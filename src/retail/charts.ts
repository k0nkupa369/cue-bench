import type {analyze} from './analysis.ts';
import {escape as h} from './views.ts';

type Research=ReturnType<typeof analyze>;
function drill(filters:Record<string,string>,label:string){
  return '<a href="/results?'+h(new URLSearchParams({origin:'openai',...filters}).toString())+'">'+h(label)+'</a>';
}
function percent(value:number|null){
  return value===null?'—':(value*100).toFixed(1)+'%';
}
export function charts(data:Research){
  const cohorts=data.groups.map(g=>{
    const [phase,model,mode]=g.group.split('/');
    return '<tr><th>'+drill({phase,model,mode},[phase,model,mode].join(' / '))+'</th><td>'+g.correct+' / '+g.attempts+
      '</td><td>'+percent(g.recovery)+' ('+g.recovered+'/'+g.reachedFault+'; '+g.observationQualifiedRecoveries+' with observed pages)</td><td>'+percent(g.allThree)+' ('+g.repeatSets+' sets)</td><td>'+g.unsafeWrites+
      '</td><td>'+g.excessUnits+'</td><td>'+(g.costPerCorrect===null?'—':g.costPerCorrect.toFixed(4))+'</td></tr>';
  }).join('');
  const grouped=new Map<string,Research['disruption']>();
  for(const row of data.disruption){
    const key=[row.phase,row.model,row.mode,row.fault].join('/');
    const values=grouped.get(key)??[];
    values.push(row);grouped.set(key,values);
  }
  const faults=[...grouped.values()].map(pairs=>{
    const {phase,model,mode,fault}=pairs[0];
    const delta=pairs.reduce((s,p)=>s+p.deltaSuccess,0)/pairs.length;
    const seconds=pairs.reduce((s,p)=>s+p.deltaSeconds,0)/pairs.length;
    const actions=pairs.reduce((s,p)=>s+p.deltaActions,0)/pairs.length;
    return '<tr><th>'+h(fault)+'</th><td>'+h([model,mode,phase].join(' / '))+'</td><td>'+pairs.length+'</td><td>'+signed(100*delta)+' pp</td><td>'+signed(actions)+'</td><td>'+signed(seconds)+'</td><td><details><summary>Paired records</summary>'+
      pairs.map(p=>'<p><a href="/trace?id='+encodeURIComponent(p.control)+'">Clean</a> / <a href="/trace?id='+encodeURIComponent(p.attempt)+'">'+h(p.attempt)+'</a></p>').join('')+'</details></td></tr>';
  }).join('');
  return '<section><h2>Reliability and cost</h2><p>All recorded attempts count toward completion. Uncollected slots are listed in the JSON report. Recovery uses attempts that reached a timeout. Consistency is the share of three-attempt sets with three successes.</p><div class="scroll"><table><thead><tr><th>Cohort</th><th>Completed</th><th>Recovery</th><th>Consistency</th><th>Unsafe writes</th><th>Excess units</th><th>US$ / correct</th></tr></thead><tbody>'+cohorts+'</tbody></table></div></section>'+
    '<section><h2>Effect of disruption</h2><p>Each pair shares a model, interface, starting dataset and repetition. Differences are disrupted minus clean.</p><div class="scroll"><table><thead><tr><th>Fault</th><th>Cohort</th><th>Pairs</th><th>Completion change</th><th>Extra actions</th><th>Extra seconds</th><th>Evidence</th></tr></thead><tbody>'+faults+'</tbody></table></div></section>';
}
function signed(n:number){return (n>0?'+':'')+n.toFixed(1);}
