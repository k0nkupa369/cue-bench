import {attempts} from './portfolio.ts';
import {analyze} from './analysis.ts';
const r=analyze(attempts());
if(process.argv.includes('--json'))console.log(JSON.stringify(r,null,2));
else {
  console.log('Live research evidence: '+r.observed+' / '+r.planned+' scheduled attempts.');
  console.table(r.groups.map(g=>({cohort:g.group,correct:g.correct,total:g.attempts,harmful:g.damaged,unsafe:g.unsafeWrites,
    medianSeconds:g.medianSeconds,p95Seconds:g.p95Seconds,USD:g.cost.toFixed(5),USDperCorrect:g.costPerCorrect?.toFixed(5)??'—'})));
  console.log(JSON.stringify(r.pairs,null,2));
}
