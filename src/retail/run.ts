import {createHash,randomUUID} from 'node:crypto';
import {existsSync,linkSync,mkdirSync,renameSync,unlinkSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {chromium,type Page} from 'playwright';
import {z} from 'zod';
import {conditions,workflows} from './ledger.ts';
import {capture,grade,type ClickEvidence,type PixelObservation} from './grade.ts';
import {credential,pixelPolicies,providers,queryProvider,type StandaloneAttempt} from './providers.ts';
import {startRetail} from './server.ts';
import {act,action,observe,observationPrompt,protocol} from './study.ts';

const usage='Usage: npm run retail:run -- --provider openai|anthropic|gemini --model MODEL --mode controls|pixels --allow-paid [--policy batch|refresh-after-navigation] [--workflow receiving|transfer|refund] [--condition clean|saved|lost|partial|stale|conflict] [--seed 1] [--max-calls 8]';
const root=fileURLToPath(new URL('../../retail/local/standalone',import.meta.url));
const options=z.object({
  provider:z.enum(providers),model:z.string().max(150).regex(/^[a-z0-9][a-z0-9._:-]*$/),
  mode:z.enum(['controls','pixels']),policy:z.enum(pixelPolicies).optional(),workflow:z.enum(workflows).default('receiving'),
  condition:z.enum(conditions).default('partial'),seed:z.coerce.number().int().min(1).max(9999).default(1),
  'max-calls':z.coerce.number().int().min(1).max(protocol.actions).default(8)
});
const decision=z.object({actions:z.array(action).max(4),memo:z.string()});
const finished={openai:'completed',anthropic:'end_turn',gemini:'STOP'};
const actionError='Control action could not be completed.';

type BrowserEvent = {kind:'navigation'} | {kind:'click',x:number,y:number,target:NonNullable<ClickEvidence['target']>};
type ActivePixelAction = {move:z.infer<typeof action>,target:ClickEvidence['target'],navigationExpected:boolean};
async function auditPixels(page:Page){
  let sequence=0;
  let active:ActivePixelAction|undefined;
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())sequence++;});
  await page.exposeBinding('__cueBenchBrowserEvent',({frame},event:BrowserEvent)=>{
    if(frame!==page.mainFrame()||!active)return;
    if(event.kind==='navigation')active.navigationExpected=true;
    else if(active.move.op==='click' && event.x===active.move.x && event.y===active.move.y)active.target??=event.target;
  });
  await page.addInitScript(()=>{
    function emit(event:BrowserEvent){
      if('__cueBenchBrowserEvent' in window && typeof window.__cueBenchBrowserEvent==='function'){
        void window.__cueBenchBrowserEvent(event).catch(()=>{});
      }
    }
    window.addEventListener('click',event=>{
      if(!event.isTrusted||!event.detail||!(event.target instanceof Element))return;
      const target=event.target;
      const control=target.closest('a,button,input,label,select,textarea');
      const named=control??target;
      const label=(named.getAttribute('aria-label')??named.getAttribute('name')??named.textContent??'').replace(/\s+/g,' ').trim().slice(0,160);
      emit({kind:'click',x:event.clientX,y:event.clientY,target:{tag:target.localName,label,control:control!==target?control?.localName:undefined}});
    },{capture:true});
    window.addEventListener('click',event=>{
      if(event.isTrusted&&!event.defaultPrevented&&event.target instanceof Element&&event.target.closest('a[href]'))emit({kind:'navigation'});
    });
    window.addEventListener('submit',event=>{
      if(event.isTrusted&&!event.defaultPrevented)emit({kind:'navigation'});
    });
  });
  function navigation(){
    const {pathname,search,hash}=new URL(page.url());
    return {sequence,path:pathname+search+hash};
  }
  return {navigation,async perform(move:z.infer<typeof action>,observationId:number){
    const before=navigation();
    const observed:ActivePixelAction={move,target:null,navigationExpected:false};
    active=observed;
    let feedback='';
    try{
      await act(page,move,'pixels',false);
      if(observed.navigationExpected && sequence===before.sequence)await page.waitForEvent('framenavigated',frame=>frame===page.mainFrame());
      await page.waitForLoadState('domcontentloaded');
    }catch{feedback=actionError;}
    const view=feedback||await page.locator('main').innerText();
    const after=navigation();
    active=undefined;
    const click=move.op==='click'&&move.x!==undefined&&move.y!==undefined
      ?{observationId,x:move.x,y:move.y,target:observed.target,before,after}:undefined;
    return {feedback,view,click,navigated:before.sequence!==after.sequence};
  }};
}

