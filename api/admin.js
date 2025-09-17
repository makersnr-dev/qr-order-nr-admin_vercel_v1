import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import { migrate, withClient } from '../db.js';

dotenv.config();
const app = express();
app.use(cors({ origin:true, credentials:true }));
app.use(express.json({ limit:'2mb' }));
app.use(express.urlencoded({ extended:true }));

const API_BASE = process.env.API_BASE||'';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD||'admin';
function authHeaders(){ return { 'Authorization':'Bearer '+ADMIN_PASSWORD, 'Content-Type':'application/json' }; }

app.get('/api/healthz', (_req,res)=> res.type('text/plain').send('ok'));

app.post('/api/auth/login', (req,res)=>{
  const { password } = req.body||{};
  if(String(password)!==ADMIN_PASSWORD) return res.status(401).send('bad password');
  res.json({ token: ADMIN_PASSWORD });
});

await migrate();

app.post('/api/adb/sync/orders', async (_req,res)=>{
  try{
    const r = await fetch(API_BASE+'/api/orders?includeCleared=1');
    if(!r.ok) return res.status(502).send('api fail');
    const arr = await r.json();
    for(const o of arr){
      await withClient(c=> c.query(`
        insert into admin_orders(id, order_id, table_no, amount, status, created_at, cleared, payment_key, items)
        values($1,$2,$3,$4,$5,coalesce($6,now()),$7,$8,$9)
        on conflict (id) do update set order_id=excluded.order_id, table_no=excluded.table_no, amount=excluded.amount, status=excluded.status, created_at=excluded.created_at, cleared=excluded.cleared, payment_key=excluded.payment_key, items=excluded.items
      `, [o.id, o.orderId||null, String(o.tableNo||''), Number(o.amount||0), String(o.status||'접수'), o.createdAt? new Date(o.createdAt): null, !!o.cleared, o.paymentKey||'', JSON.stringify(o.items||[]) ]));
    }
    res.json({ ok:true, count: arr.length });
  }catch(e){ console.error(e); res.status(500).json({ ok:false }); }
});

app.get('/api/adb/orders', async (req,res)=>{
  try{
    const include = String(req.query.includeCleared||'0')==='1';
    const table = (req.query.table||'').trim();
    let q='select * from admin_orders'; const cond=[]; const vals=[];
    if(table){ cond.push('table_no=$'+(vals.length+1)); vals.push(table); }
    if(!include){ cond.push('cleared=false'); }
    if(cond.length) q+=' where '+cond.join(' and ');
    q+=' order by created_at desc';
    const rows = await withClient(c=> c.query(q, vals));
    res.json(rows.rows);
  }catch(e){ res.status(500).json([]); }
});

app.post('/api/adb/order-status', async (req,res)=>{
  try{
    const { id, status } = req.body||{};
    if(!id) return res.status(400).send('id required');
    await fetch(API_BASE+'/api/orders/'+encodeURIComponent(id), { method:'PATCH', headers: authHeaders(), body: JSON.stringify({ status }) });
    const sets=['status=$2']; const vals=[id, String(status||'')];
    if(status==='접수') sets.push('accepted_at=now()');
    else if(status==='완료') sets.push('completed_at=now()');
    else if(status==='주문취소') sets.push('canceled_at=now()');
    else if(status==='환불') sets.push('refunded_at=now()');
    await withClient(c=> c.query('update admin_orders set '+sets.join(', ')+' where id=$1', vals));
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ ok:false }); }
});

app.post('/api/adb/order-clear', async (req,res)=>{
  try{
    const { id, cleared=true } = req.body||{};
    if(!id) return res.status(400).send('id required');
    await withClient(c=> c.query('update admin_orders set cleared=$2 where id=$1', [id, !!cleared]));
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ ok:false }); }
});

app.post('/api/adb/refund', async (req,res)=>{
  try{
    const { id } = req.body||{};
    if(!id) return res.status(400).send('id required');
    const r = await fetch(API_BASE+'/api/refund/'+encodeURIComponent(id), { method:'POST', headers:{ 'Authorization':'Bearer '+ADMIN_PASSWORD } });
    if(!r.ok){ const t=await r.text(); return res.status(502).send(t||'refund fail'); }
    await withClient(c=> c.query('update admin_orders set status=$2, refunded_at=now() where id=$1', [id, '환불']));
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ ok:false }); }
});

