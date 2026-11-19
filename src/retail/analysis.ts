import {grade,type Attempt} from './grade.ts';
import {plan} from './study.ts';

function groupBy<T>(rows:T[],key:(value:T)=>string){
  const groups:Record<string,T[]>={};
  for(const row of rows)(groups[key(row)]??=[]).push(row);
  return groups;
}
function rate(values:boolean[]){
  return values.length?values.filter(Boolean).length/values.length:null;
}
function quantile(values:number[],q:number){
  const sorted=values.toSorted((a,b)=>a-b);
  return sorted.length?sorted[Math.ceil(q*sorted.length)-1]:null;
}
export function summarize(rows:Attempt[]){
  const scores=rows.map(grade),correct=scores.filter(g=>g.complete).length;
  const cost=rows.reduce((n,a)=>n+a.costUsd,0);
  const unknown=rows.reduce((n,a)=>n+Number((a as Attempt&{unknownCharges?:number}).unknownCharges??0),0);
  const conflict=rows.filter(a=>a.condition==='conflict'),solvable=rows.filter(a=>a.condition!=='conflict');
  const repeated=Object.values(groupBy(rows,r=>[r.seed,r.condition,r.model,r.mode].join('/'))).filter(r=>r?.length===3);
  return {attempts:rows.length,correct,complete:rate(scores.map(g=>g.complete)),recovery:rate(scores.filter(g=>g.recovery!==null).map(g=>g.recovery===true)),
    damaged:scores.filter(g=>g.excessUnits>0||!g.invariants).length,excessUnits:scores.reduce((n,g)=>n+g.excessUnits,0),
    excessCreditCents:scores.reduce((n,g)=>n+g.excessCreditCents,0),blocked:scores.reduce((n,g)=>n+g.blocked,0),
    unsafeWrites:scores.reduce((n,g)=>n+g.unsafeWrites,0),
    justifiedHandoffs:conflict.filter(a=>grade(a).escalation==='justified').length,conflictCases:conflict.length,
    unnecessaryHandoffs:solvable.filter(a=>grade(a).escalation==='unnecessary').length,solvableCases:solvable.length,
    interruptions:rows.filter(r=>r.termination==='interrupted').length,
    medianSeconds:quantile(rows.map(a=>a.durationMs/1000),.5),p95Seconds:quantile(rows.map(a=>a.durationMs/1000),.95),
    medianActions:quantile(rows.map(a=>a.actions),.5),cost,unknown,costPerCorrect:correct&&!unknown?cost/correct:null,
    repeatSets:repeated.length,allThree:rate(repeated.map(set=>set!.every(a=>grade(a).complete)))};
}
function interval(effects:number[]){
  if(effects.length<2)return null;
  // The design has four independent seeds. Enumerate all with-replacement cluster resamples.
  const means:number[]=[];
  function visit(depth:number,sum:number){
    if(depth===effects.length){means.push(sum/depth);return;}
    for(const effect of effects)visit(depth+1,sum+effect);
  }
  visit(0,0);return [quantile(means,.025),quantile(means,.975)];
}
export function analyze(input:Attempt[]){
  const jobs=plan();
  const live=new Map(input.filter(a=>a.origin==='openai').map(a=>[a.id,a]));
  const rows=jobs.flatMap(j=>live.has(j.id)?[live.get(j.id)!]:[]);
  const groups=Object.entries(groupBy(rows,a=>[a.phase,a.model,a.mode].join('/'))).map(([group,members])=>({group,...summarize(members!)}));
  const pairs=[];
  for(const phase of ['development','heldout'] as const){
    const comparison=phase==='development'?'mini minus nano':'controls minus pixels';
    const aJobs=jobs.filter(j=>j.phase===phase&&(phase==='development'?j.model==='mini':j.mode==='controls'));
    const deltas=new Map<number,number[]>();let matched=0;
    for(const j of aJobs){
      const k=jobs.find(k=>k.phase===phase&&k.seed===j.seed&&k.condition===j.condition&&k.repeat===j.repeat&&
        (phase==='development'?k.model==='nano':k.mode==='pixels'));
      const a=live.get(j.id),b=k&&live.get(k.id);if(!a||!b)continue;
      const bucket=deltas.get(j.seed)??[];bucket.push(Number(grade(a).complete)-Number(grade(b).complete));deltas.set(j.seed,bucket);matched++;
    }
    const seedEffects=[...deltas].map(([seed,v])=>({seed,effect:v.reduce((x,y)=>x+y,0)/v.length}));
    const effects=seedEffects.map(s=>s.effect);
    pairs.push({phase,comparison,matched,planned:aJobs.length,seedEffects,
      mean:effects.length?effects.reduce((x,y)=>x+y,0)/effects.length:null,interval:interval(effects)});
  }
  const disruption=[];
  for(const j of jobs.filter(j=>j.phase!=='calibration'&&j.condition!=='clean')){
    const clean=jobs.find(k=>k.phase===j.phase&&k.seed===j.seed&&k.repeat===j.repeat&&k.model===j.model&&k.mode===j.mode&&k.condition==='clean');
    const a=live.get(j.id),b=clean&&live.get(clean.id);
    if(a&&b)disruption.push({fault:j.condition,model:j.model,mode:j.mode,phase:j.phase,attempt:a.id,control:b.id,
      deltaSuccess:Number(grade(a).complete)-Number(grade(b).complete),deltaActions:a.actions-b.actions});
  }
  return {planned:jobs.length,observed:rows.length,missing:jobs.filter(j=>!live.has(j.id)).map(j=>j.id),groups,pairs,disruption};
}
