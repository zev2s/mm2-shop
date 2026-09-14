const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATABASE_URL = process.env.DATABASE_URL || "";

const YOOMONEY_RECEIVER =
    process.env.YOOMONEY_RECEIVER || "";

const YOOMONEY_NOTIFICATION_SECRET =
    process.env.YOOMONEY_NOTIFICATION_SECRET || "";

const ROOT = __dirname;

const DATA_DIR = path.join(ROOT, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");


// ======================================================
// ПРОВЕРКА
// ======================================================

if (!ADMIN_PASSWORD) {
    console.error(
        "ERROR: ADMIN_PASSWORD is not set."
    );

    process.exit(1);
}

if (!YOOMONEY_RECEIVER) {
    console.warn(
        "WARNING: YOOMONEY_RECEIVER is not set."
    );
}

if (!YOOMONEY_NOTIFICATION_SECRET) {
    console.warn(
        "WARNING: YOOMONEY_NOTIFICATION_SECRET is not set."
    );
}


// ======================================================
// LOCAL STORAGE
// ======================================================

fs.mkdirSync(DATA_DIR, {
    recursive: true
});

if (!fs.existsSync(ORDERS_FILE)) {

    fs.writeFileSync(
        ORDERS_FILE,
        "[]",
        "utf8"
    );

}


// ======================================================
// SESSIONS
// ======================================================

const sessions = new Map();


// ======================================================
// DATABASE
// ======================================================

let db = null;


async function initDb() {

    if (!DATABASE_URL) {

        console.log(
            "Database: local JSON"
        );

        return;

    }


    try {

        const { Pool } =
            require("pg");


        db = new Pool({

            connectionString:
                DATABASE_URL,

            ssl:
                process.env.NODE_ENV === "production"
                    ? {
                        rejectUnauthorized: false
                    }
                    : false

        });


        await db.query(`

            CREATE TABLE IF NOT EXISTS orders (

                id TEXT PRIMARY KEY,

                product TEXT NOT NULL,

                price TEXT NOT NULL,

                telegram TEXT,

                nickname TEXT,

                status TEXT NOT NULL DEFAULT 'waiting_payment',

                payment_label TEXT,

                payment_operation_id TEXT,

                payment_amount TEXT,

                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                paid_at TIMESTAMPTZ

            )

        `);


        // Для старой базы добавляем новые поля

        await db.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS status TEXT
            DEFAULT 'waiting_payment'
        `);

        await db.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS payment_label TEXT
        `);

        await db.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS payment_operation_id TEXT
        `);

        await db.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS payment_amount TEXT
        `);

        await db.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ
        `);


        console.log(
            "Database: PostgreSQL"
        );


    } catch (error) {

        console.error(
            "Database connection failed:",
            error.message
        );

        process.exit(1);

    }

}


// ======================================================
// LOCAL JSON
// ======================================================

function readOrdersLocal() {

    try {

        const data =
            JSON.parse(
                fs.readFileSync(
                    ORDERS_FILE,
                    "utf8"
                )
            );


        return Array.isArray(data)
            ? data
            : [];


    } catch {

        return [];

    }

}


function writeOrdersLocal(
    orders
) {

    const tmp =
        ORDERS_FILE + ".tmp";


    fs.writeFileSync(
        tmp,
        JSON.stringify(
            orders,
            null,
            2
        ),
        "utf8"
    );


    fs.renameSync(
        tmp,
        ORDERS_FILE
    );

}


// ======================================================
// ID
// ======================================================

function createId() {

    return (
        "MM2-" +
        Date.now()
            .toString(36)
            .toUpperCase() +
        "-" +
        crypto
            .randomBytes(3)
            .toString("hex")
            .toUpperCase()
    );

}


// ======================================================
// CREATE PENDING ORDER
// ======================================================

async function createPendingOrder(
    product,
    price
) {

    const id =
        createId();


    const paymentLabel =
        id;


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
                (
                    $1,
                    $2,
                    $3,
                    NULL,
                    NULL,
                    'waiting_payment',
                    $4
                )
                RETURNING *
                `,
                [
                    id,
                    product,
                    price,
                    paymentLabel
                ]
            );


        return normalizeOrder(
            result.rows[0]
        );

    }


    const orders =
        readOrdersLocal();


    const order = {

        id,

        product,

        price,

        telegram: "",

        nickname: "",

        status:
            "waiting_payment",

        payment_label:
            paymentLabel,

        payment_operation_id:
            "",

        payment_amount:
            "",

        date:
            new Date()
                .toLocaleString(
                    "ru-RU"
                )

    };


    orders.push(order);

    writeOrdersLocal(
        orders
    );


    return order;

}


