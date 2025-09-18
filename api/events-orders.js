import http from 'http';
import https from 'https';
export default function handler(req,res){
  try{
    const base = process.env.API_BASE;
    if(!base){ res.statusCode=500; return res.end('API_BASE not set'); }
    const url = new URL('/events/orders', base).toString();
    res.statusCode=200;
    res.setHeader('Content-Type','text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control','no-cache, no-transform');
    res.setHeader('Connection','keep-alive');
    const mod = url.startsWith('https:')?https:http;
    const up = mod.request(url,{method:'GET', headers:{Accept:'text/event-stream'}},(r)=>{
      r.on('data', chunk=>{ try{ res.write(chunk); }catch(_){} });
      r.on('end', ()=>{ try{ res.end(); }catch(_){} });
    });
    up.on('error', err=>{ try{ res.write('event: error\n'+'data: '+JSON.stringify({message:String(err)})+'\n\n'); }catch(_){ } try{ res.end(); }catch(_){} });
    up.end();
    req.on('close', ()=>{ try{ up.destroy(); }catch(_){} });
  }catch(e){ res.statusCode=500; res.end('proxy error'); }
}