async function main(){
  const {values}=parseArgs({options:{
    provider:{type:'string'},model:{type:'string'},mode:{type:'string'},policy:{type:'string'},workflow:{type:'string'},
    condition:{type:'string'},seed:{type:'string'},'max-calls':{type:'string'},
    'allow-paid':{type:'boolean'},help:{type:'boolean',short:'h'}
  }});
  if(values.help){console.log(usage);return;}
  if(!values['allow-paid'])throw Error('Pass --allow-paid to start provider calls.');
  const parsed=options.safeParse(values);
  if(!parsed.success)throw Error('Invalid option: '+parsed.error.issues.map(issue=>issue.path.join('.')).join(', '));
  const {provider,model,mode,workflow,condition,seed,'max-calls':maxCalls}=parsed.data;
  if(parsed.data.policy&&mode!=='pixels')throw Error('--policy requires --mode pixels.');
  const policy=mode==='pixels'?(parsed.data.policy??'batch'):undefined;
  if((provider==='anthropic'&&!model.startsWith('claude-'))||(provider==='gemini'&&!model.startsWith('gemini-'))){
    throw Error('Model does not match provider.');
  }
  const key=process.env[credential[provider]];
  if(!key?.trim())throw Error('Set '+credential[provider]+' before starting.');
  const workspaceId=provider==='anthropic'?process.env.ANTHROPIC_WORKSPACE_ID?.trim():undefined;

  const assignedUuid=z.uuid().safeParse(process.env.CUE_RETAIL_RUN_UUID??randomUUID());
  if(!assignedUuid.success)throw Error('CUE_RETAIL_RUN_UUID must be a UUID.');
  const id='standalone-'+provider+'-'+assignedUuid.data;
  mkdirSync(root+'/attempts',{recursive:true});
  if(mode==='pixels')mkdirSync(root+'/screens',{recursive:true});
  const file=root+'/attempts/'+id;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,env:{}});
  try{
    const context=await browser.newContext({viewport:{width:protocol.width,height:protocol.height},serviceWorkers:'block'});
    const fixture=await startRetail({seed,condition,workflow});
    const start=Date.now();
    const signal=AbortSignal.timeout(protocol.minutes*60000);
    const close=()=>{void context.close().catch(()=>{});};
    signal.addEventListener('abort',close,{once:true});
    try{
      const page=await context.newPage();page.setDefaultTimeout(3000);
      const audit=mode==='pixels'?await auditPixels(page):undefined;
      await page.route('**/*',route=>new URL(route.request().url()).origin===fixture.url?route.continue():route.abort());
      await page.goto(fixture.url);
      await page.getByRole('button',{name:'Start '+workflow+' job'}).click();
      const [desk]=fixture.sessions.values();
      if(!desk)throw Error('Browser did not start the job.');

      const frames:StandaloneAttempt['frames']=[];
      const readbacks:StandaloneAttempt['readbacks']=[];
      const history:string[]=[];
      let actions=0;
      let termination:StandaloneAttempt['termination']='checkpoint';
      let error:string|undefined;
      function archive(reserve=false){
        const metered=readbacks.every(receipt=>receipt?.usage);
        const tokens=metered?readbacks.reduce((sum,receipt)=>sum+(receipt?.usage?.totalTokens??0),0):null;
        const attempt:StandaloneAttempt={...capture(desk),id,origin:provider,phase:'standalone',model,mode,actions,
          durationMs:Date.now()-start,tokens,costUsd:null,maxCalls,protocolVersion:protocol.version,readbacks,termination,frames,policy,error};
        const pending=file+(reserve?'.'+randomUUID():'')+'.tmp';
        writeFileSync(pending,JSON.stringify(attempt)+'\n');
        if(reserve){
          try{linkSync(pending,file+'.json');}
          catch(e){if(existsSync(file+'.json'))throw Error('Attempt ID already exists: '+id);throw e;}
          finally{unlinkSync(pending);}
        }else renameSync(pending,file+'.json');
        return attempt;
      }
      archive(true);
      try{
        for(let turn=0;turn<maxCalls && actions<protocol.actions && !desk.finished;turn++){
          signal.throwIfAborted();
          const view=await observe(page,mode);
          let image:string|undefined;
          if(view.image){
            const pixels=Buffer.from(view.image,'base64');
            image=createHash('sha256').update(pixels).digest('hex')+'.jpg';
            const path=root+'/screens/'+image;
            if(!existsSync(path)){
              const pending=path+'.'+id+'.tmp';
              writeFileSync(pending,pixels,{flag:'wx'});
              renameSync(pending,path);
            }
          }
          const observation:PixelObservation|undefined=audit&&{id:turn+1,navigation:audit.navigation(),viewport:{width:protocol.width,height:protocol.height}};
          frames.push({action:'Observation '+(turn+1),view:view.text,elapsedMs:Date.now()-start,eventCount:desk.events.length,image,observation});
          const text=observationPrompt(mode,history,view);
          readbacks.push(null);
          archive();
          signal.throwIfAborted();
          const result=await queryProvider({provider,model,key,workspaceId,mode,text,image:view.image,signal}).catch(e=>{
            if(signal.aborted)throw e;
            throw Error('Provider request did not return an HTTP response.');
          });
          readbacks[turn]=result.readback;
          archive();
          const {httpStatus,stopReason,usage}=result.readback;
          if(httpStatus<200||httpStatus>=300)throw Error('Provider returned HTTP '+httpStatus+'.');
          if(!usage)throw Error('Provider response has no usable token receipt.');
          if(stopReason!==finished[provider])throw Error('Provider did not finish its decision.');
          let decoded:unknown;
          try{decoded=JSON.parse(result.text,(_key,value)=>value===null?undefined:value);}
          catch{throw Error('Provider did not return a valid browser decision.');}
          const parsedDecision=decision.safeParse(decoded);
          if(!parsedDecision.success)throw Error('Provider did not return a valid browser decision.');
          const moves=parsedDecision.data.actions;
          history.push(parsedDecision.data.memo.slice(0,900));
          if(!moves.length)throw Error('Provider returned no actions.');
          for(const [index,move] of moves.entries()){
            if(actions>=protocol.actions||desk.finished)break;
            signal.throwIfAborted();
            actions++;
            const label=JSON.stringify(move);
            let feedback='';
            const result=audit&&observation?await audit.perform(move,observation.id):undefined;
            if(result)feedback=result.feedback;
            else {
              try{await act(page,move,mode);await page.waitForLoadState('domcontentloaded');}
              catch{feedback=actionError;}
            }
            history.push(label+' '+feedback);
            const refresh=policy==='refresh-after-navigation'&&result?.navigated;
            frames.push({action:label,view:result?.view??(feedback||await page.locator('main').innerText()),
              elapsedMs:Date.now()-start,eventCount:desk.events.length,click:result?.click,
              discardedActions:refresh?moves.length-index-1:undefined});
            archive();
            if(refresh)break;
          }
        }
        termination=desk.finished?'closed':'limit';
        error=termination==='limit'?(actions>=protocol.actions?'Action limit.':'Provider call limit.'):undefined;
      }catch(e){
        termination=signal.aborted?'limit':'interrupted';
        error=signal.aborted?'Time limit.':e instanceof Error?e.message.slice(0,240):'Interrupted.';
      }
      const attempt=archive();
      console.log(JSON.stringify({id,path:file+'.json',termination,tokens:attempt.tokens,costUsd:attempt.costUsd,grade:grade(attempt),error}));
      if(termination!=='closed')process.exitCode=1;
    }finally{
      signal.removeEventListener('abort',close);
      fixture.close();
    }
  }finally{await browser.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main().catch((e:unknown)=>{
  console.error(e instanceof Error?e.message:'Could not start the run.');
  console.error(usage);
  process.exitCode=1;
});
