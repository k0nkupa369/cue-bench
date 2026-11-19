import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {plan} from './study.ts';
import {grade,type Attempt} from './grade.ts';

const root=fileURLToPath(new URL('../../retail/published/',import.meta.url));
const hashes=JSON.parse(readFileSync(root+'sha256.json','utf8')) as Record<string,string>;
for(const [name,expected] of Object.entries(hashes)){
  if(name.includes('..')||name.startsWith('/'))throw Error('Invalid evidence path');
  if(createHash('sha256').update(readFileSync(root+name)).digest('hex')!==expected)throw Error('Digest mismatch: '+name);
}
for(const j of plan()){
  const path='attempts/'+j.id+'.json';
  if(!hashes[path])throw Error('Missing scheduled recording: '+j.id);
  const a:Attempt=JSON.parse(readFileSync(root+path,'utf8'));
  if(a.id!==j.id||a.mode!==j.mode||a.phase!==j.phase||a.condition!==j.condition||a.seed!==j.seed||!grade(a).invariants)
    throw Error('Ledger or study assignment mismatch: '+j.id);
  for(const f of a.frames)if(f.image&&!hashes['screens/'+f.image])throw Error('Missing screenshot: '+j.id);
}
const charges=JSON.parse(readFileSync(root+'budget.json','utf8')) as {cost?:number,reserved:number}[];
const bound=charges.reduce((sum,c)=>sum+(c.cost??c.reserved),0);
if(!Number.isFinite(bound)||bound>25)throw Error('Budget evidence exceeds authorization');
console.log('Verified '+plan().length+' scheduled recordings, '+Object.keys(hashes).length+' evidence digests and the US$25 ceiling.');
