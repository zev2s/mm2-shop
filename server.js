const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || '';

const DATABASE_URL =
    process.env.DATABASE_URL || '';

const YOOMONEY_RECEIVER =
    process.env.YOOMONEY_RECEIVER || '';

const YOOMONEY_NOTIFICATION_SECRET =
    process.env.YOOMONEY_NOTIFICATION_SECRET || '';

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

if (!ADMIN_PASSWORD) {
    console.error('ERROR: ADMIN_PASSWORD is not set.');
    process.exit(1);
}

if (!YOOMONEY_RECEIVER) {
    console.error('ERROR: YOOMONEY_RECEIVER is not set.');
    process.exit(1);
}

if (!YOOMONEY_NOTIFICATION_SECRET) {
    console.error(
        'ERROR: YOOMONEY_NOTIFICATION_SECRET is not set.'
    );
    process.exit(1);
}

fs.mkdirSync(DATA_DIR, {
    recursive: true
});

if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(
        ORDERS_FILE,
        '[]',
        'utf8'
    );
}

let db = null;

const sessions = new Map();

/* =====================================================
   ТОВАРЫ
===================================================== */

const PRODUCTS = {
    BioBlade: 39,
    Raygun: 399,
    "Traveler's Gun": 8999,
    Harvester: 299,
    "Тест": 2
};

/*
   Получение цены товара.
   Специально нормализуем название "Тест",
   чтобы ошибка "Такого товара нет" больше
   не возникала из-за регистра или пробелов.
*/

function getProductPrice(product) {
    const name = String(product || '')
        .trim();

    if (
        name.toLowerCase() === 'тест'
    ) {
        return 2;
    }

    if (
        Object.prototype.hasOwnProperty.call(
            PRODUCTS,
            name
        )
    ) {
        return PRODUCTS[name];
    }

    return null;
}

/* =====================================================
   DATABASE
===================================================== */

