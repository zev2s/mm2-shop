const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL || '';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

if (!ADMIN_PASSWORD) {
  console.error('ERROR: ADMIN_PASSWORD is not set. Set it before starting the server.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');

const sessions = new Map();
let db = null;

async function initDb() {
  if (!DATABASE_URL) return;
  try {
    const { Pool } = require('pg');
    db = new Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        product TEXT NOT NULL,
        price TEXT NOT NULL,
        telegram TEXT NOT NULL,
        nickname TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('Database: PostgreSQL');
  } catch (e) {
    console.error('Database connection failed:', e.message);
    process.exit(1);
  }
}

function readOrdersLocal() {
  try {
    const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
function writeOrdersLocal(orders) {
  const tmp = ORDERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(orders, null, 2), 'utf8');
  fs.renameSync(tmp, ORDERS_FILE);
}

async function createOrder(order) {
  if (db) {
    const id = 'MM2-' + Date.now().toString(36).toUpperCase();
    const result = await db.query(
      `INSERT INTO orders (id, product, price, telegram, nickname) VALUES ($1,$2,$3,$4,$5) RETURNING id, product, price, telegram, nickname, created_at`,
      [id, order.product, order.price, order.telegram, order.nickname]
    );
    return normalizeDbOrder(result.rows[0]);
  }
  const orders = readOrdersLocal();
  const created = new Date().toISOString();
  const saved = { id: 'MM2-' + Date.now().toString(36).toUpperCase(), product: order.product, price: order.price, telegram: order.telegram, nickname: order.nickname, date: new Date().toLocaleString('ru-RU') };
  orders.push(saved);
  writeOrdersLocal(orders);
  return saved;
}

async function getOrders() {
  if (db) {
    const result = await db.query(`SELECT id, product, price, telegram, nickname, created_at FROM orders ORDER BY created_at DESC`);
    return result.rows.map(normalizeDbOrder);
  }
  return readOrdersLocal().slice().reverse();
}

async function deleteOrder(id) {
  if (db) {
    await db.query('DELETE FROM orders WHERE id = $1', [id]);
    return;
  }
  const orders = readOrdersLocal().filter(o => o.id !== id);
  writeOrdersLocal(orders);
}

function normalizeDbOrder(o) {
  return { id: o.id, product: o.product, price: o.price, telegram: o.telegram, nickname: o.nickname, date: new Date(o.created_at).toLocaleString('ru-RU') };
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isAdmin(req) {
  const token = parseCookies(req).admin_session;
  return !!token && sessions.has(token);
}
function safePath(requestPath) {
  let clean;
  try { clean = decodeURIComponent(String(requestPath || '/').split('?')[0]); } catch { return null; }
  const relative = (clean === '/' || clean === '') ? 'index.html' : clean.replace(/^[/\\]+/, '');
  const root = path.resolve(ROOT);
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}
function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon' })[ext] || 'application/octet-stream';
}
function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'Не найдено' });
    res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}
