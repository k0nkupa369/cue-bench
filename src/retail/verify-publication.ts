import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {relative,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {plan,protocol,rates} from './study.ts';
import {grade,type Attempt} from './grade.ts';

type ReceiptAttempt=Attempt & {receiptCount:number,unknownCharges:number};
type Charge={attempt:string,reserved:number,cost?:number,input?:number,cached?:number,output?:number};
export function verify(root:string){
  const json=(name:string)=>JSON.parse(readFileSync(root+name,'utf8'));
  const hashes=json('sha256.json') as Record<string,string>;
  const files=readdirSync(root,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>
    relative(root,join(e.parentPath,e.name)));
  if(files.some(name=>name!=='sha256.json'&&!Object.hasOwn(hashes,name)))throw Error('Unindexed evidence file');
  for(const required of ['budget.json','manifest.json'])if(!hashes[required])throw Error('Missing '+required);
  for(const [name,expected] of Object.entries(hashes)){
    if(name.includes('..')||name.startsWith('/'))throw Error('Invalid evidence path');
    if(createHash('sha256').update(readFileSync(root+name)).digest('hex')!==expected)throw Error('Digest mismatch: '+name);
  }
  const manifest=json('manifest.json'),jobs=plan();
  if(JSON.stringify(manifest.jobs)!==JSON.stringify(jobs)||JSON.stringify(manifest.protocol)!==JSON.stringify(protocol)
    ||JSON.stringify(manifest.rates)!==JSON.stringify(rates)||manifest.capUsd!==25)throw Error('Frozen design differs');
  const archived:ReceiptAttempt[]=[];
  for(const path of Object.keys(hashes).filter(p=>/(^|\/)attempts\/[^/]+\.json$/.test(p))){
    const a:ReceiptAttempt=json(path);
    const j=jobs.find(j=>j.id===a.id);
    if(!j||a.origin!=='openai'||a.workflow!=='receiving'||a.model!==rates[j.model].snapshot||a.mode!==j.mode||
      a.phase!==j.phase||a.condition!==j.condition||a.seed!==j.seed||!grade(a).invariants) throw Error('Ledger or assignment mismatch: '+path);
    if(!path.endsWith('/'+j.id+'.json'))throw Error('Recording ID does not match filename');
    for(const f of a.frames)if(f.image&&!hashes[path.split('attempts/')[0]+'screens/'+f.image])throw Error('Missing screenshot: '+a.id);
    archived.push(a);
  }
  for(const j of jobs)if(!hashes['attempts/'+j.id+'.json'])throw Error('Missing slot: '+j.id);
  const charges=json('budget.json') as Charge[];
  if(charges.some(c=>!jobs.some(j=>j.id===c.attempt)||!Number.isFinite(c.reserved)||c.reserved<=0))throw Error('Invalid reservation');
  for(const j of jobs){
    const r=rates[j.model],ledger=charges.filter(c=>c.attempt===j.id),records=archived.filter(a=>a.id===j.id);
    const metered=ledger.filter(c=>c.cost!==undefined);
    for(const c of metered){
      if(![c.input,c.cached,c.output].every(n=>Number.isInteger(n)&&n!>=0)||c.cached!>c.input!)throw Error('Invalid token receipt');
      const price=((c.input!-c.cached!)*r.input+c.cached!*r.cached+c.output!*r.output)/1e6;
      if(!Number.isFinite(c.cost)||Math.abs(c.cost!-price)>1e-8||price>c.reserved)throw Error('Incorrect token cost');
    }
    if(records.reduce((n,a)=>n+a.receiptCount,0)!==metered.length||
      records.reduce((n,a)=>n+a.unknownCharges,0)!==ledger.length-metered.length||
      records.reduce((n,a)=>n+a.tokens,0)!==metered.reduce((n,c)=>n+c.input!+c.output!,0)||
      Math.abs(records.reduce((n,a)=>n+a.costUsd,0)-metered.reduce((n,c)=>n+c.cost!,0))>1e-8)throw Error('Receipt reconciliation failed for '+j.id);
  }
  const bound=charges.reduce((sum,c)=>sum+(c.cost??c.reserved),0);
  if(!Number.isFinite(bound)||bound>25)throw Error('Budget evidence exceeds authorization');
  return {slots:jobs.length,files:Object.keys(hashes).length,requests:charges.length,
    uncertain:charges.filter(c=>c.cost===undefined).length,meteredUsd:charges.reduce((s,c)=>s+(c.cost??0),0),boundUsd:bound};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  console.log(verify(fileURLToPath(new URL('../../retail/published/',import.meta.url))));
}