// ======================================================
// GET ORDER
// ======================================================

async function getOrder(
    id
) {

    if (db) {

        const result =
            await db.query(
                `
                SELECT *
                FROM orders
                WHERE id = $1
                LIMIT 1
                `,
                [id]
            );


        if (!result.rows.length) {
            return null;
        }


        return normalizeOrder(
            result.rows[0]
        );

    }


    const orders =
        readOrdersLocal();


    return (
        orders.find(
            order =>
                order.id === id
        ) || null
    );

}


// ======================================================
// SAVE CUSTOMER DATA
// ======================================================

async function saveCustomerData(
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
                    nickname = $2

                WHERE id = $3

                RETURNING *
                `,
                [
                    telegram,
                    nickname,
                    id
                ]
            );


        if (!result.rows.length) {
            return null;
        }


        return normalizeOrder(
            result.rows[0]
        );

    }


    const orders =
        readOrdersLocal();


    const index =
        orders.findIndex(
            order =>
                order.id === id
        );


    if (index === -1) {
        return null;
    }


    orders[index].telegram =
        telegram;

    orders[index].nickname =
        nickname;


    writeOrdersLocal(
        orders
    );


    return orders[index];

}


// ======================================================
// MARK ORDER PAID
// ======================================================

async function markOrderPaid(
    label,
    operationId,
    amount
) {

    if (db) {

        const result =
            await db.query(
                `
                UPDATE orders

                SET
                    status = 'paid_waiting_data',
                    payment_operation_id = $1,
                    payment_amount = $2,
                    paid_at = NOW()

                WHERE
                    payment_label = $3
                    AND status = 'waiting_payment'

                RETURNING *
                `,
                [
                    operationId,
                    amount,
                    label
                ]
            );


        if (!result.rows.length) {
            return null;
        }


        return normalizeOrder(
            result.rows[0]
        );

    }


    const orders =
        readOrdersLocal();


    const index =
        orders.findIndex(
            order =>
                order.payment_label === label &&
                order.status ===
                    "waiting_payment"
        );


    if (index === -1) {
        return null;
    }


    orders[index].status =
        "paid_waiting_data";

    orders[index].payment_operation_id =
        operationId;

    orders[index].payment_amount =
        amount;

    orders[index].paid_at =
        new Date().toISOString();


    writeOrdersLocal(
        orders
    );


    return orders[index];

}


// ======================================================
// FINAL STATUS AFTER DATA
// ======================================================

async function markOrderCompleted(
    id
) {

    if (db) {

        const result =
            await db.query(
                `
                UPDATE orders

                SET status = 'completed'

                WHERE
                    id = $1
                    AND telegram IS NOT NULL
                    AND telegram <> ''
                    AND nickname IS NOT NULL
                    AND nickname <> ''

                RETURNING *
                `,
                [id]
            );


        if (!result.rows.length) {
            return null;
        }


        return normalizeOrder(
            result.rows[0]
        );

    }


    const orders =
        readOrdersLocal();


    const index =
        orders.findIndex(
            order =>
                order.id === id
        );


    if (index === -1) {
        return null;
    }


    orders[index].status =
        "completed";


    writeOrdersLocal(
        orders
    );


    return orders[index];

}


// ======================================================
// ALL ORDERS
// ======================================================

async function getOrders() {

    if (db) {

        const result =
            await db.query(
                `
                SELECT *
                FROM orders
                ORDER BY created_at DESC
                `
            );


        return result.rows.map(
            normalizeOrder
        );

    }


    return readOrdersLocal()
        .slice()
        .reverse();

}


// ======================================================
// DELETE
// ======================================================

async function deleteOrder(
    id
) {

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


// ======================================================
// NORMALIZE
// ======================================================

function normalizeOrder(
    order
) {

    return {

        id:
            order.id,

        product:
            order.product,

        price:
            order.price,

        telegram:
            order.telegram || "",

        nickname:
            order.nickname || "",

        status:
            order.status ||
            "waiting_payment",

        payment_label:
            order.payment_label ||
            "",

        payment_operation_id:
            order.payment_operation_id ||
            "",

        payment_amount:
            order.payment_amount ||
            "",

        date:
            order.created_at
                ? new Date(
                    order.created_at
                ).toLocaleString(
                    "ru-RU"
                )
                : (
                    order.date || ""
                ),

        paid_at:
            order.paid_at
                ? new Date(
                    order.paid_at
                ).toLocaleString(
                    "ru-RU"
                )
                : ""

    };

}


// ======================================================
// MONEY
// ======================================================

function moneyToNumber(
    value
) {

    const number =
        Number(
            String(value)
                .replace(",", ".")
                .replace(/[^\d.]/g, "")
        );


    if (!Number.isFinite(number)) {
        return null;
    }


    return number;

}


// ======================================================
// YOOMONEY SIGN
// ======================================================

function rfc3986Encode(
    value
) {

    return encodeURIComponent(
        String(value ?? "")
    )
        .replace(/[!'()*]/g,
            char =>
                "%" +
                char
                    .charCodeAt(0)
                    .toString(16)
                    .toUpperCase()
        );

}


function verifyYuMoneySignature(
    params
) {

    if (!YOOMONEY_NOTIFICATION_SECRET) {
        return false;
    }


    const sign =
        String(
            params.sign || ""
        );


    if (!sign) {
        return false;
    }


    const keys =
        Object.keys(params)
            .filter(
                key =>
                    key !== "sign"
            )
            .sort();


    const source =
        keys
            .map(
                key =>
                    `${rfc3986Encode(key)}=${rfc3986Encode(params[key])}`
            )
            .join("&");


    const expected =
        crypto
            .createHmac(
                "sha256",
                YOOMONEY_NOTIFICATION_SECRET
            )
            .update(
                source,
                "utf8"
            )
            .digest("hex");


    try {

        return crypto.timingSafeEqual(
            Buffer.from(
                expected,
                "utf8"
            ),
            Buffer.from(
                sign.toLowerCase(),
                "utf8"
            )
        );

    } catch {

        return false;

    }

}


// ======================================================
// BODY
// ======================================================

function readBody(
    req,
    limit = 30000
) {

    return new Promise(
        (resolve, reject) => {

            let body = "";


            req.on(
                "data",
                chunk => {

                    body += chunk;


                    if (
                        body.length >
                        limit
                    ) {

                        reject(
                            new Error(
                                "payload"
                            )
                        );

                        req.destroy();

                    }

                }
            );


            req.on(
                "end",
                () => resolve(body)
            );


            req.on(
                "error",
                reject
            );

        }
    );

}


// ======================================================
// JSON RESPONSE
// ======================================================

function json(
    res,
    status,
    body
) {

    const text =
        JSON.stringify(body);


    res.writeHead(
        status,
        {
            "Content-Type":
                "application/json; charset=utf-8",

            "Cache-Control":
                "no-store",

            "Content-Length":
                Buffer.byteLength(
                    text
                )
        }
    );


    res.end(text);

}


// ======================================================
// COOKIES
// ======================================================

function parseCookies(
    req
) {

    const result = {};


    for (
        const part of
        (
            req.headers.cookie ||
            ""
        ).split(";")
    ) {

        const index =
            part.indexOf("=");


        if (index === -1) {
            continue;
        }


        const key =
            part
                .slice(0, index)
                .trim();


        const value =
            part
                .slice(index + 1)
                .trim();


        result[key] =
            decodeURIComponent(
                value
            );

    }


    return result;

}


function isAdmin(
    req
) {

    const token =
        parseCookies(req)
            .admin_session;


    return (
        !!token &&
        sessions.has(token)
    );

}


// ======================================================
// FILES
// ======================================================

function safePath(
    requestPath
) {

    let clean;


    try {

        clean =
            decodeURIComponent(
                String(
                    requestPath || "/"
                ).split("?")[0]
            );

    } catch {

        return null;

    }


    const relative =
        (
            clean === "/" ||
            clean === ""
        )
            ? "index.html"
            : clean.replace(
                /^[/\\]+/,
                ""
            );


    const root =
        path.resolve(
            ROOT
        );


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


function mime(
    file
) {

    const ext =
        path.extname(
            file
        ).toLowerCase();


    return {

        ".html":
            "text/html; charset=utf-8",

        ".js":
            "application/javascript; charset=utf-8",

        ".css":
            "text/css; charset=utf-8",

        ".png":
            "image/png",

        ".jpg":
            "image/jpeg",

        ".jpeg":
            "image/jpeg",

        ".webp":
            "image/webp",

        ".svg":
            "image/svg+xml",

        ".ico":
            "image/x-icon"

    }[ext] ||
        "application/octet-stream";

}


function serveFile(
    res,
    file
) {

    fs.readFile(
        file,
        (error, data) => {

            if (error) {

                return json(
                    res,
                    404,
                    {
                        error:
                            "Не найдено"
                    }
                );

            }


            res.writeHead(
                200,
                {
                    "Content-Type":
                        mime(file),

                    "Cache-Control":
                        "no-cache"
                }
            );


            res.end(data);

        }
    );

}


// ======================================================
// ADMIN
// ======================================================

function adminPage(
    res
) {

    const html = `

<!doctype html>

<html lang="ru">

<head>

<meta charset="utf-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>
MM2 SHOP — Админка
</title>

<style>

* {
    box-sizing:border-box;
}

body {

    margin:0;

    min-height:100vh;

    background:
        radial-gradient(
            circle at 50% 0,
            rgba(243,198,91,.14),
            transparent 35%
        ),
        #070707;

    color:#fff;

    font-family:
        Inter,
        Arial,
        sans-serif;

    padding:24px;

}

.wrap {

    max-width:1100px;

    margin:auto;

}

.card {

    background:
        rgba(17,17,17,.95);

    border:
        1px solid
        rgba(243,198,91,.2);

    border-radius:22px;

    padding:24px;

    box-shadow:
        0 25px 80px
        rgba(0,0,0,.4);

}

#login {

    max-width:430px;

    margin:10vh auto;

}

