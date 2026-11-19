// Package only curated synthetic study runs. Local human sessions remain private to their checkout.
import {createHash} from 'node:crypto';
import {existsSync,readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {plan} from './study.ts';
import {grade,type Attempt} from './grade.ts';
const source=fileURLToPath(new URL('../../retail/local/study/',import.meta.url));
const dest=fileURLToPath(new URL('../../retail/published/',import.meta.url));
const expected=plan();
mkdirSync(dest+'attempts',{recursive:true});mkdirSync(dest+'screens',{recursive:true});
const checksums:Record<string,string>={};
function copy(from:string,to:string){
  const blob=readFileSync(source+from);
  writeFileSync(dest+to,blob);
  checksums[to]=createHash('sha256').update(blob).digest('hex');
}
for(const j of expected){
  const name='attempts/'+j.id+'.json';
  if(!existsSync(source+name))throw Error('Uncollected study slot: '+j.id);
  const run:Attempt=JSON.parse(readFileSync(source+name,'utf8'));
  if(run.origin!=='openai'||run.id!==j.id||run.condition!==j.condition||run.seed!==j.seed||!grade(run).invariants)
    throw Error('Unverified recording: '+j.id);
  for(const f of run.frames)if(f.image){
    if(!/^[0-9a-f]{64}\.jpg$/.test(f.image))throw Error('Invalid image name');
    if(!checksums['screens/'+f.image])copy('screens/'+f.image,'screens/'+f.image);
  }
  copy(name,name);
}
const revisions=source+'revisions';
if(existsSync(revisions))for(const rev of readdirSync(revisions)){
  const sub='revisions/'+rev+'/';
  mkdirSync(dest+sub+'attempts',{recursive:true});
  copy(sub+'manifest.json',sub+'manifest.json');
  for(const filename of readdirSync(source+sub+'attempts').filter(f=>f.endsWith('.json'))){
    copy(sub+'attempts/'+filename,sub+'attempts/'+filename);
    const run:Attempt=JSON.parse(readFileSync(source+sub+'attempts/'+filename,'utf8'));
    for(const f of run.frames)if(f.image){
      mkdirSync(dest+sub+'screens',{recursive:true});copy(sub+'screens/'+f.image,sub+'screens/'+f.image);
    }
  }
}
copy('budget.json','budget.json');copy('manifest.json','manifest.json');
writeFileSync(dest+'sha256.json',JSON.stringify(checksums,null,2)+'\n');
console.log('Packaged '+expected.length+' study slots and '+Object.keys(checksums).length+' checksummed artifacts.');
