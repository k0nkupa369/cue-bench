import {z} from 'zod';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {recording,score} from './model.ts';
import {baselineConfig, maxActions,maxMillis,prompt,readLock,slotIds} from './protocol.ts';

const outcome = z.enum(['pass','fail']);
const previous = z.object({checkerVersion:z.string().min(1),outcome,recovery:z.enum(['pass','fail','N/A']),reason:z.string().min(1)});
const manifest = z.object({series:z.enum(['fictional','baseline']),entries:z.array(z.object({
  id:z.string(),file:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),replaces:z.string().optional(),previous:previous.optional()
}))});
function report(file:string) {
  const data = manifest.parse(JSON.parse(readFileSync(file,'utf8')));
  const lockPath = resolve(dirname(file),'frozen.json');
  const lock = existsSync(lockPath) ? readLock(lockPath) : null;
  const entries = new Map(data.entries.map(e=>[e.id,e]));
  if (entries.size !== data.entries.length) throw Error('Duplicate attempt ID');
  const seen = new Set<string>();
  const replaced = new Set<string>();
  const rows = [...slotIds,...data.entries.map(e=>e.id).filter(id=>!slotIds.includes(id))].map(id=>{
    const entry = entries.get(id);
    const scenario = id.split('-')[0];
    if (!entry) return {id,scenario,status:'unrun',origin:null,outcome:null,recovery:null};
    const bytes = readFileSync(resolve(dirname(file),entry.file));
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw Error(id+' recording changed');
    const run = recording.parse(JSON.parse(bytes.toString()));
    if (!lock || run.scenario !== scenario || run.configuration.model !== lock.model ||
        run.configuration.prompt !== lock.prompt || run.configuration.maxMillis !== lock.maxMillis ||
        run.configuration.maxActions !== lock.maxActions || !run.stopReason || !run.startedAt ||
        Date.parse(run.startedAt) < Date.parse(lock.frozenAt) || run.baselineId !== id ||
        run.origin !== (data.series === 'fictional' ? 'stand-in' : 'openai')) throw Error(id+' configuration or provenance mismatch');
    const base = id.replace(/-r[1-9]\d*$/,'');
    if (!slotIds.includes(base) || (id === base) !== !entry.replaces ||
        (entry.replaces && (!seen.has(entry.replaces) || replaced.has(entry.replaces) ||
         entry.replaces.replace(/-r[1-9]\d*$/,'') !== base))) throw Error(id+' invalid replacement');
    if (entry.replaces) replaced.add(entry.replaces);
    if (run.stopReason === 'interrupted') seen.add(id);
    if (entry.previous?.checkerVersion === String(run.checkerVersion)) throw Error(id+' correction must identify the earlier checker version');
    return {id,scenario,status:run.stopReason,origin:run.origin,...score(run),recording:entry.file,
      sha256:entry.sha256,checkerVersion:run.checkerVersion,previous:entry.previous,
      replaces:entry.replaces,lastKnownView:run.steps.at(-1)?.view ?? run.initialView};
  });
  return {series:data.series,configuration:lock,rows};
}

const args = process.argv.slice(2);
if (args[0] === 'freeze') {
  const model = args[1];
  if (!model || !/-\d{4}-\d{2}-\d{2}$/.test(model)) throw Error('Provide a dated model snapshot ID');
  const lock = baselineConfig.parse({model,frozenAt:new Date().toISOString(),prompt,maxActions,maxMillis,taskVersion:1,checkerVersion:1});
  writeFileSync('baseline/frozen.json',JSON.stringify(lock,null,2)+'\n',{flag:'wx'});
} else {
  const file = args.find(arg=>arg !== '--json') ?? 'baseline/attempts.json';
  const result = report(file);
  if (args.includes('--json')) console.log(JSON.stringify(result,null,2));
  else {
    console.log(result.series === 'fictional' ? 'FICTIONAL REPORT EXAMPLE' : 'Maintained baseline');
    console.log(result.configuration ?? 'Configuration pending. All nine slots are unrun.');
    for (const r of result.rows) {
      console.log([r.id,r.status,r.origin,r.outcome,r.recovery].map(v=>v ?? '—').join('  '));
      if (!('recording' in r)) continue;
      if (r.replaces) console.log('  Replaces '+r.replaces);
      if (r.previous) console.log('  Previous checker '+r.previous.checkerVersion+' '+r.previous.outcome+'/'+r.previous.recovery+
        ' → checker '+r.checkerVersion+' '+r.outcome+'/'+r.recovery+'. '+r.previous.reason);
      if (r.status === 'interrupted') console.log('  Last known view\n'+r.lastKnownView);
    }
  }
}
