// /api/login-proxy.js
export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).end();
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const apiBase = process.env.API_BASE;
    if (!apiBase) {
      res.status(500).json({ error: 'Missing API_BASE env' });
      return;
    }

    let body = '';
    await new Promise((resolve) => {
      req.on('data', (c) => (body += c));
      req.on('end', resolve);
    });
    const payload = body ? JSON.parse(body) : {};

    const upstream = await fetch(`${apiBase.replace(/\/$/, '')}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    // Pass through status and JSON (or text) as-is
    res.setHeader('Cache-Control', 'no-store');
    const ct = upstream.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', ct);
    res.status(upstream.status).send(text);
  } catch (e) {
    res.status(500).json({ error: 'proxy error', message: e?.message || String(e) });
  }
}