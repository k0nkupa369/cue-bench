import {createHash,randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {grade} from './grade.ts';
import {protocol,rates} from './study.ts';
import type {StandaloneAttempt} from './providers.ts';

const root=fileURLToPath(new URL('../../retail/local/navigation-v1/',import.meta.url));
const cmd=process.argv[2]??'plan';
const published=new URL('../../retail/navigation-study/',import.meta.url);
const verify=cmd==='verify';
const attempts=verify?new URL('attempts/',published):new URL('../../retail/local/standalone/attempts/',import.meta.url);
const evidence=verify?JSON.parse(readFileSync(new URL('report.json',published),'utf8')):undefined;
const publishedIds=new Map<string,string>(evidence?.rows.map((r:{key:string,result:{id:string}})=>[r.key,r.result.id]));
const model=rates.mini.snapshot;
const policies=['batch','refresh-after-navigation'] as const;
type Slot={key:string,policy:typeof policies[number],seed:number,condition:'clean'|'partial',repeat:number};
function schedule(){
  const jobs:Slot[]=[{key:'calibration',policy:'batch',seed:91,condition:'clean',repeat:0}];
  for(const repeat of [1,2])for(const seed of [21,22,23])for(const condition of ['clean','partial'] as const){
    const order=(seed+repeat+Number(condition==='partial'))%2?policies:policies.toReversed();
    for(const policy of order)jobs.push({key:[seed,condition,repeat,policy].join('-'),policy,seed,condition,repeat});
  }
  return jobs;
}
const maxCalls=8,capUsd=25;
const boundPerRequest=(400000*rates.mini.input+protocol.outputTokens*rates.mini.output)/1e6;
const boundPerRun=maxCalls*boundPerRequest;
const jobs=schedule();
function fingerprint(){
  const hash=createHash('sha256');
  for(const file of ['navigation-experiment','run','providers','study','server','views','ledger','grade'])
    hash.update(readFileSync(new URL(file+'.ts',import.meta.url)));
  hash.update(readFileSync(new URL('../../retail/style.css',import.meta.url)));
  return hash.digest('hex');
}
function readSlot(slot:Slot){
  const claim=root+slot.key+'.claim';
  if(!verify&&!existsSync(claim))return;
  const uuid=verify?publishedIds.get(slot.key)?.replace(/^standalone-openai-/,'')??'':readFileSync(claim,'utf8').trim();
  if(!/^[0-9a-f-]{36}$/.test(uuid))throw Error('Invalid claim '+slot.key);
  const id='standalone-openai-'+uuid;
  const file=new URL(id+'.json',attempts);
  if(!existsSync(file))return {bound:boundPerRun,id};
  const a=JSON.parse(readFileSync(file,'utf8')) as StandaloneAttempt;
  if(a.id!==id||a.model!==model||a.seed!==slot.seed||a.condition!==slot.condition||
    a.workflow!=='receiving'||a.mode!=='pixels'||a.origin!=='openai'||a.policy!==slot.policy||
    a.maxCalls!==maxCalls||a.protocolVersion!==protocol.version||a.readbacks.length>maxCalls)throw Error('Mismatched attempt '+slot.key);
  let metered=0,unknown=0;
  for(const r of a.readbacks){
    const usage=r?.usage?.reported;
    if(!usage||!('input_tokens' in usage)||!('total_tokens' in usage)){unknown++;continue;}
    const cached=usage.input_tokens_details?.cached_tokens??0;
    if(cached>usage.input_tokens||usage.input_tokens>400000||usage.output_tokens>protocol.outputTokens)throw Error('Usage outside reservation');
    metered+=((usage.input_tokens-cached)*rates.mini.input+cached*rates.mini.cached+usage.output_tokens*rates.mini.output)/1e6;
  }
  const g=grade(a);
  return {id,bound:a.termination==='checkpoint'?boundPerRun:metered+unknown*boundPerRequest,metered,unknown,termination:a.termination,
    complete:g.complete,prematureFinish:a.events.at(-1)?.kind==='finish'&&!a.events.some(e=>e.kind==='post'&&(e.result==='applied'||e.result==='timeout')),
    posted:a.events.some(e=>e.kind==='post'&&(e.result==='applied'||e.result==='timeout')),excess:g.excessUnits,seconds:a.durationMs/1000,calls:a.readbacks.length};
}
function report(){
  const rows=jobs.map(slot=>({...slot,result:readSlot(slot)??null}));
  const effects=rows.filter(r=>r.repeat&&r.policy==='batch').flatMap(left=>{
    const right=rows.find(r=>r.seed===left.seed&&r.repeat===left.repeat&&r.condition===left.condition&&r.policy===policies[1]);
    const a=left.result,b=right?.result;
    if(!a?.termination||!b?.termination||[a.termination,b.termination].includes('checkpoint'))return [];
    return [{seed:left.seed,condition:left.condition,repeat:left.repeat,
      prematureFinish:Number(b.prematureFinish)-Number(a.prematureFinish),complete:Number(b.complete)-Number(a.complete),
      posted:Number(b.posted)-Number(a.posted),excess:b.excess!-a.excess!,seconds:b.seconds!-a.seconds!,calls:b.calls!-a.calls!}];
  });
  return {model,capUsd,boundUsd:rows.reduce((s,r)=>s+(r.result?.bound??0),0),
    meteredUsd:rows.reduce((s,r)=>s+(r.result?.metered??0),0),pairs:effects.length,plannedPairs:12,effects,rows};
}
if(verify){
  if(new Set(publishedIds.values()).size!==jobs.length||JSON.stringify(evidence)!==JSON.stringify(report()))throw Error('Report does not match archived attempts');
  const digests=JSON.parse(readFileSync(new URL('sha256.json',published),'utf8')) as Record<string,string>;
  const required=new Set(['manifest.json','report.json']);
  for(const id of publishedIds.values()){
    const path='attempts/'+id+'.json';
    required.add(path);
    const run:StandaloneAttempt=JSON.parse(readFileSync(new URL(path,published),'utf8'));
    for(const f of run.frames)if(f.image)required.add('screens/'+f.image);
  }
  if(required.size!==Object.keys(digests).length||[...required].some(p=>!digests[p]))throw Error('Incomplete artifact index');
  for(const [path,expected] of Object.entries(digests)){
    if(!/^(manifest\.json|report\.json|attempts\/standalone-openai-[a-f0-9-]+\.json|screens\/[a-f0-9]{64}\.jpg)$/.test(path))throw Error('Unexpected artifact path');
    if(createHash('sha256').update(readFileSync(new URL(path,published))).digest('hex')!==expected)throw Error('Digest mismatch '+path);
  }
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',published),'utf8'));
  if(JSON.stringify(manifest.jobs)!==JSON.stringify(jobs)||manifest.model!==model||manifest.capUsd!==capUsd||manifest.maxCalls!==maxCalls)throw Error('Protocol mismatch');
  console.log('Verified '+jobs.length+' recordings and '+evidence.pairs+' paired comparisons.');
}else if(cmd==='plan')console.log(JSON.stringify({model,capUsd,maxCalls,boundPerRun,jobs},null,2));
else if(cmd==='report')console.log(JSON.stringify(report(),null,2));
else if(cmd==='calibrate'||cmd==='collect'){
  if(!process.argv.includes('--allow-paid')||!process.env.OPENAI_API_KEY)throw Error('Explicit paid flag and OpenAI key required');
  mkdirSync(root,{recursive:true});
  const lock=root+'collector.lock';
  writeFileSync(lock,String(process.pid),{flag:'wx'});
  try{
    const manifest=JSON.stringify({digest:fingerprint(),model,capUsd,maxCalls,jobs});
    const path=root+'manifest.json';
    if(!existsSync(path))writeFileSync(path,manifest,{flag:'wx'});
    if(readFileSync(path,'utf8')!==manifest)throw Error('Collection source or schedule changed');
    if(cmd==='collect'){
      const calibration=readSlot(jobs[0]);
      if(!calibration?.termination||calibration.termination==='checkpoint'||calibration.termination==='interrupted'||calibration.unknown||!calibration.calls)
        throw Error('A finished calibration with usage is required');
    }
    for(const slot of jobs.filter(s=>cmd==='calibrate'?!s.repeat:s.repeat)){
      const results=report();
      if(results.rows.some(r=>r.result&&(!r.result.termination||r.result.termination==='checkpoint'||r.result.unknown)))throw Error('Unreconciled request or checkpoint; stopping collection');
      if(readSlot(slot))continue;
      if(results.boundUsd+boundPerRun>capUsd)throw Error('Next run would exceed the shared reservation ceiling');
      const uuid=randomUUID();
      writeFileSync(root+slot.key+'.claim',uuid,{flag:'wx'});
      const result=spawnSync(process.execPath,[fileURLToPath(new URL('run.ts',import.meta.url)),'--provider','openai','--model',model,
        '--mode','pixels','--workflow','receiving','--condition',slot.condition,'--seed',String(slot.seed),'--policy',slot.policy,
        '--max-calls',String(maxCalls),'--allow-paid'],{env:{...process.env,CUE_RETAIL_RUN_UUID:uuid},stdio:'inherit'});
      const saved=readSlot(slot);
      if(result.error||!saved?.termination||saved.termination==='checkpoint'||saved.unknown)throw Error('Reconcile slot '+slot.key+' before proceeding');
    }
  }finally{unlinkSync(lock);}
}else throw Error('Use plan, report, calibrate or collect');