function readBody(req, limit = 12000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > limit) { reject(new Error('payload')); req.destroy(); } });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function adminPage(res) {
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MM2 SHOP — Админка</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% 0,rgba(243,198,91,.14),transparent 34%),#070707;color:#fff;font-family:Inter,Arial,sans-serif;padding:24px}.wrap{max-width:1100px;margin:auto}.card{background:rgba(17,17,17,.94);border:1px solid rgba(243,198,91,.2);border-radius:22px;padding:24px;box-shadow:0 25px 80px rgba(0,0,0,.4)}#login{max-width:430px;margin:10vh auto}.crown{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;margin:0 auto 18px;background:linear-gradient(145deg,#ffe08a,#b77b18);font-size:30px;color:#15100a}.badge{text-align:center;color:#e4b64e;font-size:11px;font-weight:800;letter-spacing:3px}.login-title{text-align:center;font-size:29px;margin:9px 0}.muted{color:#888}.login-sub{text-align:center;font-size:14px;margin:0 0 26px}.field label{display:block;font-size:13px;font-weight:700;color:#bbb;margin-bottom:8px}.field{margin-bottom:14px}input{width:100%;height:52px;border-radius:14px;border:1px solid #303030;background:#141414;color:#fff;padding:0 16px;font-size:15px;outline:none}input:focus{border-color:#dca52e;box-shadow:0 0 0 4px rgba(220,165,46,.08)}.btn{border:0;border-radius:13px;padding:12px 16px;font-weight:800;cursor:pointer}.gold{width:100%;height:52px;background:linear-gradient(100deg,#d99a25,#ffe18a,#d99a25);color:#171109}.error{min-height:20px;color:#ff6d78;text-align:center;margin-top:10px}.top{display:flex;justify-content:space-between;gap:15px;align-items:center;flex-wrap:wrap}.actions{display:flex;gap:8px}.darkbtn{background:#191919;color:#fff;border:1px solid #333}.danger{background:#35141a;color:#ff8490;border:1px solid #5a252d}.count{margin-top:18px;font-size:18px}.order{margin-top:14px;padding:18px;border:1px solid #2a2a2a;border-radius:16px;background:#101010}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:13px}.fieldbox{background:#171717;padding:11px;border-radius:11px;color:#999;font-size:12px}.fieldbox b{display:block;color:#fff;font-size:14px;margin-top:5px;word-break:break-word}.status{display:inline-block;padding:5px 9px;border-radius:999px;background:#183a28;color:#75e9a0;font-size:11px}.empty{padding:35px;text-align:center;color:#777}@media(max-width:600px){body{padding:14px}.card{padding:18px}.login-title{font-size:24px}}
</style></head><body><div class="wrap">
<div id="login" class="card"><div class="crown">♛</div><div class="badge">MM2 SHOP</div><h1 class="login-title">Вход в админ-панель</h1><p class="muted login-sub">Доступ только владельцу магазина</p><div class="field"><label for="pass">Секретный пароль</label><input id="pass" type="password" placeholder="Введите пароль" autocomplete="current-password"></div><button class="btn gold" onclick="login()">Войти в админ-панель →</button><div id="loginErr" class="error"></div></div>
<div id="panel" style="display:none"><div class="top"><div><h1 style="margin:0">📦 Заказы MM2</h1><div class="muted">Новые заказы появляются автоматически.</div></div><div class="actions"><button class="btn darkbtn" onclick="loadOrders()">↻ Обновить</button><button class="btn darkbtn" onclick="logout()">Выйти</button></div></div><div class="card count">Всего заказов: <b id="count">0</b></div><div id="orders"></div></div></div>
<script>
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
async function login(){const p=document.getElementById('pass').value;const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})});if(r.ok){document.getElementById('login').style.display='none';document.getElementById('panel').style.display='block';loadOrders();}else document.getElementById('loginErr').textContent='❌ Неверный пароль';}
async function loadOrders(){const r=await fetch('/api/admin/orders',{cache:'no-store'});if(r.status===401){document.getElementById('login').style.display='block';document.getElementById('panel').style.display='none';return;}const d=await r.json();document.getElementById('count').textContent=d.orders.length;const box=document.getElementById('orders');if(!d.orders.length){box.innerHTML='<div class="card empty">Пока заказов нет.</div>';return;}box.innerHTML=d.orders.map(o=>'<div class="order"><div class="top"><b>Заказ #'+esc(o.id)+'</b><span class="status">Новый</span></div><div class="grid"><div class="fieldbox">🛒 Товар<b>'+esc(o.product)+'</b></div><div class="fieldbox">💰 Цена<b>'+esc(o.price)+'</b></div><div class="fieldbox">👤 Telegram<b>'+esc(o.telegram)+'</b></div><div class="fieldbox">🎮 Roblox<b>'+esc(o.nickname)+'</b></div><div class="fieldbox">🕒 Дата<b>'+esc(o.date)+'</b></div><div class="fieldbox" style="display:flex;align-items:end"><button class="btn danger" onclick="delOrder(\''+esc(o.id)+\'')">Удалить</button></div></div></div>').join('');}
async function delOrder(id){if(!confirm('Удалить этот заказ?'))return;const r=await fetch('/api/admin/orders/'+encodeURIComponent(id),{method:'DELETE'});if(r.ok)loadOrders();}
async function logout(){await fetch('/api/admin/logout',{method:'POST'});location.reload();}
document.getElementById('pass').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
</script></body></html>`;
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);
}

async function handle(req,res){
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'POST' && parsed.pathname === '/api/orders') {
    try {
      const input = JSON.parse(await readBody(req));
      const product=String(input.product||'').trim().slice(0,100), price=String(input.price||'').trim().slice(0,50), telegram=String(input.telegram||'').trim().slice(0,50), nickname=String(input.nickname||'').trim().slice(0,50);
      if(!product||!price||!telegram||!nickname) return json(res,400,{success:false,error:'Заполни все поля.'});
      const order=await createOrder({product,price,telegram,nickname});
      return json(res,201,{success:true,order});
    } catch(e){ return json(res,400,{success:false,error:e.message==='payload'?'Слишком большой запрос.':'Не удалось сохранить заказ.'}); }
  }

  if (req.method === 'POST' && parsed.pathname === '/api/admin/login') {
    try { const input=JSON.parse(await readBody(req)); if(String(input.password||'')!==ADMIN_PASSWORD) return json(res,401,{success:false}); const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,Date.now()); const secure=process.env.NODE_ENV==='production'?' Secure;':''; res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':`admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure}`}); return res.end(JSON.stringify({success:true})); } catch { return json(res,400,{success:false}); }
  }
  if (req.method === 'POST' && parsed.pathname === '/api/admin/logout') { const token=parseCookies(req).admin_session;if(token)sessions.delete(token);res.writeHead(200,{'Content-Type':'application/json','Set-Cookie':'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return res.end(JSON.stringify({success:true})); }
  if (req.method === 'GET' && parsed.pathname === '/api/admin/orders') { if(!isAdmin(req))return json(res,401,{error:'Требуется вход'}); try{return json(res,200,{orders:await getOrders()});}catch{return json(res,500,{error:'Ошибка базы данных'});} }
  if (req.method === 'DELETE' && parsed.pathname.startsWith('/api/admin/orders/')) { if(!isAdmin(req))return json(res,401,{error:'Требуется вход'});const id=decodeURIComponent(parsed.pathname.split('/').pop());try{await deleteOrder(id);return json(res,200,{success:true});}catch{return json(res,500,{success:false});} }
  if (req.method === 'GET' && parsed.pathname === '/admin') return adminPage(res);

  if (req.method === 'GET') { const file=safePath(req.url); if(file && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res,file); }
  return json(res,404,{error:'Не найдено'});
}

(async()=>{await initDb();http.createServer((req,res)=>handle(req,res).catch(()=>json(res,500,{error:'Внутренняя ошибка сервера'}))).listen(PORT,()=>{console.log(`MM2 SHOP запущен: http://localhost:${PORT}`);console.log(`Админка: http://localhost:${PORT}/admin`);console.log(`Storage: ${db?'PostgreSQL':'local JSON (for local use)'}`);});})();
