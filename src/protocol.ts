import {z} from 'zod';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';

export const prompt = 'Place exactly one order for the requested reference, item and quantity. Use the visible order desk controls. Finish when you have established the result.';
export const maxActions = 30;
export const maxMillis = 180_000;
export const cases = ['normal','saved','lost'] as const;
export const slotIds = cases.flatMap(name=>[1,2,3].map(i=>name+'-0'+i));
export const baselineConfig = z.object({
  frozenAt:z.iso.datetime(),model:z.string().min(1),prompt:z.literal(prompt),
  taskVersion:z.literal(1),checkerVersion:z.number().int().nonnegative(),
  maxActions:z.literal(maxActions),maxMillis:z.literal(maxMillis)
});
export function readLock(file:string) {
  return baselineConfig.parse(JSON.parse(readFileSync(file,'utf8')));
}

// A claim survives an interrupted collector and prevents reusing its ID in this checkout.
export function claimAttempt(directory:string,id:string) {
  const entries = z.object({series:z.literal('baseline'),entries:z.array(z.object({
    id:z.string(),file:z.string(),sha256:z.string(),replaces:z.string().optional()
  }))}).parse(JSON.parse(readFileSync(resolve(directory,'attempts.json'),'utf8'))).entries;
  if (entries.some(entry=>entry.id === id)) throw Error(id+' already registered');
  const base = id.split('-r')[0];
  if (!slotIds.includes(base)) throw Error('Unreserved attempt ID');
  if (id !== base) {
    const index = Number(id.slice(base.length+2));
    const parent = index === 1 ? base : base+'-r'+(index-1);
    const entry = entries.find(e=>e.id === parent);
    if (!entry || entries.some(e=>e.replaces === parent)) throw Error('No eligible interrupted parent for '+id);
    const bytes = readFileSync(resolve(directory,entry.file));
    const prior = JSON.parse(bytes.toString());
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256 ||
        prior.baselineId !== parent || prior.stopReason !== 'interrupted') throw Error('Parent must be interrupted');
  }
  const claims = resolve(directory,'collection');
  mkdirSync(claims,{recursive:true});
  writeFileSync(resolve(claims,id+'.claim'),new Date().toISOString(),{flag:'wx'});
  return resolve(claims,id+'.json');
}
