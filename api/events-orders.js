export const config = { runtime: 'edge' };

// Robust SSE proxy with heartbeat and auth forward
export default async function handler(req) {
  const apiBase = process.env.API_BASE;
  if (!apiBase) {
    return new Response('API_BASE is not set', { status: 500 });
  }
  try {
    const upstreamUrl = new URL('/events/orders', apiBase).toString();
    // Forward Authorization if present
    const auth = req.headers.get('authorization') || undefined;

    const upstream = await fetch(upstreamUrl, {
      headers: {
        'accept': 'text/event-stream',
        ...(auth ? { 'authorization': auth } : {}),
      },
      cache: 'no-store',
      redirect: 'follow',
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(()=>'upstream error');
      return new Response(text, { status: upstream.status || 502 });
    }

    const transformer = new TransformStream();
    const writer = transformer.writable.getWriter();
    const reader = upstream.body.getReader();

    // Heartbeat every 20s so edge/CDN won't 504 on idle
    let alive = true;
    const heartbeat = setInterval(() => {
      if (!alive) return;
      try { writer.write(new TextEncoder().encode(':ping\n\n')); } catch (e) {}
    }, 20000);

    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) await writer.write(value);
        }
      } catch (e) {
        // swallow, client will reconnect
      } finally {
        alive = false;
        clearInterval(heartbeat);
        try { await writer.close(); } catch (_) {}
      }
    })();

    return new Response(transformer.readable, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'connection': 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  } catch (e) {
    return new Response('sse proxy error', { status: 502 });
  }
}
