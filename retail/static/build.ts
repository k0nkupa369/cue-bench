import {buildExperiment} from './experiment.ts';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, readFileSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {grade, type Attempt} from '../../src/retail/grade.ts';

const root = resolve(import.meta.dirname, '../..');
const site = resolve(root, '.site/cue-bench');
const trace = resolve(root, 'retail/published/attempts/development-1-partial-mini-controls-3.json');
const attempt:Attempt = JSON.parse(readFileSync(trace,'utf8'));
const firstReceipt = attempt.events.find(event => event.result === 'timeout');
const retry = attempt.events.find(event => event.result === 'applied');
assert.equal(attempt.id, 'development-1-partial-mini-controls-3');
assert.equal(attempt.origin, 'openai');
assert.equal(attempt.seed, 1);
assert.equal(attempt.condition, 'partial');
assert.equal(attempt.workflow, 'receiving');
assert.equal(attempt.mode, 'controls');
assert.equal(attempt.termination, 'closed');
assert.equal(attempt.events.at(-1)?.kind, 'finish');
assert.deepEqual(firstReceipt?.units, [12,8]);
assert.deepEqual(firstReceipt?.changes?.map(change => [change.line,change.units]), [[0,12]]);
assert.deepEqual(retry?.units, [1,0]);
const result = grade(attempt);
assert.ok(result.invariants);
assert.deepEqual(result.lines.map(line => line.actual), [13,0]);

rmSync(site, {recursive:true, force:true});
execFileSync(process.execPath, [
  resolve(root, 'node_modules/typescript/bin/tsc'),
  '--ignoreConfig', '--target', 'ES2023', '--module', 'NodeNext', '--strict', '--skipLibCheck',
  '--rewriteRelativeImportExtensions', '--noEmitOnError',
  '--rootDir', root, '--outDir', site, resolve(import.meta.dirname, 'case.ts'),
], {cwd:root, stdio:'inherit'});
for (const name of ['index.html','case.css']) copyFileSync(resolve(import.meta.dirname,name), resolve(site,name));
copyFileSync(trace, resolve(site,'recording.json'));
buildExperiment(root,site);
console.log(site);
