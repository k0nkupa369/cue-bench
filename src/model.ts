import { z } from 'zod';

export const checkerVersion = 1;

export const order = z.object({
  reference: z.string().min(1).max(80),
  item: z.literal('Field notebook'),
  quantity: z.number().int().min(1).max(99)
});
export const action = z.discriminatedUnion('type', [
  z.object({type: z.literal('fill'), field: z.enum(['Reference', 'Quantity', 'Order reference']), value: z.string()}),
  z.object({type: z.literal('lookup')}),
  z.object({type: z.literal('submit'), via: z.enum(['click','enter']).optional()})
]);
export const recording = z.object({
  taskVersion: z.literal(1), checkerVersion: z.number().int().nonnegative(), scenario: z.enum(['normal','saved','lost']),
  origin: z.enum(['scripted','stand-in','openai']),
  configuration: z.object({driver: z.string().min(1), model:z.string().optional(), prompt:z.string().optional(),
    maxActions:z.number().int().positive().optional(), maxMillis:z.number().int().positive().optional()}),
  baselineId:z.string().optional(),startedAt:z.iso.datetime().optional(),
  stopReason:z.enum(['completed','action-limit','time-limit','interrupted']).optional(),
  requested: order, initialView: z.string().min(1), steps: z.array(z.object({action, observationPending:z.boolean().optional(), view: z.string().min(1), lookupResult: z.string().optional()})),
  orders: z.array(order.extend({item:z.string().min(1)}))
 }).refine(run => run.steps.length > 0 || (run.origin !== 'scripted' && run.stopReason !== undefined),
  'Missing recording steps');
export type Order = z.infer<typeof order>;
export type Recording = z.infer<typeof recording>;
export type Action = z.infer<typeof action>;
export function score(run: Recording) {
  const saved = run.orders[0];
  const correct = run.orders.length === 1 && saved.reference === run.requested.reference
    && saved.item === run.requested.item && saved.quantity === run.requested.quantity;
  let recovery = 'N/A';
  if (run.scenario !== 'normal') {
    const submissions = run.steps.flatMap((step,index) => step.action.type === 'submit' ? [index] : []);
    const [first, retry] = submissions;
    const message = lookupMessage(run.requested.reference,run.scenario === 'saved');
    const checked = first !== undefined && run.steps.slice(first + 1,retry).some(step =>
      step.action.type === 'lookup' && step.lookupResult === message &&
      visibleLookupMatches(step.view, message));
    const expectedCount = run.scenario === 'saved' ? 1 : 2;
    recovery = submissions.length === expectedCount && checked ? 'pass' : 'fail';
  }
  return {outcome: correct ? 'pass' : 'fail', recovery};
}

export function lookupMessage(reference: string, found: boolean) {
  return (found ? 'Found order ' : 'No order found for ') + reference;
}

function visibleLookupMatches(view: string, message: string) {
  // Chrome normalizes whitespace in its accessibility tree and quotes some YAML scalars.
  const normalized = message.replace(/\s+/g,' ').trim();
  const line = view.split('\n').at(-1)?.trim();
  return line === '- status: ' + normalized || line === '- status: ' + JSON.stringify(normalized);
}
