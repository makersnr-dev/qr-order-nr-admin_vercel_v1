import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { MongoClient, ObjectId } from 'mongodb';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const SSE_CLIENTS = new Set();
function sseSendAll(payload){ const data = `data: ${JSON.stringify(payload)}\n\n`; for(const res of SSE_CLIENTS){ try{ res.write(data);}catch(_){ } } }
const PORT = process.env.PORT || 3001;

// CORS (whitelist)
const ALLOWED = (process.env.ALLOWED_ORIGINS||'*').split(',').map(s=>s.trim()).filter(Boolean);
app.use((req,res,next)=>{
  const origin = req.headers.origin;
  if(!origin || ALLOWED.includes('*') || ALLOWED.includes(origin)){
    res.setHeader('Access-Control-Allow-Origin', origin||'*'); res.setHeader('Vary','Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials','true');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
  if(req.method==='OPTIONS'){ return res.sendStatus(204); } next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname,'public')));

// ===== MongoDB Connection =====
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
let dbClient = null;
let db = null;

async function connectDB() {
  if (db) return db;
  
  try {
    dbClient = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
    });
    
    await dbClient.connect();
    db = dbClient.db('qrorder');
    
    console.log('✅ MongoDB connected');
    
    // 인덱스 생성
    await db.collection('menu').createIndex({ id: 1 }, { unique: true });
    await db.collection('orders').createIndex({ orderId: 1 });
    await db.collection('orders').createIndex({ createdAt: -1 });
    
    return db;
  } catch (e) {
    console.error('❌ MongoDB connection failed:', e.message);
    // Fallback to memory mode
    return null;
  }
}

// DB helper functions
async function getDB() {
  if (!db) {
    await connectDB();
  }
  return db;
}

// 초기 메뉴 데이터 (DB가 비어있을 때만 삽입)
const DEFAULT_MENU = [
  { id:'A1', name:'아메리카노', price:3000, cat:'커피', active:true },
  { id:'A2', name:'라떼', price:4000, cat:'커피', active:true },
  { id:'B1', name:'크로와상', price:3500, cat:'베이커리', active:true },
];

async function initializeDefaultMenu() {
  const database = await getDB();
  if (!database) return;
  
  try {
    const count = await database.collection('menu').countDocuments();
    if (count === 0) {
      await database.collection('menu').insertMany(DEFAULT_MENU);
      console.log('✅ Default menu initialized');
    }
  } catch (e) {
    console.error('Menu initialization error:', e);
  }
}

// Initialize DB on startup
connectDB().then(() => initializeDefaultMenu());

// Config for client
const TOSS_CLIENT_KEY = process.env.TOSS_CLIENT_KEY || 'test_ck_xxx';
const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || 'test_sk_xxx';
app.get('/config', (_req,res)=> res.json({ clientKey: TOSS_CLIENT_KEY }));

// Admin auth
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';
const TOKENS = new Set();
function makeToken(){ return crypto.randomBytes(24).toString('hex'); }
function isAuthed(req){ const h=req.headers['authorization']||''; const t=h.startsWith('Bearer ')?h.slice(7):''; return TOKENS.has(t); }
function requireAuth(req,res,next){ if(isAuthed(req)) return next(); return res.status(401).json({ ok:false, message:'Unauthorized' }); }
app.post('/auth/login', (req,res)=>{
  const { password } = req.body || {};
  if(String(password)===String(ADMIN_PASSWORD)){ const token=makeToken(); TOKENS.add(token); return res.json({ ok:true, token }); }
  res.status(401).json({ ok:false, message:'Invalid password' });
});

