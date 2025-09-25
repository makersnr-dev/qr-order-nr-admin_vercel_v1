export const config = { runtime: 'edge' };
export default async function handler(req) {
  try{
    const apiBase = process.env.API_BASE;
    if(!apiBase) return new Response('API_BASE is not set', { status: 500 });
    const url = new URL('/events/orders', apiBase).toString();
    const upstream = await fetch(url, { cache: 'no-store' });
    if(!upstream.ok) return new Response(await upstream.text(), { status: upstream.status });
    return new Response(upstream.body, {
      status: 200,
      headers:{
        'Content-Type':'text/event-stream; charset=utf-8',
        'Cache-Control':'no-cache, no-transform',
        'Connection':'keep-alive',
        'X-Accel-Buffering':'no'
      }
    });
  }catch(e){ return new Response('sse proxy error', { status: 500 }); }
}
