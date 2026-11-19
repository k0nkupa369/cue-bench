import {chromium,type Browser,type Page} from 'playwright';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {z} from 'zod';
import {Desk} from './ledger.ts';
import {startRetail} from './server.ts';
import {capture,grade,type Attempt} from './grade.ts';
import {type Condition} from './ledger.ts';

export const rates={
  mini:{snapshot:'gpt-5.4-mini-2026-03-17',input:.75,cached:.075,output:4.50},
  nano:{snapshot:'gpt-5.4-nano-2026-03-17',input:.20,cached:.020,output:1.25}
};
type Model=keyof typeof rates;
type Mode='controls'|'pixels';
type Job={id:string,model:Model,mode:Mode,condition:Condition,seed:number,repeat:number,phase:Attempt['phase']};
export const protocol={version:1,actions:40,minutes:4,outputTokens:600,width:1024,height:900,
  instruction:'Operate this fictional retail workbench to complete the assigned job. Read the source documents. Decide what to do from the visible evidence. When done, use Finish job or Send to supervisor. Respond with a JSON object containing actions, an ordered array of at most four actions. Stop a batch before you need new evidence. Never use external resources.'};
const decisionInstruction=protocol.instruction+' Include a short factual observation in the JSON field memo for your next step.';
function decisionFormat(mode:Mode){
  return {
    type:'object',additionalProperties:false,required:['memo','actions'],properties:{
      memo:{type:'string'},actions:{type:'array',items:{
        type:'object',additionalProperties:false,required:['op','target','value','x','y'],properties:{
          op:{type:'string',enum:mode==='controls'?['click','fill','select']:['click','type','key','scroll']},
          target:{type:['integer','null']},value:{type:['string','null']},x:{type:['integer','null']},y:{type:['integer','null']}
        }
      }}
    }
  };
}
export function plan():Job[]{
  const rows:Job[]=[];
  function add(phase:Job['phase'],seed:number,condition:Condition,model:Model,mode:Mode,repeat:number){
    rows.push({phase,seed,condition,model,mode,repeat,id:[phase,seed,condition,model,mode,repeat].join('-')});
  }
  for(const model of ['mini','nano'] as const)for(const mode of ['controls','pixels'] as const)add('calibration',90,'partial',model,mode,1);
  for(const repeat of [1,2,3])for(const seed of [1,2,3,4])for(const condition of ['clean','saved','lost','partial','conflict'] as const)
    for(const model of (seed+repeat)%2?['mini','nano'] as const:['nano','mini'] as const)add('development',seed,condition,model,'controls',repeat);
  for(const seed of [11,12,13,14])for(const condition of ['clean','saved','lost','partial','stale','conflict'] as const)
    for(const mode of ['controls','pixels'] as const)add('heldout',seed,condition,'mini',mode,1);
  return rows;
}

const root=fileURLToPath(new URL('../../retail/local/study',import.meta.url));
let haltPaid=false;
const budgetFile=root+'/budget.json';
const maxUsd=25;
type Charge={attempt:string,reserved:number,cost?:number,input?:number,cached?:number,output?:number};
function atomic(file:string,data:unknown){
  writeFileSync(file+'.tmp',JSON.stringify(data)+'\n');renameSync(file+'.tmp',file);
}
function reserve(id:string,model:Model){
  // Reserve the full context at the standard uncached price plus maximum output, before sending.
  if(haltPaid)throw Error('Paid requests stopped pending receipt reconciliation');
  const bound=(400000*rates[model].input+protocol.outputTokens*rates[model].output)/1e6;
  const charges:Charge[]=existsSync(budgetFile)?JSON.parse(readFileSync(budgetFile,'utf8')):[];
  if(charges.reduce((n,c)=>n+(c.cost??c.reserved),0)+bound>maxUsd) throw Error('Shared study spend limit reached');
  charges.push({attempt:id,reserved:bound});atomic(budgetFile,charges);return charges.length-1;
}
function settle(index:number,model:Model,usage:unknown){
  const u=z.object({input_tokens:z.number().int().nonnegative(),output_tokens:z.number().int().nonnegative(),
    input_tokens_details:z.object({cached_tokens:z.number().int().nonnegative()})}).parse(usage);
  const r=rates[model],cached=u.input_tokens_details.cached_tokens;
  const cost=((u.input_tokens-cached)*r.input+cached*r.cached+u.output_tokens*r.output)/1e6;
  const charges:Charge[]=JSON.parse(readFileSync(budgetFile,'utf8'));
  Object.assign(charges[index],{cost,input:u.input_tokens,cached,output:u.output_tokens});atomic(budgetFile,charges);
  return {cost,tokens:u.input_tokens+u.output_tokens};
}
const action=z.object({op:z.enum(['click','fill','select','type','key','scroll']),target:z.number().int().optional(),
  x:z.number().int().optional(),y:z.number().int().optional(),value:z.string().max(1200).optional()});
