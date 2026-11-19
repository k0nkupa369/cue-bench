import {createServer} from 'node:http';
import {randomUUID,randomInt} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {Desk,conditions,type Condition,type Screen} from './ledger.ts';
import {page,workspace,escape} from './views.ts';

export async function startRetail(options:{seed?:number,condition?:Condition}={}) {
  const sessions=new Map<string,Desk>();
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url??'/','http://localhost');
    const send=(status:number,body:string,type='text/html; charset=utf-8')=>res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'}).end(body);
    const redirect=(location:string)=>res.writeHead(303,{Location:location}).end();
    const token=req.headers.cookie?.match(/(?:^|; )desk=([\w-]+)/)?.[1];
    const d=token?sessions.get(token):undefined;
    try{
      if(req.method==='GET' && url.pathname==='/style.css') return send(200,readFileSync(new URL('../../retail/style.css',import.meta.url),'utf8'),'text/css');
      if(req.method==='GET' && url.pathname==='/') return send(200,page('<p class="eyebrow">Operations benchmark</p><h1>The receiving desk</h1><p class="brief">A delivery arrives with two product lines. Reconcile it against the purchase order and leave the warehouse books correct.</p><form method="post" action="/start"><button>Start receiving job</button></form>','Retail operations'));
      if(req.method==='POST' && req.headers.origin!=='http://'+req.headers.host) return send(403,'Origin rejected');
      if(req.method==='POST' && url.pathname==='/start'){
        if(sessions.size>=500) return send(503,'Session capacity reached');
        const id=randomUUID();
        sessions.set(id,new Desk(options.seed??randomInt(1,5),options.condition??conditions[randomInt(conditions.length)]));
        res.setHeader('Set-Cookie','desk='+id+'; HttpOnly; SameSite=Strict; Path=/');
        return redirect('/desk');
      }
      if(!d) return redirect('/');
      if(req.method==='GET' && url.pathname==='/desk'){
        if(d.finished) return send(200,page('<h1>Job closed</h1><p>'+escape(d.note||'Submitted for review.')+'</p><a href="/">Back to workbench</a>','Job closed'));
        const name=url.searchParams.get('view')??'job';
        if(!['job','document','post','journal','stock','handoff'].includes(name))return send(404,'Unknown view');
        return send(200,workspace(d,name as Screen));
      }
      if(req.method!=='POST'||d.finished) return send(404,'Unknown action');
      let raw='';req.setEncoding('utf8');
      for await(const chunk of req){raw+=chunk;if(raw.length>8192)return send(413,'Form too large');}
      const form=new URLSearchParams(raw);
      if(url.pathname==='/post'){
        if(!form.has('q0')||!form.has('q1')) return send(400,'Missing quantities');
        d.post([Number(form.get('q0')),Number(form.get('q1'))]);return redirect('/desk?view=post');
      }
      if(url.pathname==='/handoff'){
        const note=form.get('note')?.trim();if(!note||note.length>1200)return send(400,'Enter a discrepancy note.');
        d.note=note;
      }else if(url.pathname!=='/finish') return send(404,'Unknown action');
      d.finished=true;return redirect('/desk');
    }catch(e){return send(400,escape(e instanceof Error?e.message:'Invalid request'));}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();if(!address||typeof address==='string')throw Error('Missing port');
  return {url:'http://127.0.0.1:'+address.port, sessions,close:()=>server.close()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) console.log((await startRetail()).url);
