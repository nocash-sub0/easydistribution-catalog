const express = require('express')
const cors = require('cors')
const pool = require('./db')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { autoTranslateProduct } = require('./translate')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())

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
        await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending_payment'", [orderId])
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
    baseUnit: row.base_unit,
    saleUnit: row.sale_unit,
    saleUnitFactor: Number(row.sale_unit_factor),
    vatRate: Number(row.vat_rate),
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

// Единый вход: логин админа из .env либо логин клиента из таблицы clients
app.post('/login', async (req, res) => {
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

app.post('/register', async (req, res) => {
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
app.post('/auth/google', async (req, res) => {
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
          await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [result.insertId])
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
  res.json({ cardPayments: !!stripe })
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

app.get('/orders', requireAdmin, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.id, o.status, o.payment_method AS paymentMethod, o.contact_name AS contactName, o.phone,
              o.address, o.comment, o.total, o.created_at AS createdAt, c.name AS clientName
       FROM orders o JOIN clients c ON c.id = o.client_id
       ORDER BY o.id DESC LIMIT 200`
    )
    const ids = orders.map((o) => o.id)
    const [items] = ids.length
      ? await pool.query(
          `SELECT order_id AS orderId, product_name AS name, sale_unit AS saleUnit, qty, unit_price AS unitPrice
           FROM order_items WHERE order_id IN (?)`,
          [ids]
        )
      : [[]]
    res.json(
      orders.map((o) => ({
        ...o,
        total: Number(o.total),
        items: items.filter((i) => i.orderId === o.id).map((i) => ({ ...i, unitPrice: Number(i.unitPrice) })),
      }))
    )
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
    `SELECT p.*, tr.name AS tr_name, tr.category AS tr_category, active.price AS active_price, def.price AS default_price
     FROM products p
     LEFT JOIN product_translations tr ON tr.product_id = p.id AND tr.lang = ?
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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

module.exports = app