async function initDb() {
    if (!DATABASE_URL) {
        console.log(
            'Database: local JSON'
        );
        return;
    }

    try {
        const { Pool } = require('pg');

        db = new Pool({
            connectionString: DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            }
        });

        await db.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                product TEXT NOT NULL,
                price TEXT NOT NULL,
                telegram TEXT NOT NULL DEFAULT '',
                nickname TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'waiting_payment',
                payment_label TEXT,
                operation_id TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                paid_at TIMESTAMPTZ
            )
        `);

        await db.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS
            status TEXT NOT NULL DEFAULT 'completed'
        `);

        await db.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS
            payment_label TEXT
        `);

        await db.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS
            operation_id TEXT
        `);

        await db.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS
            paid_at TIMESTAMPTZ
        `);

        await db.query(`
            ALTER TABLE orders
            ALTER COLUMN telegram DROP NOT NULL
        `).catch(() => {});

        await db.query(`
            ALTER TABLE orders
            ALTER COLUMN nickname DROP NOT NULL
        `).catch(() => {});

        console.log(
            'Database: PostgreSQL'
        );

    } catch (error) {

        console.error(
            'Database connection failed:',
            error.message
        );

        process.exit(1);
    }
}

/* =====================================================
   LOCAL JSON
===================================================== */

function readOrdersLocal() {
    try {

        const data = JSON.parse(
            fs.readFileSync(
                ORDERS_FILE,
                'utf8'
            )
        );

        return Array.isArray(data)
            ? data
            : [];

    } catch {

        return [];
    }
}

function writeOrdersLocal(orders) {

    const temp =
        ORDERS_FILE + '.tmp';

    fs.writeFileSync(
        temp,
        JSON.stringify(
            orders,
            null,
            2
        ),
        'utf8'
    );

    fs.renameSync(
        temp,
        ORDERS_FILE
    );
}

/* =====================================================
   HELPERS
===================================================== */

function createId() {

    return (
        'MM2-' +
        Date.now()
            .toString(36)
            .toUpperCase() +
        '-' +
        crypto
            .randomBytes(3)
            .toString('hex')
            .toUpperCase()
    );
}

function normalizePrice(value) {

    return Number(
        String(value)
            .replace(/[^\d.,]/g, '')
            .replace(',', '.')
    );
}

function formatOrder(row) {

    if (!row) {
        return null;
    }

    return {
        id: row.id,
        product: row.product,
        price: row.price,
        telegram: row.telegram || '',
        nickname: row.nickname || '',
        status:
            row.status ||
            'completed',
        payment_label:
            row.payment_label ||
            '',
        operation_id:
            row.operation_id ||
            '',
        date:
            row.created_at
                ? new Date(
                    row.created_at
                ).toLocaleString('ru-RU')
                : (
                    row.date || ''
                ),
        paid_at:
            row.paid_at
                ? new Date(
                    row.paid_at
                ).toLocaleString('ru-RU')
                : ''
    };
}

/* =====================================================
   CREATE ORDER
===================================================== */

async function createPendingOrder(
    product,
    price
) {

    const id = createId();

    const label =
        'MM2_' +
        id.replace(
            /[^A-Za-z0-9_-]/g,
            ''
        );

    if (db) {

        const result =
            await db.query(
                `
                INSERT INTO orders
                (
                    id,
                    product,
                    price,
                    telegram,
                    nickname,
                    status,
                    payment_label
                )
                VALUES
                ($1,$2,$3,$4,$5,$6,$7)
                RETURNING *
                `,
                [
                    id,
                    product,
                    String(price) + ' ₽',
                    '',
                    '',
                    'waiting_payment',
                    label
                ]
            );

        return formatOrder(
            result.rows[0]
        );
    }

    const orders =
        readOrdersLocal();

    const order = {
        id: id,
        product: product,
        price:
            String(price) + ' ₽',
        telegram: '',
        nickname: '',
        status:
            'waiting_payment',
        payment_label: label,
        operation_id: '',
        date:
            new Date()
                .toLocaleString(
                    'ru-RU'
                ),
        paid_at: ''
    };

    orders.push(order);

    writeOrdersLocal(
        orders
    );

    return order;
}

/* =====================================================
   GET ORDER
===================================================== */

async function getOrder(id) {

    if (db) {

        const result =
            await db.query(
                `
                SELECT *
                FROM orders
                WHERE id = $1
                `,
                [id]
            );

        return formatOrder(
            result.rows[0]
        );
    }

    return readOrdersLocal()
        .find(
            order =>
                order.id === id
        ) || null;
}

/* =====================================================
   GET ORDER BY PAYMENT LABEL
===================================================== */

async function getOrderByLabel(
    label
) {

    if (db) {

        const result =
            await db.query(
                `
                SELECT *
                FROM orders
                WHERE payment_label = $1
                LIMIT 1
                `,
                [label]
            );

        return result.rows[0]
            ? formatOrder(
                result.rows[0]
            )
            : null;
    }

    return readOrdersLocal()
        .find(
            order =>
                order.payment_label ===
                label
        ) || null;
}

/* =====================================================
   MARK PAID
===================================================== */

async function markPaid(
    label,
    operationId
) {

    if (db) {

        const result =
            await db.query(
                `
                UPDATE orders
                SET
                    status = 'paid',
                    operation_id = $1,
                    paid_at = NOW()
                WHERE
                    payment_label = $2
                    AND status =
                    'waiting_payment'
                RETURNING *
                `,
                [
                    operationId,
                    label
                ]
            );

        return result.rows[0]
            ? formatOrder(
                result.rows[0]
            )
            : null;
    }

    const orders =
        readOrdersLocal();

    const order =
        orders.find(
            item =>
                item.payment_label ===
                    label &&
                item.status ===
                    'waiting_payment'
        );

    if (!order) {
        return null;
    }

    order.status = 'paid';

    order.operation_id =
        operationId;

    order.paid_at =
        new Date()
            .toLocaleString(
                'ru-RU'
            );

    writeOrdersLocal(
        orders
    );

    return order;
}

/* =====================================================
   SAVE USER DATA
===================================================== */

async function saveUserData(
    id,
    telegram,
    nickname
) {

    if (db) {

        const result =
            await db.query(
                `
                UPDATE orders
                SET
                    telegram = $1,
                    nickname = $2,
                    status = 'completed'
                WHERE
                    id = $3
                    AND status = 'paid'
                RETURNING *
                `,
                [
                    telegram,
                    nickname,
                    id
                ]
            );

        return result.rows[0]
            ? formatOrder(
                result.rows[0]
            )
            : null;
    }

    const orders =
        readOrdersLocal();

    const order =
        orders.find(
            item =>
                item.id === id &&
                item.status === 'paid'
        );

    if (!order) {
        return null;
    }

    order.telegram =
        telegram;

    order.nickname =
        nickname;

    order.status =
        'completed';

    writeOrdersLocal(
        orders
    );

    return order;
}

/* =====================================================
   ADMIN ORDERS
===================================================== */

async function getOrders() {

    if (db) {

        const result =
            await db.query(
                `
                SELECT *
                FROM orders
                ORDER BY
                created_at DESC
                `
            );

        return result.rows.map(
            formatOrder
        );
    }

    return readOrdersLocal()
        .slice()
        .reverse()
        .map(
            formatOrder
        );
}

async function deleteOrder(id) {

    if (db) {

        await db.query(
            `
            DELETE FROM orders
            WHERE id = $1
            `,
            [id]
        );

        return;
    }

    const orders =
        readOrdersLocal()
            .filter(
                order =>
                    order.id !== id
            );

    writeOrdersLocal(
        orders
    );
}

/* =====================================================
   HTTP
===================================================== */

function json(
    res,
    status,
    data
) {

    const text =
        JSON.stringify(data);

    res.writeHead(
        status,
        {
            'Content-Type':
                'application/json; charset=utf-8',

            'Cache-Control':
                'no-store',

            'Content-Length':
                Buffer.byteLength(
                    text
                )
        }
    );

    res.end(text);
}

function readBody(
    req,
    limit = 50000
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            let body = '';

            req.on(
                'data',
                chunk => {

                    body += chunk;

                    if (
                        body.length >
                        limit
                    ) {

                        reject(
                            new Error(
                                'Payload too large'
                            )
                        );

                        req.destroy();
                    }
                }
            );

            req.on(
                'end',
                () => resolve(body)
            );

            req.on(
                'error',
                reject
            );
        }
    );
}

/* =====================================================
   COOKIES
===================================================== */

function parseCookies(req) {

    const result = {};

    const cookies =
        String(
            req.headers.cookie ||
            ''
        ).split(';');

    for (
        const cookie of cookies
    ) {

        const index =
            cookie.indexOf('=');

        if (
            index === -1
        ) {
            continue;
        }

        const key =
            cookie
                .slice(
                    0,
                    index
                )
                .trim();

        const value =
            cookie
                .slice(
                    index + 1
                )
                .trim();

        try {

            result[key] =
                decodeURIComponent(
                    value
                );

        } catch {

            result[key] =
                value;
        }
    }

    return result;
}

function isAdmin(req) {

    const token =
        parseCookies(req)
            .admin_session;

    return (
        !!token &&
        sessions.has(token)
    );
}

/* =====================================================
   YOOMONEY SIGNATURE
===================================================== */

function encodeRFC3986(
    value
) {

    return encodeURIComponent(
        String(
            value ?? ''
        )
    ).replace(
        /[!'()*]/g,
        char =>
            '%' +
            char
                .charCodeAt(0)
                .toString(16)
                .toUpperCase()
    );
}

function verifyYooMoneySignature(
    params
) {

    const received =
        String(
            params.sign || ''
        ).toLowerCase();

    if (!received) {
        return false;
    }

    const data =
        Object.keys(params)
            .filter(
                key =>
                    key !== 'sign'
            )
            .sort()
            .map(
                key =>
                    key +
                    '=' +
                    encodeRFC3986(
                        params[key]
                    )
            )
            .join('&');

    const expected =
        crypto
            .createHmac(
                'sha256',
                YOOMONEY_NOTIFICATION_SECRET
            )
            .update(
                data,
                'utf8'
            )
            .digest('hex')
            .toLowerCase();

    if (
        received.length !==
        expected.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(received),
        Buffer.from(expected)
    );
}

/* =====================================================
   STATIC FILES
===================================================== */

function safePath(
    requestPath
) {

    let clean;

    try {

        clean =
            decodeURIComponent(
                String(
                    requestPath ||
                    '/'
                ).split('?')[0]
            );

    } catch {

        return null;
    }

    const relative =
        clean === '/' ||
        clean === ''
            ? 'index.html'
            : clean.replace(
                /^[/\\]+/,
                ''
            );

    const root =
        path.resolve(ROOT);

    const full =
        path.resolve(
            root,
            relative
        );

    if (
        full !== root &&
        !full.startsWith(
            root + path.sep
        )
    ) {
        return null;
    }

    return full;
}

function mime(file) {

    const ext =
        path.extname(
            file
        ).toLowerCase();

    const types = {
        '.html':
            'text/html; charset=utf-8',

        '.js':
            'application/javascript; charset=utf-8',

        '.css':
            'text/css; charset=utf-8',

        '.png':
            'image/png',

        '.jpg':
            'image/jpeg',

        '.jpeg':
            'image/jpeg',

        '.webp':
            'image/webp',

        '.svg':
            'image/svg+xml',

        '.ico':
            'image/x-icon'
    };

    return (
        types[ext] ||
        'application/octet-stream'
    );
}

function serveFile(
    res,
    file
) {

    fs.readFile(
        file,
        (err, data) => {

            if (err) {

                return json(
                    res,
                    404,
                    {
                        error:
                            'Не найдено'
                    }
                );
            }

            res.writeHead(
                200,
                {
                    'Content-Type':
                        mime(file),

                    'Cache-Control':
                        'no-cache'
                }
            );

            res.end(data);
        }
    );
}

/* =====================================================
   ADMIN PAGE
===================================================== */

function adminPage(res) {

    const html = `<!doctype html>
