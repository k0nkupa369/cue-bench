import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {delivery,conditions, workflows, type Desk} from './ledger.ts';
import {charts} from './charts.ts';
import {analyze,summarize} from './analysis.ts';
import {capture,grade,type Attempt} from './grade.ts';
import {escape as h,page,jobHistory} from './views.ts';
import type {StandaloneAttempt} from './providers.ts';

const dir=fileURLToPath(new URL('../../retail/',import.meta.url));
const studyFolder=existsSync(resolve(dir,'published/manifest.json'))?'published':'local/study';
const standaloneFolder='local/standalone';
const defaultArchive=resolve(dir,'local/human');
type StudyAttempt=Attempt & {receiptCount?:number,unknownCharges?:number,error?:string};
type VisitorAttempt=StudyAttempt|StandaloneAttempt;
const cache=new Map<string,unknown>();
export function attempts(archive=defaultArchive){
  return readAttempts<StudyAttempt>(['examples',studyFolder+'/attempts',archive]);
}
function visitorAttempts(archive:string):VisitorAttempt[]{
  return [...attempts(archive),...readAttempts<StandaloneAttempt>([standaloneFolder+'/attempts'],false)];
}
function readAttempts<T extends VisitorAttempt>(paths:string[],cacheRows=true){
  const rows=new Map<string,T>();
  for(const path of paths){
    const folder=resolve(dir,path);
    if(!existsSync(folder))continue;
    for(const name of readdirSync(folder).filter(f=>f.endsWith('.json'))){
      const file=resolve(folder,name);
      let row=cacheRows?cache.get(file) as T|undefined:undefined;
      if(!row){
        row=JSON.parse(readFileSync(file,'utf8')) as T;
        if(cacheRows)cache.set(file,row);
      }
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
export function home(archive=defaultArchive){
  const runs=attempts(archive),paid=runs.filter(r=>r.origin==='openai');
  const pair=featuredPair(runs);
  const replayPath=pair?url('/replays',{a:pair[0].id,b:pair[1].id}):'/replays';
  const comparison=pair?'Two live models reached the same partial receipt. Their attempts left '+grade(pair[0]).excessUnits+' and '+grade(pair[1]).excessUnits+' excess units. Compare the decisions behind their scores.':'Follow the checked and blind scripted retries from the same partial receipt. Inspect the stock change at each step.';
  return shell('<div class="lead"><div><p class="eyebrow">Browser-agent reliability</p><h1>When the receipt goes missing.</h1><p class="brief">Two jacket lines arrive. A receipt times out halfway through. Can an operator settle the delivery without booking the same stock twice?</p><div class="choices">'+workButtons()+'</div></div><aside class="slip"><p class="eyebrow">Delivery note · DN-184</p><h2>Field jackets</h2><dl><div><dt>Ink</dt><dd>12 units</dd></div><div><dt>Moss</dt><dd>8 units</dd></div><div><dt>Purchase order</dt><dd>PO-731</dd></div></dl><small>Fictional receiving case · dataset 1</small></aside></div><section class="teaser"><div><p class="eyebrow">Compare the decision</p><h2>One timeout. Two responses.</h2><p>'+comparison+'</p></div><a class="button" href="'+h(replayPath)+'">Replay both operators</a></section><p>'+link('/results','Explore the results')+' · '+paid.length+' live attempts · '+runs.filter(a=>a.origin==='scripted').length+' scripted calibrations</p>','Retail reliability workbench');
}
function decision(a:VisitorAttempt){
  const g=grade(a);
  const pending=a.termination==='checkpoint';
  return '<dl class="metrics"><div><dt>Completion</dt><dd>'+(pending?'Pending':g.complete?'Pass':'Fail')+'</dd></div><div><dt>Recovery</dt><dd>'+(pending?'Pending':g.recovery===null?'N/A':g.recovery?'Pass':'Fail')+'</dd></div><div><dt>Excess units</dt><dd>'+g.excessUnits+'</dd></div><div><dt>Blocked writes</dt><dd>'+g.blocked+'</dd></div></dl>';
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
function traceRow(a:VisitorAttempt){
  const g=grade(a);
  const pending=a.termination==='checkpoint';
  return '<tr><th>'+link(url('/trace',{id:a.id}),a.id)+'</th><td>'+h(a.origin)+'</td><td>'+h(a.model)+'</td><td>'+h(a.mode)+'</td><td>'+h(pending?'Unfinished checkpoint':a.termination)+'</td><td>'+(pending?'Pending':g.complete?'Pass':'Fail')+'</td><td>'+(pending||g.recovery===null?'—':g.recovery?'Pass':'Fail')+'</td><td>'+g.excessUnits+'</td></tr>';
}
export function results(params:URLSearchParams,archive=defaultArchive){
  if(params.get('study')==='matched'){
    const research=analyze(attempts(archive));
    const ledger=resolve(dir,studyFolder,'budget.json');
    const receipts: {cost?:number,reserved:number}[]=existsSync(ledger)?JSON.parse(readFileSync(ledger,'utf8')):[];
    const unknown=receipts.filter(c=>c.cost===undefined);
    const accounting='<p>All research requests including setup revisions: US$'+receipts.reduce((s,c)=>s+(c.cost??0),0).toFixed(4)+' metered. '+unknown.length+' without receipts or still in flight; US$'+unknown.reduce((s,c)=>s+c.reserved,0).toFixed(4)+' reserved for them. Cohort costs below cover the selected frozen attempts only.</p>';
    const pct=(v:number|null)=>v===null?'—':(v*100).toFixed(1)+'%';
    const paired=research.pairs.map(pair=>'<section><h2>'+h(pair.comparison)+'</h2><p>'+pair.matched+' / '+pair.planned+' matched pairs · success difference '+(pair.mean===null?'—':(pair.mean*100).toFixed(1)+' percentage points')+'</p><p>95% empirical seed-resampling range: '+(pair.interval?pair.interval.map(v=>pct(v)).join(' to '):'pending')+'</p>'+link(url('/results',{origin:'openai',phase:pair.phase}),'Inspect contributing attempts')+'</section>').join('');
    return shell('<p class="eyebrow">Live model research</p><h1>Matched comparisons</h1><p>'+research.observed+' / '+research.planned+' scheduled attempts. Compare identical starting records and keep interruptions in the denominator.</p>'+accounting+paired+charts(research)+'<p>Intervals resample starting datasets. Four seeds give limited evidence about new datasets.</p>','Matched comparisons');
  }
  const rows=visitorAttempts(archive);
  const fields=['workflow','condition','origin','model','mode','phase'] as const;
  const filtered=rows.filter(r=>fields.every(k=>!params.get(k)||r[k]===params.get(k)));
  const study=filtered.filter(r=>r.phase!=='standalone');
  const cohorts=['openai','human','scripted'].map(origin=>{
    const members=study.filter(r=>r.origin===origin);if(!members.length)return '';
    const scores=members.map(grade);
    const summary=summarize(members);
    return '<div class="cohort"><p><strong>'+origin+' · '+scores.filter(g=>g.complete).length+' / '+members.length+' completed correctly</strong> · '+scores.filter(g=>g.recovery).length+' / '+scores.filter(g=>g.recovery!==null).length+' recovered · '+members.filter(r=>r.termination==='interrupted').length+' interrupted</p><dl class="cohortstats"><div><dt>Excess units</dt><dd>'+summary.excessUnits+'</dd></div><div><dt>Excess refunds</dt><dd>US$'+(summary.excessCreditCents/100).toFixed(2)+'</dd></div><div><dt>Unsafe writes</dt><dd>'+summary.unsafeWrites+'</dd></div><div><dt>Blocked writes</dt><dd>'+summary.blocked+'</dd></div><div><dt>Median / p95 time</dt><dd>'+summary.medianSeconds?.toFixed(1)+' / '+summary.p95Seconds?.toFixed(1)+'s</dd></div><div><dt>Justified handoffs</dt><dd>'+summary.justifiedHandoffs+' / '+summary.conflictCases+'</dd></div><div><dt>Unnecessary handoffs</dt><dd>'+summary.unnecessaryHandoffs+' / '+summary.solvableCases+'</dd></div>'+(origin==='openai'?'<div><dt>Selected runs: US$ per correct job</dt><dd>'+(summary.costPerCorrect===null?'—':'US$'+summary.costPerCorrect.toFixed(4))+'</dd></div>':'')+'</dl></div>';
  }).join('');
  const standalone=filtered.filter(r=>r.phase==='standalone');
  const table=(runs:VisitorAttempt[])=>'<div class="scroll"><table><thead><tr><th>Attempt</th><th>Origin</th><th>Model</th><th>Interface</th><th>Stop</th><th>Outcome</th><th>Recovery</th><th>Excess units</th></tr></thead><tbody>'+runs.map(traceRow).join('')+'</tbody></table></div>';
  return shell('<p class="eyebrow">Research / Evidence</p><h1>Results explorer</h1><p><a href="/results?study=matched">View matched model and interface comparisons</a></p><form class="filters" method="get">'+fields.map(k=>filter(k,[...new Set(rows.map(r=>r[k]))].sort(),params.get(k)??'')).join('')+'<button>Apply filters</button></form>'+
    (cohorts?cohorts+table(study):'')+
    (standalone.length?'<section><h2>Standalone provider runs</h2><p>Operator-selected jobs and models.</p>'+table(standalone)+'</section>':'')+
    (filtered.length?'':'<p>No attempts match these filters.</p>'),'Results explorer');
}
function frames(a:VisitorAttempt):Attempt['frames']{
  return a.frames.length?a.frames:a.events.map((e,i)=>({action:e.kind+(e.screen?' '+e.screen:''),view:e.visible??e.note??e.result??'',elapsedMs:e.ms,eventCount:i+1,image:undefined}));
}
function clickDetails(f:Attempt['frames'][number],source:Attempt['frames'][number]|undefined){
  const click=f.click;
  if(!click)return f.action.startsWith('{"op":"click"')?'<p>Click target unknown.</p>':'';
  const target=click.target;
  const landing=target?'Click target '+h(target.tag)+(target.control?' inside '+h(target.control):'')+(target.label?' · '+h(target.label):''):'Click target unknown';
  const {before,after}=click;
  const moved=before.sequence!==after.sequence;
  const stale=source?.observation && source.observation.navigation.sequence!==before.sequence;
  return '<p>Observation '+h(click.observationId)+' · ('+h(click.x)+', '+h(click.y)+') · '+landing+'. '+
    (stale?'The browser had already navigated since this screenshot. ':'')+
    (moved?'The click navigated from '+h(before.path)+' to '+h(after.path)+'.':'The browser stayed on '+h(before.path)+'.')+'</p>';
}
function frameCard(a:VisitorAttempt,index:number){
  const series=frames(a);
  const f=series[Math.max(0,Math.min(series.length-1,index))];
  if(!f)return '<article><h2>'+h(a.model)+'</h2><p>No browser observation was retained.</p></article>';
  const logged=a.events.slice(0,f.eventCount),units=[0,0];
  for(const e of logged)for(const change of e.changes??[])units[change.line]+=change.units;
  const click=f.click;
  const source=click?series.find(other=>other.observation?.id===click.observationId):undefined;
  const imageName=source?.image??f.image;
  const image=imageName&&(a.phase==='standalone'?'standalone/':'')+imageName;
  const available=image&&screenshotPath(image);
  const viewport=source?.observation?.viewport;
  const marker=click&&viewport&&Number.isInteger(click.x)&&Number.isInteger(click.y)
    &&Number.isInteger(viewport.width)&&Number.isInteger(viewport.height)
    &&click.x>=0&&click.y>=0&&click.x<viewport.width&&click.y<viewport.height
    ?'<span class="click-marker" aria-hidden="true" style="left:'+100*click.x/viewport.width+'%;top:'+100*click.y/viewport.height+'%"></span>':'';
  const picture=available?'<div class="observation-image"><img src="/screens/'+h(image)+'" alt="Browser viewport at the source observation">'+marker+'</div>':
    a.mode==='pixels'&&(f.click||f.image||f.action.startsWith('Observation ')||!a.frames.length)?'<p>Screenshot unavailable.</p>':'';
  return '<article class="frame"><p class="eyebrow">'+h(a.origin)+' / '+h(a.mode)+'</p><h2>'+h(a.model)+'</h2><p><strong>'+h(f.action)+'</strong></p>'+
    picture+(a.mode==='pixels'?clickDetails(f,source):'')+
    (f.discardedActions?'<p>Discarded '+h(f.discardedActions)+' remaining '+(f.discardedActions===1?'action':'actions')+' after navigation.</p>':'')+
    '<details '+(available?'':'open')+'><summary>'+(f.click?'Page text after the action':a.mode==='pixels'?'Audit text from the page':'Browser evidence')+'</summary><pre>'+h(f.view)+'</pre></details><p class="ledger">Underlying ledger · '+units.join(' / ')+' units</p><small>'+f.elapsedMs+' ms from start · frame '+(Math.max(0,Math.min(series.length-1,index))+1)+' of '+series.length+'</small></article>';
}
function frameForEvent(a:VisitorAttempt,event:number){
  if(event<0)return 0;
  const series=frames(a),i=series.findIndex(f=>f.eventCount>event);
  return i>=0?i:Math.max(0,series.length-1);
}
function decisionAnchors(a:VisitorAttempt,b:VisitorAttempt){
  const [left,right]=[a,b].map(run=>{
    const fault=run.events.findIndex(e=>e.result==='timeout');
    return run.events.map((e,i)=>({i,key:JSON.stringify([e.kind,e.screen,e.units,e.result,e.citation,e.note])})).slice(fault+1);
  });
  let i=0;
  while(left[i] && right[i] && left[i].key===right[i].key)i++;
  if(i===left.length&&i===right.length)return;
  return [frameForEvent(a,left[i]?.i??a.events.length-1),frameForEvent(b,right[i]?.i??b.events.length-1)];
}
function sameOpening(a:VisitorAttempt,b:VisitorAttempt){
  if(a.id===b.id || a.workflow!==b.workflow || a.seed!==b.seed || a.condition!==b.condition
    || JSON.stringify(a.openingBalances)!==JSON.stringify(b.openingBalances))return false;
  if(a.phase!=='standalone')return b.phase!=='standalone';
  return b.phase==='standalone' && a.mode===b.mode && a.maxCalls===b.maxCalls && a.protocolVersion===b.protocolVersion
    && (a.policy??'batch')===(b.policy??'batch');
}
export function replay(params:URLSearchParams,archive=defaultArchive){
  const rows=visitorAttempts(archive),first=rows.find(r=>r.id===(params.get('a')??'receiving-partial-1-verify'));
  if(!first)return shell('<h1>Attempt unavailable</h1>','Replay');
  const peers=rows.filter(r=>sameOpening(first,r));
  const preferred=first.phase==='standalone'?peers.find(r=>r.origin!==first.origin):peers.find(r=>r.origin==='openai' && r.model!==first.model);
  const second=peers.find(r=>r.id===params.get('b'))??preferred??peers.find(r=>r.model!==first.model)??peers[0];
  if(!second)return trace(first.id,archive);
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
export function trace(id:string,archive=defaultArchive){
  const all=visitorAttempts(archive);
  const a=all.find(r=>r.id===id);
  if(!a)return shell('<h1>Attempt unavailable</h1>','Attempt');
  const job=delivery(a.seed,a.workflow),lines=grade(a).lines;
  const document='<section><h2>'+h(job.reference)+' · '+h(job.document)+'</h2><table><thead><tr><th>Product</th><th>Ordered / paid</th><th>Requested</th><th>Posted</th></tr></thead><tbody>'+job.lines.map((l,i)=>'<tr><th>'+h(l.name)+'<small>'+h(l.sku)+'</small></th><td>'+l.ordered+'</td><td>'+l.delivered+'</td><td>'+lines[i].actual+'</td></tr>').join('')+'</tbody></table></section>';
  const stop=a.termination==='checkpoint'?'Unfinished checkpoint':a.termination;
  return shell('<p class="eyebrow">'+h(a.origin)+' / '+h(a.phase)+'</p><h1>Attempt record</h1><p>'+h(a.id)+' · '+h(a.model)+' · '+h(stop)+
    (a.phase==='standalone'&&a.mode==='pixels'?' · '+h(a.policy??'batch'):'')+'</p>'+
    (a.termination==='checkpoint'?'<p>This is the last saved state. Later browser actions or provider usage may be unconfirmed.</p>':'')+
    decision(a)+document+jobHistory(a.priorJobs??[])+(a.openingBalances?'<p>Opening stock (Wharf / Depot) · '+a.openingBalances.map(b=>h(b.sku)+' '+b.wharf+' / '+b.depot).join(' · ')+'</p>':'')+
    '<p>'+a.actions+' actions · '+(a.durationMs/1000).toFixed(1)+' seconds</p>'+accountingDetails(a)+
    (a.error?'<p>'+h(a.error)+'</p>':'')+'<p>'+(all.some(r=>sameOpening(a,r))?link(url('/replays',{a:id}),'Compare matched attempts'):'No matched peer has been recorded.')+'</p><section><h2>Recorded browser frames</h2>'+
    (frames(a).length?frames(a).map((f,i)=>'<details><summary>'+i+' · '+h(f.action)+'</summary>'+frameCard(a,i)+'</details>').join(''):'<p>No browser observation was retained.</p>')+
    '</section><section><h2>Decision history</h2>'+a.events.map(e=>'<details><summary>'+e.ms+' ms · '+h(e.kind)+' '+h(e.screen??e.result??'')+'</summary><pre>'+h(JSON.stringify(e,null,2))+'</pre></details>').join('')+'</section>','Attempt record');
}
function accountingDetails(a:VisitorAttempt){
  if(a.phase!=='standalone'){
    if(a.origin!=='openai')return '';
    const recorded=a.receiptCount? a.tokens+' metered tokens · US$'+a.costUsd.toFixed(5)+' metered. ':'';
    const missing=a.unknownCharges? a.unknownCharges+' requests without usage receipts. Total tokens and cost are unknown. ':'';
    return '<p>'+recorded+missing+(!recorded&&!missing?'No usage receipts recorded.':'')+'</p>';
  }
  const receipts=a.readbacks.filter(r=>r?.usage).length;
  return '<section><h2>Provider readback</h2><p>'+h(a.model)+' requested · '+a.readbacks.length+' of '+a.maxCalls+' requests recorded · '+receipts+' usage receipts · '+
    (a.tokens===null?'Total tokens unknown':a.tokens+' reported tokens')+' · Cost unknown</p>'+
    (a.readbacks.length?a.readbacks.map((receipt,i)=>'<details><summary>Request '+(i+1)+' · '+
      (receipt?.usage?'Usage reported':'No usage receipt')+'</summary>'+(receipt?
        '<p>HTTP '+receipt.httpStatus+' · Model returned '+h(receipt.model??'unknown')+
        ' · Request ID '+h(receipt.requestId??'unavailable')+' · Response ID '+h(receipt.responseId??'unavailable')+
        ' · Stop reason '+h(receipt.stopReason??'unavailable')+'</p>'+
        (receipt.usage?'<pre>'+h(JSON.stringify(receipt.usage.reported,null,2))+'</pre>':''):
        '<p>No HTTP response was recorded.</p>')+'</details>').join(''):'<p>No provider requests started.</p>')+'</section>';
}
function screenshotPath(name:string){
  if(!/^(standalone\/)?[a-f0-9]{64}\.jpg$/.test(name))return;
  const standalone=name.startsWith('standalone/');
  const file=resolve(dir,standalone?standaloneFolder:studyFolder,'screens',standalone?name.slice(11):name);
  if(existsSync(file))return file;
}
export function screenshot(name:string){
  const file=screenshotPath(name);
  if(file)return readFileSync(file);
}
