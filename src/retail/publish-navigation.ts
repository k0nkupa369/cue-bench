import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdtempSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import type {StandaloneAttempt} from './providers.ts';

const retail=fileURLToPath(new URL('../../retail',import.meta.url));
const target=join(retail,'navigation-study');
if(existsSync(target))throw Error('Study already published');
const raw=execFileSync(process.execPath,[fileURLToPath(new URL('navigation-experiment.ts',import.meta.url)),'report'],{encoding:'utf8'});
const report=JSON.parse(raw) as {pairs:number,plannedPairs:number,capUsd:number,boundUsd:number,rows:{result:{id:string,termination:string,unknown:number}|null}[]};
if(report.pairs!==report.plannedPairs||report.boundUsd>report.capUsd||report.rows.some(r=>!r.result||r.result.termination==='checkpoint'||r.result.unknown))
  throw Error('Only complete reconciled studies may be packaged');
const stage=mkdtempSync(join(retail,'navigation-stage-'));
const hashes:Record<string,string>={};
try{
  for(const folder of ['attempts','screens'])mkdirSync(join(stage,folder));
  function copy(relative:string,source:string){
    cpSync(source,join(stage,relative));
    hashes[relative]=createHash('sha256').update(readFileSync(join(stage,relative))).digest('hex');
  }
  copy('manifest.json',join(retail,'local/navigation-v1/manifest.json'));
  for(const row of report.rows){
    const id=row.result!.id;
    if(!/^standalone-openai-[a-f0-9-]{36}$/.test(id))throw Error('Unexpected recording ID');
    const relative='attempts/'+id+'.json';
    copy(relative,join(retail,'local/standalone',relative));
    const a:StandaloneAttempt=JSON.parse(readFileSync(join(stage,relative),'utf8'));
    for(const frame of a.frames){
      if(!frame.image)continue;
      if(!/^[a-f0-9]{64}\.jpg$/.test(frame.image))throw Error('Unexpected screenshot filename');
      const path='screens/'+frame.image;
      if(!hashes[path])copy(path,join(retail,'local/standalone',path));
      if(hashes[path]!==frame.image.slice(0,64))throw Error('Screenshot digest mismatch');
    }
  }
  writeFileSync(join(stage,'report.json'),raw);
  hashes['report.json']=createHash('sha256').update(raw).digest('hex');
  writeFileSync(join(stage,'sha256.json'),JSON.stringify(hashes,null,2)+'\n');
  renameSync(stage,target);
}finally{rmSync(stage,{recursive:true,force:true});}