type Move=z.infer<typeof action>;
const selector='main a, main button, main input:not([type=hidden]), main textarea, main select';
async function observe(page:Page,mode:Mode){
  const text=await page.locator('main').innerText();
  if(mode==='pixels') return {text,image:(await page.screenshot({type:'jpeg',quality:65})).toString('base64')};
  const controls=await page.locator(selector).evaluateAll(els=>els.map((e,i)=>{
    const field=e as HTMLInputElement;
    return [i,e.tagName,field.labels?.[0]?.innerText??e.textContent,field.value??''].join(' ');
  }).join('\n'));
  return {text:text+'\nControls\n'+controls,image:undefined};
}
function observationPrompt(mode:Mode,history:string[],view:Awaited<ReturnType<typeof observe>>){
  const controls=mode==='controls'?'Use click/fill/select with numeric target from Controls and value for fill/select. End a batch at navigation; indexes can change.':
    'Use click with integer x,y in the 1024x900 image; type with value; key with Tab, Enter, ArrowDown, ArrowUp, Backspace or ControlOrMeta+a; scroll with value up/down.';
  return 'Return a JSON object with actions and memo. '+controls+'\nPrior observations and actions:\n'+history.slice(-14).join('\n')+'\nCurrent screen:\n'+(view.image?'See image.':view.text);
}
async function act(page:Page,m:Move,mode:Mode,waitForClickNavigation=true){
  if(mode==='controls'){
    if(m.target===undefined || m.target<0)throw Error('Invalid control index');
    const el=page.locator(selector).nth(m.target);
    if(m.op==='click')await el.click();else if(m.op==='fill')await el.fill(m.value??'');
    else if(m.op==='select')await el.selectOption({label:m.value??''});else throw Error('Unknown control operation');
  }else{
    if(m.op==='click' && m.x!==undefined && m.y!==undefined && m.x>=0 && m.x<protocol.width && m.y>=0 && m.y<protocol.height){
      const navigation=waitForClickNavigation&&await page.evaluate(([x,y])=>{
        const el=document.elementFromPoint(x,y)?.closest('a,button');
        return el instanceof HTMLAnchorElement || el instanceof HTMLButtonElement && !!el.form?.checkValidity();
      },[m.x,m.y]);
      if(navigation)await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.mouse.click(m.x,m.y)]);
      else await page.mouse.click(m.x,m.y);
    }
    else if(m.op==='type')await page.keyboard.insertText(m.value??'');
    else if(m.op==='key' && ['Tab','Enter','ArrowDown','ArrowUp','Backspace','ControlOrMeta+a','Home','End','Space'].includes(m.value??''))await page.keyboard.press(m.value!);
    else if(m.op==='scroll')await page.mouse.wheel(0,m.value==='up'?-560:560);
    else throw Error('Invalid screen operation');
  }
}
type LiveAttempt=Attempt & {error?:string,receiptCount:number,unknownCharges:number};
async function runJob(browser:Browser,j:Job,rehearsal=false):Promise<LiveAttempt>{
  const f=await startRetail({seed:j.seed,condition:j.condition,workflow:'receiving'});
  const context=await browser.newContext({viewport:{width:protocol.width,height:protocol.height}});
  const start=Date.now();
  let costUsd=0,tokens=0,actions=0,receiptCount=0,unknownCharges=0,error:string|undefined;
  const frames:Attempt['frames']=[];
  let termination:Attempt['termination']='interrupted';
  const signal=AbortSignal.timeout(protocol.minutes*60000);
  const close=()=>{void context.close().catch(()=>{});};
  signal.addEventListener('abort',close,{once:true});
  try{
    const page=await context.newPage();page.setDefaultTimeout(3000);
    await page.route('**/*',r=>new URL(r.request().url()).origin===f.url?r.continue():r.abort());
    await page.goto(f.url);await page.getByRole('button',{name:'Start receiving job'}).click();
    const desk=[...f.sessions.values()][0];
    const history:string[]=[];
    for(let turn=0;turn<protocol.actions && actions<protocol.actions && !desk.finished;turn++){
      signal.throwIfAborted();
      const view=await observe(page,j.mode);
      let imagePath:string|undefined;
      if(view.image && !rehearsal){
        imagePath=createHash('sha256').update(view.image).digest('hex')+'.jpg';
        writeFileSync(root+'/screens/'+imagePath,Buffer.from(view.image,'base64'));
      }
      frames.push({action:'Observation '+(turn+1),view:view.text,elapsedMs:Date.now()-start,eventCount:desk.events.length,image:imagePath});
      const content:object[]=[{type:'input_text',text:observationPrompt(j.mode,history,view)}];
      if(view.image)content.push({type:'input_image',image_url:'data:image/jpeg;base64,'+view.image,detail:'high'});
      if(!rehearsal)atomic(root+'/attempts/'+j.id+'.checkpoint',{...capture(desk),frames,actions,durationMs:Date.now()-start});
      let moves:Move[];
      let memo='';
      if(rehearsal){
        if(j.mode==='controls')moves=[{op:'click',target:await page.locator(selector).evaluateAll(els=>els.findIndex(e=>e.textContent==='Finish job'))}];
        else {const box=await page.getByRole('button',{name:'Finish job'}).boundingBox();if(!box)throw Error('Missing finish');moves=[{op:'click',x:Math.floor(box.x+5),y:Math.floor(box.y+5)}];}
      }else{
        const charge=reserve(j.id,j.model);unknownCharges++;
        const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal,headers:{
          Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({
            model:rates[j.model].snapshot,store:false,service_tier:'default',max_output_tokens:protocol.outputTokens,
            instructions:decisionInstruction,
            text:{format:{type:'json_schema',name:'browser_decision',strict:true,schema:decisionFormat(j.mode)}},
            input:[{role:'user',content}]})});
        if(!response.ok){
          const info=await response.json().catch(()=>({}));
          const diagnostic=String(info.error?.message??'').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,180);
          throw Error('OpenAI HTTP '+response.status+' '+(info.error?.code??'')+' '+diagnostic);
        }
        const body=await response.json();
        const receipt=settle(charge,j.model,body.usage);costUsd+=receipt.cost;tokens+=receipt.tokens;receiptCount++;unknownCharges--;
        const raw=body.output.flatMap((o:{content?:{type:string,text?:string}[]})=>o.content??[]).find((c:{type:string})=>c.type==='output_text')?.text;
        const parsed=JSON.parse(raw??'{}',(_key,value)=>value===null?undefined:value);
        const decision=z.object({actions:z.array(action).max(4),memo:z.string().optional()}).parse(parsed);
        moves=decision.actions;memo=decision.memo??'';
      }
      history.push(memo.slice(0,900));
      if(!moves.length){error='Agent returned no actions';break;}
      for(const m of moves){
        if(actions>=protocol.actions || desk.finished)break;
        signal.throwIfAborted();actions++;
        const label=JSON.stringify(m);let feedback='';
        try{await act(page,m,j.mode);await page.waitForLoadState('domcontentloaded');}
        catch{feedback='Control action could not be completed.';}
        history.push(label+' '+feedback);
        frames.push({action:label,view:feedback||await page.locator('main').innerText(),
          elapsedMs:Date.now()-start,eventCount:desk.events.length});
      }
    }
    termination=desk.finished?'closed':error?'interrupted':'limit';
  }catch(e){if(unknownCharges)haltPaid=true;error=signal.aborted?'Time limit':e instanceof Error?e.message.slice(0,240):'Interrupted';termination=signal.aborted?'limit':'interrupted';}
  finally{signal.removeEventListener('abort',close);await context.close();f.close();}
  const desk=[...f.sessions.values()][0];if(!desk)throw Error('Browser did not start the job');
  return {...capture(desk),id:j.id,phase:j.phase,model:rates[j.model].snapshot,origin:rehearsal?'scripted':'openai',mode:j.mode,
    actions,tokens,costUsd,termination,durationMs:Date.now()-start,receiptCount,unknownCharges,frames,error};
}
async function main(){
  const command=process.argv[2]??'plan',jobs=plan();
  if(command==='plan'){console.log(JSON.stringify({protocol,jobs},null,2));return;}
  if(command==='rehearse'){
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
    try{for(const j of jobs.slice(0,2)){const a=await runJob(browser,j,true);console.log(j.mode,a.termination,a.actions,grade(a).complete,a.error);if(a.termination!=='closed')throw Error('Rehearsal did not close job');}}finally{await browser.close();}return;
  }
  if(!['calibration','development','heldout'].includes(command)||!process.argv.includes('--allow-paid')||!process.env.OPENAI_API_KEY)throw Error('Select an authorized phase and explicitly enable paid runs.');
  mkdirSync(root+'/attempts',{recursive:true});mkdirSync(root+'/screens',{recursive:true});
  const active=root+'/active.lock';
  if(existsSync(active)) {
    const pid=Number(readFileSync(active,'utf8'));
    if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Invalid collector lock. Inspect before recovery.');
    try{process.kill(pid,0);throw Error('Collector is already active');}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}
    if(!process.argv.includes('--recover'))throw Error('Prior collector exited. Use --recover to retain interrupted attempts.');
    unlinkSync(active);
  }
  writeFileSync(active,String(process.pid),{flag:'wx'});
  try{
    const digest=createHash('sha256');
    for(const file of ['ledger.ts','grade.ts','views.ts','server.ts','study.ts'])digest.update(readFileSync(new URL(file,import.meta.url)));
    digest.update(readFileSync(new URL('../../retail/style.css',import.meta.url)));
    const manifest={protocol,rates,jobs,capUsd:maxUsd,digest:digest.digest('hex')};
    const lock=root+'/manifest.json';
    if(!existsSync(lock))atomic(lock,manifest);
    if(JSON.stringify(JSON.parse(readFileSync(lock,'utf8')))!==JSON.stringify(manifest))throw Error('Frozen study configuration differs');
    for(const j of jobs){
      const file=root+'/attempts/'+j.id;
      if(!existsSync(file+'.claim')||existsSync(file+'.json'))continue;
      const receipts:Charge[]=existsSync(budgetFile)?JSON.parse(readFileSync(budgetFile,'utf8')):[];
      const charges=receipts.filter(c=>c.attempt===j.id);
      const prior=existsSync(file+'.checkpoint')?JSON.parse(readFileSync(file+'.checkpoint','utf8')):capture(new Desk(j.seed,j.condition));
      atomic(file+'.json',{...prior,id:j.id,phase:j.phase,origin:'openai',mode:j.mode,model:rates[j.model].snapshot,
        termination:'interrupted',error:'Collector exited before final archive; last checkpoint retained',
        costUsd:charges.reduce((n,c)=>n+(c.cost??0),0),tokens:charges.reduce((n,c)=>n+(c.input??0)+(c.output??0),0),
        receiptCount:charges.filter(c=>c.cost!==undefined).length,unknownCharges:charges.filter(c=>c.cost===undefined).length});
    }
    const past:Charge[]=existsSync(budgetFile)?JSON.parse(readFileSync(budgetFile,'utf8')):[];
    if(past.some(c=>c.cost===undefined) && !process.argv.includes('--retain-unknown-reservations'))throw Error('Unmetered requests retain full reservations; inspect before resuming');
    if(command!=='calibration'){
      for(const j of jobs.filter(j=>j.phase==='calibration')){
        const path=root+'/attempts/'+j.id+'.json';
        if(!existsSync(path))throw Error('Complete all four interface calibrations before collection');
        const a:LiveAttempt=JSON.parse(readFileSync(path,'utf8'));
        if(!a.receiptCount||a.unknownCharges||!a.frames.length)throw Error('Calibration lacks metered browser evidence: '+j.id);
      }
      if(!process.argv.includes('--reviewed-calibration'))throw Error('Inspect calibration outcomes and pass --reviewed-calibration');
    }
    const only=process.argv.find(s=>s.startsWith('--id='))?.slice(5);
    const queue=jobs.filter(j=>j.phase===command&&(!only||j.id===only)&&!existsSync(root+'/attempts/'+j.id+'.json'));
    const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,env:{}});
    try{
      let stop=false;
      const workers=await Promise.allSettled(Array.from({length:4},async()=>{
        while(!stop && !haltPaid && queue.length){
          const j=queue.shift()!;
          try{
          writeFileSync(root+'/attempts/'+j.id+'.claim',String(Date.now()),{flag:'wx'});
          const attempt=await runJob(browser,j);
          atomic(root+'/attempts/'+j.id+'.json',attempt);
          const checkpoint=root+'/attempts/'+j.id+'.checkpoint';if(existsSync(checkpoint))unlinkSync(checkpoint);
          console.log(j.id,attempt.termination,grade(attempt).complete,attempt.costUsd.toFixed(6),attempt.error??'');
          if(attempt.unknownCharges || attempt.error?.includes('spend limit'))stop=true;
          }catch(e){stop=true;throw e;}
        }
      }));
      for(const worker of workers)if(worker.status==='rejected')throw worker.reason;
    }finally{await browser.close();}
  }finally{unlinkSync(root+'/active.lock');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();

export {action,act,observe,observationPrompt,decisionInstruction,decisionFormat,type Mode};