<html lang="ru">

<head>

<meta charset="utf-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>MM2 SHOP — Админка</title>

<style>

*{
    box-sizing:border-box;
}

body{
    margin:0;
    min-height:100vh;
    background:#070707;
    color:#fff;
    font-family:Arial,sans-serif;
    padding:24px;
}

.wrap{
    max-width:1100px;
    margin:auto;
}

.card,
.order{
    background:#111;
    border:1px solid #292929;
    border-radius:20px;
    padding:24px;
}

#login{
    max-width:430px;
    margin:10vh auto;
}

h1,
h2{
    margin-top:0;
}

input{
    width:100%;
    height:50px;
    padding:0 15px;
    border-radius:12px;
    border:1px solid #333;
    background:#181818;
    color:#fff;
    margin:8px 0 15px;
    outline:none;
}

button{
    border:0;
    border-radius:11px;
    padding:12px 16px;
    cursor:pointer;
    font-weight:800;
}

button:disabled{
    opacity:.6;
    cursor:not-allowed;
}

.gold{
    width:100%;
    background:#e1b44d;
    color:#111;
}

.dark{
    background:#222;
    color:#fff;
}

.delete{
    background:#401820;
    color:#ff8793;
}

.top{
    display:flex;
    justify-content:space-between;
    gap:15px;
    align-items:center;
    flex-wrap:wrap;
}

