const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const YOOMONEY_RECEIVER = process.env.YOOMONEY_RECEIVER || '';
const YOOMONEY_NOTIFICATION_SECRET = process.env.YOOMONEY_NOTIFICATION_SECRET || '';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

const PRODUCTS = {
  BioBlade: 39,
  Raygun: 399,
  "Traveler's Gun": 8999,
  Harvester: 299,
  'Тест': 2
};

if (!ADMIN_PASSWORD || !YOOMONEY_RECEIVER || !YOOMONEY_NOTIFICATION_SECRET) {
  console.error('ERROR: Set ADMIN_PASSWORD, YOOMONEY_RECEIVER and YOOMONEY_NOTIFICATION_SECRET.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');

let db = null;
const sessions = new Map();

async function initDb() {
  if (!DATABASE_URL) {
    console.log('Database: local JSON');
    return;
  }
  try {
    const { Pool } = require('pg');
    db = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        product TEXT NOT NULL,
        price TEXT NOT NULL,
        telegram TEXT NOT NULL DEFAULT '',
        nickname TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'waiting_payment',
        payment_label TEXT NOT NULL UNIQUE,
        operation_id TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paid_at TIMESTAMPTZ
      )
    `);
    console.log('Database: PostgreSQL');
  } catch (e) {
    console.error('Database connection failed:', e.message);
    process.exit(1);
  }
}

function readOrders() {
  try {
    const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function writeOrders(orders) {
  const tmp = ORDERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(orders, null, 2), 'utf8');
  fs.renameSync(tmp, ORDERS_FILE);
}

function createId() {
  return 'MM2-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function normalizePrice(value) {
  return Number(String(value ?? '').replace(/[^\d.,]/g, '').replace(',', '.'));
}

function formatOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    product: row.product,
    price: row.price,
    telegram: row.telegram || '',
    nickname: row.nickname || '',
    status: row.status || 'completed',
    payment_label: row.payment_label || '',
    operation_id: row.operation_id || '',
    date: row.created_at ? new Date(row.created_at).toLocaleString('ru-RU') : (row.date || ''),
    paid_at: row.paid_at ? new Date(row.paid_at).toLocaleString('ru-RU') : ''
  };
}

async function createPendingOrder(product, price) {
  const id = createId();
  const label = 'MM2_' + id.replace(/[^A-Za-z0-9_-]/g, '');
  const priceText = String(price) + ' ₽';

  if (db) {
    const r = await db.query(
      `INSERT INTO orders (id,product,price,telegram,nickname,status,payment_label)
       VALUES ($1,$2,$3,'','',$4,$5) RETURNING *`,
      [id, product, priceText, 'waiting_payment', label]
    );
    return formatOrder(r.rows[0]);
  }

  const order = {
    id, product, price: priceText, telegram: '', nickname: '', status: 'waiting_payment',
    payment_label: label, operation_id: '', date: new Date().toLocaleString('ru-RU'), paid_at: ''
  };
  const orders = readOrders();
  orders.push(order);
  writeOrders(orders);
  return order;
}

async function getOrder(id) {
  if (db) {
    const r = await db.query('SELECT * FROM orders WHERE id=$1 LIMIT 1', [id]);
    return formatOrder(r.rows[0]);
  }
  return readOrders().find(o => o.id === id) || null;
}

async function getOrderByLabel(label) {
  if (db) {
    const r = await db.query('SELECT * FROM orders WHERE payment_label=$1 LIMIT 1', [label]);
    return formatOrder(r.rows[0]);
  }
  return readOrders().find(o => o.payment_label === label) || null;
}

async function markPaid(label, operationId) {
  if (db) {
    const r = await db.query(
      `UPDATE orders SET status='paid', operation_id=$1, paid_at=NOW()
       WHERE payment_label=$2 AND status='waiting_payment' RETURNING *`,
      [operationId, label]
    );
    return formatOrder(r.rows[0]);
  }
  const orders = readOrders();
  const order = orders.find(o => o.payment_label === label && o.status === 'waiting_payment');
  if (!order) return null;
  order.status = 'paid';
  order.operation_id = operationId;
  order.paid_at = new Date().toLocaleString('ru-RU');
  writeOrders(orders);
  return order;
}

async function saveUserData(id, telegram, nickname) {
  if (db) {
    const r = await db.query(
      `UPDATE orders SET telegram=$1,nickname=$2,status='completed'
       WHERE id=$3 AND status='paid' RETURNING *`,
      [telegram, nickname, id]
    );
    return formatOrder(r.rows[0]);
  }
  const orders = readOrders();
  const order = orders.find(o => o.id === id && o.status === 'paid');
  if (!order) return null;
  order.telegram = telegram;
  order.nickname = nickname;
  order.status = 'completed';
  writeOrders(orders);
  return order;
}

async function getOrders() {
  if (db) {
    const r = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
    return r.rows.map(formatOrder);
  }
  return readOrders().slice().reverse().map(formatOrder);
}

async function deleteOrder(id) {
  if (db) {
    await db.query('DELETE FROM orders WHERE id=$1', [id]);
    return;
  }
  writeOrders(readOrders().filter(o => o.id !== id));
}

function json(res, status, data) {
  const text = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
}

function readBody(req, limit = 50000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    result[key] = decodeURIComponent(value);
  }
  return result;
}

function isAdmin(req) {
  const token = parseCookies(req).admin_session;
  return Boolean(token && sessions.has(token));
}

function encodeRFC3986(value) {
  return encodeURIComponent(String(value ?? '')).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function verifyYooMoneySignature(params) {
  const received = String(params.sign || '').toLowerCase();
  if (!received) return false;
  const source = Object.keys(params)
    .filter(k => k !== 'sign')
    .sort()
    .map(k => k + '=' + encodeRFC3986(params[k]))
    .join('&');
  const expected = crypto.createHmac('sha256', YOOMONEY_NOTIFICATION_SECRET).update(source, 'utf8').digest('hex').toLowerCase();
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function safePath(requestPath) {
  let clean;
  try { clean = decodeURIComponent(String(requestPath || '/').split('?')[0]); } catch { return null; }
  const relative = clean === '/' || clean === '' ? 'index.html' : clean.replace(/^[/\\]+/, '');
  const root = path.resolve(ROOT);
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

function mime(file) {
  return ({
    '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg',
    '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon'
  })[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'Не найдено' });
    res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function adminPage(res) {
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MM2 SHOP — Админка</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#070707;color:#fff;font-family:Arial,sans-serif;padding:24px}.wrap{max-width:1100px;margin:auto}.card,.order{background:#111;border:1px solid #292929;border-radius:20px;padding:24px}#login{max-width:430px;margin:10vh auto}h1,h2{margin-top:0}input{width:100%;height:50px;padding:0 15px;border-radius:12px;border:1px solid #333;background:#181818;color:#fff;margin:8px 0 15px}button{border:0;border-radius:11px;padding:12px 16px;cursor:pointer;font-weight:800}.gold{width:100%;background:#e1b44d;color:#111}.dark{background:#222;color:#fff}.delete{background:#401820;color:#ff8793}.top{display:flex;justify-content:space-between;gap:15px;align-items:center;flex-wrap:wrap}.actions{display:flex;gap:8px}.order{margin-top:15px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:15px}.box{padding:12px;background:#181818;border-radius:10px;color:#999;font-size:12px}.box b{display:block;color:#fff;margin-top:5px;word-break:break-word}.status{display:inline-block;padding:6px 10px;border-radius:20px;background:#183b28;color:#76e9a0;font-size:11px}.status.waiting{background:#3a3015;color:#f3d36d}.status.paid{background:#143b2b;color:#76e9a0}.empty{text-align:center;color:#777}@media(max-width:600px){body{padding:12px}.card,.order{padding:17px}}
</style></head><body><div class="wrap">
<div id="login" class="card"><h2>♛ MM2 SHOP</h2><p>Вход в админ-панель</p><input id="password" type="password" placeholder="Пароль"><button class="gold" onclick="login()">Войти</button><div id="loginError" style="color:#ff6675;margin-top:12px"></div></div>
<div id="panel" style="display:none"><div class="top"><div><h1>📦 Заказы MM2</h1><p style="color:#777">Заказы обновляются автоматически.</p></div><div class="actions"><button class="dark" onclick="loadOrders()">↻ Обновить</button><button class="dark" onclick="logout()">Выйти</button></div></div><div class="card" style="margin-top:15px">Всего заказов: <b id="count">0</b></div><div id="orders"></div></div></div>
<script>
function esc(v){return String(v??'').replace(/[&<>'"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]})}
function statusText(s){return s==='waiting_payment'?'Ожидает оплаты':s==='paid'?'Оплачено':'Данные получены'}
function statusClass(s){return s==='waiting_payment'?'status waiting':s==='paid'?'status paid':'status'}
async function login(){const p=document.getElementById('password').value;const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})});if(r.ok){document.getElementById('login').style.display='none';document.getElementById('panel').style.display='block';loadOrders()}else document.getElementById('loginError').textContent='❌ Неверный пароль'}
async function loadOrders(){const r=await fetch('/api/admin/orders',{cache:'no-store'});if(r.status===401){document.getElementById('login').style.display='block';document.getElementById('panel').style.display='none';return}const d=await r.json();document.getElementById('count').textContent=d.orders.length;const box=document.getElementById('orders');if(!d.orders.length){box.innerHTML='<div class="card empty">Пока заказов нет.</div>';return}box.innerHTML=d.orders.map(function(o){return '<div class="order"><div class="top"><b>Заказ #'+esc(o.id)+'</b><span class="'+statusClass(o.status)+'">'+esc(statusText(o.status))+'</span></div><div class="grid"><div class="box">🛒 Товар<b>'+esc(o.product)+'</b></div><div class="box">💰 Цена<b>'+esc(o.price)+'</b></div><div class="box">💳 Платёж<b>'+esc(o.payment_label||'—')+'</b></div><div class="box">👤 Telegram<b>'+esc(o.telegram||'Ожидается')+'</b></div><div class="box">🎮 Roblox<b>'+esc(o.nickname||'Ожидается')+'</b></div><div class="box">🕒 Дата<b>'+esc(o.date)+'</b></div><div class="box">🔐 ID операции<b>'+esc(o.operation_id||'—')+'</b></div><div class="box"><button class="delete" onclick="deleteOrder(\''+esc(o.id)+'\')">🗑 Удалить</button></div></div></div>'}).join('')}
async function deleteOrder(id){if(!confirm('Удалить этот заказ?'))return;const r=await fetch('/api/admin/orders/'+encodeURIComponent(id),{method:'DELETE'});if(r.ok)loadOrders()}
async function logout(){await fetch('/api/admin/logout',{method:'POST'});location.reload()}
document.getElementById('password').addEventListener('keydown',function(e){if(e.key==='Enter')login()});setInterval(function(){const p=document.getElementById('panel');if(p.style.display!=='none')loadOrders()},15000)
</script></body></html>`;
  res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(html);
}

async function handle(req, res) {
  const parsed = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (req.method === 'POST' && parsed.pathname === '/api/payment/create') {
    try {
      const input = JSON.parse(await readBody(req, 20000));
      const product = String(input.product || '').trim();
      const clientPrice = normalizePrice(input.price);
      if (!product || !Object.prototype.hasOwnProperty.call(PRODUCTS, product)) return json(res,400,{success:false,error:'Такого товара нет.'});
      const serverPrice = PRODUCTS[product];
      if (!Number.isFinite(clientPrice) || clientPrice !== serverPrice) return json(res,400,{success:false,error:'Неверная цена товара.'});
      const order = await createPendingOrder(product, serverPrice);
      const host = process.env.RENDER_EXTERNAL_URL || ('https://' + (req.headers.host || 'mm2-shop.onrender.com'));
      return json(res,200,{success:true,orderId:order.id,label:order.payment_label,receiver:YOOMONEY_RECEIVER,sum:serverPrice,successURL:host+'/?payment=success&order='+encodeURIComponent(order.id)});
    } catch (e) { console.error(e); return json(res,500,{success:false,error:'Не удалось создать платёж.'}); }
  }

  if (req.method === 'GET' && parsed.pathname === '/api/payment/status') {
    const id = parsed.searchParams.get('order');
    if (!id) return json(res,400,{success:false,error:'Заказ не указан.'});
    const order = await getOrder(id);
    if (!order) return json(res,404,{success:false,error:'Заказ не найден.'});
    return json(res,200,{success:true,status:order.status,order});
  }

  if (req.method === 'POST' && parsed.pathname === '/api/orders') {
    try {
      const input = JSON.parse(await readBody(req));
      const id = String(input.orderId || '').trim();
      const telegram = String(input.telegram || '').trim().slice(0,80);
      const nickname = String(input.nickname || '').trim().slice(0,80);
      if (!id || !telegram || !nickname) return json(res,400,{success:false,error:'Заполни Telegram и Roblox ник.'});
      const order = await saveUserData(id,telegram,nickname);
      if (!order) return json(res,400,{success:false,error:'Оплата ещё не подтверждена или заказ не найден.'});
      return json(res,200,{success:true,order});
    } catch (e) { console.error(e); return json(res,400,{success:false,error:'Не удалось сохранить заказ.'}); }
  }

  if (req.method === 'POST' && parsed.pathname === '/api/yoomoney/notification') {
    try {
      const params = Object.fromEntries(new URLSearchParams(await readBody(req)));
      console.log('YuMoney notification:', params);
      if (params.test_notification === 'true') return json(res,200,{success:true,test:true});
      if (!verifyYooMoneySignature(params)) return json(res,403,{success:false});
      if (params.currency !== '643' || params.unaccepted === 'true') return json(res,200,{success:true});
      const label = String(params.label || '').trim();
      const operationId = String(params.operation_id || '').trim();
      const amount = Number(params.withdraw_amount);
      if (!label || !operationId || !Number.isFinite(amount)) return json(res,400,{success:false});
      const order = await getOrderByLabel(label);
      if (!order) { console.error('YuMoney: order not found:',label); return json(res,200,{success:true}); }
      const expected = normalizePrice(order.price);
      if (Math.abs(amount - expected) > 0.01) { console.error('YuMoney: wrong amount',amount,expected); return json(res,400,{success:false}); }
      await markPaid(label,operationId);
      console.log('PAYMENT CONFIRMED:',order.id);
      return json(res,200,{success:true});
    } catch (e) { console.error('YuMoney notification error:',e); return json(res,500,{success:false}); }
  }

  if (req.method === 'POST' && parsed.pathname === '/api/admin/login') {
    try {
      const input = JSON.parse(await readBody(req,10000));
      if (String(input.password || '') !== ADMIN_PASSWORD) return json(res,401,{success:false});
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token,Date.now());
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Set-Cookie':'admin_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400'});
      return res.end(JSON.stringify({success:true}));
    } catch { return json(res,400,{success:false}); }
  }

  if (req.method === 'POST' && parsed.pathname === '/api/admin/logout') {
    const token = parseCookies(req).admin_session;
    if (token) sessions.delete(token);
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Set-Cookie':'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
    return res.end(JSON.stringify({success:true}));
  }

  if (req.method === 'GET' && parsed.pathname === '/api/admin/orders') {
    if (!isAdmin(req)) return json(res,401,{error:'Требуется вход'});
    return json(res,200,{orders:await getOrders()});
  }

  if (req.method === 'DELETE' && parsed.pathname.startsWith('/api/admin/orders/')) {
    if (!isAdmin(req)) return json(res,401,{error:'Требуется вход'});
    const id = decodeURIComponent(parsed.pathname.split('/').pop());
    await deleteOrder(id);
    return json(res,200,{success:true});
  }

  if (req.method === 'GET' && parsed.pathname === '/admin') return adminPage(res);

  if (req.method === 'GET') {
    const file = safePath(req.url);
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res,file);
  }
  return json(res,404,{error:'Не найдено'});
}

(async () => {
  await initDb();
  const server = http.createServer((req,res) => handle(req,res).catch(e => { console.error(e); json(res,500,{error:'Внутренняя ошибка сервера'}); }));
  server.listen(PORT,() => { console.log('MM2 SHOP запущен на порту '+PORT); console.log('Админка: /admin'); });
})();
