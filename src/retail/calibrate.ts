import {chromium,type Browser} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {startRetail} from './server.ts';
import {capture,grade} from './grade.ts';
import {type Condition,type Workflow} from './ledger.ts';

export async function scripted(browser:Browser,workflow:Workflow,condition:Condition,policy:'verify'|'retry',seed=1){
  const server=await startRetail({seed,condition,workflow});
  const page=await browser.newPage();
  try{
    await page.goto(server.url);await page.getByRole('button',{name:'Start '+workflow+' job'}).click();
    const desk=[...server.sessions.values()][0];
    const frames:ReturnType<typeof capture>['frames']=[];
    let actions=0;
    const nav=async(index:number)=>{const link=page.locator('nav a').nth(index);const label=await link.innerText();await link.click();actions++;await observe(label);};
    async function observe(action:string){
      frames.push({action,view:await page.locator('main').innerText(),elapsedMs:Date.now()-desk.started,eventCount:desk.events.length});
    }
    async function post(units:number[]){
      await nav(4);
      for(const [i,n] of units.entries()) await page.getByRole('spinbutton').nth(i).fill(String(n));
      actions+=3;await page.locator('section button').click();await observe('Post '+units.join(' / '));
    }
    await observe('Open job');await nav(1);
    const units=await page.locator('tbody tr td:first-of-type').allTextContents();
    let opening:number[]=[];
    if(workflow==='transfer' && policy==='verify'){
      await nav(3);opening=(await page.locator('tbody tr td:last-of-type').allTextContents()).map(Number);
    }
    await post(units.map(Number));
    if((await page.locator('section').innerText()).includes('timed out')){
      if(policy==='retry')await post(units.map(Number));
      else{
        await nav(0);
        const ordered=(await page.locator('tbody tr td:first-of-type').allTextContents()).map(Number);
        await nav(2);
        const journal=(await page.locator('tbody tr td:first-of-type').allTextContents()).map(Number);
        if((await page.locator('section').innerText()).includes('Unverified')){
          const products=await page.locator('tbody small').allTextContents();
          await nav(3);
          const rows=await page.locator('tbody tr').all();
          const balance:number[]=[];
          for(const [i,row] of rows.entries()){
            const [left,right]=(await row.locator('td').allTextContents()).map(s=>Number(s.replace('$','')));
            // Compare the independent visible quantities, converting currency back to units for refunds.
            if(workflow==='refund')balance.push(Math.round(left*ordered[i]/(left+right)));
            else if(workflow==='transfer')balance.push(right-opening[i]);
            else balance.push(right-left);
          }
          const affected=journal.findIndex((n,i)=>n!==balance[i]);
          if(affected<0)throw Error('No visible discrepancy found');
          await nav(5);
          await page.getByRole('combobox').selectOption(products[affected]);
          await page.getByLabel('Units in journal').fill(String(journal[affected]));
          await page.getByLabel('Units supported by independent balance').fill(String(balance[affected]));
          await page.getByRole('textbox').fill('Journal and balance disagree for '+products[affected]+'. Verify before posting.');
          await page.locator('section button').click();actions+=5;await observe('Hand off discrepancy');
        }else{
          const missing=units.map((n,i)=>Number(n)-journal[i]);
          if(missing.some(n=>n>0)) await post(missing);
        }
      }
    }
    if(!desk.finished){await page.getByRole('button',{name:'Finish job'}).click();actions++;await observe('Finish');}
    return {...capture(desk),actions,id:[workflow,condition,seed,policy].join('-'),origin:'scripted' as const,model:policy,frames};
  }finally{await page.close();server.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  try{
    mkdirSync('retail/examples',{recursive:true});
    for(const workflow of ['receiving','transfer','refund'] as const){
      for(const condition of ['clean','partial','lost','saved','stale','conflict'] as const){
        for(const policy of ['verify','retry'] as const){
          const attempt=await scripted(browser,workflow,condition,policy);
          const score=grade(attempt);
          if(policy==='verify' && !score.complete || policy==='retry' && condition!=='clean' && score.recovery!==false) throw Error('Unexpected calibration score '+attempt.id);
          writeFileSync('retail/examples/'+attempt.id+'.json',JSON.stringify(attempt)+'\n');
        }
      }
    }
    console.log('36 browser calibrations complete');
  }finally{await browser.close();}
}
