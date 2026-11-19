import {Desk,type Screen} from './ledger.ts';
export const escape = (s:string|number)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const titles:Record<Screen,string>={job:'Purchase order',document:'Delivery note',journal:'Receipt journal',stock:'Inventory',post:'Post receipt',handoff:'Handoff'};
export function page(body:string,title:string) {
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+escape(title)+' · Cue Bench</title><link rel="stylesheet" href="/style.css"><header><a href="/" class="brand">Cue Bench</a><span>Retail operations lab</span></header><main>'+body+'</main></html>';
}
export function workspace(d:Desk,screen:Screen) {
  const {job}=d, totals=d.totals();
  const conflict=d.posts>0 && d.condition==='conflict';
  const stale=d.posts>0 && d.condition==='stale';
  const table=(a:string,b:string,rows:(string|number)[][])=>'<div class="scroll"><table><thead><tr><th>Product</th><th>'+a+'</th><th>'+b+'</th></tr></thead><tbody>'+rows.map((cells,i)=>'<tr><th>'+escape(job.lines[i].name)+'<small>'+escape(job.lines[i].sku)+'</small></th>'+cells.map(x=>'<td>'+escape(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  let body='';
  switch(screen){
    case 'job':
      body=table('Ordered','Open',job.lines.map((l,i)=>[l.ordered,conflict?'Pending reconciliation':Math.max(0,l.ordered-totals[i])]));
      break;
    case 'document':
      body='<p>Delivery '+job.document+' · Matched to '+job.reference+'</p>'+table('Delivered','Unit',job.lines.map(l=>[l.delivered,'each']));
      break;
    case 'journal':
      body=conflict?'<p role="status">Unverified journal export. Compare the independently captured warehouse count.</p>'+table('Posted units','Document',job.lines.map((_,i)=>[totals[i],job.document])):
        table('Posted units','Document',job.lines.map((_,i)=>[totals[i],job.document]));
      break;
    case 'stock':
      body='<p>'+(conflict?'Independent count at posting time. Neither source is certified during reconciliation.':stale?'Snapshot captured before this delivery.':'Current warehouse count.')+'</p>'+
        table('Opening','On hand',job.lines.map((l,i)=>[l.opening,l.opening+(stale || (conflict && i===1)?0:totals[i])]));
      break;
    case 'post':
      body='<form method="post" action="/post">'+job.lines.map((l,i)=>'<label>'+escape(l.name)+' · units<input type="number" name="q'+i+'" min="0" max="999" value="0" required></label>').join('')+'<button>Post receipt</button></form>';
      break;
    case 'handoff':
      body='<form method="post" action="/handoff"><label>Discrepancy and evidence<textarea name="note" required maxlength="1200"></textarea></label><button>Send to supervisor</button></form>';
  }
  const nav=Object.entries(titles).map(([key,label])=>'<a '+(screen===key?'aria-current="page" ':'')+'href="/desk?view='+key+'">'+label+'</a>').join('');
  const content=('<p class="eyebrow">Receiving / '+job.reference+'</p><h1>Receive delivery '+job.document+'</h1><p class="brief">Receive the delivered units against '+job.reference+'. Leave outstanding quantities open. Hand off unresolved discrepancies with evidence.</p><nav>'+nav+'</nav><section><h2>'+titles[screen]+'</h2>'+(d.message?'<p class="notice" role="status">'+escape(d.message)+'</p>':'')+body+'</section><footer><form method="post" action="/finish"><button class="secondary">Finish job</button></form></footer>').replaceAll('</form>','<input type="hidden" name="job" value="'+d.id+'"></form>');
  return page(content,titles[screen]);
}