app.get('/api/adb/menu', async (_req,res)=>{
  try{
    const r = await fetch(API_BASE+'/api/menu');
    if(!r.ok) return res.status(502).send('api fail');
    const arr = await r.json();
    for(const m of arr){
      await withClient(c=> c.query(`
        insert into admin_menus(id,name,price,active,soldout,updated_at)
        values($1,$2,$3,$4,$5,now())
        on conflict (id) do update set name=excluded.name, price=excluded.price, active=excluded.active, soldout=excluded.soldout, updated_at=now()
      `, [m.id, m.name, Number(m.price||0), !!m.active, !!m.soldout]));
    }
    const out = await withClient(c=> c.query('select * from admin_menus order by name'));
    res.json(out.rows);
  }catch(e){ res.status(500).json([]); }
});
app.post('/api/adb/menu', async (req,res)=>{
  try{
    const m=req.body||{};
    await fetch(API_BASE+'/api/menu', { method:'POST', headers: authHeaders(), body: JSON.stringify(m) });
    await withClient(c=> c.query(`
      insert into admin_menus(id,name,price,active,soldout,updated_at)
      values($1,$2,$3,$4,$5,now())
      on conflict (id) do update set name=$2, price=$3, active=$4, soldout=$5, updated_at=now()
    `, [m.id, m.name, Number(m.price||0), !!m.active, !!m.soldout]));
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ ok:false }); }
});
app.patch('/api/adb/menu/:id', async (req,res)=>{
  try{
    const id = req.params.id, m=req.body||{};
    await fetch(API_BASE+'/api/menu/'+encodeURIComponent(id), { method:'PATCH', headers: authHeaders(), body: JSON.stringify(m) });
    await withClient(c=> c.query(`update admin_menus set name=coalesce($2,name), price=coalesce($3,price), active=coalesce($4,active), soldout=coalesce($5,soldout), updated_at=now() where id=$1`,
      [id, m.name, m.price!=null?Number(m.price):null, m.active, m.soldout]));
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ ok:false }); }
});

app.get('/api/adb/daily-code', async (_req,res)=>{
  try{
    const r = await fetch(API_BASE+'/api/daily-code', { headers:{ 'Authorization':'Bearer '+ADMIN_PASSWORD }});
    if(!r.ok) return res.status(502).send('api fail');
    const j = await r.json();
    await withClient(c=> c.query(`insert into admin_daily_codes(code_date,code,override,saved_at) values($1,$2,$3,now())
      on conflict (code_date) do update set code=$2, override=$3, saved_at=now()`, [j.date, j.code, !!j.override]));
    res.json(j);
  }catch(e){ res.status(500).json({}); }
});
app.post('/api/adb/daily-code/regen', async (_req,res)=>{
  try{
    const r = await fetch(API_BASE+'/api/daily-code/regen', { method:'POST', headers:{ 'Authorization':'Bearer '+ADMIN_PASSWORD }});
    if(!r.ok) return res.status(502).send('api fail');
    const r2 = await fetch(API_BASE+'/api/daily-code', { headers:{ 'Authorization':'Bearer '+ADMIN_PASSWORD }});
    const j2 = await r2.json();
    await withClient(c=> c.query(`insert into admin_daily_codes(code_date,code,override,saved_at) values($1,$2,$3,now())
      on conflict (code_date) do update set code=$2, override=$3, saved_at=now()`, [j2.date, j2.code, !!j2.override]));
    res.json({ ok:true });
  }catch(e){ res.status(500).json({}); }
});
app.post('/api/adb/daily-code/clear', async (_req,res)=>{
  try{
    const r = await fetch(API_BASE+'/api/daily-code/clear', { method:'POST', headers:{ 'Authorization':'Bearer '+ADMIN_PASSWORD }});
    if(!r.ok) return res.status(502).send('api fail');
    const r2 = await fetch(API_BASE+'/api/daily-code', { headers:{ 'Authorization':'Bearer '+ADMIN_PASSWORD }});
    const j2 = await r2.json();
    await withClient(c=> c.query(`insert into admin_daily_codes(code_date,code,override,saved_at) values($1,$2,$3,now())
      on conflict (code_date) do update set code=$2, override=$3, saved_at=now()`, [j2.date, j2.code, !!j2.override]));
    res.json({ ok:true });
  }catch(e){ res.status(500).json({}); }
});

function parseTableFromUrl(u){ try{ const z=new URL(u); return z.searchParams.get('table')||null; }catch(_){ return null; } }
app.post('/api/adb/qr-history', async (req,res)=>{
  try{
    const { url } = req.body||{};
    if(!url) return res.status(400).send('url required');
    const t = parseTableFromUrl(url);
    await withClient(c=> c.query('insert into admin_qr_history(url, table_no) values($1,$2)', [url, t]));
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ ok:false }); }
});
app.get('/api/adb/qr-history', async (_req,res)=>{
  try{
    const rows = await withClient(c=> c.query('select id,url,table_no,created_at from admin_qr_history order by id desc limit 50'));
    res.json(rows.rows);
  }catch(e){ res.status(500).json([]); }
});

app.get('/api/adb/export/orders.xlsx', async (_req,res)=>{
  try{
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('orders');
    ws.addRow(['createdAt','table','status','amount','items']);
    const rows = await withClient(c=> c.query('select * from admin_orders order by created_at desc'));
    for(const o of rows.rows){
      const items = (o.items||[]).map(it=> `${it[0]} x ${it[1]}`).join(', ');
      ws.addRow([o.created_at, o.table_no, o.status, o.amount, items]);
    }
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="orders.xlsx"');
    await wb.xlsx.write(res); res.end();
  }catch(e){ res.status(500).send('export error'); }
});

export default app;
