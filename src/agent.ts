import {chromium} from 'playwright';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {startFixture} from './fixture.ts';
import {perform} from './record.ts';
import {action, recording, type Action, type Recording} from './model.ts';

export const prompt = 'Place exactly one order for the requested reference, item and quantity. Use the visible order desk controls. Finish when you have established the result.';
export const maxActions = 30;
export const maxMillis = 180_000;
const args = process.argv.slice(2);
const mode = z.enum(['stand-in','limit','disconnect','deadline','openai']).parse(args[0] ?? 'stand-in');
const scenario = z.enum(['normal','saved','lost']).parse(args[1] ?? 'normal');
const live = mode === 'openai';
const model = live ? process.env.OPENAI_MODEL : 'scripted-provider';
if (!model || (live && (!process.env.OPENAI_API_KEY || !args.includes('--allow-paid')))) {
  throw Error('Live mode requires --allow-paid, OPENAI_MODEL and OPENAI_API_KEY.');
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
    if (!steps.length) return [fill,{type:'fill',field:'Quantity',value:String(requested.quantity)},{type:'submit'}];
    if (steps.at(-1)?.view.includes('Submission timed out.') && steps.at(-1)?.action.type === 'submit'
        && !steps.some(step=>step.action.type === 'lookup')) {
      return [{type:'fill',field:'Order reference',value:requested.reference},{type:'lookup'}];
    }
    if (steps.at(-1)?.lookupResult === 'No order found for ' + requested.reference) return [{type:'submit'}];
    return [];
  }
  const response = await fetch('https://api.openai.com/v1/responses',{
    method:'POST', signal, headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({model,store:false,instructions:prompt,tools:functions,max_output_tokens:1024,
      input:JSON.stringify({requested, initialView, history:steps.map(({action,view})=>({action,view}))})})
  });
  if (!response.ok) throw Error('OpenAI returned HTTP '+response.status);
  const payload = z.object({status:z.literal('completed'),output:z.array(z.object({
    type:z.string(),name:z.string().optional(),arguments:z.string().optional()
  }))}).parse(await response.json());
  return payload.output.filter(item=>item.type === 'function_call').map(item=>
    action.parse({...JSON.parse(item.arguments ?? '{}'),type:item.name}));
}

const fixture = await startFixture(scenario);
try {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,env:{}});
  try {
    const page = await browser.newPage();
    await page.route('**/*',route=>new URL(route.request().url()).origin === fixture.url ? route.continue() : route.abort());
    await page.goto(fixture.url);
    const budget = mode === 'deadline' ? 75 : maxMillis;
    const signal = AbortSignal.timeout(budget);
    const run: Recording = {taskVersion:1,checkerVersion:1,scenario,origin:live?'openai':'stand-in',
      configuration:{driver:'local Chromium / labelled controls',model,prompt,maxActions,maxMillis:budget},
      initialView:await page.locator('main').ariaSnapshot(),requested:{reference:'CUE-'+randomUUID(),item:'Field notebook',quantity:2},
      steps:[],orders:fixture.orders};
    const expire = () => { void page.close().catch(()=>{}); };
    signal.addEventListener('abort',expire,{once:true});
    try {
      while (run.steps.length < maxActions) {
        signal.throwIfAborted();
        const batch = await decide(run.requested,run.steps,run.initialView,signal);
        if (!batch.length) break;
        for (const next of batch) {
          signal.throwIfAborted();
          if (run.steps.length === maxActions) break;
          run.steps.push(await perform(page,next));
        }
      }
      run.stopReason = run.steps.length === maxActions ? 'action-limit' : 'completed';
    } catch (error) {
      run.stopReason = signal.aborted ? 'time-limit' : 'interrupted';
      console.error(signal.aborted ? 'Time limit reached' : 'Attempt interrupted: '+(error instanceof Error ? error.name : 'unknown error'));
    } finally { signal.removeEventListener('abort',expire); }
    console.log(JSON.stringify(recording.parse(run),null,2));
  } finally { await browser.close(); }
} finally { fixture.close(); }
