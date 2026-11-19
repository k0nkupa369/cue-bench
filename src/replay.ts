import {readFileSync} from 'node:fs';
import {recording,score} from './model.ts';
try {
  const file = process.argv[2] ?? 'examples/normal.json';
  const run = recording.parse(JSON.parse(readFileSync(file,'utf8')));
  const result = score(run);
  console.log(JSON.stringify(result));
  console.error(run.origin + ' · ' + run.scenario + ' · outcome ' + result.outcome + ' · recovery ' + result.recovery);
  const expected = process.argv[3];
  if (expected && expected !== result.outcome + '/' + result.recovery) process.exitCode = 1;
} catch(error) { console.error(String(error)); process.exitCode = 2; }