// ===== Daily code =====
function todayStr(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function to4(n){ return String(n%10000).padStart(4,'0'); }
function digitsFromHex(hex){ let acc=0; for(let i=0;i<hex.length;i+=2){ acc=(acc*31 + parseInt(hex.slice(i,i+2),16))>>>0; } return to4(acc); }
const CODE_SECRET = process.env.CODE_SECRET || process.env.ADMIN_PASSWORD || 'qrorder_salt';

function defaultCodeFor(dateStr){ 
  const h=crypto.createHmac('sha256', CODE_SECRET).update(String(dateStr)).digest('hex'); 
  return digitsFromHex(h); 
}

async function getTodayCode(){ 
  const date = todayStr();
  const database = await getDB();
  
  if (database) {
    try {
      const override = await database.collection('daily_codes').findOne({ date });
      if (override && override.code) {
        return { date, code: override.code, override: true };
      }
    } catch (e) {
      console.error('Daily code fetch error:', e);
    }
  }
  
  return { date, code: defaultCodeFor(date), override: false };
}

app.get('/daily-code', requireAuth, async (_req,res)=>{ 
  try{ 
    res.json(await getTodayCode()); 
  }catch(e){ 
    console.error(e); 
    res.status(500).send('code error'); 
  } 
});

app.post('/daily-code/regen', requireAuth, async (_req,res)=>{ 
  try{ 
    const date = todayStr(); 
    const code = String(Math.floor(1000+Math.random()*9000)); 
    
    const database = await getDB();
    if (database) {
      await database.collection('daily_codes').updateOne(
        { date },
        { $set: { date, code, createdAt: new Date() } },
        { upsert: true }
      );
    }
    
    res.json({ date, code, override: true }); 
  }catch(e){ 
    console.error(e); 
    res.status(500).send('regen error'); 
  } 
});

app.post('/daily-code/clear', requireAuth, async (_req,res)=>{ 
  try{ 
    const date = todayStr(); 
    
    const database = await getDB();
    if (database) {
      await database.collection('daily_codes').deleteOne({ date });
    }
    
    res.json(await getTodayCode()); 
  }catch(e){ 
    console.error(e); 
    res.status(500).send('clear error'); 
  } 
});

// Customer verify code
app.post('/verify-code', async (req,res)=>{
  try{ 
    const provided=String((req.body||{}).code||'').trim(); 
    const j=await getTodayCode(); 
    if(provided && provided===j.code) return res.json({ ok:true }); 
    res.status(401).json({ ok:false, message:'코드 불일치' }); 
  }
  catch(e){ console.error(e); res.status(500).json({ ok:false, message:'server error' }); }
});

// Staff call from customer
app.post('/call-staff', async (req,res)=>{
  try{
    const j = req.body || {};
    const tableNo = String(j.tableNo||'').trim();
    const reason = (j.reason||'').toString().slice(0,100);
    if(!tableNo){ return res.status(400).json({ok:false, error:'TABLE_REQUIRED'}); }
    const payload = { type:'staff_call', at: Date.now(), tableNo, reason };
    sseSendAll(payload);
    return res.json({ok:true});
  }catch(e){ console.error('call-staff error', e); return res.status(500).json({ok:false}); }
});

// ===== Menu CRUD (MongoDB) =====
app.get('/menu', async (_req,res)=> {
  try {
    const database = await getDB();
    if (!database) return res.json(DEFAULT_MENU);
    
    const menu = await database.collection('menu').find({}).toArray();
    res.json(menu.map(m => ({ ...m, _id: undefined })));
  } catch (e) {
    console.error('Menu fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

app.post('/menu', requireAuth, async (req,res)=>{ 
  const { id,name,price,cat,active=true } = req.body||{}; 
  if(!id||!name||!price) return res.status(400).send('id/name/price required'); 
  
  try {
    const database = await getDB();
    if (!database) return res.status(500).send('DB not available');
    
    const exists = await database.collection('menu').findOne({ id });
    if (exists) return res.status(409).send('duplicate id');
    
    await database.collection('menu').insertOne({ 
      id, 
      name, 
      price: Number(price), 
      cat: cat||'', 
      active: !!active 
    });
    
    res.json({ ok:true }); 
  } catch (e) {
    console.error('Menu insert error:', e);
    res.status(500).send('Insert failed');
  }
});

app.patch('/menu/:id', requireAuth, async (req,res)=>{ 
  try {
    const database = await getDB();
    if (!database) return res.status(500).send('DB not available');
    
    const result = await database.collection('menu').updateOne(
      { id: req.params.id },
      { $set: req.body }
    );
    
    if (result.matchedCount === 0) return res.status(404).send('not found');
    res.json({ ok:true }); 
  } catch (e) {
    console.error('Menu update error:', e);
    res.status(500).send('Update failed');
  }
});

app.delete('/menu/:id', requireAuth, async (req,res)=>{ 
  try {
    const database = await getDB();
    if (!database) return res.status(500).send('DB not available');
    
    const result = await database.collection('menu').deleteOne({ id: req.params.id });
    
    if (result.deletedCount === 0) return res.status(404).send('not found');
    res.json({ ok:true }); 
  } catch (e) {
    console.error('Menu delete error:', e);
    res.status(500).send('Delete failed');
  }
});

// ===== Orders + SSE (MongoDB) =====
const clients = new Set();
app.get('/events/orders', (req,res)=>{ 
  res.setHeader('Content-Type','text/event-stream');
  SSE_CLIENTS.add(res);
  req.on('close',()=>{ try{ SSE_CLIENTS.delete(res); res.end(); }catch(_){}}); 
  res.setHeader('Cache-Control','no-cache'); 
  res.setHeader('Connection','keep-alive'); 
  res.flushHeaders?.(); 
  const client={res}; 
  clients.add(client); 
  req.on('close', ()=> clients.delete(client)); 
});

function broadcastOrder(o){ 
  const data=JSON.stringify({ 
    type:'order', 
    id: o._id || o.id, 
    tableNo: o.tableNo, 
    amount: o.amount, 
    createdAt: o.createdAt 
  }); 
  for(const c of clients){ 
    try{ 
      c.res.write(`event: order\n`); 
      c.res.write(`data: ${data}\n\n`); 
    }catch(_){} 
  } 
}

app.get('/orders', async (_req,res)=> {
  try {
    const database = await getDB();
    if (!database) return res.json([]);
    
    const orders = await database.collection('orders')
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    
    res.json(orders.map(o => ({ ...o, id: o._id.toString(), _id: undefined })));
  } catch (e) {
    console.error('Orders fetch error:', e);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.post('/orders', async (req,res)=>{ 
  const { 
    tableNo, 
    items, 
    amount, 
    paymentKey, 
    orderId,
    deliveryInfo
  } = req.body||{}; 
  
  try {
    const database = await getDB();
    if (!database) return res.status(500).json({ ok: false, error: 'DB not available' });
    
    const order = { 
      orderId: orderId || `ORD-${Date.now()}`, 
      tableNo: tableNo || '', 
      items: items || [], 
      amount: Number(amount) || 0, 
      paymentKey: paymentKey || '', 
      status: '접수', 
      createdAt: new Date(),
      deliveryInfo: deliveryInfo || null
    }; 
    
    const result = await database.collection('orders').insertOne(order);
    const insertedOrder = { ...order, id: result.insertedId.toString() };
    
    try { broadcastOrder(insertedOrder); } catch(_) {}
    
    res.json({ ok: true, order: insertedOrder }); 
  } catch (e) {
    console.error('Order insert error:', e);
    res.status(500).json({ ok: false, error: 'Failed to create order' });
  }
});

app.patch('/orders/:id', requireAuth, async (req,res)=>{ 
  try {
    const database = await getDB();
    if (!database) return res.status(500).send('DB not available');
    
    let objectId;
    try {
      objectId = new ObjectId(req.params.id);
    } catch (_) {
      return res.status(400).send('Invalid order ID');
    }
    
    const result = await database.collection('orders').updateOne(
      { _id: objectId },
      { $set: req.body }
    );
    
    if (result.matchedCount === 0) return res.status(404).send('not found');
    res.json({ ok: true }); 
  } catch (e) {
    console.error('Order update error:', e);
    res.status(500).send('Update failed');
  }
});

app.delete('/orders/:id', requireAuth, async (req,res)=>{ 
  try {
    const database = await getDB();
    if (!database) return res.status(500).send('DB not available');
    
    let objectId;
    try {
      objectId = new ObjectId(req.params.id);
    } catch (_) {
      return res.status(400).send('Invalid order ID');
    }
    
    const result = await database.collection('orders').deleteOne({ _id: objectId });
    
    if (result.deletedCount === 0) return res.status(404).send('not found');
    res.json({ ok: true }); 
  } catch (e) {
    console.error('Order delete error:', e);
    res.status(500).send('Delete failed');
  }
});

// ===== Payment Confirmation =====
app.post('/confirm', async (req,res)=>{ 
  const { paymentKey, orderId, amount } = req.body || {};
  
  if (!paymentKey || !orderId || !amount) {
    return res.status(400).json({ 
      ok: false, 
      message: 'paymentKey, orderId, amount required' 
    });
  }

  try {
    const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(TOSS_SECRET_KEY + ':').toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount: Number(amount)
      })
    });

    const tossData = await tossResponse.json();

    if (!tossResponse.ok) {
      console.error('Toss confirm failed:', tossData);
      return res.status(tossResponse.status).json({ 
        ok: false, 
        message: tossData.message || 'Payment confirmation failed',
        code: tossData.code
      });
    }

    console.log('Payment confirmed:', orderId, amount);
    
    res.json({ 
      ok: true, 
      payment: tossData 
    });

  } catch (e) {
    console.error('Confirm error:', e);
    res.status(500).json({ 
      ok: false, 
      message: 'Server error during payment confirmation' 
    });
  }
});

// ===== Excel export/import =====
app.get('/export/orders.xlsx', requireAuth, async (_req,res)=>{ 
  try{ 
    const database = await getDB();
    if (!database) return res.status(500).send('DB not available');
    
    const orders = await database.collection('orders')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    const wb = new ExcelJS.Workbook(); 
    const ws = wb.addWorksheet('orders'); 
    ws.columns = [
      {header:'createdAt',key:'createdAt',width:22},
      {header:'orderId',key:'orderId',width:24},
      {header:'tableNo',key:'tableNo',width:10},
      {header:'items',key:'items',width:40},
      {header:'amount',key:'amount',width:12},
      {header:'status',key:'status',width:10},
      {header:'paymentKey',key:'paymentKey',width:32},
      {header:'deliveryAddr',key:'deliveryAddr',width:30},
      {header:'deliveryName',key:'deliveryName',width:15},
      {header:'deliveryPhone',key:'deliveryPhone',width:15},
      {header:'reserveTime',key:'reserveTime',width:20},
    ]; 
    
    const toTxt = (items) => (items||[]).map(([id,q])=>`${id} x ${q}`).join(', '); 
    
    orders.forEach(o => {
      const row = {
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '',
        orderId: o.orderId,
        tableNo: o.tableNo,
        items: toTxt(o.items),
        amount: o.amount,
        status: o.status,
        paymentKey: o.paymentKey
      };
      
      if (o.deliveryInfo) {
        row.deliveryAddr = o.deliveryInfo.addr || '';
        row.deliveryName = o.deliveryInfo.name || '';
        row.deliveryPhone = o.deliveryInfo.phone || '';
        row.reserveTime = o.deliveryInfo.reserveTime || '';
      }
      
      ws.addRow(row);
    }); 
    
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); 
    res.setHeader('Content-Disposition','attachment; filename="orders.xlsx"'); 
    await wb.xlsx.write(res); 
    res.end(); 
  }catch(e){ 
    console.error(e); 
    res.status(500).send('엑셀 생성 실패'); 
  } 
});

const upload = multer({ storage: multer.memoryStorage(), limits:{ fileSize: 5*1024*1024 } });
app.post('/import/menu', requireAuth, upload.single('file'), async (req,res)=>{ 
  try{ 
    if(!req.file) return res.status(400).send('파일이 필요합니다.'); 
    
    const wb = new ExcelJS.Workbook(); 
    await wb.xlsx.load(req.file.buffer); 
    const ws = wb.worksheets[0]; 
    if(!ws) return res.status(400).send('시트를 찾을 수 없습니다.'); 
    
    const headers = {}; 
    ws.getRow(1).eachCell((cell,col)=> headers[String(cell.value).toLowerCase()]=col); 
    const need = ['id','name','price']; 
    for(const h of need){ if(!headers[h]) return res.status(400).send('헤더 누락: '+h); } 
    
    const newMenu = []; 
    ws.eachRow((row,i)=>{ 
      if(i===1) return; 
      const id = String(row.getCell(headers['id']).value||'').trim(); 
      if(!id) return; 
      const name = String(row.getCell(headers['name']).value||'').trim(); 
      const price = Number(row.getCell(headers['price']).value||0); 
      const cat = headers['cat']?String(row.getCell(headers['cat']).value||'').trim():''; 
      const active = headers['active']?!!row.getCell(headers['active']).value:true; 
      if(!name||!price) return; 
      newMenu.push({ id,name,price,cat,active }); 
    }); 
    
    if(newMenu.length === 0) return res.status(400).send('유효한 행이 없습니다.'); 
    
    const database = await getDB();
    if (!database) return res.status(500).send('DB not available');
    
    // 기존 메뉴 전체 삭제 후 새로 삽입
    await database.collection('menu').deleteMany({});
    await database.collection('menu').insertMany(newMenu);
    
    res.json({ ok: true, count: newMenu.length }); 
  }catch(e){ 
    console.error(e); 
    res.status(500).send('업로드 실패'); 
  } 
});

// QR proxy for download
app.get('/qr', async (req,res)=>{
  try{ 
    const data = String(req.query.data||'').trim(); 
    const size = String(req.query.size||'220x220'); 
    if(!data) return res.status(400).send('data required'); 
    const url = 'https://api.qrserver.com/v1/create-qr-code/?size='+encodeURIComponent(size)+'&data='+encodeURIComponent(data); 
    const r = await fetch(url); 
    if(!r.ok) return res.status(500).send('QR service error'); 
    res.setHeader('Content-Type','image/png'); 
    const buf = Buffer.from(await r.arrayBuffer()); 
    res.send(buf); 
  }catch(e){ 
    console.error(e); 
    res.status(500).send('QR proxy error'); 
  }
});

// Health & routes
app.get('/healthz', (_req,res)=> res.send('ok'));
app.get('/payment/success', (_req,res)=> res.sendFile(path.join(__dirname,'public','success.html')));
app.get('/payment/fail', (_req,res)=> res.sendFile(path.join(__dirname,'public','fail.html')));
app.get('/', (_req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));
app.get('/store', (_req,res)=> res.sendFile(path.join(__dirname,'public','store.html')));
app.get('/delivery', (_req,res)=> res.sendFile(path.join(__dirname,'public','delivery-login.html')));
app.get('/delivery/home', (_req,res)=> res.sendFile(path.join(__dirname,'public','delivery-home.html')));

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing MongoDB connection...');
  if (dbClient) {
    await dbClient.close();
  }
  process.exit(0);
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, ()=> console.log('API on :'+PORT));
}

export default app;