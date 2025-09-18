import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    const apiBase = process.env.API_BASE;
    if (!apiBase) { res.status(500).json({ ok:false, error:'API_BASE not set' }); return; }

    let raw='';
    await new Promise((resolve)=>{ req.on('data', c=> raw+=c); req.on('end', resolve); });
    if (!raw) raw='{}';

    const url = new URL('/auth/login', apiBase);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(raw)
      }
    };

    const upstream = lib.request(url, opts, (up) => {
      res.statusCode = up.statusCode || 500;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', up.headers['content-type'] || 'application/json; charset=utf-8');
      up.pipe(res);
    });

    upstream.on('error', (e) => {
      res.status(500).json({ ok:false, error: String(e) });
    });
    upstream.end(raw);
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
}
