import {readFileSync} from 'node:fs';
import {recording, score} from './model.ts';

const examples = [
  ['normal','pass','N/A'],
  ['saved-check','pass','pass'], ['lost-check','pass','pass'],
  ['saved-blind','pass','fail'], ['lost-blind','pass','fail'],
  ['saved-stop','pass','fail'], ['lost-stop','fail','fail']
];
const rows = examples.map(([example,outcome,recovery])=>{
  const file = new URL('../examples/'+example+'.json',import.meta.url);
  const run = recording.parse(JSON.parse(readFileSync(file,'utf8')));
  const actual = score(run);
  if (run.scenario !== example.split('-')[0] || run.origin !== 'scripted' || actual.outcome !== outcome || actual.recovery !== recovery) {
    throw Error('Unexpected example result: '+example+' '+JSON.stringify(actual));
  }
  return {example,origin:run.origin,...actual};
});
console.table(rows);
