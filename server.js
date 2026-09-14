const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const YOOMONEY_RECEIVER = process.env.YOOMONEY_RECEIVER || '';
const YOOMONEY_NOTIFICATION_SECRET =
    process.env.YOOMONEY_NOTIFICATION_SECRET || '';

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

if (
    !ADMIN_PASSWORD ||
    !YOOMONEY_RECEIVER ||
    !YOOMONEY_NOTIFICATION_SECRET
) {
    console.error(
        'ERROR: Set ADMIN_PASSWORD, YOOMONEY_RECEIVER and YOOMONEY_NOTIFICATION_SECRET.'
    );

    process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');
}

const sessions = new Map();

let db = null;

/* =========================
   ТОВАРЫ
========================= */

const PRODUCTS = {
    'BioBlade': 39,
    'Raygun': 399,
    "Traveler's Gun": 8999,
    'Harvester': 299,
    'Тест': 2
};

/* =========================
   DATABASE
========================= */

async function initDb() {
    if (!DATABASE_URL) {
        console.log('Database: local JSON');
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
                telegram TEXT DEFAULT '',
                nickname TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'waiting_payment',
                payment_label TEXT,
                operation_id TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                paid_at TIMESTAMPTZ
            )
        `);

        const migrations = [
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_label TEXT`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS operation_id TEXT`,
            `ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`,
            `ALTER TABLE orders ALTER COLUMN telegram DROP NOT NULL`,
            `ALTER TABLE orders ALTER COLUMN nickname DROP NOT NULL`
        ];

        for (const query of migrations) {
            await db.query(query).catch(() => {});
        }

        console.log('Database: PostgreSQL');
    } catch (error) {
        console.error(
            'Database connection failed:',
            error.message
        );

        process.exit(1);
    }
}

/* =========================
   LOCAL JSON
========================= */

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

/* =========================
   HELPERS
========================= */

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
        String(value ?? '')
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
            row.payment_label || '',
        operation_id:
            row.operation_id || '',
        date: row.created_at
            ? new Date(
                row.created_at
            ).toLocaleString('ru-RU')
            : (
                row.date || ''
            ),
        paid_at: row.paid_at
            ? new Date(
                row.paid_at
            ).toLocaleString('ru-RU')
            : ''
    };
}

/* =========================
   CREATE ORDER
========================= */

async function createPendingOrder(
    product,
    price
) {
    const orderId = createId();

    const label =
        'MM2_' +
        orderId.replace(
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
                (
                    $1,
                    $2,
                    $3,
                    '',
                    '',
                    $4,
                    $5
                )
                RETURNING *
                `,
                [
                    orderId,
                    product,
                    price + ' ₽',
                    'waiting_payment',
                    label
                ]
            );

        return formatOrder(
            result.rows[0]
        );
    }

    const order = {
        id: orderId,
        product: product,
        price: price + ' ₽',
        telegram: '',
        nickname: '',
        status: 'waiting_payment',
        payment_label: label,
        operation_id: '',
        date:
            new Date()
                .toLocaleString('ru-RU'),
        paid_at: ''
    };

    const orders =
        readOrdersLocal();

    orders.push(order);

    writeOrdersLocal(orders);

    return order;
}

/* =========================
   GET ORDER
========================= */

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

/* =========================
   GET ORDER BY LABEL
========================= */

async function getOrderByLabel(label) {
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

        return formatOrder(
            result.rows[0]
        );
    }

    return readOrdersLocal()
        .find(
            order =>
                order.payment_label === label
        ) || null;
}

/* =========================
   MARK PAYMENT PAID
========================= */

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
                WHERE payment_label = $2
                  AND status = 'waiting_payment'
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
                item.payment_label === label &&
                item.status === 'waiting_payment'
        );

    if (!order) {
        return null;
    }

    order.status = 'paid';

    order.operation_id =
        operationId;

    order.paid_at =
        new Date()
            .toLocaleString('ru-RU');

    writeOrdersLocal(
        orders
    );

    return order;
}

/* =========================
   SAVE USER DATA
========================= */

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
                WHERE id = $3
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

/* =========================
   ADMIN ORDERS
========================= */

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

/* =========================
   HTTP HELPERS
========================= */

function json(
    res,
    status,
    data,
    extraHeaders = {}
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
                Buffer.byteLength(text),

            ...extraHeaders
        }
    );

    res.end(text);
}

function readBody(
    req,
    limit = 50000
) {
    return new Promise(
        (resolve, reject) => {
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
                                'payload too large'
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

/* =========================
   COOKIES
========================= */

function parseCookies(req) {
    const result = {};

    const
