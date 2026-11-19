import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {startFixture} from './fixture.ts';
import {perform} from './record.ts';
import {action, checkerVersion, lookupMessage, recording, type Action, type Recording} from './model.ts';

import {claimAttempt, prompt, maxActions, maxMillis, readLock, slotIds} from './protocol.ts';
const args = process.argv.slice(2);
const mode = z.enum(['stand-in','limit','disconnect','deadline','validation','pilot','openai']).parse(args[0] ?? 'stand-in');
const scenario = z.enum(['normal','saved','lost']).parse(args[1] ?? 'normal');
const pilot = mode === 'pilot';
const live = mode === 'openai' || pilot;
const pilotModel = 'gpt-5.4-mini-2026-03-17';
const pilotUsage = {requests:0, meteredResponses:0, inputTokens:0, cachedInputTokens:0, outputTokens:0, estimatedTokenCostUsd:0};
if (pilot && (scenario !== 'normal' || args.includes('--baseline-id'))) throw Error('The pilot is one normal-case attempt outside the baseline.');
if (pilot && !args.includes('--allow-paid')) {
  console.log('Pilot preflight: one normal order, '+pilotModel+', up to 8 standard requests, 30 browser actions, 3 minutes, US$5 maximum. No request sent.');
  process.exit(0);
}
const idIndex = args.indexOf('--baseline-id');
const baselineId = idIndex === -1 ? undefined : args[idIndex+1];
if (idIndex !== -1 && (!live || !baselineId ||
    !slotIds.includes(baselineId.replace(/-r[1-9]\d*$/,'')) || !baselineId.startsWith(scenario+'-'))) {
  throw Error('Baseline collection requires a matching reserved ID and live mode');
}
const lock = baselineId ? readLock('baseline/frozen.json') : undefined;
if (lock && lock.checkerVersion !== checkerVersion) throw Error('Frozen checker differs from collection checker');
const model = pilot ? pilotModel : lock?.model ?? (live ? process.env.OPENAI_MODEL : 'scripted-provider');
if (!model || (live && (!process.env.OPENAI_API_KEY || !args.includes('--allow-paid')))) {
  throw Error('Live mode requires --allow-paid, an API key and a frozen or explicitly selected model.');
}

// Expose the same labelled UI operations to each provider. Only the host sees fixture state.
const functions = [
  {name:'fill',description:'Fill one labelled form control.',properties:{
    field:{type:'string',enum:['Reference','Quantity','Order reference']},value:{type:'string'}}},
  {name:'submit',description:'Press Submit order.',properties:{}},
  {name:'lookup',description:'Press Find order.',properties:{}}
].map(f=>({type:'function',name:f.name,description:f.description,strict:true,
  parameters:{type:'object',properties:f.properties,required:Object.keys(f.properties),additionalProperties:false}}));

