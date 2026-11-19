import {z} from 'zod';
import {readFileSync} from 'node:fs';

export const prompt = 'Place exactly one order for the requested reference, item and quantity. Use the visible order desk controls. Finish when you have established the result.';
export const maxActions = 30;
export const maxMillis = 180_000;
export const cases = ['normal','saved','lost'] as const;
export const slotIds = cases.flatMap(name=>[1,2,3].map(i=>name+'-0'+i));
export const baselineConfig = z.object({
  frozenAt:z.iso.datetime(),model:z.string().min(1),prompt:z.literal(prompt),
  taskVersion:z.literal(1),checkerVersion:z.literal(1),
  maxActions:z.literal(maxActions),maxMillis:z.literal(maxMillis)
});
export function readLock(file:string) {
  return baselineConfig.parse(JSON.parse(readFileSync(file,'utf8')));
}
