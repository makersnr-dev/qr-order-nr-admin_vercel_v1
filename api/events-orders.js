export const config = { runtime: 'edge' };

// Edge SSE proxy: pipes upstream SSE to the client without 300s serverless timeout
async function getApiBase(req) {
  try {
    const url = new URL(req.url);
    const origin = url.origin;
    const r = await fetch(origin + '/api/admin-config');
    if (r.ok) {
      const j = await r.json();
      if (j && j.apiBase) return j.apiBase;
    }
  } catch (_) {}
  // fallback to env
  return (process.env.API_BASE || '').trim();
}

export default async function handler(req) {
  try {
    const apiBase = await getApiBase(req);
    if (!apiBase) {
      return new Response('apiBase not configured', { status: 500 });
    }
    const upstreamUrl = apiBase.replace(/\/+$/, '') + '/events/orders';

    const upstream = await fetch(upstreamUrl, {
      headers: { 'Accept': 'text/event-stream' }
    });

    if (!upstream.ok || !upstream.body) {
      return new Response('Upstream SSE error', { status: upstream.status || 502 });
    }

    const encoder = new TextEncoder();
    const reader = upstream.body.getReader();

    const stream = new ReadableStream({
      start(controller) {
        // heartbeat every 15s to keep proxies alive
        const iv = setInterval(() => {
          try { controller.enqueue(encoder.encode(':hb\n\n')); } catch (_) {}
        }, 15000);

        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (_) {
            // swallow
          } finally {
            clearInterval(iv);
            try { controller.close(); } catch (_) {}
          }
        })();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        // allow admin UI to connect
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    return new Response('SSE proxy failed', { status: 502 });
  }
}