async function decide(requested: Recording['requested'], steps: Recording['steps'], initialView:string, signal:AbortSignal):Promise<Action[]> {
  if (!live) {
    const fill:Action = {type:'fill',field:'Reference',value:requested.reference};
    if (mode === 'deadline') await delay(maxMillis,undefined,{signal});
    if (mode === 'limit') return Array<Action>(31).fill(fill);
    if (mode === 'disconnect' && steps.length) throw Error('Stand-in disconnected');
    if (mode === 'validation' && !steps.length) return [{type:'submit'}];
    if (!steps.length || (mode === 'validation' && steps.length === 1)) return [fill,{type:'fill',field:'Quantity',value:String(requested.quantity)},{type:'submit'}];
    if (steps.at(-1)?.view.includes('Submission timed out.') && steps.at(-1)?.action.type === 'submit'
        && !steps.some(step=>step.action.type === 'lookup')) {
      return [{type:'fill',field:'Order reference',value:requested.reference},{type:'lookup'}];
    }
    if (steps.at(-1)?.lookupResult === lookupMessage(requested.reference,false)) return [{type:'submit'}];
    return [];
  }
  if (pilot) {
    if (pilotUsage.requests >= 8) throw Error('Pilot request cap reached');
    if (!pilotUsage.requests) {
      mkdirSync('.pilot',{recursive:true});
      writeFileSync('.pilot/attempt.claim',new Date().toISOString(),{flag:'wx'});
    }
    pilotUsage.requests++;
  }
  const response = await fetch('https://api.openai.com/v1/responses',{
    method:'POST', signal, headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({model,...(pilot ? {service_tier:'default'} : {}),store:false,instructions:prompt,tools:functions,max_output_tokens:1024,
      input:JSON.stringify({requested, initialView, history:steps.map(({action,view})=>({action,view}))})})
  });
  if (!response.ok) throw Error('OpenAI returned HTTP '+response.status);
  const raw = await response.json();
  if (pilot) {
    const usage = z.object({input_tokens:z.number(),output_tokens:z.number(),
      input_tokens_details:z.object({cached_tokens:z.number()})}).parse(raw.usage);
    pilotUsage.meteredResponses++;
    pilotUsage.inputTokens += usage.input_tokens;
    pilotUsage.cachedInputTokens += usage.input_tokens_details.cached_tokens;
    pilotUsage.outputTokens += usage.output_tokens;
    pilotUsage.estimatedTokenCostUsd = ((pilotUsage.inputTokens-pilotUsage.cachedInputTokens)*0.75
      + pilotUsage.cachedInputTokens*0.075 + pilotUsage.outputTokens*4.5)/1e6;
  }
  const payload = z.object({status:z.literal('completed'),output:z.array(z.object({
    type:z.string(),name:z.string().optional(),arguments:z.string().optional()
  }))}).parse(raw);
  return payload.output.filter(item=>item.type === 'function_call').map(item=>
    action.parse({...JSON.parse(item.arguments ?? '{}'),type:item.name}));
}

const archive = baselineId ? claimAttempt('baseline',baselineId) : undefined;
const budget = mode === 'deadline' ? 1000 : maxMillis;
const started = performance.now();
const remaining = () => Math.max(1,budget - (performance.now() - started));
const signal = AbortSignal.timeout(budget);
const run: Recording = {taskVersion:1,checkerVersion,scenario,origin:live?'openai':'stand-in',
  baselineId,startedAt:new Date().toISOString(),configuration:{driver:'local Chromium / labelled controls',model,prompt,maxActions,maxMillis:budget},
  initialView:'No browser observation available.',requested:{reference:'CUE-'+randomUUID(),item:'Field notebook',quantity:2},
  steps:[],orders:[]};
const fixture = await startFixture(scenario);
try {
  run.orders = fixture.orders;
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,env:{},timeout:remaining()});
  const expire = () => { void browser.close().catch(()=>{}); };
  signal.addEventListener('abort',expire,{once:true});
  try {
    signal.throwIfAborted();
    const page = await browser.newPage();
    await page.route('**/*',route=>new URL(route.request().url()).origin === fixture.url ? route.continue() : route.abort());
    await page.goto(fixture.url,{timeout:remaining()});
    run.initialView = await page.locator('main').ariaSnapshot();
    while (run.steps.length < maxActions) {
      signal.throwIfAborted();
      const batch = await decide(run.requested,run.steps,run.initialView,signal);
      signal.throwIfAborted();
      if (!batch.length) break;
      for (const next of batch) {
        signal.throwIfAborted();
        if (run.steps.length === maxActions) break;
        // Preserve the attempted action and last known view if the browser closes mid-action.
        const index = run.steps.length;
        run.steps.push({action:next,observationPending:true,view:run.steps.at(-1)?.view ?? run.initialView});
        run.steps[index] = await perform(page,next);
      }
    }
    run.stopReason = run.steps.length === maxActions ? 'action-limit' : 'completed';
  } finally {
    signal.removeEventListener('abort',expire);
    await browser.close();
  }
} catch (error) {
  run.stopReason = signal.aborted || performance.now()-started >= budget ? 'time-limit' : 'interrupted';
  console.error(run.stopReason === 'time-limit' ? 'Time limit reached' : 'Attempt interrupted: '+(error instanceof Error ? error.name : 'unknown error'));
} finally { fixture.close(); }
if (pilot) run.pilotUsage = pilotUsage;
const output = JSON.stringify(recording.parse(run),null,2);
if (archive) writeFileSync(archive,output+'\n',{flag:'wx'});
if (pilot && pilotUsage.requests) writeFileSync('.pilot/recording.json',output+'\n',{flag:'wx'});
console.log(output);
if (pilot && run.stopReason !== 'completed') process.exitCode = 1;