.actions{
    display:flex;
    gap:8px;
}

.order{
    margin-top:15px;
}

.grid{
    display:grid;
    grid-template-columns:
        repeat(auto-fit,minmax(170px,1fr));
    gap:10px;
    margin-top:15px;
}

.box{
    padding:12px;
    background:#181818;
    border-radius:10px;
    color:#999;
    font-size:12px;
}

.box b{
    display:block;
    color:#fff;
    margin-top:5px;
    word-break:break-word;
}

.status{
    display:inline-block;
    padding:6px 10px;
    border-radius:20px;
    background:#183b28;
    color:#76e9a0;
    font-size:11px;
}

.waiting{
    background:#3a3015;
    color:#f3d36d;
}

.paid{
    background:#143b2b;
    color:#76e9a0;
}

.empty{
    margin-top:15px;
    text-align:center;
    color:#777;
}

@media(max-width:600px){

    body{
        padding:12px;
    }

    .card,
    .order{
        padding:17px;
    }

    .actions{
        width:100%;
    }

    .actions button{
        flex:1;
    }
}

</style>

</head>

<body>

<div class="wrap">

<div id="login" class="card">

<h2>♛ MM2 SHOP</h2>

<p>Вход в админ-панель</p>

<input
    id="password"
    type="password"
    placeholder="Пароль"
    autocomplete="current-password"
>

<button
    id="loginButton"
    class="gold"
    type="button"
>
    Войти
</button>

<div
    id="loginError"
    style="
        color:#ff6675;
        margin-top:12px;
        min-height:18px;
    "
></div>

</div>

<div
    id="panel"
    style="display:none"
>

<div class="top">

<div>

<h1>📦 Заказы MM2</h1>

<p style="color:#777">
Заказы обновляются автоматически.
</p>

</div>

<div class="actions">

<button
    id="refreshButton"
    class="dark"
    type="button"
>
↻ Обновить
</button>

<button
    id="logoutButton"
    class="dark"
    type="button"
>
Выйти
</button>

</div>

</div>

<div
    class="card"
    style="margin-top:15px"
>

Всего заказов:

<b id="count">0</b>

</div>

<div id="orders"></div>

</div>

</div>

<script>

'use strict';

