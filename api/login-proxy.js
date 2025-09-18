export default async function handler(req, res) {
  try {
    const apiBase = process.env.API_BASE;
    if (!apiBase) { res.status(500).json({ ok:false, error:'API_BASE not set' }); return; }
    let raw=''; await new Promise(r => { req.on('data', c=> raw+=c); req.on('end', r); });
    let payload={}; try{ payload=raw?JSON.parse(raw):{}; }catch(_){}
    const r = await fetch(apiBase.replace(/\/$/, '') + '/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const txt = await r.text();
    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(txt);
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
}
