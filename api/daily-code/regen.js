export default async function handler(req, res) {
  try{
    const apiBase = process.env.API_BASE;
    if(!apiBase){ res.status(500).send('API_BASE is not set'); return; }
    const url = new URL('/daily-code/regen', apiBase).toString();
    const h = { 'content-type':'application/json' };
    const auth = req.headers['authorization']; if(auth) h['authorization'] = auth;
    const r = await fetch(url, { method:'POST', headers: h });
    const txt = await r.text();
    res.status(r.status).send(txt);
  }catch(e){ res.status(500).send('daily-code regen proxy error'); }
}
