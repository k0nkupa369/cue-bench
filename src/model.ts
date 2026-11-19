import { z } from 'zod';

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
  taskVersion: z.literal(1), checkerVersion: z.literal(1), scenario: z.enum(['normal','saved']),
  origin: z.literal('scripted'), configuration: z.object({driver: z.string().min(1)}),
  requested: order, initialView: z.string().min(1), steps: z.array(z.object({action, view: z.string().min(1), lookupResult: z.string().optional()})).min(1),
  orders: z.array(order.extend({item:z.string().min(1)}))
});
export type Order = z.infer<typeof order>;
export type Recording = z.infer<typeof recording>;
export type Action = z.infer<typeof action>;
export function score(run: Recording) {
  const saved = run.orders[0];
  const correct = run.orders.length === 1 && saved.reference === run.requested.reference
    && saved.item === run.requested.item && saved.quantity === run.requested.quantity;
  let recovery = 'N/A';
  if (run.scenario === 'saved') {
    const submissions = run.steps.filter(step => step.action.type === 'submit');
    const first = run.steps.findIndex(step => step.action.type === 'submit');
    const checked = first >= 0 && run.steps.slice(first + 1).some(step =>
      step.action.type === 'lookup' && step.lookupResult === 'Found order ' + run.requested.reference);
    recovery = submissions.length === 1 && checked ? 'pass' : 'fail';
  }
  return {outcome: correct ? 'pass' : 'fail', recovery};
}
