const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");
const DATABASE_URL = String(process.env.DATABASE_URL || "");
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

if (!ADMIN_PASSWORD) {
  console.error("ERROR: ADMIN_PASSWORD is not set in Render Environment Variables.");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(ORDERS_FILE, "[]", "utf8");
}

const sessions = new Map();
let db = null;

async function initDb() {
  if (!DATABASE_URL) {
    console.log("Storage: local JSON (DATABASE_URL is not set)");
    return;
  }

  try {
    const { Pool } = require("pg");
    db = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
    });

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

    console.log("Storage: PostgreSQL");
  } catch (error) {
    console.error("PostgreSQL connection failed:", error.message);
    process.exit(1);
  }
}

function readOrdersLocal() {
  try {
    const data = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeOrdersLocal(orders) {
  const tmp = ORDERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(orders, null, 2), "utf8");
  fs.renameSync(tmp, ORDERS_FILE);
}

function normalizeDbOrder(order) {
  return {
    id: order.id,
    product: order.product,
    price: order.price,
    telegram: order.telegram,
    nickname: order.nickname,
    date: new Date(order.created_at).toLocaleString("ru-RU")
  };
}

async function createOrder(order) {
  const id = "MM2-" + Date.now().toString(36).toUpperCase();

  if (db) {
    const result = await db.query(
      `INSERT INTO orders
       (id, product, price, telegram, nickname)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, product, price, telegram, nickname, created_at`,
      [id, order.product, order.price, order.telegram, order.nickname]
    );

    return normalizeDbOrder(result.rows[0]);
  }

  const orders = readOrdersLocal();

  const saved = {
    id,
    product: order.product,
    price: order.price,
    telegram: order.telegram,
    nickname: order.nickname,
    date: new Date().toLocaleString("ru-RU")
  };

  orders.push(saved);
  writeOrdersLocal(orders);
  return saved;
}

async function getOrders() {
  if (db) {
    const result = await db.query(
      `SELECT id, product, price, telegram, nickname, created_at
       FROM orders
       ORDER BY created_at DESC`
    );

    return result.rows.map(normalizeDbOrder);
  }

  return readOrdersLocal().slice().reverse();
}

async function deleteOrder(id) {
  if (db) {
    await db.query("DELETE FROM orders WHERE id = $1", [id]);
    return;
  }

  writeOrdersLocal(readOrdersLocal().filter(order => order.id !== id));
}

function json(res, status, body) {
  const text = JSON.stringify(body);

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(text)
  });

  res.end(text);
}

