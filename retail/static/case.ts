import {capture, grade, type Attempt} from '../../src/retail/grade.ts';
import {Desk, type Pair, type Screen} from '../../src/retail/ledger.ts';

function element<T extends HTMLElement>(selector: string, type: {new():T}):T {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) throw Error('Missing element '+selector);
  return found;
}
const get = (selector: string) => element(selector, HTMLElement);
const inputs = [element('#ink', HTMLInputElement), element('#moss', HTMLInputElement)];
const deskScreens = document.querySelectorAll<HTMLButtonElement>('[data-screen]');
const message = get('#message');
let desk = new Desk(1, 'partial');
const {lines, reference, document:deliveryNote} = desk.job;

function rows(selector: string, values: (string|number)[][], includeSku = false) {
  const body = element(selector, HTMLTableSectionElement);
  body.replaceChildren();
  values.forEach((cells,i) => {
    const row = body.insertRow();
    const product = document.createElement('th');
    product.scope = 'row';
    product.textContent = lines[i].name;
    if (includeSku) {
      const sku = document.createElement('small');
      sku.textContent = lines[i].sku;
      product.append(sku);
    }
    row.append(product);
    for (const value of cells) row.insertCell().textContent = String(value);
  });
}

function openScreen(screen: Screen) {
  desk.log({kind:'view', screen});
  const totals = desk.totals();
  if (screen === 'journal') rows('#posted', totals.map(total => [total]));
  if (screen === 'stock') rows('#balances', desk.balances().map((line,i) => [lines[i].opening,line.wharf]));
  if (screen === 'job') rows('#ordered', lines.map((line,i) => [line.ordered,Math.max(0,line.ordered-totals[i])]));
  for (const button of deskScreens) {
    const panel = button.dataset.screen;
    const active = panel === screen;
    button.setAttribute('aria-pressed', String(active));
    get('#'+panel).hidden = !active;
  }
}

function start() {
  message.textContent = '';
  message.classList.remove('issue');
  get('#play').hidden = false;
  get('#debrief').hidden = true;
  inputs.forEach((input, i) => input.value = String(lines[i].delivered));
  openScreen('post');
}

for (const id of document.querySelectorAll('[data-reference]')) id.textContent = reference;
get('[data-document]').textContent = deliveryNote;
rows('#delivered', lines.map(line => [line.delivered]), true);
lines.forEach((line,i) => { get('#line-'+i).textContent = line.name+' units'; });

for (const screen of ['post', 'journal', 'stock', 'job'] as const) {
  get('[data-screen="'+screen+'"]').addEventListener('click', () => openScreen(screen));
}
get('#receipt').addEventListener('submit', event => {
  event.preventDefault();
  const units: Pair = [inputs[0].valueAsNumber, inputs[1].valueAsNumber];
  const before = desk.entries.length;
  let issue = false;
  try {
    desk.post(units);
    issue = desk.message.includes('timed out');
    desk.log({kind:'post', units, result: issue ? 'timeout' : 'applied', changes: desk.entries.slice(before)});
    inputs.forEach(input => input.value = '0');
  } catch (error) {
    issue = true;
    desk.message = error instanceof Error ? error.message : 'Invalid quantities.';
    desk.log({kind:'post', result:'invalid'});
  }
  message.classList.toggle('issue', issue);
  message.textContent = desk.message;
  openScreen('post');
});

get('#finish').addEventListener('click', () => {
  desk.log({kind:'finish'});
  desk.finished = true;
  const result = grade(capture(desk));
  const missing = result.lines.reduce((sum,line) => sum+Math.max(0,line.target-line.actual), 0);
  get('#outcome').textContent = result.excessUnits > 0 ? 'Over-receipt recorded' :
    missing > 0 ? 'Receipt incomplete' : result.recovery ? 'Receipt recovered' : 'Delivered quantities matched';
  get('#outcome-note').textContent = result.complete
    ? result.recovery ? 'You checked the records and posted the outstanding units.' : 'The quantities match. Check the journal, inventory, or purchase order before retrying to pass the recovery check.'
    : result.excessUnits+' excess units. '+missing+' delivered units still unposted.';
  rows('#final-counts', result.lines.map(line => [line.target,line.actual]));
  get('#play').hidden = true;
  get('#debrief').hidden = false;
  get('#outcome').focus();
});

get('#restart').addEventListener('click', () => {
  desk = new Desk(1, 'partial');
  start();
  inputs[0].focus();
});
start();

async function loadReplay() {
  const response = await fetch('./recording.json');
  if (!response.ok) throw Error('Recording unavailable');
  const attempt:Attempt = await response.json();
  const {events, frames} = attempt;
  const timeout = events.findIndex(event => event.result === 'timeout');
  const retry = events.findIndex((event,i) => i > timeout && event.result === 'applied');
  const rejected = events.slice(timeout+1,retry).filter(event => event.result === 'invalid').length;
  const result = grade(attempt);
  const submitted = (index: number) => events[index].units?.map((units,i) => units+' '+lines[i].name.split(' ')[0]).join(' and ');
  const stages = [
    {index: timeout, title:'Receipt times out',
      detail:'The model submitted '+submitted(timeout)+'. The service returned a timeout after the Ink line posted.'},
    {index: retry-1, title:'Receipt form rejects retries',
      detail:rejected+' submissions failed quantity validation. The ledger kept the first posting.'},
    {index: retry, title:'An extra Ink unit posts',
      detail:'The model submitted '+submitted(retry)+'. The form confirmed the transaction.'},
    {index: events.length-1, title:'The model closes the job',
      detail:result.excessUnits+' excess Ink unit and '+(result.lines[1].target-result.lines[1].actual)+' unposted Moss units remained.'},
  ];
  get('#recorded-model').textContent = attempt.model+' · Numbered browser controls';
  const controls = get('#replay-controls');
  const buttons = stages.map(stage => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = stage.title;
    const item = document.createElement('li');
    item.append(button);
    controls.append(item);
    return button;
  });
  function show(index: number) {
    const stage = stages[index];
    const time = events[stage.index].ms;
    get('#step-time').textContent = (time/1000).toFixed(1)+' s from job start';
    get('#step-title').textContent = stage.title;
    get('#step-detail').textContent = stage.detail;
    const totals:Pair = [0,0];
    for (const event of events.slice(0,stage.index+1)) {
      for (const change of event.changes ?? []) totals[change.line] += change.units;
    }
    rows('#replay-counts', lines.map((line,i) => [line.delivered,totals[i]]));
    get('#replay-ledger').hidden = false;
    const observation = frames.find(frame => frame.eventCount > stage.index && frame.action.startsWith('Observation '));
    const details = element('#replay-observation', HTMLDetailsElement);
    details.hidden = !observation;
    details.open = false;
    get('#observation-text').textContent = observation?.view ?? '';
    buttons.forEach((button,i) => {
      if (i === index) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }
  buttons.forEach((button,index) => button.addEventListener('click', () => show(index)));
  show(0);
}
loadReplay().catch(() => {
  get('#step-title').textContent = 'The interactive replay could not load';
  get('#step-detail').textContent = 'Open the original trace to read the recorded events.';
});
