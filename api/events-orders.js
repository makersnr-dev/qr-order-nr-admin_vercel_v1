import http from 'http';
import https from 'https';
import { URL } from 'url';

export default function handler(req, res) {
  try {
    const apiBase = process.env.API_BASE;
    if (!apiBase) {
      res.statusCode = 500;
      return res.end('API_BASE is not set');
    }
    // Target: <API_BASE>/events/orders
    const target = new URL('/events/orders', apiBase).toString();

    // Prepare SSE headers
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Vary', 'Origin');

    const mod = target.startsWith('https:') ? https : http;
    const upstream = mod.request(target, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    }, (up) => {
      up.on('data', (chunk) => {
        try { res.write(chunk); } catch (_) {}
      });
      up.on('end', () => {
        try { res.end(); } catch (_) {}
      });
    });

    upstream.on('error', (err) => {
      try { res.write(`event: error\ndata: ${JSON.stringify({ message: String(err) })}\n\n`); } catch (_) {}
      try { res.end(); } catch (_) {}
    });

    upstream.end();

    req.on('close', () => {
      try { upstream.destroy(); } catch (_) {}
    });
  } catch (e) {
    res.statusCode = 500;
    res.end('sse proxy error');
  }
}