.crown {

    width:64px;
    height:64px;

    border-radius:18px;

    display:grid;
    place-items:center;

    margin:
        0 auto 18px;

    background:
        linear-gradient(
            145deg,
            #ffe08a,
            #b77b18
        );

    font-size:30px;

    color:#15100a;

}

.badge {

    text-align:center;

    color:#e4b64e;

    font-size:11px;

    font-weight:800;

    letter-spacing:3px;

}

.login-title {

    text-align:center;

    font-size:29px;

    margin:9px 0;

}

.muted {

    color:#888;

}

.login-sub {

    text-align:center;

    font-size:14px;

    margin:
        0 0 26px;

}

.field {

    margin-bottom:14px;

}

.field label {

    display:block;

    font-size:13px;

    font-weight:700;

    color:#bbb;

    margin-bottom:8px;

}

input {

    width:100%;

    height:52px;

    border-radius:14px;

    border:
        1px solid #303030;

    background:#141414;

    color:#fff;

    padding:
        0 16px;

    font-size:15px;

    outline:none;

}

input:focus {

    border-color:#dca52e;

    box-shadow:
        0 0 0 4px
        rgba(220,165,46,.08);

}

.btn {

    border:0;

    border-radius:13px;

    padding:
        12px 16px;

    font-weight:800;

    cursor:pointer;

}

