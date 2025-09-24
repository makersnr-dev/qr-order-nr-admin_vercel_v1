export default async function handler(req, res) {
  try{
    const apiBase = process.env.API_BASE;
    if(!apiBase){ res.status(500).send('API_BASE is not set'); return; }
    const url = new URL('/orders', apiBase).toString();
    const h = { };
    const auth = req.headers['authorization'];
    if (auth) h['authorization'] = auth;
    const r = await fetch(url, { headers: h });
    const txt = await r.text();
    res.setHeader('Cache-Control','no-store');
    if(r.ok){
      try{ res.status(200).json(JSON.parse(txt)); }
      catch(_){ res.status(200).send(txt); }
    } else {
      res.status(r.status).send(txt);
    }
  }catch(e){
    res.status(500).send('orders proxy error');
  }
}
