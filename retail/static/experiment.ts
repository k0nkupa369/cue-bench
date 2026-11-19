import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {escape as h} from '../../src/retail/views.ts';
import type {StandaloneAttempt} from '../../src/retail/providers.ts';

type Row={seed:number,repeat:number,condition:string,policy:string,result:{id:string,complete:boolean,prematureFinish:boolean,posted:boolean,excess:number,calls:number}};
export function buildExperiment(root:string,site:string){
  const dir=join(root,'retail/navigation-study');
  const report=JSON.parse(readFileSync(join(dir,'report.json'),'utf8')) as {rows:Row[],pairs:number,meteredUsd:number};
  const rows=report.rows.filter(r=>r.repeat);
  mkdirSync(join(site,'screens'),{recursive:true});
  const label=(p:string)=>p==='batch'?'Batch':'Refresh after navigation';
  const stats=['batch','refresh-after-navigation'].map(policy=>{
    const runs=rows.filter(r=>r.policy===policy);
    return '<tr><th>'+label(policy)+'</th>'+(['prematureFinish','posted','complete','excess','calls'] as const)
      .map(k=>'<td>'+runs.reduce((n,r)=>n+Number(r.result[k]),0)+'</td>').join('')+'</tr>';
  }).join('');
  function example(row:Row){
    const run:StandaloneAttempt=JSON.parse(readFileSync(join(dir,'attempts',row.result.id+'.json'),'utf8'));
    const clicks=run.frames.flatMap(frame=>{
      const c=frame.click;
      if(!c)return [];
      const source=run.frames.find(f=>f.observation?.id===c.observationId);
      if(!source?.image||!source.observation)return [];
      const {width,height}=source.observation.viewport;
      copyFileSync(join(dir,'screens',source.image),join(site,'screens',source.image));
      const target=c.target?(c.target.label||c.target.control||c.target.tag):'Unknown';
      const moved=source.observation.navigation.sequence!==c.before.sequence;
      return ['<details><summary>Click ('+c.x+', '+c.y+') · '+h(target)+'</summary><figure><div class="shot"><img loading="lazy" src="screens/'+h(source.image)+'" alt="Source screenshot for observation '+c.observationId+'"><i style="left:'+c.x/width*100+'%;top:'+c.y/height*100+'%"></i></div><figcaption>Observation '+c.observationId+'. '+(moved?'The page navigated between this screenshot and the click.':'The click used the same navigation state as this screenshot.')+' Browser target: '+h(target)+'.</figcaption></figure></details>'];
    }).join('');
    return '<article><h3>'+label(row.policy)+'</h3><p>'+row.result.calls+' requests · '+(row.result.complete?'correct completion':'job did not pass')+'</p>'+clicks+'<p><a href="https://github.com/k0nkupa369/cue-bench/blob/main/retail/navigation-study/attempts/'+row.result.id+'.json">Full recording</a></p></article>';
  }
  const pairs=rows.filter(r=>r.policy==='batch').map(a=>{
    const b=rows.find(r=>r.policy!==a.policy&&r.seed===a.seed&&r.repeat===a.repeat&&r.condition===a.condition)!;
    return '<section id="'+a.seed+'-'+a.condition+'-'+a.repeat+'"><h2>Dataset '+a.seed+' · '+h(a.condition)+' · repetition '+a.repeat+'</h2><div class="pair">'+example(a)+example(b)+'</div></section>';
  }).join('');
  const table='<div class="scroll"><table><thead><tr><th>Policy</th><th>Early finishes</th><th>Valid postings</th><th>Correct jobs</th><th>Excess units</th><th>API calls</th></tr></thead><tbody>'+stats+'</tbody></table></div>';
  writeFileSync(join(site,'experiment.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Screenshot refresh experiment · Cue Bench</title><link rel="stylesheet" href="case.css"><style>main{padding:2rem 0}.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:1rem}.shot{position:relative}.shot img{width:100%;display:block}.shot i{position:absolute;width:1rem;height:1rem;border:3px solid #b91d32;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 0 2px white}figure{margin:.75rem 0}.scroll{overflow:auto}summary{cursor:pointer}section{margin:2rem 0}</style><main class="wrap"><a href="./">Back to the playable delivery</a><h1>Does a fresh screenshot help?</h1><p>GPT-5.4 mini made '+report.pairs+' attempts per policy on the same receiving cases. An early finish means closing the job before a valid posting. Expand a click to see the screenshot the model used and the control the browser actually received.</p>'+table+'<p>Estimated spend including calibration: US$'+report.meteredUsd.toFixed(4)+'. Three synthetic datasets limit generalization. <a href="https://github.com/k0nkupa369/cue-bench/blob/main/retail/EXPERIMENT.md">Read the protocol</a>.</p>'+pairs+'</main></html>');
}
