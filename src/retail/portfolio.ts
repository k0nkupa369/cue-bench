import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {conditions, workflows, type Desk} from './ledger.ts';
import {capture,grade,type Attempt} from './grade.ts';
import {escape as h,page} from './views.ts';

const dir=fileURLToPath(new URL('../../retail/',import.meta.url));
const paths=['examples','published/attempts','local/study/attempts','local/human'];
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
export function home(){
  const runs=attempts(),paid=runs.filter(r=>r.origin==='openai');
  return shell('<div class="lead"><div><p class="eyebrow">Browser-agent reliability</p><h1>When the receipt goes missing.</h1><p class="brief">Two jacket lines arrive. A receipt times out halfway through. Can an operator settle the delivery without booking the same stock twice?</p><div class="choices">'+workButtons()+'</div></div><aside class="slip"><p class="eyebrow">Delivery note · DN-184</p><h2>Field jackets</h2><dl><div><dt>Ink</dt><dd>12 units</dd></div><div><dt>Moss</dt><dd>8 units</dd></div><div><dt>Purchase order</dt><dd>PO-731</dd></div></dl><small>Fictional receiving case · dataset 1</small></aside></div><section class="teaser"><div><p class="eyebrow">Compare the decision</p><h2>One timeout. Two responses.</h2><p>Follow the checked and blind retries from the same partial receipt. Inspect the stock change at each step.</p></div><a class="button" href="/replays">Replay both operators</a></section><p>'+link('/results','Explore the results')+' · '+paid.length+' live attempts · '+runs.filter(a=>a.origin==='scripted').length+' scripted calibrations</p>','Retail reliability workbench');
}
function decision(a:Attempt){
  const g=grade(a);
  return '<dl class="metrics"><div><dt>Completion</dt><dd>'+(g.complete?'Pass':'Fail')+'</dd></div><div><dt>Recovery</dt><dd>'+(g.recovery===null?'N/A':g.recovery?'Pass':'Fail')+'</dd></div><div><dt>Excess units</dt><dd>'+g.excessUnits+'</dd></div><div><dt>Blocked writes</dt><dd>'+g.blocked+'</dd></div></dl>';
}
export function reveal(d:Desk){
  const a=capture(d),g=grade(a);
  return shell('<p class="eyebrow">Operator debrief / '+h(d.job.reference)+'</p><h1>Job closed.</h1><p>The case was <strong>'+h(a.condition)+'</strong>. '+(d.note?'You handed the job to a supervisor.':'You finished the job.')+'</p>'+decision(a)+
    '<section><h2>Final ledger</h2><table><thead><tr><th>Product</th><th>Requested</th><th>Posted</th></tr></thead><tbody>'+g.lines.map(l=>'<tr><th>'+h(l.sku)+'</th><td>'+l.target+'</td><td>'+l.actual+'</td></tr>').join('')+'</tbody></table></section>'+
    '<div class="choices">'+link('/trace?id='+d.id,'Inspect your attempt')+link('/','Try another job')+'</div>','Job result');
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
    return '<p><strong>'+origin+' · '+scores.filter(g=>g.complete).length+' / '+members.length+' completed correctly</strong> · '+scores.filter(g=>g.recovery).length+' / '+scores.filter(g=>g.recovery!==null).length+' recovered · '+members.filter(r=>r.termination==='interrupted').length+' interrupted</p>';
  }).join('');
  return shell('<p class="eyebrow">Research / Evidence</p><h1>Results explorer</h1><form class="filters" method="get">'+fields.map(k=>filter(k,[...new Set(rows.map(r=>r[k]))].sort(),params.get(k)??'')).join('')+'<button>Apply filters</button></form>'+
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
    '<details '+(f.image?'':'open')+'><summary>Browser evidence</summary><pre>'+h(f.view)+'</pre></details><p class="ledger">Underlying ledger · '+units.join(' / ')+' units</p><small>'+f.elapsedMs+' ms from start · frame '+(Math.max(0,Math.min(series.length-1,index))+1)+' of '+series.length+'</small></article>';
}
function anchor(a:Attempt){
  const event=a.events.findIndex(e=>e.result==='timeout');
  return event<0?0:Math.max(0,frames(a).findIndex(f=>f.eventCount>event));
}
export function replay(params:URLSearchParams){
  const rows=attempts(),first=rows.find(r=>r.id===(params.get('a')??'receiving-partial-1-verify'));
  if(!first)return shell('<h1>Attempt unavailable</h1>','Replay');
  const peers=rows.filter(r=>r.id!==first.id && r.workflow===first.workflow && r.seed===first.seed && r.condition===first.condition);
  const second=peers.find(r=>r.id===params.get('b'))??peers.find(r=>r.model!==first.model)??peers[0];
  if(!second)return trace(first.id);
  const min=-Math.max(anchor(first),anchor(second)),max=Math.max(frames(first).length-anchor(first),frames(second).length-anchor(second))-1;
  const step=Math.min(max,Math.max(min,Number.parseInt(params.get('step')??'0')||0));
  const nav=(delta:number,label:string)=>link(url('/replays',{a:first.id,b:second.id,step:String(delta)}),label);
  return shell('<p class="eyebrow">'+h(first.workflow)+' / '+h(first.condition)+' / dataset '+first.seed+'</p><h1>Replay room</h1><p>Compare two operators from the same opening state. Step zero is the first visible timeout, or the opening screen for a clean run. Shorter traces hold their last frame.</p>'+
    '<form class="filters"><input type="hidden" name="a" value="'+h(first.id)+'"><label>Compare with<select name="b">'+peers.map(r=>'<option '+(r.id===second.id?'selected ':'')+'value="'+h(r.id)+'">'+h(r.id)+'</option>').join('')+'</select></label><button>Compare</button></form>'+
    '<div class="transport">'+(step>min?nav(step-1,'← Previous'):'<span>Start</span>')+'<strong>Step '+step+'</strong>'+nav(0,'Align at fault')+(step<max?nav(step+1,'Next →'):'<span>End</span>')+'</div><div class="compare">'+frameCard(first,anchor(first)+step)+frameCard(second,anchor(second)+step)+'</div><p>'+link(url('/trace',{id:first.id}),'Full first attempt')+' · '+link(url('/trace',{id:second.id}),'Full second attempt')+'</p>','Replay room');
}
export function trace(id:string){
  const all=attempts();
  const a=all.find(r=>r.id===id);
  if(!a)return shell('<h1>Attempt unavailable</h1>','Attempt');
  return shell('<p class="eyebrow">'+h(a.origin)+' / '+h(a.phase)+'</p><h1>Attempt record</h1><p>'+h(a.id)+' · '+h(a.model)+' · '+h(a.termination)+'</p>'+decision(a)+
    '<p>'+a.actions+' actions · '+(a.durationMs/1000).toFixed(1)+' seconds · '+a.tokens+' tokens · US$'+a.costUsd.toFixed(5)+' metered</p><p>'+(all.some(r=>r.id!==a.id&&r.condition===a.condition&&r.seed===a.seed&&r.workflow===a.workflow)?link(url('/replays',{a:id}),'Compare matched attempts'):'No matched peer has been recorded.')+'</p><section><h2>Recorded browser frames</h2>'+frames(a).map((f,i)=>'<details><summary>'+i+' · '+h(f.action)+'</summary>'+frameCard(a,i)+'</details>').join('')+'</section><section><h2>Decision history</h2>'+a.events.map(e=>'<details><summary>'+e.ms+' ms · '+h(e.kind)+' '+h(e.screen??e.result??'')+'</summary><pre>'+h(JSON.stringify(e,null,2))+'</pre></details>').join('')+'</section>','Attempt record');
}
export function screenshot(name:string){
  if(!/^[a-f0-9]{64}\.jpg$/.test(name))return;
  for(const path of ['published/screens','local/study/screens']){
    const file=resolve(dir,path,name);if(existsSync(file))return readFileSync(file);
  }
}