function esc(value){

    return String(
        value ?? ''
    ).replace(
        /[&<>'"]/g,
        function(char){

            return {
                '&':'&amp;',
                '<':'&lt;',
                '>':'&gt;',
                "'":'&#39;',
                '"':'&quot;'
            }[char];
        }
    );
}

function statusText(status){

    if(
        status ===
        'waiting_payment'
    ){
        return 'Ожидает оплаты';
    }

    if(
        status === 'paid'
    ){
        return 'Оплачено';
    }

    return 'Данные получены';
}

function statusClass(status){

    if(
        status ===
        'waiting_payment'
    ){
        return 'status waiting';
    }

    if(
        status === 'paid'
    ){
        return 'status paid';
    }

    return 'status';
}

function showLoginError(
    message
){

    const element =
        document.getElementById(
            'loginError'
        );

    if(element){
        element.textContent =
            message || '';
    }
}

async function login(){

    const password =
        document.getElementById(
            'password'
        );

    const button =
        document.getElementById(
            'loginButton'
        );

    if(!password){
        return;
    }

    if(!password.value){

        showLoginError(
            '❌ Введи пароль.'
        );

        password.focus();

        return;
    }

    showLoginError('');

    if(button){

        button.disabled =
            true;

        button.textContent =
            'Проверяем...';
    }

    try{

        const response =
            await fetch(
                '/api/admin/login',
                {
                    method:'POST',

                    credentials:
                        'same-origin',

                    headers:{
                        'Content-Type':
                            'application/json'
                    },

                    body:
                        JSON.stringify({
                            password:
                                password.value
                        })
                }
            );

        if(!response.ok){

            showLoginError(
                '❌ Неверный пароль.'
            );

            return;
        }

        document.getElementById(
            'login'
        ).style.display =
            'none';

        document.getElementById(
            'panel'
        ).style.display =
            'block';

        await loadOrders();

    }catch(error){

        console.error(error);

        showLoginError(
            '❌ Ошибка соединения.'
        );

    }finally{

        if(button){

            button.disabled =
                false;

            button.textContent =
                'Войти';
        }
    }
}

async function loadOrders(){

    try{

        const response =
            await fetch(
                '/api/admin/orders',
                {
                    method:'GET',

                    credentials:
                        'same-origin',

                    cache:'no-store'
                }
            );

        if(
            response.status === 401
        ){

            document.getElementById(
                'login'
            ).style.display =
                'block';

            document.getElementById(
                'panel'
            ).style.display =
                'none';

            return;
        }

        if(!response.ok){

            throw new Error(
                'HTTP ' +
                response.status
            );
        }

        const data =
            await response.json();

        const orders =
            Array.isArray(
                data.orders
            )
                ? data.orders
                : [];

        document.getElementById(
            'count'
        ).textContent =
            orders.length;

        const box =
            document.getElementById(
                'orders'
            );

        if(!orders.length){

            box.innerHTML =
                '<div class="card empty">' +
                'Пока заказов нет.' +
                '</div>';

            return;
        }

        box.innerHTML =
            orders.map(
                function(order){

                    return \`
<div class="order">

<div class="top">

<b>
Заказ #\${esc(order.id)}
</b>

<span class="\${statusClass(order.status)}">
\${esc(statusText(order.status))}
</span>

</div>

<div class="grid">

<div class="box">
🛒 Товар
<b>\${esc(order.product)}</b>
</div>

<div class="box">
💰 Цена
<b>\${esc(order.price)}</b>
</div>

<div class="box">
💳 Платёж
<b>\${esc(
    order.payment_label || '—'
)}</b>
</div>

<div class="box">
👤 Telegram
<b>\${esc(
    order.telegram ||
    'Ожидается'
)}</b>
</div>

<div class="box">
🎮 Roblox
<b>\${esc(
    order.nickname ||
    'Ожидается'
)}</b>
</div>

<div class="box">
🕒 Дата
<b>\${esc(order.date)}</b>
</div>

<div class="box">
🔐 ID операции
<b>\${esc(
    order.operation_id ||
    '—'
)}</b>
</div>

<div class="box">

<button
    class="delete"
    type="button"
    data-order-id="\${esc(order.id)}"
>
🗑 Удалить
</button>

</div>

</div>

</div>
\`;
                }
            ).join('');

        box.querySelectorAll(
            '[data-order-id]'
        ).forEach(
            function(button){

                button.addEventListener(
                    'click',
                    function(){

                        deleteOrder(
                            button.getAttribute(
                                'data-order-id'
                            )
                        );

                    }
                );
            }
        );

    }catch(error){

        console.error(error);

        document.getElementById(
            'orders'
        ).innerHTML =
            '<div class="card empty">' +
            '❌ Не удалось загрузить заказы.' +
            '</div>';
    }
}

async function deleteOrder(id){

    if(!id){
        return;
    }

    if(
        !confirm(
            'Удалить этот заказ?'
        )
    ){
        return;
    }

    try{

        const response =
            await fetch(
                '/api/admin/orders/' +
                encodeURIComponent(id),
                {
                    method:'DELETE',

                    credentials:
                        'same-origin'
                }
            );

        if(
            response.status === 401
        ){

            location.reload();

            return;
        }

        if(!response.ok){

            throw new Error(
                'HTTP ' +
                response.status
            );
        }

        await loadOrders();

    }catch(error){

        console.error(error);

        alert(
            'Не удалось удалить заказ.'
        );
    }
}

async function logout(){

    try{

        await fetch(
            '/api/admin/logout',
            {
                method:'POST',
                credentials:
                    'same-origin'
            }
        );

    }catch(error){

        console.error(error);

    }finally{

        location.reload();
    }
}

document.addEventListener(
    'DOMContentLoaded',
    function(){

        const loginButton =
            document.getElementById(
                'loginButton'
            );

        const password =
            document.getElementById(
                'password'
            );

        const refreshButton =
            document.getElementById(
                'refreshButton'
            );

        const logoutButton =
            document.getElementById(
                'logoutButton'
            );

        if(loginButton){

            loginButton.addEventListener(
                'click',
                login
            );
        }

        if(password){

            password.addEventListener(
                'keydown',
                function(event){

                    if(
                        event.key ===
                        'Enter'
                    ){

                        event.preventDefault();

                        login();
                    }
                }
            );

            password.focus();
        }

        if(refreshButton){

            refreshButton.addEventListener(
                'click',
                loadOrders
            );
        }

        if(logoutButton){

            logoutButton.addEventListener(
                'click',
                logout
            );
        }
    }
);

setInterval(
    function(){

        const panel =
            document.getElementById(
                'panel'
            );

        if(
            panel &&
            panel.style.display !==
            'none'
        ){

            loadOrders();
        }

    },
    15000
);

</script>

</body>

</html>`;

    res.writeHead(
        200,
        {
            'Content-Type':
                'text/html; charset=utf-8',

            'Cache-Control':
                'no-store'
        }
    );

    res.end(html);
}

/* =====================================================
   REQUEST HANDLER
===================================================== */

async function handle(
    req,
    res
) {

    const parsed =
        new URL(
            req.url,
            'http://' +
            (
                req.headers.host ||
                'localhost'
            )
        );

    /* -------------------------------------------------
       CREATE PAYMENT
    ------------------------------------------------- */

    if(
        req.method === 'POST' &&
        parsed.pathname ===
            '/api/payment/create'
    ){

        try{

            const input =
                JSON.parse(
                    await readBody(
                        req,
                        20000
                    )
                );

            const product =
                String(
                    input.product ||
                    ''
                ).trim();

            const clientPrice =
                normalizePrice(
                    input.price
                );

            /*
               ВАЖНО:
               Цена берётся с сервера,
               а не доверяется браузеру.
            */

            const serverPrice =
                getProductPrice(
                    product
                );

            if(
                serverPrice === null
            ){

                console.log(
                    'Unknown product:',
                    JSON.stringify(
                        product
                    )
                );

                return json(
                    res,
                    400,
                    {
                        success:false,
                        error:
                            'Такого товара нет.'
                    }
                );
            }

            if(
                !Number.isFinite(
                    clientPrice
                ) ||
                clientPrice !==
                    serverPrice
            ){

                return json(
                    res,
                    400,
                    {
                        success:false,
                        error:
                            'Неверная цена товара.'
                    }
                );
            }

            const order =
                await createPendingOrder(
                    product,
                    serverPrice
                );

            const host =
                process.env
                    .RENDER_EXTERNAL_URL ||
                (
                    'https://' +
                    (
                        req.headers.host ||
                        'mm2-shop.onrender.com'
                    )
                );

            return json(
                res,
                200,
                {
                    success:true,

                    orderId:
                        order.id,

                    label:
                        order.payment_label,

                    receiver:
                        YOOMONEY_RECEIVER,

                    sum:
                        serverPrice,

                    successURL:
                        host +
                        '/?payment=success&order=' +
                        encodeURIComponent(
                            order.id
                        )
                }
            );

        }catch(error){

            console.error(
                'Payment create error:',
                error
            );

            return json(
                res,
                500,
                {
                    success:false,
                    error:
                        'Не удалось создать платёж.'
                }
            );
        }
    }

    /* -------------------------------------------------
       PAYMENT STATUS
    ------------------------------------------------- */

    if(
        req.method === 'GET' &&
        parsed.pathname ===
            '/api/payment/status'
    ){

        const id =
            parsed.searchParams.get(
                'order'
            );

        if(!id){

            return json(
                res,
                400,
                {
                    success:false,
                    error:
                        'Заказ не указан.'
                }
            );
        }

        const order =
            await getOrder(id);

        if(!order){

            return json(
                res,
                404,
                {
                    success:false,
                    error:
                        'Заказ не найден.'
                }
            );
        }

        return json(
            res,
            200,
            {
                success:true,
                status:
                    order.status,
                order:
                    order
            }
        );
    }

    /* -------------------------------------------------
       SAVE USER DATA
    ------------------------------------------------- */

    if(
        req.method === 'POST' &&
        parsed.pathname ===
            '/api/orders'
    ){

        try{

            const input =
                JSON.parse(
                    await readBody(req)
                );

            const id =
                String(
                    input.orderId ||
                    ''
                ).trim();

            const telegram =
                String(
                    input.telegram ||
                    ''
                )
                    .trim()
                    .slice(
                        0,
                        80
                    );

            const nickname =
                String(
                    input.nickname ||
                    ''
                )
                    .trim()
                    .slice(
                        0,
                        80
                    );

            if(
                !id ||
                !telegram ||
                !nickname
            ){

                return json(
                    res,
                    400,
                    {
                        success:false,
                        error:
                            'Заполни Telegram и Roblox ник.'
                    }
                );
            }

            const order =
                await saveUserData(
                    id,
                    telegram,
                    nickname
                );

            if(!order){

                return json(
                    res,
                    400,
                    {
                        success:false,
                        error:
                            'Оплата ещё не подтверждена или заказ не найден.'
                    }
                );
            }

            return json(
                res,
                200,
                {
                    success:true,
                    order:
                        order
                }
            );

        }catch(error){

            console.error(
                error
            );

            return json(
                res,
                400,
                {
                    success:false,
                    error:
                        'Не удалось сохранить заказ.'
                }
            );
        }
    }

    /* -------------------------------------------------
       YOOMONEY NOTIFICATION
    ------------------------------------------------- */

    if(
        req.method === 'POST' &&
        parsed.pathname ===
            '/api/yoomoney/notification'
    ){

        try{

            const body =
                await readBody(
                    req,
                    50000
                );

            const params =
                Object.fromEntries(
                    new URLSearchParams(
                        body
                    )
                );

            console.log(
                'YuMoney notification:',
                params
            );

            /*
               ЮMoney отправляет специальное
               тестовое уведомление.
               Оно НЕ должно создавать оплату.
            */

            if(
                params.test_notification ===
                'true'
            ){

                console.log(
                    'YuMoney test notification received.'
                );

                return json(
                    res,
                    200,
                    {
                        success:true,
                        test:true
                    }
                );
            }

            if(
                !verifyYooMoneySignature(
                    params
                )
            ){

                console.error(
                    'YuMoney: invalid signature'
                );

                return json(
                    res,
                    403,
                    {
                        success:false
                    }
                );
            }

            if(
                params.currency !==
                '643'
            ){

                return json(
                    res,
                    400,
                    {
                        success:false
                    }
                );
            }

            if(
                params.unaccepted ===
                'true'
            ){

                return json(
                    res,
                    200,
                    {
                        success:true
                    }
                );
            }

            const label =
                String(
                    params.label ||
                    ''
                ).trim();

            const operationId =
                String(
                    params.operation_id ||
                    ''
                ).trim();

            const amount =
                Number(
                    params.withdraw_amount
                );

            if(
                !label ||
                !operationId ||
                !Number.isFinite(
                    amount
                )
            ){

                return json(
                    res,
                    400,
                    {
                        success:false
                    }
                );
            }

            const order =
                await getOrderByLabel(
                    label
                );

            if(!order){

                console.error(
                    'YuMoney order not found:',
                    label
                );

                return json(
                    res,
                    200,
                    {
                        success:true
                    }
                );
            }

            const expected =
                normalizePrice(
                    order.price
                );

            if(
                Math.abs(
                    amount -
                    expected
                ) > 0.01
            ){

                console.error(
                    'YuMoney wrong amount:',
                    amount,
                    expected
                );

                return json(
                    res,
                    400,
                    {
                        success:false
                    }
                );
            }

            await markPaid(
                label,
                operationId
            );

            console.log(
                'PAYMENT CONFIRMED:',
                order.id
            );

            return json(
                res,
                200,
                {
                    success:true
                }
            );

        }catch(error){

            console.error(
                'YuMoney notification error:',
                error
            );

            return json(
                res,
                500,
                {
                    success:false
                }
            );
        }
    }

    /* -------------------------------------------------
       ADMIN LOGIN
    ------------------------------------------------- */

    if(
        req.method === 'POST' &&
        parsed.pathname ===
            '/api/admin/login'
    ){

        try{

            const input =
                JSON.parse(
                    await readBody(
                        req,
                        10000
                    )
                );

            const password =
                String(
                    input.password ||
                    ''
                );

            if(
                password !==
                ADMIN_PASSWORD
            ){

                return json(
                    res,
                    401,
                    {
                        success:false,
                        error:
                            'Неверный пароль.'
                    }
                );
            }

            const token =
                crypto
                    .randomBytes(32)
                    .toString('hex');

            sessions.set(
                token,
                Date.now()
            );

            res.writeHead(
                200,
                {
                    'Content-Type':
                        'application/json; charset=utf-8',

                    'Cache-Control':
                        'no-store',

                    'Set-Cookie':
                        'admin_session=' +
                        token +
                        '; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400'
                }
            );

            return res.end(
                JSON.stringify({
                    success:true
                })
            );

        }catch(error){

            console.error(
                error
            );

            return json(
                res,
                400,
                {
                    success:false
                }
            );
        }
    }

    /* -------------------------------------------------
       ADMIN LOGOUT
    ------------------------------------------------- */

    if(
        req.method === 'POST' &&
        parsed.pathname ===
            '/api/admin/logout'
    ){

        const token =
            parseCookies(req)
                .admin_session;

        if(token){

            sessions.delete(
                token
            );
        }

        res.writeHead(
            200,
            {
                'Content-Type':
                    'application/json; charset=utf-8',

                'Cache-Control':
                    'no-store',

                'Set-Cookie':
                    'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
            }
        );

        return res.end(
            JSON.stringify({
                success:true
            })
        );
    }

    /* -------------------------------------------------
       ADMIN ORDERS
    ------------------------------------------------- */

    if(
        req.method === 'GET' &&
        parsed.pathname ===
            '/api/admin/orders'
    ){

        if(
            !isAdmin(req)
        ){

            return json(
                res,
                401,
                {
                    error:
                        'Требуется вход'
                }
            );
        }

        return json(
            res,
            200,
            {
                orders:
                    await getOrders()
            }
        );
    }

    /* -------------------------------------------------
       DELETE ORDER
    ------------------------------------------------- */

    if(
        req.method === 'DELETE' &&
        parsed.pathname.startsWith(
            '/api/admin/orders/'
        )
    ){

        if(
            !isAdmin(req)
        ){

            return json(
                res,
                401,
                {
                    error:
                        'Требуется вход'
                }
            );
        }

        const id =
            decodeURIComponent(
                parsed.pathname
                    .split('/')
                    .pop()
            );

        await deleteOrder(id);

        return json(
            res,
            200,
            {
                success:true
            }
        );
    }

    /* -------------------------------------------------
       ADMIN PAGE
    ------------------------------------------------- */

    if(
        req.method === 'GET' &&
        parsed.pathname ===
            '/admin'
    ){

        return adminPage(
            res
        );
    }

    /* -------------------------------------------------
       STATIC FILES
    ------------------------------------------------- */

    if(
        req.method === 'GET'
    ){

        const file =
            safePath(
                req.url
            );

        if(
            file &&
            fs.existsSync(file) &&
            fs.statSync(file).isFile()
        ){

            return serveFile(
                res,
                file
            );
        }
    }

    return json(
        res,
        404,
        {
            error:
                'Не найдено'
        }
    );
}

/* =====================================================
   START
===================================================== */

(async function(){

    await initDb();

    const server =
        http.createServer(
            function(req,res){

                handle(
                    req,
                    res
                ).catch(
                    function(error){

                        console.error(
                            'SERVER ERROR:',
                            error
                        );

                        if(
                            !res.headersSent
                        ){

                            json(
                                res,
                                500,
                                {
                                    error:
                                        'Внутренняя ошибка сервера'
                                }
                            );

                        }else{

                            res.end();
                        }
                    }
                );
            }
        );

    server.listen(
        PORT,
        function(){

            console.log(
                '================================'
            );

            console.log(
                'MM2 SHOP запущен'
            );

            console.log(
                'PORT:',
                PORT
            );

            console.log(
                'ADMIN: /admin'
            );

            console.log(
                'TEST PRODUCT: Тест = 2 ₽'
            );

            console.log(
                '================================'
            );
        }
    );

})();
