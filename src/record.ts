import {chromium} from 'playwright';
import {randomUUID} from 'node:crypto';
import {startFixture} from './fixture.ts';
import {type Action, type Recording} from './model.ts';

const fixture = await startFixture();
try {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  try {
    const page = await browser.newPage();
    await page.goto(fixture.url);
    const requested = {reference:'CUE-' + randomUUID(),item:'Field notebook' as const,quantity:2};
    const run: Recording = {taskVersion:1, checkerVersion:1, scenario:'normal', origin:'scripted',
      configuration:{driver:'Chromium / Playwright'}, requested, initialView:await page.locator('main').ariaSnapshot(),
      steps:[], orders:fixture.orders};
    const actions: Action[] = [{type:'fill',field:'Reference',value:requested.reference},
      {type:'fill',field:'Quantity',value:String(requested.quantity)}, {type:'submit'}];
    for (const action of actions) {
      if (action.type === 'fill') await page.getByLabel(action.field,{exact:true}).fill(action.value);
      else {
        await page.getByRole('button',{name:'Submit order'}).click();
        await page.getByText('Order saved: ' + requested.reference,{exact:true}).waitFor();
      }
      run.steps.push({action,view:await page.locator('main').ariaSnapshot()});
    }
    console.log(JSON.stringify(run,null,2));
  } finally { await browser.close(); }
} finally { fixture.close(); }
