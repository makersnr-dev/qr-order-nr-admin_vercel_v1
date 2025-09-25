export default async function handler(req, res) {
  try{
    const apiBase = process.env.API_BASE;
    if(!apiBase){ res.status(500).send('API_BASE is not set'); return; }
    const url = new URL('/daily-code', apiBase).toString();
    const h = {};
    const auth = req.headers['authorization'];
    if(auth) h['authorization'] = auth;
    const r = await fetch(url, { headers: h });
    const txt = await r.text();
    res.setHeader('Cache-Control','no-store');
    res.status(r.status).send(txt);
  }catch(e){
    res.status(500).send('daily-code proxy error');
  }
}
