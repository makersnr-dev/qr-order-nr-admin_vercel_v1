export default async function handler(req, res) {
  try {
    const apiBase = process.env.API_BASE || '';
    const out = { apiBase, checks: {} };
    if (!apiBase) {
      out.ok = false;
      out.reason = 'API_BASE not set';
      res.status(500).json(out);
      return;
    }
    // Vercel runtime has fetch
    try {
      const r = await fetch(`${apiBase}/healthz`);
      out.checks.healthz = r.status;
    } catch (e) {
      out.checks.healthz = String(e);
    }
    // Do a HEAD to events/orders if possible (some envs may not allow)
    try {
      const r2 = await fetch(`${apiBase}/events/orders`, { method: 'HEAD' });
      out.checks.events = r2.status;
    } catch (e) {
      out.checks.events = String(e);
    }
    out.ok = true;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
}
