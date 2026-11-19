import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import {extname, resolve} from 'node:path';
import {chromium, devices, type Locator} from 'playwright';

const root = resolve(import.meta.dirname, '../../.site/cue-bench');
const prefix = '/cue-bench/';
const files = new Map([
  ['', 'index.html'],
  ...['case.css','recording.json','retail/static/case.js','src/retail/grade.js','src/retail/ledger.js']
    .map(name => [name,name] as const),
]);
const types:Record<string,string> = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'};
const server = createServer((request,response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const file = pathname.startsWith(prefix) ? files.get(pathname.slice(prefix.length)) : undefined;
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  const stream = createReadStream(resolve(root,file));
  stream.once('error', () => response.writeHead(404).end());
  stream.once('open', () => {
    response.writeHead(200, {'Content-Type':types[extname(file)]+'; charset=utf-8'});
    stream.pipe(response);
  });
});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');
const site = 'http://127.0.0.1:'+address.port+prefix;
const hash = '#development-1-partial-mini-controls-3';

try {
  const browser = await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH});
  try {
    for (const mobile of [false,true]) {
      const context = await browser.newContext(mobile ? devices['Pixel 7'] : {viewport:{width:1280,height:850}});
      const page = await context.newPage();
      const errors:string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (!request.url().startsWith(site)) errors.push('Request outside the repository subpath: '+request.url());
      });
      page.on('response', response => {
        if (!response.ok()) errors.push(response.status()+' '+response.url());
      });
      const activate = async (target:Locator) => {
        if (mobile) await target.tap();
        else {
          await target.focus();
          await page.keyboard.press('Enter');
        }
      };
      const button = (name:string) => page.getByRole('button',{name,exact:true});
      const close = async (heading:string, totals:[string,string]) => {
        await activate(button('Close job'));
        await page.getByRole('heading',{name:heading,exact:true}).waitFor();
        assert.deepEqual(await page.locator('#final-counts tr td:last-child').allTextContents(),totals);
        assert.equal(await page.locator('#outcome').evaluate(node => node === document.activeElement),true);
      };
      const post = async (ink?:string, moss?:string) => {
        if (ink !== undefined) await page.getByRole('spinbutton',{name:'Ink field jacket units'}).fill(ink);
        if (moss !== undefined) await page.getByRole('spinbutton',{name:'Moss field jacket units'}).fill(moss);
        await activate(button('Post units'));
      };
      await page.goto(site);
      assert.equal(await page.locator('body').evaluate(node => node.scrollWidth > document.documentElement.clientWidth),false);
      if (!mobile) {
        await page.keyboard.press('Tab');
        assert.equal(await page.locator(':focus').textContent(),'Skip to the case');
      }
      await post();
      assert.match(await page.getByRole('status').textContent() ?? '',/Posting timed out/);
      await activate(button('Receipt journal'));
      assert.deepEqual(await page.locator('#posted td').allTextContents(),['12','0']);
      await activate(button('Inventory'));
      assert.deepEqual(await page.locator('#balances tr td:last-child').allTextContents(),['32','21']);
      await activate(button('Post receipt'));
      await post('0','8');
      await activate(button('Purchase order'));
      assert.deepEqual(await page.locator('#ordered tr td:last-child').allTextContents(),['4','3']);
      await close('Receipt recovered',['12','8']);

      await activate(button('Start again'));
      await post();
      await post('12','8');
      await close('Over-receipt recorded',['24','8']);
      assert.match(await page.locator('#outcome-note').textContent() ?? '',/12 excess units/);
      await activate(page.getByRole('link',{name:'Compare with the recorded run'}));
      assert.equal(page.url(),site+hash);
      await button('Receipt times out').waitFor();
      assert.deepEqual(await page.locator('#replay-counts tr td:last-child').allTextContents(),['12','0']);
      await activate(button('Receipt form rejects retries'));
      assert.match(await page.locator('#step-detail').textContent() ?? '',/21 submissions/);
      await activate(button('An extra Ink unit posts'));
      assert.deepEqual(await page.locator('#replay-counts tr td:last-child').allTextContents(),['13','0']);
      await activate(button('The model closes the job'));
      assert.match(await page.locator('#step-detail').textContent() ?? '',/8 unposted Moss units/);
      assert.deepEqual(await page.locator('#final-counts tr td:last-child').allTextContents(),['24','8']);

      await page.goto(site+hash);
      await button('Receipt times out').waitFor();
      const recording = await context.request.get(site+'recording.json');
      assert.equal(recording.ok(),true);
      assert.equal((await recording.json()).id,hash.slice(1));
      assert.deepEqual(errors,[]);
      console.log((mobile ? 'Mobile touch' : 'Desktop keyboard')+' Chromium: recovery, duplicate receipt, and replay passed.');
      await context.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  server.close();
}
