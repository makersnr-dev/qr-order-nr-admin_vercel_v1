export const config = { runtime: 'edge' };

function sleep(ms){ return new Promise(r=> setTimeout(r, ms)); }

export default async function handler(req) {
  const apiBase = process.env.API_BASE;
  if (!apiBase) return new Response('API_BASE is not set', { status: 500 });

  const ts = new TransformStream();
  const w = ts.writable.getWriter();
  const enc = new TextEncoder();

  await w.write(enc.encode('retry: 5000\n\n'));
  await w.write(enc.encode(': edge connected\n\n'));

  let alive = true;
  const hb = setInterval(()=>{
    if (!alive) return;
    try { w.write(enc.encode(': ping\n\n')); } catch(_) {}
  }, 15000);

  async function pumpOnce() {
    const upstreamUrl = new URL('/events/orders', apiBase).toString();
    const auth = req.headers.get('authorization') || undefined;

    const upstream = await fetch(upstreamUrl, {
      headers: { accept: 'text/event-stream', ...(auth ? { authorization: auth } : {}) },
      cache: 'no-store',
      redirect: 'follow',
    });

    if (!upstream.ok || !upstream.body) {
      const code = upstream.status || 502;
      try { await w.write(enc.encode(`: upstream ${code}\n\n`)); } catch(_){}
      return;
    }

    const r = upstream.body.getReader();
    while (true) {
      const { value, done } = await r.read();
      if (done) break;
      if (value && value.byteLength) {
        try { await w.write(value); } catch(_) { break; }
      }
    }
  }

  (async () => {
    try {
      while (alive) {
        await pumpOnce();
        await sleep(1500);
      }
    } catch (_) {
    } finally {
      alive = false;
      clearInterval(hb);
      try { await w.close(); } catch(_) {}
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
}
