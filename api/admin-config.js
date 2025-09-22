export default async function handler(req, res) {
  const proto = (req.headers['x-forwarded-proto'] || 'https');
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const sameOrigin = `${proto}://${host}`;

  const apiBase = process.env.API_BASE || sameOrigin;
  const orderBase = process.env.ORDER_BASE || process.env.API_BASE || sameOrigin;

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ apiBase, orderBase });
}
