import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {conditions, workflows, type Desk} from './ledger.ts';
import {charts} from './charts.ts';
import {analyze,summarize} from './analysis.ts';
import {capture,grade,type Attempt} from './grade.ts';
import {escape as h,page,jobHistory} from './views.ts';

const dir=fileURLToPath(new URL('../../retail/',import.meta.url));
const studyFolder=existsSync(resolve(dir,'published/manifest.json'))?'published':'local/study';
const paths=['examples',studyFolder+'/attempts','local/human'];
const cache=new Map<string,Attempt>();
export function attempts(){
  const rows=new Map<string,Attempt>();
  for(const path of paths){
    const folder=resolve(dir,path);
    if(!existsSync(folder))continue;
    for(const name of readdirSync(folder).filter(f=>f.endsWith('.json'))){
      const file=resolve(folder,name);
      let row=cache.get(file);
      if(!row){row=JSON.parse(readFileSync(file,'utf8')) as Attempt;cache.set(file,row);}
      rows.set(row.id,row);
    }
  }
  return [...rows.values()];
}
const link=(path:string,label:string)=>'<a href="'+h(path)+'">'+h(label)+'</a>';
const url=(path:string,params:Record<string,string>)=>path+'?'+new URLSearchParams(params);
function shell(body:string,title:string){
  return page('<div class="topnav">'+link('/','Workbench')+link('/replays','Replay room')+link('/results','Results')+'</div>'+body,title)
    .replace('</title>','</title><link rel="stylesheet" href="/portfolio.css">');
}
function workButtons(){return workflows.map(w=>'<form method="post" action="/start?workflow='+w+'"><button class="'+(w==='receiving'?'':'secondary')+'">Start '+w+' job</button></form>').join('');}
function featuredPair(rows:Attempt[]){
  const candidates=rows.filter(a=>a.origin==='openai'&&a.phase==='development'&&a.condition==='partial'
    &&a.model.includes('mini')&&a.events.some(e=>e.result==='timeout')).sort((a,b)=>a.id.localeCompare(b.id));
  let differentHarm:Attempt[]|undefined;
  for(const a of candidates){
    const peer=rows.find(b=>b.id===a.id.replace('-mini-','-nano-') && b.events.some(e=>e.result==='timeout'));
    if(!peer)continue;
    const left=grade(a),right=grade(peer);
    if(left.complete!==right.complete)return [a,peer];
    if(!differentHarm&&left.excessUnits!==right.excessUnits)differentHarm=[a,peer];
  }
  return differentHarm;
}
export function home(){
  const runs=attempts(),paid=runs.filter(r=>r.origin==='openai');
  const pair=featuredPair(runs);
  const replayPath=pair?url('/replays',{a:pair[0].id,b:pair[1].id}):'/replays';
  const comparison=pair?'Two live models reached the same partial receipt. Their attempts left '+grade(pair[0]).excessUnits+' and '+grade(pair[1]).excessUnits+' excess units. Compare the decisions behind their scores.':'Follow the checked and blind scripted retries from the same partial receipt. Inspect the stock change at each step.';
  return shell('<div class="lead"><div><p class="eyebrow">Browser-agent reliability</p><h1>When the receipt goes missing.</h1><p class="brief">Two jacket lines arrive. A receipt times out halfway through. Can an operator settle the delivery without booking the same stock twice?</p><div class="choices">'+workButtons()+'</div></div><aside class="slip"><p class="eyebrow">Delivery note · DN-184</p><h2>Field jackets</h2><dl><div><dt>Ink</dt><dd>12 units</dd></div><div><dt>Moss</dt><dd>8 units</dd></div><div><dt>Purchase order</dt><dd>PO-731</dd></div></dl><small>Fictional receiving case · dataset 1</small></aside></div><section class="teaser"><div><p class="eyebrow">Compare the decision</p><h2>One timeout. Two responses.</h2><p>'+comparison+'</p></div><a class="button" href="'+h(replayPath)+'">Replay both operators</a></section><p>'+link('/results','Explore the results')+' · '+paid.length+' live attempts · '+runs.filter(a=>a.origin==='scripted').length+' scripted calibrations</p>','Retail reliability workbench');
}
function decision(a:Attempt){
  const g=grade(a);
  return '<dl class="metrics"><div><dt>Completion</dt><dd>'+(g.complete?'Pass':'Fail')+'</dd></div><div><dt>Recovery</dt><dd>'+(g.recovery===null?'N/A':g.recovery?'Pass':'Fail')+'</dd></div><div><dt>Excess units</dt><dd>'+g.excessUnits+'</dd></div><div><dt>Blocked writes</dt><dd>'+g.blocked+'</dd></div></dl>';
}
export function reveal(d:Desk){
  const a=capture(d),g=grade(a),next=d.nextWorkflow();
  const continuation=next?'<form method="post" action="/continue"><input type="hidden" name="job" value="'+h(d.id)+'"><button>Continue to '+h(next)+'</button></form>':'';
  const balances='<section><h2>Closing stock</h2><table><thead><tr><th>Product</th><th>Wharf</th><th>Depot</th></tr></thead><tbody>'+d.balances().map(b=>'<tr><th>'+h(b.sku)+'</th><td>'+b.wharf+'</td><td>'+b.depot+'</td></tr>').join('')+'</tbody></table></section>';
  return shell('<p class="eyebrow">Operator debrief / '+h(d.job.reference)+'</p><h1>Job closed.</h1><p>The case was <strong>'+h(a.condition)+'</strong>. '+(d.note?'You handed the job to a supervisor.':'You finished the job.')+'</p>'+decision(a)+
    '<section><h2>Final ledger</h2><table><thead><tr><th>Product</th><th>Requested</th><th>Posted</th></tr></thead><tbody>'+g.lines.map(l=>'<tr><th>'+h(l.sku)+'</th><td>'+l.target+'</td><td>'+l.actual+'</td></tr>').join('')+'</tbody></table></section>'+
    balances+jobHistory(d.priorJobs)+'<div class="choices">'+continuation+link('/trace?id='+d.id,'Inspect your attempt')+(d.priorJobs.length?'':link(url('/replays',{a:d.id}),'Compare your job with a matched run'))+link('/','Try another job')+'</div>','Job result');
}
function filter(name:string,options:string[],chosen:string){
  return '<label>'+h(name)+'<select aria-label="'+h(name)+'" name="'+h(name)+'"><option value="">All</option>'+options.map(o=>'<option '+(o===chosen?'selected ':'')+'value="'+h(o)+'">'+h(o)+'</option>').join('')+'</select></label>';
}
function traceRow(a:Attempt){
  const g=grade(a);
  return '<tr><th>'+link(url('/trace',{id:a.id}),a.id)+'</th><td>'+h(a.origin)+'</td><td>'+h(a.termination)+'</td><td>'+(g.complete?'Pass':'Fail')+'</td><td>'+(g.recovery===null?'—':g.recovery?'Pass':'Fail')+'</td><td>'+g.excessUnits+'</td></tr>';
}
export function results(params:URLSearchParams){
  const rows=attempts();
  const fields=['workflow','condition','origin','model','mode','phase'] as const;
  const filtered=rows.filter(r=>fields.every(k=>!params.get(k)||r[k]===params.get(k)));
  const cohorts=['openai','human','scripted'].map(origin=>{
    const members=filtered.filter(r=>r.origin===origin);if(!members.length)return '';
    const scores=members.map(grade);
    const summary=summarize(members);
    return '<div class="cohort"><p><strong>'+origin+' · '+scores.filter(g=>g.complete).length+' / '+members.length+' completed correctly</strong> · '+scores.filter(g=>g.recovery).length+' / '+scores.filter(g=>g.recovery!==null).length+' recovered · '+members.filter(r=>r.termination==='interrupted').length+' interrupted</p><dl class="cohortstats"><div><dt>Excess units</dt><dd>'+summary.excessUnits+'</dd></div><div><dt>Excess refunds</dt><dd>US$'+(summary.excessCreditCents/100).toFixed(2)+'</dd></div><div><dt>Unsafe writes</dt><dd>'+summary.unsafeWrites+'</dd></div><div><dt>Blocked writes</dt><dd>'+summary.blocked+'</dd></div><div><dt>Median / p95 time</dt><dd>'+summary.medianSeconds?.toFixed(1)+' / '+summary.p95Seconds?.toFixed(1)+'s</dd></div><div><dt>Justified handoffs</dt><dd>'+summary.justifiedHandoffs+' / '+summary.conflictCases+'</dd></div><div><dt>Unnecessary handoffs</dt><dd>'+summary.unnecessaryHandoffs+' / '+summary.solvableCases+'</dd></div>'+(origin==='openai'?'<div><dt>Selected runs: US$ per correct job</dt><dd>'+(summary.costPerCorrect===null?'—':'US$'+summary.costPerCorrect.toFixed(4))+'</dd></div>':'')+'</dl></div>';
  }).join('');
  if(params.get('study')==='matched'){
    const research=analyze(rows);
    const ledger=resolve(dir,studyFolder,'budget.json');
    const receipts: {cost?:number,reserved:number}[]=existsSync(ledger)?JSON.parse(readFileSync(ledger,'utf8')):[];
    const unknown=receipts.filter(c=>c.cost===undefined);
    const accounting='<p>All research requests including setup revisions: US$'+receipts.reduce((s,c)=>s+(c.cost??0),0).toFixed(4)+' metered. '+unknown.length+' without receipts or still in flight; US$'+unknown.reduce((s,c)=>s+c.reserved,0).toFixed(4)+' reserved for them. Cohort costs below cover the selected frozen attempts only.</p>';
    const pct=(v:number|null)=>v===null?'—':(v*100).toFixed(1)+'%';
    const paired=research.pairs.map(pair=>'<section><h2>'+h(pair.comparison)+'</h2><p>'+pair.matched+' / '+pair.planned+' matched pairs · success difference '+(pair.mean===null?'—':(pair.mean*100).toFixed(1)+' percentage points')+'</p><p>95% empirical seed-resampling range: '+(pair.interval?pair.interval.map(v=>pct(v)).join(' to '):'pending')+'</p>'+link(url('/results',{origin:'openai',phase:pair.phase}),'Inspect contributing attempts')+'</section>').join('');
    return shell('<p class="eyebrow">Live model research</p><h1>Matched comparisons</h1><p>'+research.observed+' / '+research.planned+' scheduled attempts. Compare identical starting records and keep interruptions in the denominator.</p>'+accounting+paired+charts(research)+'<p>Intervals resample starting datasets. Four seeds give limited evidence about new datasets.</p>','Matched comparisons');
  }
  return shell('<p class="eyebrow">Research / Evidence</p><h1>Results explorer</h1><p><a href="/results?study=matched">View matched model and interface comparisons</a></p><form class="filters" method="get">'+fields.map(k=>filter(k,[...new Set(rows.map(r=>r[k]))].sort(),params.get(k)??'')).join('')+'<button>Apply filters</button></form>'+
    (cohorts||'<p>No attempts match these filters.</p>')+
    '<div class="scroll"><table><thead><tr><th>Attempt</th><th>Origin</th><th>Stop</th><th>Outcome</th><th>Recovery</th><th>Excess units</th></tr></thead><tbody>'+filtered.map(traceRow).join('')+'</tbody></table></div>','Results explorer');
}
function frames(a:Attempt){
  return a.frames.length?a.frames:a.events.map((e,i)=>({action:e.kind+(e.screen?' '+e.screen:''),view:e.visible??e.note??e.result??'',elapsedMs:e.ms,eventCount:i+1,image:undefined}));
}
function frameCard(a:Attempt,index:number){
  const series=frames(a);
  const f=series[Math.max(0,Math.min(series.length-1,index))];
  if(!f)return '<article><h2>'+h(a.model)+'</h2><p>No browser observation was retained.</p></article>';
  const logged=a.events.slice(0,f.eventCount),units=[0,0];
  for(const e of logged)for(const change of e.changes??[])units[change.line]+=change.units;
  return '<article class="frame"><p class="eyebrow">'+h(a.origin)+' / '+h(a.mode)+'</p><h2>'+h(a.model)+'</h2><p><strong>'+h(f.action)+'</strong></p>'+
    (f.image?'<img src="/screens/'+h(f.image)+'" alt="Browser viewport at this observation">':'')+
    '<details '+(f.image?'':'open')+'><summary>'+(a.mode==='pixels'?'Audit text from the page':'Browser evidence')+'</summary><pre>'+h(f.view)+'</pre></details><p class="ledger">Underlying ledger · '+units.join(' / ')+' units</p><small>'+f.elapsedMs+' ms from start · frame '+(Math.max(0,Math.min(series.length-1,index))+1)+' of '+series.length+'</small></article>';
}
function frameForEvent(a:Attempt,event:number){
  if(event<0)return 0;
  const series=frames(a),i=series.findIndex(f=>f.eventCount>event);
  return i>=0?i:Math.max(0,series.length-1);
}
function decisionAnchors(a:Attempt,b:Attempt){
  const [left,right]=[a,b].map(run=>{
    const fault=run.events.findIndex(e=>e.result==='timeout');
    return run.events.map((e,i)=>({i,key:JSON.stringify([e.kind,e.screen,e.units,e.result,e.citation,e.note])})).slice(fault+1);
  });
  let i=0;
  while(left[i] && right[i] && left[i].key===right[i].key)i++;
  if(i===left.length&&i===right.length)return;
  return [frameForEvent(a,left[i]?.i??a.events.length-1),frameForEvent(b,right[i]?.i??b.events.length-1)];
}
function sameOpening(a:Attempt,b:Attempt){
  return a.id!==b.id && a.workflow===b.workflow && a.seed===b.seed && a.condition===b.condition
    && JSON.stringify(a.openingBalances)===JSON.stringify(b.openingBalances);
}
export function replay(params:URLSearchParams){
  const rows=attempts(),first=rows.find(r=>r.id===(params.get('a')??'receiving-partial-1-verify'));
  if(!first)return shell('<h1>Attempt unavailable</h1>','Replay');
  const peers=rows.filter(r=>sameOpening(first,r));
  const second=peers.find(r=>r.id===params.get('b'))??peers.find(r=>r.origin==='openai' && r.model!==first.model)??peers.find(r=>r.model!==first.model)??peers[0];
  if(!second)return trace(first.id);
  const faults=[first,second].map(a=>a.events.findIndex(e=>e.result==='timeout'));
  const diverged=decisionAnchors(first,second);
  const at=params.get('at')==='decision' && diverged?'decision':'fault';
  const [left,right]=at==='decision'?diverged!:[frameForEvent(first,faults[0]),frameForEvent(second,faults[1])];
  const min=-Math.max(left,right),max=Math.max(frames(first).length-left,frames(second).length-right)-1;
  const step=Math.min(max,Math.max(min,Number.parseInt(params.get('step')??'0')||0));
  const nav=(delta:number,label:string)=>link(url('/replays',{a:first.id,b:second.id,at,step:String(delta)}),label);
  return shell('<p class="eyebrow">'+h(first.workflow)+' / '+h(first.condition)+' / dataset '+first.seed+'</p><h1>Replay room</h1><p>Compare two operators from the same opening state. Traces align at the first timeout when observed, otherwise at the opening observation. Shorter traces hold their final frame.</p>'+
    '<form class="filters"><input type="hidden" name="a" value="'+h(first.id)+'"><label>Compare with<select name="b">'+peers.map(r=>'<option '+(r.id===second.id?'selected ':'')+'value="'+h(r.id)+'">'+h(r.id)+'</option>').join('')+'</select></label><button>Compare</button></form>'+
    '<div class="transport">'+(step>min?nav(step-1,'← Previous'):'<span>Start</span>')+'<strong>Step '+step+'</strong>'+link(url('/replays',{a:first.id,b:second.id}),'Align at fault')+(diverged?link(url('/replays',{a:first.id,b:second.id,at:'decision'}),'First different job event'):'')+(step<max?nav(step+1,'Next →'):'<span>End</span>')+'</div><div class="compare">'+frameCard(first,left+step)+frameCard(second,right+step)+'</div><p>'+link(url('/trace',{id:first.id}),'Full first attempt')+' · '+link(url('/trace',{id:second.id}),'Full second attempt')+'</p>','Replay room');
}
export function trace(id:string){
  const all=attempts();
  const a=all.find(r=>r.id===id);
  if(!a)return shell('<h1>Attempt unavailable</h1>','Attempt');
  return shell('<p class="eyebrow">'+h(a.origin)+' / '+h(a.phase)+'</p><h1>Attempt record</h1><p>'+h(a.id)+' · '+h(a.model)+' · '+h(a.termination)+'</p>'+decision(a)+jobHistory(a.priorJobs??[])+(a.openingBalances?'<p>Opening stock (Wharf / Depot) · '+a.openingBalances.map(b=>h(b.sku)+' '+b.wharf+' / '+b.depot).join(' · ')+'</p>':'')+
    '<p>'+a.actions+' actions · '+(a.durationMs/1000).toFixed(1)+' seconds · '+a.tokens+' tokens · US$'+a.costUsd.toFixed(5)+' metered</p><p>'+(all.some(r=>sameOpening(a,r))?link(url('/replays',{a:id}),'Compare matched attempts'):'No matched peer has been recorded.')+'</p><section><h2>Recorded browser frames</h2>'+frames(a).map((f,i)=>'<details><summary>'+i+' · '+h(f.action)+'</summary>'+frameCard(a,i)+'</details>').join('')+'</section><section><h2>Decision history</h2>'+a.events.map(e=>'<details><summary>'+e.ms+' ms · '+h(e.kind)+' '+h(e.screen??e.result??'')+'</summary><pre>'+h(JSON.stringify(e,null,2))+'</pre></details>').join('')+'</section>','Attempt record');
}
export function screenshot(name:string){
  if(!/^[a-f0-9]{64}\.jpg$/.test(name))return;
  const file=resolve(dir,studyFolder,'screens',name);
  if(existsSync(file))return readFileSync(file);
}
