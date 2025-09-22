
// /api/download-proxy.js (Vercel Serverless Function)
export default async function handler(req, res) {
  try {
    const url = req.query.url;
    const filename = req.query.filename || 'qr.png';
    if (!url) {
      res.status(400).json({error: 'missing url'});
      return;
    }
    // fetch remote resource server-side
    const r = await fetch(url);
    if (!r.ok) {
      res.status(r.status).send('upstream error');
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    // set download headers
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g,'_')}"`);
    // CORS just in case (same-origin usually fine)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).send('proxy error');
  }
}
