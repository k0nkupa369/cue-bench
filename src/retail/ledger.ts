import {randomUUID} from 'node:crypto';
export const conditions = ['clean','saved','lost','partial','stale','conflict'] as const;
export type Condition = typeof conditions[number];
export type Pair = [number,number];
export const workflows=['receiving','transfer','refund'] as const;
export type Workflow=typeof workflows[number];
export type Screen = 'job'|'document'|'journal'|'stock'|'post'|'handoff';
export type Entry = {line:number, units:number, sourceDelta:number, destinationDelta:number, creditCents:number};
export function delivery(seed:number, workflow:Workflow='receiving') {
  const colours = [['Ink','Moss'],['Ochre','Slate'],['Indigo','Clay'],['Cedar','Sand']];
  const n = seed - 1;
  return {
    reference:({receiving:'PO-',transfer:'TO-',refund:'SO-'})[workflow]+(731+n*7), document:({receiving:'DN-',transfer:'TR-',refund:'RA-'})[workflow]+(184+n*13),
    lines:colours[n%4].map((colour,i)=>({sku:'JK-'+(300+n*3+i),name:colour+' field jacket',
      delivered:i===0?12+n%5:8+n%3, ordered:i===0?16+n%5:11+n%3, priceCents:2499+100*i+10*n, destinationOpening:4+i, opening:20+2*n+i}))
  };
}
export class Desk {
  readonly id=randomUUID();
  readonly job:ReturnType<typeof delivery>;
  readonly condition:Condition;
  readonly entries:Entry[]=[];
  lastSeen=Date.now();
  readonly workflow:Workflow;
  blocked:Pair[]=[];
  posts=0;
  finished=false;
  note='';
  message='';
  constructor(seed:number, condition:Condition,workflow:Workflow='receiving') {
    this.workflow=workflow;
    this.job=delivery(seed,workflow);
    this.condition=condition;
  }
  totals():Pair {
    const result:Pair=[0,0];
    for(const e of this.entries) result[e.line]+=e.units;
    return result;
  }
  post(q:Pair) {
    if(this.finished) throw Error('Job already closed');
    if(!q.every(n=>Number.isSafeInteger(n)&& n>=0 && n<=999)||!q.some(Boolean)) throw Error('Enter a quantity from 1–999 on at least one line.');
    const prior=this.totals();
    if(this.workflow!=='receiving' && q.some((n,i)=>n+prior[i]>(this.workflow==='refund'?this.job.lines[i].ordered:this.job.lines[i].opening))){
      this.blocked.push([...q]);
      this.message=this.workflow==='refund'?'Blocked: refund exceeds the remaining paid balance.':'Blocked: insufficient stock at origin.';
      return;
    }
    this.posts++;
    const disrupted=this.posts===1 && this.condition!=='clean';
    q.forEach((units,line)=>{
      if(!units || (disrupted && (this.condition==='lost' || (this.condition==='partial' && line===1)))) return;
      this.entries.push({line,units,sourceDelta:this.workflow==='transfer'?-units:0,
        destinationDelta:this.workflow==='refund'?0:units,creditCents:this.workflow==='refund'?units*this.job.lines[line].priceCents:0});
    });
    this.message=disrupted?'Posting timed out. The service did not return a confirmation.':'Transaction posted.';
  }
}