.gold {

    width:100%;

    height:52px;

    background:
        linear-gradient(
            100deg,
            #d99a25,
            #ffe18a,
            #d99a25
        );

    color:#171109;

}

.error {

    min-height:20px;

    color:#ff6d78;

    text-align:center;

    margin-top:10px;

}

.top {

    display:flex;

    justify-content:space-between;

    gap:15px;

    align-items:center;

    flex-wrap:wrap;

}

.actions {

    display:flex;

    gap:8px;

}

.darkbtn {

    background:#191919;

    color:#fff;

    border:
        1px solid #333;

}

.danger {

    background:#35141a;

    color:#ff8490;

    border:
        1px solid #5a252d;

}

.count {

    margin-top:18px;

    font-size:18px;

}

.order {

    margin-top:14px;

    padding:18px;

    border:
        1px solid #2a2a2a;

    border-radius:16px;

    background:#101010;

}

.grid {

    display:grid;

    grid-template-columns:
        repeat(
            auto-fit,
            minmax(170px,1fr)
        );

    gap:10px;

    margin-top:13px;

}

.fieldbox {

    background:#171717;

    padding:11px;

    border-radius:11px;

    color:#999;

    font-size:12px;

}

.fieldbox b {

    display:block;

    color:#fff;

    font-size:14px;

    margin-top:5px;

    word-break:break-word;

}

.status {

    display:inline-block;

    padding:
        5px 9px;

    border-radius:999px;

    font-size:11px;

}

.waiting {

    background:#3a3218;

    color:#ffd86a;

}

.paid {

    background:#173c28;

    color:#70f0a0;

}

.completed {

    background:#17374a;

    color:#72d9ff;

}

.empty {

    padding:35px;

    text-align:center;

    color:#777;

}

</style>

</head>

<body>

<div class="wrap">

<div
    id="login"
    class="card"
