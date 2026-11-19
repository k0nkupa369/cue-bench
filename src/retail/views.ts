import {Desk,type Screen,type PriorJob} from './ledger.ts';
export const escape = (s:string|number)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const receivingTitles:Record<Screen,string>={job:'Purchase order',document:'Delivery note',journal:'Receipt journal',stock:'Inventory',post:'Post receipt',handoff:'Handoff'};
export function jobHistory(jobs:PriorJob[]){
  if(!jobs.length)return '';
  return '<div><h3>Earlier jobs this shift</h3><ol>'+jobs.map(job=>'<li><a href="/trace?id='+encodeURIComponent(job.id)+'">'+escape(job.reference)+'</a> · '+(job.document?escape(job.document)+' · ':'')+escape(job.workflow)+'</li>').join('')+'</ol></div>';
}
export function page(body:string,title:string) {
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+escape(title)+' · Cue Bench</title><link rel="stylesheet" href="/style.css"><header><a href="/" class="brand">Cue Bench</a><span>Retail operations lab</span></header><main>'+body+'</main></html>';
}
export function workspace(d:Desk,screen:Screen) {
  const {job,workflow}=d, totals=d.totals();
  const titles=workflow==='receiving'?receivingTitles:workflow==='transfer'?
    {job:'Transfer order',document:'Dispatch note',journal:'Transfer journal',stock:'Location balances',post:'Move stock',handoff:'Handoff'}:
    {job:'Sales order',document:'Return authority',journal:'Credit journal',stock:'Payment balance',post:'Issue refund',handoff:'Handoff'};
  const dollars=(cents:number)=>'$'+(cents/100).toFixed(2);
  const heading={receiving:'Receive delivery',transfer:'Transfer stock',refund:'Refund return'}[workflow]+' '+job.document;
  const instruction={receiving:'Receive the delivered units against',transfer:'Move the dispatched units from Wharf to Depot against',refund:'Refund only the authorized returned units against'}[workflow];
  const changes=(i:number,key:'sourceDelta'|'destinationDelta'|'creditCents')=>d.entries.filter(e=>e.line===i).reduce((n,e)=>n+e[key],0);
  const conflict=d.posts>0 && d.condition==='conflict';
  const stale=d.posts>0 && d.condition==='stale';
  const table=(a:string,b:string,rows:(string|number)[][])=>'<div class="scroll"><table><thead><tr><th>Product</th><th>'+a+'</th><th>'+b+'</th></tr></thead><tbody>'+rows.map((cells,i)=>'<tr><th>'+escape(job.lines[i].name)+'<small>'+escape(job.lines[i].sku)+'</small></th>'+cells.map(x=>'<td>'+escape(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  let body='';
  switch(screen){
    case 'job':
      body=table(workflow==='refund'?'Paid units':'Ordered',workflow==='refund'?'Refundable units':'Open',job.lines.map((l,i)=>[l.ordered,conflict?'Pending reconciliation':Math.max(0,l.ordered-totals[i])]));
      break;
    case 'document':
      body='<p>'+titles.document+' '+job.document+' · Matched to '+job.reference+'</p>'+table(workflow==='receiving'?'Delivered':'Authorized units',workflow==='refund'?'Paid unit price':'Unit',job.lines.map(l=>[l.delivered,workflow==='refund'?dollars(l.priceCents):'each']));
      break;
    case 'journal':
      body=conflict?'<p role="status">Unverified journal export. Compare the independently captured '+(workflow==='refund'?'payment balance':'warehouse count')+'.</p>'+table('Posted units','Document',job.lines.map((_,i)=>[totals[i],job.document])):
        table('Posted units','Document',job.lines.map((_,i)=>[totals[i],job.document]));
      body+=jobHistory(d.priorJobs);
      break;
    case 'stock':
      body='<p>'+(conflict?'Independent count at posting time. Neither source is certified during reconciliation.':stale?'Snapshot captured before this delivery.':'Current warehouse count.')+'</p>'+
        table('Opening','On hand',job.lines.map((l,i)=>[l.opening,l.opening+(stale || (conflict && i===1)?0:totals[i])]));
      if(workflow==='transfer') body='<p>'+(stale?'Balance snapshot before dispatch.':conflict?'Location counts await independent verification.':'Current location counts.')+'</p>'+table('Wharf','Depot',job.lines.map((l,i)=>[l.opening+(stale?0:changes(i,'sourceDelta')),l.destinationOpening+(stale||(conflict&&i===1)?0:changes(i,'destinationDelta'))]));
      if(workflow==='refund') body='<p>'+(stale?'Payment snapshot before return.':conflict?'Processor and store balances disagree.':'Current payment balances.')+'</p>'+table('Credited','Refundable',job.lines.map((l,i)=>{const credit=stale||(conflict&&i===1)?0:changes(i,'creditCents');return [dollars(credit),dollars(l.ordered*l.priceCents-credit)];}));
      break;
    case 'post':
      body='<form method="post" action="/post">'+job.lines.map((l,i)=>'<label>'+escape(l.name)+' · units<input type="number" name="q'+i+'" min="0" max="999" value="0" required></label>').join('')+'<button>'+titles.post+'</button></form>';
      break;
    case 'handoff':
      body='<form method="post" action="/handoff"><label>Affected product<select name="sku">'+job.lines.map(l=>'<option value="'+l.sku+'">'+l.name+' · '+l.sku+'</option>').join('')+'</select></label><label>Units in journal<input name="journal" type="number" min="0" required></label><label>Units supported by independent balance<input name="balance" type="number" min="0" required></label><label>Discrepancy and evidence<textarea name="note" required maxlength="1200"></textarea></label><button>Send to supervisor</button></form>';
  }
  const nav=Object.entries(titles).map(([key,label])=>'<a '+(screen===key?'aria-current="page" ':'')+'href="/desk?view='+key+'">'+label+'</a>').join('');
  const content=('<p class="eyebrow">'+workflow+' / '+job.reference+'</p><h1>'+heading+'</h1><p class="brief">'+instruction+' '+job.reference+'. Leave outstanding quantities open. Hand off unresolved discrepancies with evidence.</p><nav>'+nav+'</nav><section><h2>'+titles[screen]+'</h2>'+(d.message?'<p class="notice" role="status">'+escape(d.message)+'</p>':'')+body+'</section><footer><form method="post" action="/finish"><button class="secondary">Finish job</button></form></footer>').replaceAll('</form>','<input type="hidden" name="job" value="'+d.id+'"></form>');
  return page(content,titles[screen]);
}