function parseCookies(req) {
  const cookies = {};
  const raw = req.headers.cookie || "";

  for (const part of raw.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

function isAdmin(req) {
  const token = parseCookies(req).admin_session;
  return Boolean(token && sessions.has(token));
}

function readBody(req, limit = 12000) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > limit) {
        reject(new Error("payload"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function safePath(requestPath) {
  let clean;

  try {
    clean = decodeURIComponent(String(requestPath || "/").split("?")[0]);
  } catch {
    return null;
  }

  const relative =
    clean === "/" || clean === ""
      ? "index.html"
      : clean.replace(/^[/\\]+/, "");

  const root = path.resolve(ROOT);
  const full = path.resolve(root, relative);

  if (full !== root && !full.startsWith(root + path.sep)) {
    return null;
  }

  return full;
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();

  return {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  }[ext] || "application/octet-stream";
}

function serveFile(res, file) {
  fs.readFile(file, (error, data) => {
    if (error) {
      return json(res, 404, { error: "Не найдено" });
    }

    res.writeHead(200, {
      "Content-Type": mime(file),
      "Cache-Control": "no-cache"
    });

    res.end(data);
  });
}

function adminPage(res) {
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MM2 SHOP — Админка</title>
<style>
*{box-sizing:border-box}
body{
  margin:0;min-height:100vh;padding:24px;color:#fff;
  font-family:Inter,Arial,sans-serif;
  background:
    radial-gradient(circle at 50% 0,rgba(243,198,91,.14),transparent 34%),
    #070707;
}
.wrap{max-width:1100px;margin:auto}
.card{
  background:rgba(17,17,17,.96);
  border:1px solid rgba(243,198,91,.2);
  border-radius:22px;
  padding:24px;
  box-shadow:0 25px 80px rgba(0,0,0,.4);
}
#login{max-width:430px;margin:10vh auto}
.crown{
  width:64px;height:64px;border-radius:18px;
  display:grid;place-items:center;margin:0 auto 18px;
  background:linear-gradient(145deg,#ffe08a,#b77b18);
  font-size:30px;color:#15100a;
}
.badge{text-align:center;color:#e4b64e;font-size:11px;font-weight:800;letter-spacing:3px}
.login-title{text-align:center;font-size:29px;margin:9px 0}
.muted{color:#888}
.login-sub{text-align:center;font-size:14px;margin:0 0 26px}
.field{margin-bottom:14px}
.field label{
  display:block;font-size:13px;font-weight:700;
  color:#bbb;margin-bottom:8px
}
input{
  width:100%;height:52px;border-radius:14px;
  border:1px solid #303030;background:#141414;color:#fff;
  padding:0 16px;font-size:15px;outline:none;
}
input:focus{border-color:#dca52e;box-shadow:0 0 0 4px rgba(220,165,46,.08)}
.btn{
  border:0;border-radius:13px;padding:12px 16px;
  font-weight:800;cursor:pointer;
}
.gold{
  width:100%;height:52px;
  background:linear-gradient(100deg,#d99a25,#ffe18a,#d99a25);
  color:#171109;
}
.gold:disabled{opacity:.65;cursor:wait}
.error{min-height:20px;color:#ff6d78;text-align:center;margin-top:10px}
.success{min-height:20px;color:#75e9a0;text-align:center;margin-top:10px}
.top{
  display:flex;justify-content:space-between;
  gap:15px;align-items:center;flex-wrap:wrap
}
.actions{display:flex;gap:8px}
.darkbtn{background:#191919;color:#fff;border:1px solid #333}
.danger{background:#35141a;color:#ff8490;border:1px solid #5a252d}
.count{margin-top:18px;font-size:18px}
.order{
  margin-top:14px;padding:18px;border:1px solid #2a2a2a;
  border-radius:16px;background:#101010
}
.grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
  gap:10px;margin-top:13px
}
.fieldbox{
  background:#171717;padding:11px;border-radius:11px;
  color:#999;font-size:12px
}
.fieldbox b{
  display:block;color:#fff;font-size:14px;
  margin-top:5px;word-break:break-word
}
.status{
  display:inline-block;padding:5px 9px;border-radius:999px;
  background:#183a28;color:#75e9a0;font-size:11px
}
.empty{padding:35px;text-align:center;color:#777}
@media(max-width:600px){
  body{padding:14px}.card{padding:18px}.login-title{font-size:24px}
}
</style>
</head>
<body>
<div class="wrap">

<div id="login" class="card">
  <div class="crown">♛</div>
  <div class="badge">MM2 SHOP</div>
  <h1 class="login-title">Вход в админ-панель</h1>
  <p class="muted login-sub">Доступ только владельцу магазина</p>

  <form id="loginForm">
    <div class="field">
      <label for="pass">Секретный пароль</label>
      <input
        id="pass"
        type="password"
        placeholder="Введите пароль"
        autocomplete="current-password"
        required
      >
    </div>

    <button id="loginButton" class="btn gold" type="submit">
      Войти в админ-панель →
    </button>
  </form>

  <div id="loginErr" class="error"></div>
</div>

<div id="panel" style="display:none">
  <div class="top">
    <div>
      <h1 style="margin:0">📦 Заказы MM2</h1>
      <div class="muted">Новые заказы появляются автоматически.</div>
    </div>

    <div class="actions">
      <button class="btn darkbtn" id="refreshButton">↻ Обновить</button>
      <button class="btn darkbtn" id="logoutButton">Выйти</button>
    </div>
  </div>

  <div class="card count">
    Всего заказов: <b id="count">0</b>
  </div>

  <div id="orders"></div>
</div>

</div>

<script>
const $ = id => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "'":"&#39;",
    '"':"&quot;"
  }[char]));
}

function showPanel() {
  $("login").style.display = "none";
  $("panel").style.display = "block";
}

function showLogin() {
  $("login").style.display = "block";
  $("panel").style.display = "none";
}

async function login() {
  const password = $("pass").value;
  const button = $("loginButton");
  const error = $("loginErr");

  error.textContent = "";
  button.disabled = true;
  button.textContent = "Проверяем...";

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({password})
    });

    if (response.ok) {
      $("pass").value = "";
      showPanel();
      await loadOrders();
      return;
    }

    if (response.status === 401) {
      error.textContent = "❌ Неверный пароль";
    } else {
      error.textContent = "❌ Ошибка сервера. Попробуй ещё раз.";
    }
  } catch (e) {
    error.textContent = "❌ Нет связи с сервером.";
  } finally {
    button.disabled = false;
    button.textContent = "Войти в админ-панель →";
  }
}

async function loadOrders() {
  try {
    const response = await fetch("/api/admin/orders", {
      cache: "no-store",
      credentials: "same-origin"
    });

    if (response.status === 401) {
      showLogin();
      return;
    }

    if (!response.ok) {
      $("orders").innerHTML =
        '<div class="card empty">Не удалось загрузить заказы.</div>';
      return;
    }

    const data = await response.json();
    const orders = Array.isArray(data.orders) ? data.orders : [];

    $("count").textContent = orders.length;

    if (!orders.length) {
      $("orders").innerHTML =
        '<div class="card empty">Пока заказов нет.</div>';
      return;
    }

    $("orders").innerHTML = orders.map(order =>
      '<div class="order">' +
        '<div class="top">' +
          '<b>Заказ #' + esc(order.id) + '</b>' +
          '<span class="status">Новый</span>' +
        '</div>' +
        '<div class="grid">' +
          '<div class="fieldbox">🛒 Товар<b>' + esc(order.product) + '</b></div>' +
          '<div class="fieldbox">💰 Цена<b>' + esc(order.price) + '</b></div>' +
          '<div class="fieldbox">👤 Telegram<b>' + esc(order.telegram) + '</b></div>' +
          '<div class="fieldbox">🎮 Roblox<b>' + esc(order.nickname) + '</b></div>' +
          '<div class="fieldbox">🕒 Дата<b>' + esc(order.date) + '</b></div>' +
          '<div class="fieldbox"><button class="btn danger" data-delete-id="' +
            esc(order.id) + '">Удалить</button></div>' +
        '</div>' +
      '</div>'
    ).join("");

    document.querySelectorAll("[data-delete-id]").forEach(button => {
      button.addEventListener("click", () => deleteOrder(button.dataset.deleteId));
    });

  } catch (e) {
    $("orders").innerHTML =
      '<div class="card empty">Ошибка соединения с сервером.</div>';
  }
}

async function deleteOrder(id) {
  if (!confirm("Удалить этот заказ?")) return;

  const response = await fetch(
    "/api/admin/orders/" + encodeURIComponent(id),
    {
      method: "DELETE",
      credentials: "same-origin"
    }
  );

  if (response.ok) {
    await loadOrders();
  }
}

async function logout() {
  await fetch("/api/admin/logout", {
    method: "POST",
    credentials: "same-origin"
  });

  location.reload();
}

$("loginForm").addEventListener("submit", event => {
  event.preventDefault();
  login();
});

$("refreshButton").addEventListener("click", loadOrders);
$("logoutButton").addEventListener("click", logout);

async function checkSession() {
  const response = await fetch("/api/admin/orders", {
    cache: "no-store",
    credentials: "same-origin"
  });

  if (response.ok) {
    showPanel();
    await loadOrders();
  }
}

checkSession();
setInterval(() => {
  if ($("panel").style.display !== "none") {
    loadOrders();
  }
}, 5000);
</script>
</body>
</html>`;

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(html);
}

async function handle(req, res) {
  const parsed = new URL(
    req.url,
    "http://" + (req.headers.host || "localhost")
  );

  if (req.method === "GET" && parsed.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      storage: db ? "postgresql" : "local-json"
    });
  }

  if (req.method === "POST" && parsed.pathname === "/api/orders") {
    try {
      const input = JSON.parse(await readBody(req));

      const product = String(input.product || "").trim().slice(0, 100);
      const price = String(input.price || "").trim().slice(0, 50);
      const telegram = String(input.telegram || "").trim().slice(0, 50);
      const nickname = String(input.nickname || "").trim().slice(0, 50);

      if (!product || !price || !telegram || !nickname) {
        return json(res, 400, {
          success: false,
          error: "Заполни все поля."
        });
      }

      const order = await createOrder({
        product,
        price,
        telegram,
        nickname
      });

      return json(res, 201, {
        success: true,
        order
      });
    } catch (error) {
      console.error("Order error:", error);

      return json(res, 400, {
        success: false,
        error:
          error.message === "payload"
            ? "Слишком большой запрос."
            : "Не удалось сохранить заказ."
      });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/admin/login") {
    try {
      const input = JSON.parse(await readBody(req));
      const password = String(input.password || "");

      if (password !== ADMIN_PASSWORD) {
        return json(res, 401, { success: false });
      }

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, Date.now());

      const secure =
        process.env.NODE_ENV === "production" ? " Secure;" : "";

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie":
          "admin_session=" + token +
          "; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400;" +
          secure
      });

      return res.end(JSON.stringify({ success: true }));
    } catch (error) {
      return json(res, 400, { success: false });
    }
  }

  if (req.method === "POST" && parsed.pathname === "/api/admin/logout") {
    const token = parseCookies(req).admin_session;

    if (token) {
      sessions.delete(token);
    }

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie":
        "admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });

    return res.end(JSON.stringify({ success: true }));
  }

  if (req.method === "GET" && parsed.pathname === "/api/admin/orders") {
    if (!isAdmin(req)) {
      return json(res, 401, { error: "Требуется вход" });
    }

    try {
      return json(res, 200, {
        orders: await getOrders()
      });
    } catch (error) {
      console.error("Get orders error:", error);

      return json(res, 500, {
        error: "Ошибка базы данных"
      });
    }
  }

  if (
    req.method === "DELETE" &&
    parsed.pathname.startsWith("/api/admin/orders/")
  ) {
    if (!isAdmin(req)) {
      return json(res, 401, { error: "Требуется вход" });
    }

    try {
      const id = decodeURIComponent(
        parsed.pathname.slice("/api/admin/orders/".length)
      );

      await deleteOrder(id);

      return json(res, 200, { success: true });
    } catch (error) {
      console.error("Delete order error:", error);

      return json(res, 500, {
        success: false,
        error: "Не удалось удалить заказ"
      });
    }
  }

  if (req.method === "GET" && parsed.pathname === "/admin") {
    return adminPage(res);
  }

  if (req.method === "GET") {
    const file = safePath(req.url);

    if (
      file &&
      fs.existsSync(file) &&
      fs.statSync(file).isFile()
    ) {
      return serveFile(res, file);
    }
  }

  return json(res, 404, { error: "Не найдено" });
}

(async () => {
  await initDb();

  const server = http.createServer((req, res) => {
    handle(req, res).catch(error => {
      console.error("Server error:", error);
      json(res, 500, {
        error: "Внутренняя ошибка сервера"
      });
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log("MM2 SHOP запущен на порту " + PORT);
    console.log("Админка: /admin");
    console.log("Storage: " + (db ? "PostgreSQL" : "local JSON"));
  });
})();
