import {randomUUID} from 'node:crypto';
export const conditions = ['clean','saved','lost','partial','stale','conflict'] as const;
export type Condition = typeof conditions[number];
export type Pair = [number,number];
export type Screen = 'job'|'document'|'journal'|'stock'|'post'|'handoff';
export type Entry = {line:number, units:number};
export function delivery(seed:number) {
  const colours = [['Ink','Moss'],['Ochre','Slate'],['Indigo','Clay'],['Cedar','Sand']];
  const n = seed - 1;
  return {
    reference:'PO-'+(731+n*7), document:'DN-'+(184+n*13),
    lines:colours[n%4].map((colour,i)=>({sku:'JK-'+(300+n*3+i),name:colour+' field jacket',
      delivered:i===0?12+n%5:8+n%3, ordered:i===0?16+n%5:11+n%3, opening:20+2*n+i}))
  };
}
export class Desk {
  readonly id=randomUUID();
  readonly job:ReturnType<typeof delivery>;
  readonly condition:Condition;
  readonly entries:Entry[]=[];
  lastSeen=Date.now();
  posts=0;
  finished=false;
  note='';
  message='';
  constructor(seed:number, condition:Condition) {
    this.job=delivery(seed);
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
    this.posts++;
    const disrupted=this.posts===1 && this.condition!=='clean';
    q.forEach((units,line)=>{
      if(!units || (disrupted && (this.condition==='lost' || (this.condition==='partial' && line===1)))) return;
      this.entries.push({line,units});
    });
    this.message=disrupted?'Posting timed out. The receipt service did not return a confirmation.':'Receipt posted.';
  }
}
