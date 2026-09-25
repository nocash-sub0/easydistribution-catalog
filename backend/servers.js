const express = require('express')
const cors = require('cors')
const pool = require('./db')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const compression = require('compression')
const nodemailer = require('nodemailer')
const { autoTranslateProduct } = require('./translate')

// Почта для восстановления пароля (любой SMTP, например бесплатный Gmail с паролем приложения)
const mailer =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null

const app = express()
// Render стоит за прокси: берём реальный IP клиента из X-Forwarded-For
app.set('trust proxy', 1)
const PORT = process.env.PORT || 3000

app.use(cors())
// gzip: каталог из 800 товаров сжимается примерно с 210 КБ до ~25 КБ
app.use(compression())

// --- Stripe (оплата картой) ---

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '')
const STRIPE_CURRENCY = (process.env.STRIPE_CURRENCY || 'mdl').toLowerCase()

// Webhook обязан получать «сырое» тело запроса, поэтому регистрируется до express.json()
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(501).end()
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Stripe webhook signature error:', err.message)
    return res.status(400).send('Invalid signature')
  }

  try {
    const session = event.data.object
    const orderId = parseInt(session.metadata?.order_id)
    if (orderId) {
      if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
        await pool.query("UPDATE orders SET status = 'paid' WHERE id = ? AND status = 'pending_payment'", [orderId])
      } else if (event.type === 'checkout.session.expired') {
        // неоплаченный заказ отменяется, товар возвращается на склад
        await setOrderStatus(orderId, 'cancelled', 'pending_payment')
      }
    }
    res.json({ received: true })
  } catch (err) {
    console.error(err)
    res.status(500).end()
  }
})

app.use(express.json({ limit: '10mb' }))

// --- Единственное место для конверсии цены (НДС + единицы продажи) ---

function round2(num) {
  return Math.round(num * 100) / 100
}

function calculatePricing(row, basePrice) {
  if (basePrice === null || basePrice === undefined) {
    return { price: null, priceWithVat: null, saleUnitPrice: null, saleUnitPriceWithVat: null }
  }
  const vatMultiplier = 1 + Number(row.vat_rate) / 100
  const priceWithVat = round2(basePrice * vatMultiplier)
  const saleUnitPrice = round2(basePrice * Number(row.sale_unit_factor))
  const saleUnitPriceWithVat = round2(saleUnitPrice * vatMultiplier)
  return { price: basePrice, priceWithVat, saleUnitPrice, saleUnitPriceWithVat }
}

function mapProductRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.tr_name || row.name,
    category: row.tr_category || row.category,
    categoryCode: row.category, // исходная категория — для иконок и фильтров, не зависит от языка
    imageVersion: row.image_version ? Number(row.image_version) : null,
    baseUnit: row.base_unit,
    saleUnit: row.sale_unit,
    saleUnitFactor: Number(row.sale_unit_factor),
    vatRate: Number(row.vat_rate),
    stock: row.stock === null || row.stock === undefined ? null : Number(row.stock), // null — остаток не ведётся
  }
}

function validateProductRow(row) {
  const errors = []
  if (!row.code) errors.push('код обязателен')
  if (!row.name) errors.push('название обязательно')
  if (!row.category) errors.push('категория обязательна')

  const vatRate = parseFloat(row.vatRate)
  if (isNaN(vatRate) || vatRate < 0 || vatRate > 100) errors.push('cotă TVA invalidă')

  const saleUnitFactor = parseFloat(row.saleUnitFactor)
  if (isNaN(saleUnitFactor) || saleUnitFactor <= 0) errors.push('некорректный коэффициент единицы продажи')

  const price = parseFloat(row.price)
  if (isNaN(price) || price < 0) errors.push('некорректная цена')

  return errors
}

// --- Аутентификация ---

function readToken(req) {
  const authHeader = req.headers.authorization
  if (!authHeader) return null
  try {
    return jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET)
  } catch {
    return null
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ error: 'Lipsește token-ul' })
    const decoded = readToken(req)
    if (!decoded) return res.status(401).json({ error: 'Token invalid' })
    if (decoded.role !== role) return res.status(403).json({ error: 'Acces interzis' })
    req.user = decoded
    next()
  }
}

const requireAdmin = requireRole('admin')

// Защита от подбора пароля: не больше `max` запросов с одного IP за окно `windowMs`
function rateLimit({ max, windowMs }) {
  const hits = new Map()
  setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of hits) if (entry.reset < now) hits.delete(ip)
  }, windowMs).unref()

  return (req, res, next) => {
    const now = Date.now()
    let entry = hits.get(req.ip)
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs }
      hits.set(req.ip, entry)
    }
    entry.count++
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)))
      return res.status(429).json({ error: 'Prea multe încercări. Încercați mai târziu' })
    }
    next()
  }
}

