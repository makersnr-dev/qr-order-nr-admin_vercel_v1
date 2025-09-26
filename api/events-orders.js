export const config = { runtime: 'edge' };

export default async function handler(req) {
  const apiBase = process.env.API_BASE;
  if (!apiBase) return new Response('API_BASE is not set', { status: 500 });
  try {
    const upstreamUrl = new URL('/events/orders', apiBase).toString();
    const auth = req.headers.get('authorization') || undefined;
    const upstream = await fetch(upstreamUrl, {
      headers: { accept: 'text/event-stream', ...(auth ? { authorization: auth } : {}) },
      cache: 'no-store',
      redirect: 'follow',
    });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(()=> 'upstream error');
      return new Response(text, { status: upstream.status || 502 });
    }
    const ts = new TransformStream();
    const w = ts.writable.getWriter();
    const r = upstream.body.getReader();
    const enc = new TextEncoder();
    await w.write(enc.encode('retry: 5000\n\n'));
    await w.write(enc.encode(': connected\n\n'));
    let alive = true;
    const hb = setInterval(()=>{ if(!alive) return; try{ w.write(enc.encode(': ping\n\n')); }catch(_){} }, 20000);
    (async () => {
      try{
        while(true){
          const {value, done} = await r.read();
          if (done) break;
          if (value) await w.write(value);
        }
      }catch(e){}
      finally{
        alive=false;
        clearInterval(hb);
        try{ await w.close(); }catch(_){}
      }
    })();
    return new Response(ts.readable, {
      status: 200,
      headers: {
        'content-type':'text/event-stream; charset=utf-8',
        'cache-control':'no-cache, no-transform',
        'connection':'keep-alive',
        'x-accel-buffering':'no'
      }
    });
  } catch (e) {
    return new Response('sse proxy error', { status: 502 });
  }
}
