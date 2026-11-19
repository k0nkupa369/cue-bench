import {createServer} from 'node:http';
import {randomUUID,randomInt} from 'node:crypto';
import {home,results,replay,trace,reveal,screenshot} from './portfolio.ts';
import {capture} from './grade.ts';
import {resolve} from 'node:path';
import {readFileSync,mkdirSync,writeFileSync,linkSync,rmSync} from 'node:fs';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {Desk,conditions,workflows,type Workflow,type Condition,type Screen} from './ledger.ts';
import {page,workspace,escape} from './views.ts';

export async function startRetail(options:{seed?:number,condition?:Condition,workflow?:Workflow,humanArchive?:string}={}) {
  const archive=options.humanArchive?resolve(options.humanArchive):undefined;
  const sessions=new Map<string,Desk>();
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url??'/','http://localhost');
    const send=(status:number,body:string,type='text/html; charset=utf-8')=>res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'}).end(body);
    const redirect=(location:string)=>res.writeHead(303,{Location:location}).end();
    const cookie='desk_'+req.socket.localPort;
    const token=req.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith(cookie+'='))?.slice(cookie.length+1);
    const d=token?sessions.get(token):undefined;
    try{
      if(!options.humanArchive && ['/replays','/results','/trace','/portfolio.css','/screens'].some(path=>url.pathname===path||url.pathname.startsWith(path+'/')))return send(404,'Not available in an operator session');
      if(req.method==='GET' && url.pathname==='/portfolio.css')return send(200,readFileSync(new URL('../../retail/portfolio.css',import.meta.url),'utf8'),'text/css');
      if(req.method==='GET' && url.pathname==='/replays')return send(200,replay(url.searchParams,archive));
      if(req.method==='GET' && url.pathname==='/results')return send(200,results(url.searchParams,archive));
      if(req.method==='GET' && url.pathname==='/trace')return send(200,trace(url.searchParams.get('id')??'',archive));
      if(req.method==='GET' && url.pathname.startsWith('/screens/')){
        const bytes=screenshot(url.pathname.slice(9));return bytes?res.writeHead(200,{'Content-Type':'image/jpeg'}).end(bytes):send(404,'Missing screenshot');
      }
      if(req.method==='GET' && url.pathname==='/style.css') return send(200,readFileSync(new URL('../../retail/style.css',import.meta.url),'utf8'),'text/css');
      if(req.method==='GET' && url.pathname==='/') return send(200,options.humanArchive?home(archive):page('<h1>Retail workbench</h1>'+workflows.map(w=>'<form method="post" action="/start?workflow='+w+'"><button>Start '+w+' job</button></form>').join(''),'Retail workbench'));
      if(req.method==='POST' && req.headers.origin!=='http://'+req.headers.host) return send(403,'Origin rejected');
      if(req.method==='POST' && url.pathname==='/start'){
        const choice=url.searchParams.get('workflow')??'receiving';
        if(!workflows.some(w=>w===choice))return send(400,'Unknown workflow');
        if(token && options.humanArchive) sessions.delete(token);
        if(sessions.size>=500) for(const [id,old] of sessions) if(old.finished || Date.now()-old.lastSeen>3600000) sessions.delete(id);
        if(sessions.size>=500) return send(503,'Session capacity reached');
        if(d && !options.humanArchive)return send(409,'Study session already started');
        const id=randomUUID();
        sessions.set(id,new Desk(options.seed??randomInt(1,5),options.condition??conditions[randomInt(conditions.length)],options.workflow??choice as Workflow));
        res.setHeader('Set-Cookie',cookie+'='+id+'; HttpOnly; SameSite=Strict; Path=/');
        return redirect('/desk');
      }
      if(!d) return redirect('/');
      d.lastSeen=Date.now();
      if(req.method==='GET' && url.pathname==='/desk'){
        if(d.finished && options.humanArchive)return send(200,reveal(d));
        if(d.finished) return send(200,page('<h1>Job closed</h1><p>'+escape(d.note||'Submitted for review.')+'</p><a href="/">Back to workbench</a>','Job closed'));
        const name=url.searchParams.get('view')??'job';
        if(!['job','document','post','journal','stock','handoff'].includes(name))return send(404,'Unknown view');
        const html=workspace(d,name as Screen);
        const section=html.match(/<section>([\s\S]*?)<\/section>/)?.[1]??'';
        d.log({kind:'view',screen:name as Screen,visible:section.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()});
        return send(200,html);
      }
      const continuing=Boolean(options.humanArchive && url.pathname==='/continue');
      if(req.method!=='POST'||(d.finished && !continuing)) return send(404,'Unknown action');
      let raw='';req.setEncoding('utf8');
      for await(const chunk of req){raw+=chunk;if(raw.length>8192)return send(413,'Form too large');}
      const form=new URLSearchParams(raw);
      if(!token || sessions.get(token)!==d || form.get('job')!==d.id || (d.finished && !continuing)) return send(409,page('<h1>Job changed</h1><a href="/desk">Return to current job</a>','Job changed'));
      if(continuing){
        if(!d.nextWorkflow())return send(409,'No next job available');
        sessions.set(token,d.continueJob(options.condition??conditions[randomInt(conditions.length)]));
        return redirect('/desk');
      }
      if(url.pathname==='/post'){
        if(!form.has('q0')||!form.has('q1')) return send(400,'Missing quantities');
        const units:[number,number]=[Number(form.get('q0')),Number(form.get('q1'))];
        const before=d.entries.length, blocked=d.blocked.length;
        try {
          d.post(units);
          d.log({kind:'post',units,result:d.blocked.length>blocked?'blocked':d.message.includes('timed out')?'timeout':'applied',changes:d.entries.slice(before)});
        } catch(e) { d.message=e instanceof Error?e.message:'Invalid quantities';d.log({kind:'post',result:'invalid'}); }
        return redirect('/desk?view=post');
      }
      let citation;
      if(url.pathname==='/handoff'){
        const note=form.get('note')?.trim();if(!note||note.length>1200)return send(400,'Enter a discrepancy note.');
        const sku=form.get('sku')??'';
        const counts=['journal','balance'].map(k=>form.get(k)??'');
        if(!d.job.lines.some(l=>l.sku===sku)||!counts.every(n=>/^\d{1,8}$/.test(n))) return send(400,'Invalid evidence citation');
        citation={sku,journal:Number(counts[0]),balance:Number(counts[1])};
        d.note=note;
      }else if(url.pathname!=='/finish') return send(404,'Unknown action');
      d.log({kind:d.note?'handoff':'finish',note:d.note,citation});
      d.finished=true;
      if(archive){
        const pending=resolve(archive,d.id+'.'+randomUUID()+'.partial');
        try{
          mkdirSync(archive,{recursive:true});
          writeFileSync(pending,JSON.stringify(capture(d))+'\n',{flag:'wx'});
          linkSync(pending,resolve(archive,d.id+'.json'));
        }catch{
          d.finished=false;d.events.pop();d.note='';
          return send(503,page('<h1>Job could not be saved</h1><a href="/desk">Return to the job and retry</a>','Archive unavailable'));
        }finally{
          try{rmSync(pending,{force:true});}catch{ /* Only complete .json files are visible to the archive reader. */ }
        }
      }
      return redirect('/desk');
    }catch(e){return send(400,escape(e instanceof Error?e.message:'Invalid request'));}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();if(!address||typeof address==='string')throw Error('Missing port');
  return {url:'http://127.0.0.1:'+address.port, sessions,close:()=>server.close()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) console.log((await startRetail({humanArchive:'retail/local/human'})).url);
