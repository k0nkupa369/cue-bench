import {chromium, type Page} from 'playwright';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {startFixture} from './fixture.ts';
import {type Action, type Recording} from './model.ts';

export async function perform(page: Page, action: Action) {
  let lookupResult: string | undefined;
  if (action.type === 'fill') {
    await page.getByLabel(action.field,{exact:true}).fill(action.value);
  } else {
    const lookup = action.type === 'lookup';
    const button = page.getByRole('button',{name:lookup ? 'Find order' : 'Submit order'});
    const route = lookup ? '/lookup' : '/orders';
    const response = page.waitForResponse(r => new URL(r.url()).pathname === route);
    await Promise.all([response, action.type === 'submit' && action.via === 'enter'
      ? page.getByLabel('Reference',{exact:true}).press('Enter') : button.click()]);
    const message = await (await response).text();
    const output = page.locator(lookup ? '#result' : '#status');
    await output.getByText(message,{exact:true}).waitFor();
    if (lookup) lookupResult = await output.innerText();
  }
  return {action,view:await page.locator('main').ariaSnapshot(),lookupResult};
}

async function main() {
  const scenario = process.argv[2] ?? 'normal';
  const strategy = process.argv[3] ?? 'check';
  if (scenario !== 'normal' && scenario !== 'saved') throw Error('Unknown scenario');
  if (!['check','blind','stop'].includes(strategy)) throw Error('Unknown strategy');
  const fixture = await startFixture(scenario);
  try {
    const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
    try {
      const page = await browser.newPage();
      await page.goto(fixture.url);
      const requested = {reference:'CUE-' + randomUUID(),item:'Field notebook' as const,quantity:2};
      const run: Recording = {taskVersion:1, checkerVersion:1, scenario, origin:'scripted',
        configuration:{driver:'Chromium / Playwright'}, requested, initialView:await page.locator('main').ariaSnapshot(),
        steps:[], orders:fixture.orders};
      const actions: Action[] = [{type:'fill',field:'Reference',value:requested.reference},
        {type:'fill',field:'Quantity',value:String(requested.quantity)}, {type:'submit'}];
      if (scenario !== 'normal' && strategy === 'check') {
        actions.push({type:'fill',field:'Order reference',value:requested.reference},{type:'lookup'});
      }
      if (scenario !== 'normal' && strategy === 'blind') actions.push({type:'submit',via:'enter'});
      for (const action of actions) run.steps.push(await perform(page,action));
      console.log(JSON.stringify(run,null,2));
    } finally { await browser.close(); }
  } finally { fixture.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
