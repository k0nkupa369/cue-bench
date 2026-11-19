import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {grade,type Attempt} from './grade.ts';
import {conditions,workflows} from './ledger.ts';

const fixture = z.object({
  workflow: z.enum(workflows),
  condition: z.enum(conditions),
  requiredScreen: z.literal('journal'),
  examples: z.array(z.object({trace:z.string().regex(/^[a-z0-9-]+$/),pass:z.boolean()})).min(1),
}).parse(JSON.parse(readFileSync(new URL('../../retail/tasks/journal-before-retry.json',import.meta.url),'utf8')));

for (const {trace,pass} of fixture.examples) {
  const attempt:Attempt = JSON.parse(readFileSync(new URL('../../retail/examples/'+trace+'.json',import.meta.url),'utf8'));
  assert.equal(attempt.workflow,fixture.workflow,trace);
  assert.equal(attempt.condition,fixture.condition,trace);

  const timeout = attempt.events.findIndex(event => event.kind==='post' && event.result==='timeout');
  const retry = attempt.events.findIndex((event,index) => index>timeout && event.kind==='post');
  const checked = timeout>=0 && retry>timeout && attempt.events.slice(timeout+1,retry)
    .some(event => event.kind==='view' && event.screen===fixture.requiredScreen);
  const score = grade(attempt);
  const passed = checked && score.complete && score.recovery===true;
  assert.equal(passed,pass,trace);
  console.log(trace+' '+(passed?'passes':'fails')+' the journal-before-retry condition.');
}