>

    <div class="crown">
        ♛
    </div>

    <div class="badge">
        MM2 SHOP
    </div>

    <h1 class="login-title">
        Вход в админ-панель
    </h1>

    <p class="muted login-sub">
        Доступ только владельцу магазина
    </p>

    <div class="field">

        <label>
            Секретный пароль
        </label>

        <input
            id="pass"
            type="password"
            placeholder="Введите пароль"
        >

    </div>

    <button
        class="btn gold"
        onclick="login()"
    >
        Войти →
    </button>

    <div
        id="loginErr"
        class="error"
    ></div>

</div>


<div
    id="panel"
    style="display:none"
>

    <div class="top">

        <div>

            <h1 style="margin:0">
                📦 Заказы MM2
            </h1>

            <div class="muted">
                Заказы обновляются автоматически.
            </div>

        </div>

        <div class="actions">

            <button
                class="btn darkbtn"
                onclick="loadOrders()"
            >
                ↻ Обновить
            </button>

            <button
                class="btn darkbtn"
                onclick="logout()"
            >
                Выйти
            </button>

        </div>

    </div>


    <div class="card count">

        Всего заказов:
        <b id="count">
            0
        </b>

    </div>


    <div id="orders"></div>

</div>

</div>


<script>

const esc = value =>

String(value ?? "")

.replace(
    /[&<>'"]/g,

    char => ({

        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        "'":"&#39;",
        '"':"&quot;"

    }[char])

);


function statusText(
    status
) {

    if (
        status ===
        "waiting_payment"
    ) {

        return [
            "waiting",
            "⏳ Ожидает оплаты"
        ];

    }


    if (
        status ===
        "paid_waiting_data"
    ) {

        return [
            "paid",
            "💳 Оплачено"
        ];

    }


    if (
        status ===
        "completed"
    ) {

        return [
            "completed",
            "✅ Заказ оформлен"
        ];

    }


    return [
        "waiting",
        status
    ];

}


async function login() {

    const password =
        document.getElementById(
            "pass"
        ).value;


    const response =
        await fetch(
            "/api/admin/login",
            {

                method:"POST",

                headers:{
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        password
                    })

            }
        );


    if (response.ok) {

        document.getElementById(
            "login"
        ).style.display =
            "none";


        document.getElementById(
            "panel"
        ).style.display =
            "block";


        loadOrders();


    } else {

        document.getElementById(
            "loginErr"
        ).textContent =
            "❌ Неверный пароль";

    }

}


async function loadOrders() {

    const response =
        await fetch(
            "/api/admin/orders",
            {
                cache:"no-store"
            }
        );


    if (
        response.status ===
        401
    ) {

        return;

    }


    const data =
        await response.json();


    document.getElementById(
        "count"
    ).textContent =
        data.orders.length;


    const box =
        document.getElementById(
            "orders"
        );


    if (
        !data.orders.length
    ) {

        box.innerHTML =
            '<div class="card empty">Пока заказов нет.</div>';

        return;

    }


    box.innerHTML =
        data.orders.map(
            order => {

                const [
                    statusClass,
                    statusName
                ] =
                    statusText(
                        order.status
                    );


                return `

<div class="order">

    <div class="top">

        <b>
            Заказ #${esc(order.id)}
        </b>

        <span
            class="status ${statusClass}"
        >
            ${statusName}
        </span>

    </div>


    <div class="grid">

        <div class="fieldbox">

            🛒 Товар

            <b>
                ${esc(order.product)}
            </b>

        </div>


        <div class="fieldbox">

            💰 Цена

            <b>
                ${esc(order.price)}
            </b>

        </div>


        <div class="fieldbox">

            👤 Telegram

            <b>
                ${
                    esc(
                        order.telegram ||
                        "Ожидается"
                    )
                }
            </b>

        </div>


        <div class="fieldbox">

            🎮 Roblox

            <b>
                ${
                    esc(
                        order.nickname ||
                        "Ожидается"
                    )
                }
            </b>

        </div>


        <div class="fieldbox">

            💳 Оплата

            <b>
                ${
                    order.payment_operation_id
                        ? "Операция " +
                          esc(
                              order.payment_operation_id
                          )
                        : "Ожидается"
                }
            </b>

        </div>


        <div class="fieldbox">

            🕒 Дата

            <b>
                ${esc(order.date)}
            </b>

        </div>


        <div
            class="fieldbox"
            style="
                display:flex;
                align-items:end;
            "
        >

            <button
                class="btn danger"
                onclick="deleteOrder('${esc(order.id)}')"
            >
                Удалить
            </button>

        </div>

    </div>

</div>

`;

            }
        ).join("");

}