const loginLimiter = rateLimit({ max: 20, windowMs: 15 * 60 * 1000 })
const registerLimiter = rateLimit({ max: 10, windowMs: 60 * 60 * 1000 })

// Единый вход: логин админа из .env либо логин клиента из таблицы clients
app.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) return res.status(400).json({ error: 'Introduceți login și parola' })

    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' })
      return res.json({ token, role: 'admin', name: 'Администратор' })
    }

    const [rows] = await pool.query('SELECT * FROM clients WHERE login = ? LIMIT 1', [username.trim().toLowerCase()])
    const client = rows[0]
    const match = client && client.password_hash && (await bcrypt.compare(password, client.password_hash))
    if (!match) return res.status(401).json({ error: 'Login sau parolă incorectă' })

    const token = jwt.sign({ role: 'client', clientId: client.id }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, role: 'client', name: client.name })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// --- Регистрация ---

function issueClientToken(client) {
  const token = jwt.sign({ role: 'client', clientId: client.id }, process.env.JWT_SECRET, { expiresIn: '7d' })
  return { token, role: 'client', name: client.name }
}

app.post('/register', registerLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim()
    const email = String(req.body.email || '').trim().toLowerCase()
    const password = String(req.body.password || '')

    if (!name) return res.status(400).json({ error: 'Numele este obligatoriu' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalid' })
    if (password.length < 8) return res.status(400).json({ error: 'Parola trebuie să aibă minim 8 caractere' })

    const [existing] = await pool.query('SELECT id FROM clients WHERE email = ? OR login = ?', [email, email])
    if (existing.length > 0) return res.status(409).json({ error: 'Acest email este deja înregistrat' })

    const id = 'c-' + crypto.randomBytes(6).toString('hex')
    const hash = await bcrypt.hash(password, 10)
    await pool.query('INSERT INTO clients (id, name, login, email, password_hash) VALUES (?, ?, ?, ?, ?)', [
      id,
      name,
      email,
      email,
      hash,
    ])
    res.status(201).json(issueClientToken({ id, name }))
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Acest email este deja înregistrat' })
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// Вход/регистрация через Google: проверяем ID-токен у Google
app.post('/auth/google', loginLimiter, async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(501).json({ error: 'Google login is not configured' })

    const info = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(req.body.credential || '')
    ).then((r) => (r.ok ? r.json() : null))

    if (!info || info.aud !== process.env.GOOGLE_CLIENT_ID || String(info.email_verified) !== 'true') {
      return res.status(401).json({ error: 'Google token invalid' })
    }

    const email = info.email.toLowerCase()
    const [rows] = await pool.query('SELECT id, name FROM clients WHERE email = ? OR login = ? LIMIT 1', [email, email])
    if (rows.length > 0) return res.json(issueClientToken(rows[0]))

    const id = 'c-' + crypto.randomBytes(6).toString('hex')
    const name = info.name || email
    await pool.query('INSERT INTO clients (id, name, login, email) VALUES (?, ?, ?, ?)', [id, name, email, email])
    res.status(201).json(issueClientToken({ id, name }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// --- Заказы ---

const PAYMENT_METHODS = ['cash', 'invoice', 'card']

app.post('/orders', requireRole('client'), async (req, res) => {
  try {
    const { items, contactName, phone, address, comment, paymentMethod } = req.body
    if (!PAYMENT_METHODS.includes(paymentMethod)) return res.status(400).json({ error: 'Metodă de plată invalidă' })
    if (paymentMethod === 'card' && !stripe) return res.status(501).json({ error: 'Plata cu cardul nu este configurată' })
    if (!contactName || !phone || !address) return res.status(400).json({ error: 'Completați datele de livrare' })
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Coșul este gol' })

    // Цены пересчитываем на сервере по прайсу клиента — доверять цене из браузера нельзя
    const catalog = await buildCatalog(req.user.clientId)
    const byId = new Map(catalog.map((p) => [p.id, p]))

    const lines = []
    for (const item of items) {
      const product = byId.get(Number(item.productId))
      const qty = parseInt(item.qty)
      if (!product || !Number.isInteger(qty) || qty < 1 || qty > 100000) {
        return res.status(400).json({ error: 'Produs sau cantitate invalidă' })
      }
      if (product.saleUnitPriceWithVat === null) {
        return res.status(400).json({ error: 'Produsul nu are preț: ' + product.name })
      }
      if (product.stock !== null && qty > product.stock) {
        return res.status(400).json({ error: 'Stoc insuficient: ' + product.name })
      }
      lines.push({ product, qty, unitPrice: product.saleUnitPriceWithVat })
    }

    const total = round2(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0))

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [result] = await conn.query(
        `INSERT INTO orders (client_id, status, payment_method, contact_name, phone, address, comment, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.clientId,
          paymentMethod === 'card' ? 'pending_payment' : 'new',
          paymentMethod,
          contactName,
          phone,
          address,
          comment || null,
          total,
        ]
      )
      for (const l of lines) {
        await conn.query(
          `INSERT INTO order_items (order_id, product_id, product_name, sale_unit, qty, unit_price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [result.insertId, l.product.id, l.product.name, l.product.saleUnit, l.qty, l.unitPrice]
        )
        if (l.product.stock !== null) {
          // списываем остаток атомарно: два одновременных заказа не уведут склад в минус
          const [upd] = await conn.query('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?', [
            l.qty,
            l.product.id,
            l.qty,
          ])
          if (upd.affectedRows === 0) {
            await conn.rollback()
            return res.status(400).json({ error: 'Stoc insuficient: ' + l.product.name })
          }
        }
      }
      await conn.commit()

      if (paymentMethod === 'card') {
        try {
          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: lines.map((l) => ({
              quantity: l.qty,
              price_data: {
                currency: STRIPE_CURRENCY,
                unit_amount: Math.round(l.unitPrice * 100),
                product_data: { name: l.product.name + ' (' + l.product.saleUnit + ')' },
              },
            })),
            metadata: { order_id: String(result.insertId) },
            success_url: FRONTEND_URL + '/?payment=success&order=' + result.insertId,
            cancel_url: FRONTEND_URL + '/?payment=cancelled&order=' + result.insertId,
          })
          await pool.query('UPDATE orders SET stripe_session_id = ? WHERE id = ?', [session.id, result.insertId])
          return res.status(201).json({ id: result.insertId, total, paymentUrl: session.url })
        } catch (err) {
          console.error('Stripe error:', err.message)
          await setOrderStatus(result.insertId, 'cancelled') // вернёт товар на склад
          return res.status(502).json({ error: 'Nu s-a putut iniția plata cu cardul' })
        }
      }

      res.status(201).json({ id: result.insertId, total })
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// Что доступно на фронтенде (например, включена ли оплата картой)
app.get('/config', (req, res) => {
  res.json({ cardPayments: !!stripe, passwordReset: !!mailer })
})

// Статус собственного заказа; для неоплаченного картой заказа уточняем у Stripe
// (работает даже без webhook — например, при локальной разработке)
app.get('/orders/:id', requireRole('client'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, status, total, stripe_session_id FROM orders WHERE id = ? AND client_id = ?', [
      parseInt(req.params.id),
      req.user.clientId,
    ])
    if (rows.length === 0) return res.status(404).json({ error: 'Comanda nu a fost găsită' })
    const order = rows[0]

    if (order.status === 'pending_payment' && order.stripe_session_id && stripe) {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id)
      if (session.payment_status === 'paid') {
        await pool.query("UPDATE orders SET status = 'paid' WHERE id = ? AND status = 'pending_payment'", [order.id])
        order.status = 'paid'
      }
    }
    res.json({ id: order.id, status: order.status, total: Number(order.total) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// Заказы с позициями; clientId = null — все заказы (для админа)
async function loadOrders(clientId) {
  const [orders] = await pool.query(
    `SELECT o.id, o.status, o.payment_method AS paymentMethod, o.contact_name AS contactName, o.phone,
            o.address, o.comment, o.total, o.created_at AS createdAt, c.name AS clientName
     FROM orders o JOIN clients c ON c.id = o.client_id
     ${clientId ? 'WHERE o.client_id = ?' : ''}
     ORDER BY o.id DESC LIMIT 200`,
    clientId ? [clientId] : []
  )
  const ids = orders.map((o) => o.id)
  const [items] = ids.length
    ? await pool.query(
        `SELECT order_id AS orderId, product_name AS name, sale_unit AS saleUnit, qty, unit_price AS unitPrice
         FROM order_items WHERE order_id IN (?)`,
        [ids]
      )
    : [[]]
  return orders.map((o) => ({
    ...o,
    total: Number(o.total),
    items: items.filter((i) => i.orderId === o.id).map((i) => ({ ...i, unitPrice: Number(i.unitPrice) })),
  }))
}

// «Мои заказы» — только заказы вошедшего клиента
app.get('/my/orders', requireRole('client'), async (req, res) => {
  try {
    res.json(await loadOrders(req.user.clientId))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.get('/orders', requireAdmin, async (req, res) => {
  try {
    res.json(await loadOrders(null))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

const ORDER_STATUSES = ['new', 'pending_payment', 'paid', 'confirmed', 'shipped', 'delivered', 'cancelled']

// Меняет статус заказа и поправляет остатки: отмена возвращает товар на склад,
// снятие отмены снова списывает. onlyFrom — менять только если текущий статус такой.
// Возвращает false, если заказа нет (или статус не совпал с onlyFrom).
async function setOrderStatus(orderId, status, onlyFrom = null) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT status FROM orders WHERE id = ? FOR UPDATE', [orderId])
    if (rows.length === 0 || (onlyFrom && rows[0].status !== onlyFrom)) {
      await conn.rollback()
      return false
    }
    const prev = rows[0].status
    const sign = prev !== 'cancelled' && status === 'cancelled' ? 1 : prev === 'cancelled' && status !== 'cancelled' ? -1 : 0
    if (sign !== 0) {
      await conn.query(
        `UPDATE products p JOIN (SELECT product_id, SUM(qty) AS qty FROM order_items WHERE order_id = ? GROUP BY product_id) i
           ON i.product_id = p.id
         SET p.stock = GREATEST(p.stock + ? * i.qty, 0)
         WHERE p.stock IS NOT NULL`,
        [orderId, sign]
      )
    }
    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId])
    await conn.commit()
    return true
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

app.patch('/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Status invalid' })
    const found = await setOrderStatus(parseInt(req.params.id), status)
    if (!found) return res.status(404).json({ error: 'Comanda nu a fost găsită' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// --- Каталог ---

async function buildCatalog(clientId, lang) {
  const trLang = ['ru', 'en'].includes(lang) ? lang : null
  const [defaultLists] = await pool.query('SELECT id FROM price_lists WHERE is_default = TRUE LIMIT 1')
  const defaultListId = defaultLists[0].id

  let activeListId = defaultListId
  if (clientId) {
    const [assignments] = await pool.query(
      'SELECT price_list_id FROM client_assignments WHERE client_id = ?',
      [clientId]
    )
    if (assignments.length > 0) activeListId = assignments[0].price_list_id
  }

  const [rows] = await pool.query(
    `SELECT p.*, tr.name AS tr_name, tr.category AS tr_category, active.price AS active_price, def.price AS default_price,
            UNIX_TIMESTAMP(img.updated_at) AS image_version
     FROM products p
     LEFT JOIN product_translations tr ON tr.product_id = p.id AND tr.lang = ?
     LEFT JOIN product_images img ON img.product_id = p.id
     LEFT JOIN price_list_items active ON active.product_id = p.id AND active.price_list_id = ?
     LEFT JOIN price_list_items def ON def.product_id = p.id AND def.price_list_id = ?
     ORDER BY p.id`,
    [trLang, activeListId, defaultListId]
  )

  const isDefaultActive = activeListId === defaultListId

  const catalog = rows.map((row) => {
    const product = mapProductRow(row)
    let basePrice, priceSource
    if (!isDefaultActive && row.active_price !== null) {
      basePrice = Number(row.active_price)
      priceSource = 'client'
    } else {
      basePrice = row.default_price !== null ? Number(row.default_price) : null
      priceSource = 'default'
    }
    const pricing = calculatePricing(row, basePrice)
    return { ...product, priceSource, ...pricing }
  })

  return catalog
}

app.get('/catalog', async (req, res) => {
  try {
    // Клиент видит только свой прайс; админ может смотреть от имени любого клиента
    const user = readToken(req)
    let clientId = null
    if (user?.role === 'client') clientId = user.clientId
    else if (user?.role === 'admin') clientId = req.query.clientId || null

    res.json(await buildCatalog(clientId, req.query.lang))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.patch('/catalog/:productId/price', requireAdmin, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId)
    const { price } = req.body
    if (typeof price !== 'number' || price < 0) {
      return res.status(400).json({ error: 'Некорректная цена' })
    }

    const [defaultLists] = await pool.query('SELECT id FROM price_lists WHERE is_default = TRUE LIMIT 1')
    const defaultListId = defaultLists[0].id

    await pool.query(
      `INSERT INTO price_list_items (price_list_id, product_id, price) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price)`,
      [defaultListId, productId, price]
    )

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.post('/catalog/products', requireAdmin, async (req, res) => {
  try {
    const errors = validateProductRow(req.body)
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') })

    const { code, name, category, baseUnit, saleUnit, saleUnitFactor, vatRate, price } = req.body

    const [defaultLists] = await pool.query('SELECT id FROM price_lists WHERE is_default = TRUE LIMIT 1')
    const defaultListId = defaultLists[0].id

    const [result] = await pool.query(
      `INSERT INTO products (code, name, category, base_unit, sale_unit, sale_unit_factor, vat_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, name, category, baseUnit || 'buc', saleUnit || 'bax', parseFloat(saleUnitFactor), parseFloat(vatRate)]
    )

    await pool.query(
      `INSERT INTO price_list_items (price_list_id, product_id, price) VALUES (?, ?, ?)`,
      [defaultListId, result.insertId, parseFloat(price)]
    )

    autoTranslateProduct(result.insertId, name, category)
    res.status(201).json({ id: result.insertId, code, name, category })
  } catch (err) {
    console.error(err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Товар с таким кодом уже существует' })
    }
    res.status(500).json({ error: 'Eroare server' })
  }
})

// --- Редактирование товара (админка) ---

app.get('/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id])
    if (rows.length === 0) return res.status(404).json({ error: 'Produsul nu a fost găsit' })
    const [tr] = await pool.query('SELECT lang, name, category FROM product_translations WHERE product_id = ?', [id])
    const p = rows[0]
    res.json({
      id: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
      baseUnit: p.base_unit,
      saleUnit: p.sale_unit,
      saleUnitFactor: Number(p.sale_unit_factor),
      vatRate: Number(p.vat_rate),
      stock: p.stock === null ? null : Number(p.stock),
      translations: Object.fromEntries(tr.map((t) => [t.lang, { name: t.name, category: t.category }])),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.put('/catalog/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const b = req.body
    const code = String(b.code || '').trim()
    const name = String(b.name || '').trim()
    const category = String(b.category || '').trim()
    const saleUnit = String(b.saleUnit || 'bax').trim()
    const saleUnitFactor = parseFloat(b.saleUnitFactor)
    const vatRate = parseFloat(b.vatRate)
    const stock = b.stock === null || b.stock === '' || b.stock === undefined ? null : Number(b.stock)

    if (!code || !name || !category) return res.status(400).json({ error: 'Completați codul, denumirea și categoria' })
    if (isNaN(saleUnitFactor) || saleUnitFactor <= 0) return res.status(400).json({ error: 'Coeficient invalid' })
    if (isNaN(vatRate) || vatRate < 0 || vatRate > 100) return res.status(400).json({ error: 'cotă TVA invalidă' })
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return res.status(400).json({ error: 'Stoc invalid' })

    const [before] = await pool.query('SELECT name, category FROM products WHERE id = ?', [id])
    if (before.length === 0) return res.status(404).json({ error: 'Produsul nu a fost găsit' })

    await pool.query(
      `UPDATE products SET code = ?, name = ?, category = ?, sale_unit = ?, sale_unit_factor = ?, vat_rate = ?, stock = ?
       WHERE id = ?`,
      [code, name, category, saleUnit, saleUnitFactor, vatRate, stock, id]
    )

    // переводы: сохраняем то, что ввёл админ; пустые поля — переводим автоматически
    const tr = b.translations || {}
    const manual = ['ru', 'en'].filter((lang) => tr[lang]?.name?.trim())
    for (const lang of manual) {
      await pool.query(
        `INSERT INTO product_translations (product_id, lang, name, category) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category)`,
        [id, lang, tr[lang].name.trim().slice(0, 255), (tr[lang].category || '').trim().slice(0, 100) || category]
      )
    }
    const changed = before[0].name !== name || before[0].category !== category
    if (manual.length < 2 && changed) {
      await pool.query('DELETE FROM product_translations WHERE product_id = ? AND lang NOT IN (?)', [id, manual.length ? manual : ['-']])
      autoTranslateProduct(id, name, category).then(async () => {
        // автоперевод не должен перезаписать то, что админ ввёл вручную
        for (const lang of manual) {
          await pool.query('UPDATE product_translations SET name = ?, category = ? WHERE product_id = ? AND lang = ?', [
            tr[lang].name.trim().slice(0, 255),
            (tr[lang].category || '').trim().slice(0, 100) || category,
            id,
            lang,
          ])
        }
      })
    }

    res.json({ success: true })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Produs cu acest cod există deja' })
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// Удаление товара: цены, переводы и фото удаляются каскадно,
// в старых заказах остаются название и цена на момент покупки
app.delete('/catalog/products/:id', requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM products WHERE id = ?', [parseInt(req.params.id)])
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Produsul nu a fost găsit' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.post('/catalog/products/bulk', requireAdmin, async (req, res) => {
  try {
    const rows = req.body.rows || []

    const [defaultLists] = await pool.query('SELECT id FROM price_lists WHERE is_default = TRUE LIMIT 1')
    const defaultListId = defaultLists[0].id

    let imported = 0
    const toTranslate = []
    const rowErrors = []

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const errors = validateProductRow(row)
      if (errors.length > 0) {
        rowErrors.push({ row: index + 1, code: row.code || '(нет кода)', errors })
        continue
      }

      try {
        const [result] = await pool.query(
          `INSERT INTO products (code, name, category, base_unit, sale_unit, sale_unit_factor, vat_rate)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [row.code, row.name, row.category, row.baseUnit || 'buc', row.saleUnit || 'bax', parseFloat(row.saleUnitFactor), parseFloat(row.vatRate)]
        )
        await pool.query(
          `INSERT INTO price_list_items (price_list_id, product_id, price) VALUES (?, ?, ?)`,
          [defaultListId, result.insertId, parseFloat(row.price)]
        )
        imported++
        toTranslate.push([result.insertId, row.name, row.category])
      } catch (err) {
        rowErrors.push({ row: index + 1, code: row.code, errors: ['дубликат кода или ошибка записи'] })
      }
    }

    // переводим импортированные товары в фоне, по одному, чтобы не превысить лимиты сервиса
    ;(async () => {
      for (const [id, name, category] of toTranslate) await autoTranslateProduct(id, name, category)
    })()

    res.json({ imported, total: rows.length, errors: rowErrors })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// --- Прайс-листы ---

app.get('/price-lists', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT pl.id, pl.name, pl.is_default AS isDefault, COUNT(ca.client_id) AS clientCount
      FROM price_lists pl
      LEFT JOIN client_assignments ca ON ca.price_list_id = pl.id
      GROUP BY pl.id, pl.name, pl.is_default
      ORDER BY pl.id
    `)
    res.json(rows.map((r) => ({ ...r, isDefault: !!r.isDefault })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.post('/price-lists', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'Numele este obligatoriu' })
    const [result] = await pool.query(`INSERT INTO price_lists (name, is_default) VALUES (?, FALSE)`, [name])
    res.status(201).json({ id: result.insertId, name, isDefault: false })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.put('/price-lists/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'Numele este obligatoriu' })
    const [result] = await pool.query('UPDATE price_lists SET name = ? WHERE id = ?', [name, id])
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Lista nu a fost găsită' })
    res.json({ id, name })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.delete('/price-lists/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const [lists] = await pool.query('SELECT * FROM price_lists WHERE id = ?', [id])
    if (lists.length === 0) return res.status(404).json({ error: 'Lista nu a fost găsită' })
    if (lists[0].is_default) return res.status(400).json({ error: 'Nu poți șterge lista implicită' })

    const [defaultLists] = await pool.query('SELECT id FROM price_lists WHERE is_default = TRUE LIMIT 1')
    const defaultListId = defaultLists[0].id

    await pool.query('UPDATE client_assignments SET price_list_id = ? WHERE price_list_id = ?', [defaultListId, id])
    await pool.query('DELETE FROM price_lists WHERE id = ?', [id])

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// --- Клиенты ---

app.get('/clients', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.name, c.email, ca.price_list_id AS priceListId
      FROM clients c
      LEFT JOIN client_assignments ca ON ca.client_id = c.id
      ORDER BY c.name
    `)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.post('/price-lists/:id/assign', requireAdmin, async (req, res) => {
  try {
    const listId = parseInt(req.params.id)
    const { clientIds } = req.body
    if (!Array.isArray(clientIds)) return res.status(400).json({ error: 'clientIds trebuie să fie un array' })

    for (const clientId of clientIds) {
      await pool.query(
        `INSERT INTO client_assignments (client_id, price_list_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE price_list_id = VALUES(price_list_id)`,
        [clientId, listId]
      )
    }
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// --- Позиции листа + сравнение с базовым ---

app.get('/price-lists/:id/items', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const [lists] = await pool.query('SELECT * FROM price_lists WHERE id = ?', [id])
    if (lists.length === 0) return res.status(404).json({ error: 'Lista nu a fost găsită' })
    const list = lists[0]

    const [defaultLists] = await pool.query('SELECT id FROM price_lists WHERE is_default = TRUE LIMIT 1')
    const defaultListId = defaultLists[0].id

    const [rows] = await pool.query(
      `SELECT p.id AS productId, p.code, p.name, p.category, p.vat_rate AS vatRate,
              item.price AS itemPrice, def.price AS basePrice
       FROM products p
       LEFT JOIN price_list_items item ON item.product_id = p.id AND item.price_list_id = ?
       LEFT JOIN price_list_items def ON def.product_id = p.id AND def.price_list_id = ?
       ORDER BY p.id`,
      [id, defaultListId]
    )

    const items = rows.map((row) => {
      const basePrice = row.basePrice !== null ? Number(row.basePrice) : null
      const isOverridden = row.itemPrice !== null && !list.is_default
      const price = isOverridden ? Number(row.itemPrice) : basePrice
      const diffAmount = isOverridden && basePrice !== null ? round2(price - basePrice) : 0
      const diffPercent = isOverridden && basePrice ? round2(((price - basePrice) / basePrice) * 100) : 0

      return {
        productId: row.productId,
        code: row.code,
        name: row.name,
        category: row.category,
        vatRate: Number(row.vatRate),
        price,
        basePrice,
        isOverridden,
        diffAmount,
        diffPercent,
      }
    })

    res.json(items)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.post('/price-lists/:id/discount', requireAdmin, async (req, res) => {
  try {
    const listId = parseInt(req.params.id)
    const { category, percent, apply } = req.body

    if (typeof percent !== 'number' || percent <= 0 || percent >= 100) {
      return res.status(400).json({ error: 'Procent invalid' })
    }

    const [defaultLists] = await pool.query('SELECT id FROM price_lists WHERE is_default = TRUE LIMIT 1')
    const defaultListId = defaultLists[0].id

    const [rows] = await pool.query(
      `SELECT p.id AS productId, p.name, item.price AS itemPrice, def.price AS defaultPrice
       FROM products p
       LEFT JOIN price_list_items item ON item.product_id = p.id AND item.price_list_id = ?
       LEFT JOIN price_list_items def ON def.product_id = p.id AND def.price_list_id = ?
       WHERE p.category = ?`,
      [listId, defaultListId, category]
    )

    const preview = rows.map((row) => {
      const basePrice = row.itemPrice !== null ? Number(row.itemPrice) : row.defaultPrice !== null ? Number(row.defaultPrice) : null
      const newPrice = basePrice !== null ? round2(basePrice * (1 - percent / 100)) : null
      return { productId: row.productId, name: row.name, oldPrice: basePrice, newPrice }
    })

    if (apply) {
      for (const p of preview) {
        if (p.newPrice === null) continue
        await pool.query(
          `INSERT INTO price_list_items (price_list_id, product_id, price) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE price = VALUES(price)`,
          [listId, p.productId, p.newPrice]
        )
      }
    }

    res.json({ preview, applied: !!apply })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// --- Фото товаров (хранятся в базе, чтобы не зависеть от внешних сервисов) ---

const IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png']
const MAX_IMAGE_BYTES = 1024 * 1024

app.get('/products/:id/image', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT mime, data FROM product_images WHERE product_id = ?', [parseInt(req.params.id)])
    if (rows.length === 0) return res.status(404).end()
    // URL содержит ?v=<время изменения>, поэтому картинку можно кэшировать надолго
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    res.type(rows[0].mime).send(rows[0].data)
  } catch (err) {
    console.error(err)
    res.status(500).end()
  }
})

app.put('/products/:id/image', requireAdmin, async (req, res) => {
  try {
    const { mime, data } = req.body
    if (!IMAGE_TYPES.includes(mime) || typeof data !== 'string') return res.status(400).json({ error: 'Imagine invalidă' })
    const buffer = Buffer.from(data, 'base64')
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: 'Imaginea este prea mare' })

    const productId = parseInt(req.params.id)
    const [products] = await pool.query('SELECT id FROM products WHERE id = ?', [productId])
    if (products.length === 0) return res.status(404).json({ error: 'Produsul nu a fost găsit' })

    await pool.query(
      `INSERT INTO product_images (product_id, mime, data) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
      [productId, mime, buffer]
    )
    const [[row]] = await pool.query('SELECT UNIX_TIMESTAMP(updated_at) AS v FROM product_images WHERE product_id = ?', [productId])
    res.json({ imageVersion: Number(row.v) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.delete('/products/:id/image', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM product_images WHERE product_id = ?', [parseInt(req.params.id)])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// --- Клиенты (админка) ---

function makePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join('')
}

app.get('/admin/clients', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.name, c.login, c.email, (c.password_hash IS NOT NULL) AS hasPassword,
             ca.price_list_id AS priceListId,
             COUNT(o.id) AS orderCount, COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.total END), 0) AS orderTotal
      FROM clients c
      LEFT JOIN client_assignments ca ON ca.client_id = c.id
      LEFT JOIN orders o ON o.client_id = c.id
      GROUP BY c.id, c.name, c.login, c.email, c.password_hash, ca.price_list_id
      ORDER BY c.name
    `)
    res.json(
      rows.map((r) => ({ ...r, hasPassword: !!r.hasPassword, orderCount: Number(r.orderCount), orderTotal: Number(r.orderTotal) }))
    )
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// Новый пароль клиенту: показывается админу один раз, в базе хранится только хэш
app.post('/admin/clients/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const password = makePassword()
    const hash = await bcrypt.hash(password, 10)
    const [result] = await pool.query('UPDATE clients SET password_hash = ? WHERE id = ?', [hash, req.params.id])
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Client negăsit' })
    await pool.query('DELETE FROM password_resets WHERE client_id = ?', [req.params.id])
    res.json({ password })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.delete('/admin/clients/:id', requireAdmin, async (req, res) => {
  try {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM orders WHERE client_id = ?', [req.params.id])
    // заказы — история продаж, поэтому клиента с заказами не удаляем
    if (n > 0) return res.status(400).json({ error: 'Clientul are comenzi și nu poate fi șters' })
    const [result] = await pool.query('DELETE FROM clients WHERE id = ?', [req.params.id])
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Client negăsit' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

// --- Восстановление пароля по почте ---

const RESET_MAIL = {
  ru: {
    subject: 'Восстановление пароля — Catalog',
    text: (link) => `Чтобы задать новый пароль, откройте ссылку (действует 1 час):\n${link}\n\nЕсли вы не запрашивали восстановление, просто проигнорируйте это письмо.`,
  },
  ro: {
    subject: 'Resetarea parolei — Catalog',
    text: (link) => `Pentru a seta o parolă nouă, deschideți linkul (valabil 1 oră):\n${link}\n\nDacă nu ați solicitat resetarea, ignorați acest mesaj.`,
  },
  en: {
    subject: 'Password reset — Catalog',
    text: (link) => `To set a new password, open this link (valid for 1 hour):\n${link}\n\nIf you did not request a reset, just ignore this email.`,
  },
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')
const forgotLimiter = rateLimit({ max: 5, windowMs: 60 * 60 * 1000 })

app.post('/password/forgot', forgotLimiter, async (req, res) => {
  try {
    if (!mailer) return res.status(501).json({ error: 'Resetarea parolei nu este configurată' })
    const email = String(req.body.email || '').trim().toLowerCase()
    const mail = RESET_MAIL[req.body.lang] || RESET_MAIL.ro

    const [rows] = await pool.query('SELECT id FROM clients WHERE email = ? OR login = ? LIMIT 1', [email, email])
    // Ответ всегда одинаковый, чтобы по нему нельзя было узнать, зарегистрирован ли email
    if (rows.length > 0 && email) {
      const token = crypto.randomBytes(32).toString('hex')
      await pool.query('DELETE FROM password_resets WHERE client_id = ? OR expires_at < NOW()', [rows[0].id])
      await pool.query('INSERT INTO password_resets (token_hash, client_id, expires_at) VALUES (?, ?, NOW() + INTERVAL 1 HOUR)', [
        hashToken(token),
        rows[0].id,
      ])
      const link = `${FRONTEND_URL}/#/reset/${token}`
      await mailer.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: email,
        subject: mail.subject,
        text: mail.text(link),
      })
    }
    res.json({ success: true })
  } catch (err) {
    console.error('Password reset mail error:', err.message)
    res.status(500).json({ error: 'Eroare server' })
  }
})

app.post('/password/reset', loginLimiter, async (req, res) => {
  try {
    const password = String(req.body.password || '')
    if (password.length < 8) return res.status(400).json({ error: 'Parola trebuie să aibă minim 8 caractere' })

    const [rows] = await pool.query(
      `SELECT r.client_id, c.name FROM password_resets r JOIN clients c ON c.id = r.client_id
       WHERE r.token_hash = ? AND r.expires_at > NOW()`,
      [hashToken(String(req.body.token || ''))]
    )
    if (rows.length === 0) return res.status(400).json({ error: 'Linkul a expirat sau este invalid' })

    const hash = await bcrypt.hash(password, 10)
    await pool.query('UPDATE clients SET password_hash = ? WHERE id = ?', [hash, rows[0].client_id])
    await pool.query('DELETE FROM password_resets WHERE client_id = ?', [rows[0].client_id])
    // сразу входим, чтобы не заставлять вводить новый пароль ещё раз
    res.json(issueClientToken({ id: rows[0].client_id, name: rows[0].name }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Eroare server' })
  }
})

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })

  // Бесплатный Render усыпляет сервер после 15 минут без запросов, и первый вход длится ~минуту.
  // Сервер сам себя пингует каждые 10 минут (RENDER_EXTERNAL_URL Render задаёт автоматически).
  // Отключить: KEEP_ALIVE=off
  const selfUrl = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL
  if (selfUrl && process.env.KEEP_ALIVE !== 'off') {
    setInterval(() => {
      fetch(selfUrl.replace(/\/+$/, '') + '/config').catch(() => {})
    }, 10 * 60 * 1000)
    console.log('Keep-alive enabled for', selfUrl)
  }
}

module.exports = app