async function deleteOrder(
    id
) {

    if (
        !confirm(
            "Удалить этот заказ?"
        )
    ) {

        return;

    }


    const response =
        await fetch(
            "/api/admin/orders/" +
            encodeURIComponent(id),
            {
                method:"DELETE"
            }
        );


    if (response.ok) {

        loadOrders();

    }

}


async function logout() {

    await fetch(
        "/api/admin/logout",
        {
            method:"POST"
        }
    );


    location.reload();

}


document
    .getElementById("pass")
    .addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                login();

            }

        }
    );

</script>

</body>

</html>

`;

    res.writeHead(
        200,
        {
            "Content-Type":
                "text/html; charset=utf-8",

            "Cache-Control":
                "no-store"
        }
    );

    res.end(html);

}


// ======================================================
// REQUEST HANDLER
// ======================================================

async function handle(
    req,
    res
) {

    const parsed =
        new URL(
            req.url,
            `http://${req.headers.host || "localhost"}`
        );


    // ==================================================
    // CREATE PAYMENT ORDER
    // ==================================================

    if (
        req.method === "POST" &&
        parsed.pathname ===
            "/api/payment/create"
    ) {

        try {

            const input =
                JSON.parse(
                    await readBody(req)
                );


            const product =
                String(
                    input.product || ""
                )
                    .trim()
                    .slice(0,100);


            const price =
                String(
                    input.price || ""
                )
                    .trim()
                    .slice(0,50);


            if (
                !product ||
                !price
            ) {

                return json(
                    res,
                    400,
                    {
                        success:false,
                        error:
                            "Не указан товар."
                    }
                );

            }


            const order =
                await createPendingOrder(
                    product,
                    price
                );


            if (!YOOMONEY_RECEIVER) {

                return json(
                    res,
                    500,
                    {
                        success:false,
                        error:
                            "YOOMONEY_RECEIVER не настроен."
                    }
                );

            }


            const amount =
                moneyToNumber(
                    price
                );


            if (
                amount === null
            ) {

                return json(
                    res,
                    400,
                    {
                        success:false,
                        error:
                            "Некорректная цена."
                    }
                );

            }


            // Официальный quickpay
            // ЮMoney получает label =
            // номер нашего заказа

            const paymentUrl =
                new URL(
                    "https://yoomoney.ru/quickpay/confirm"
                );


            paymentUrl.searchParams.set(
                "receiver",
                YOOMONEY_RECEIVER
            );


            paymentUrl.searchParams.set(
                "quickpay-form",
                "shop"
            );


            paymentUrl.searchParams.set(
                "targets",
                `MM2 SHOP — ${product}`
            );


            paymentUrl.searchParams.set(
                "sum",
                amount.toFixed(2)
            );


            paymentUrl.searchParams.set(
                "label",
                order.payment_label
            );


            paymentUrl.searchParams.set(
                "successURL",
                `${getPublicBaseUrl(req)}/?payment=success&order=${encodeURIComponent(order.id)}`
            );


            return json(
                res,
                201,
                {
                    success:true,

                    orderId:
                        order.id,

                    status:
                        order.status,

                    paymentUrl:
                        paymentUrl.toString()
                }
            );


        } catch (error) {

            console.error(error);

            return json(
                res,
                500,
                {
                    success:false,
                    error:
                        "Не удалось создать заказ."
                }
            );

        }

    }


    // ==================================================
    // CHECK PAYMENT
    // ==================================================

    if (
        req.method === "GET" &&
        parsed.pathname ===
            "/api/payment/status"
    ) {

        const id =
            String(
                parsed.searchParams.get(
                    "id"
                ) || ""
            );


        if (!id) {

            return json(
                res,
                400,
                {
                    success:false
                }
            );

        }


        const order =
            await getOrder(id);


        if (!order) {

            return json(
                res,
                404,
                {
                    success:false
                }
            );

        }


        return json(
            res,
            200,
            {
                success:true,

                orderId:
                    order.id,

                status:
                    order.status,

                product:
                    order.product,

                price:
                    order.price

            }
        );

    }


    // ==================================================
    // SAVE USER DATA
    // ==================================================

    if (
        req.method === "POST" &&
        parsed.pathname ===
            "/api/orders"
    ) {

        try {

            const input =
                JSON.parse(
                    await readBody(req)
                );


            const id =
                String(
                    input.orderId || ""
                )
                    .trim()
                    .slice(0,100);


            const telegram =
                String(
                    input.telegram || ""
                )
                    .trim()
                    .slice(0,50);


            const nickname =
                String(
                    input.nickname || ""
                )
                    .trim()
                    .slice(0,50);


            if (
                !id ||
                !telegram ||
                !nickname
            ) {

                return json(
                    res,
                    400,
                    {
                        success:false,
                        error:
                            "Заполни все поля."
                    }
                );

            }


            const order =
                await getOrder(id);


            if (!order) {

                return json(
                    res,
                    404,
                    {
                        success:false,
                        error:
                            "Заказ не найден."
                    }
                );

            }


            // НЕЛЬЗЯ ПЕРЕДАВАТЬ ДАННЫЕ
            // ДО ОПЛАТЫ

            if (
                order.status !==
                    "paid_waiting_data"
            ) {

                return json(
                    res,
                    403,
                    {
                        success:false,
                        error:
                            "Сначала необходимо оплатить заказ."
                    }
                );

            }


            const saved =
                await saveCustomerData(
                    id,
                    telegram,
                    nickname
                );


            if (!saved) {

                return json(
                    res,
                    404,
                    {
                        success:false
                    }
                );

            }


            const completed =
                await markOrderCompleted(
                    id
                );


            return json(
                res,
                200,
                {
                    success:true,

                    order:
                        completed ||
                        saved
                }
            );


        } catch (error) {

            console.error(error);

            return json(
                res,
                500,
                {
                    success:false,
                    error:
                        "Не удалось сохранить заказ."
                }
            );

        }

    }


    // ==================================================
    // YOOMONEY WEBHOOK
    // ==================================================

    if (
        req.method === "POST" &&
        parsed.pathname ===
            "/api/yoomoney/notification"
    ) {

        try {

            const body =
                await readBody(req);


            const params =
                Object.fromEntries(
                    new URLSearchParams(
                        body
                    )
                );


            console.log(
                "YuMoney notification:",
                params
            );


            if (
                !verifyYuMoneySignature(
                    params
                )
            ) {

                console.error(
                    "Invalid YuMoney signature"
                );


                return json(
                    res,
                    403,
                    {
                        success:false
                    }
                );

            }


            const label =
                String(
                    params.label || ""
                );


            const operationId =
                String(
                    params.operation_id ||
                    ""
                );


            const amount =
                String(
                    params.amount ||
                    ""
                );


            if (
                !label ||
                !operationId ||
                !amount
            ) {

                return json(
                    res,
                    400,
                    {
                        success:false
                    }
                );

            }


            const order =
                await getOrder(
                    label
                );


            if (!order) {

                console.error(
                    "Order not found:",
                    label
                );


                // Отвечаем 200,
                // чтобы ЮMoney не повторял
                // неизвестное уведомление

                return json(
                    res,
                    200,
                    {
                        success:false,
                        ignored:true
                    }
                );

            }


            if (
                order.status !==
                    "waiting_payment"
            ) {

                return json(
                    res,
                    200,
                    {
                        success:true,
                        alreadyProcessed:true
                    }
                );

            }


            const expectedAmount =
                moneyToNumber(
                    order.price
                );


            const incomingAmount =
                moneyToNumber(
                    amount
                );


            if (
                expectedAmount === null ||
                incomingAmount === null ||
                Math.abs(
                    expectedAmount -
                    incomingAmount
                ) > 0.001
            ) {

                console.error(
                    "Wrong payment amount:",
                    {
                        expected:
                            expectedAmount,

                        incoming:
                            incomingAmount
                    }
                );


                return json(
                    res,
                    400,
                    {
                        success:false,
                        error:
                            "Неверная сумма."
                    }
                );

            }


            await markOrderPaid(
                label,
                operationId,
                amount
            );


            console.log(
                "PAYMENT CONFIRMED:",
                label,
                amount
            );


            return json(
                res,
                200,
                {
                    success:true
                }
            );


        } catch (error) {

            console.error(
                "YuMoney webhook error:",
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


    // ==================================================
    // ADMIN LOGIN
    // ==================================================

    if (
        req.method === "POST" &&
        parsed.pathname ===
            "/api/admin/login"
    ) {

        try {

            const input =
                JSON.parse(
                    await readBody(req)
                );


            if (
                String(
                    input.password || ""
                ) !==
                ADMIN_PASSWORD
            ) {

                return json(
                    res,
                    401,
                    {
                        success:false
                    }
                );

            }


            const token =
                crypto
                    .randomBytes(32)
                    .toString("hex");


            sessions.set(
                token,
                Date.now()
            );


            const secure =
                process.env.NODE_ENV ===
                "production"
                    ? " Secure;"
                    : "";


            res.writeHead(
                200,
                {
                    "Content-Type":
                        "application/json",

                    "Cache-Control":
                        "no-store",

                    "Set-Cookie":
                        `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure}`
                }
            );


            return res.end(
                JSON.stringify({
                    success:true
                })
            );


        } catch {

            return json(
                res,
                400,
                {
                    success:false
                }
            );

        }

    }


    // ==================================================
    // ADMIN LOGOUT
    // ==================================================

    if (
        req.method === "POST" &&
        parsed.pathname ===
            "/api/admin/logout"
    ) {

        const token =
            parseCookies(req)
                .admin_session;


        if (token) {

            sessions.delete(
                token
            );

        }


        res.writeHead(
            200,
            {
                "Content-Type":
                    "application/json",

                "Set-Cookie":
                    "admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
            }
        );


        return res.end(
            JSON.stringify({
                success:true
            })
        );

    }


    // ==================================================
    // ADMIN ORDERS
    // ==================================================

    if (
        req.method === "GET" &&
        parsed.pathname ===
            "/api/admin/orders"
    ) {

        if (!isAdmin(req)) {

            return json(
                res,
                401,
                {
                    error:
                        "Требуется вход"
                }
            );

        }


        try {

            return json(
                res,
                200,
                {
                    orders:
                        await getOrders()
                }
            );

        } catch {

            return json(
                res,
                500,
                {
                    error:
                        "Ошибка базы данных"
                }
            );

        }

    }


    // ==================================================
    // DELETE ORDER
    // ==================================================

    if (
        req.method === "DELETE" &&
        parsed.pathname.startsWith(
            "/api/admin/orders/"
        )
    ) {

        if (!isAdmin(req)) {

            return json(
                res,
                401,
                {
                    error:
                        "Требуется вход"
                }
            );

        }


        const id =
            decodeURIComponent(
                parsed.pathname
                    .split("/")
                    .pop()
            );


        try {

            await deleteOrder(
                id
            );


            return json(
                res,
                200,
                {
                    success:true
                }
            );

        } catch {

            return json(
                res,
                500,
                {
                    success:false
                }
            );

        }

    }


    // ==================================================
    // ADMIN
    // ==================================================

    if (
        req.method === "GET" &&
        parsed.pathname === "/admin"
    ) {

        return adminPage(
            res
        );

    }


    // ==================================================
    // HEALTH
    // ==================================================

    if (
        req.method === "GET" &&
        parsed.pathname === "/health"
    ) {

        return json(
            res,
            200,
            {
                ok:true
            }
        );

    }


    // ==================================================
    // STATIC
    // ==================================================

    if (
        req.method === "GET"
    ) {

        const file =
            safePath(
                req.url
            );


        if (
            file &&
            fs.existsSync(file) &&
            fs.statSync(file).isFile()
        ) {

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
                "Не найдено"
        }
    );

}


// ======================================================
// PUBLIC URL
// ======================================================

function getPublicBaseUrl(
    req
) {

    const forwardedProto =
        String(
            req.headers[
                "x-forwarded-proto"
            ] || ""
        )
            .split(",")[0]
            .trim();


    const protocol =
        forwardedProto ||
        (
            process.env.NODE_ENV ===
            "production"
                ? "https"
                : "http"
        );


    const host =
        req.headers.host ||
        `localhost:${PORT}`;


    return `${protocol}://${host}`;

}


// ======================================================
// START
// ======================================================

(async () => {

    await initDb();


    const server =
        http.createServer(
            (req, res) => {

                handle(
                    req,
                    res
                )
                    .catch(
                        error => {

                            console.error(
                                error
                            );


                            json(
                                res,
                                500,
                                {
                                    error:
                                        "Внутренняя ошибка сервера"
                                }
                            );

                        }
                    );

            }
        );


    server.listen(
        PORT,
        () => {

            console.log(
                `MM2 SHOP запущен: http://localhost:${PORT}`
            );

            console.log(
                `Админка: http://localhost:${PORT}/admin`
            );

            console.log(
                `ЮMoney receiver: ${
                    YOOMONEY_RECEIVER
                        ? "configured"
                        : "NOT configured"
                }`
            );

            console.log(
                `ЮMoney webhook secret: ${
                    YOOMONEY_NOTIFICATION_SECRET
                        ? "configured"
                        : "NOT configured"
                }`
            );

        }
    );

})();
