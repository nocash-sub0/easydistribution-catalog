const express = require('express')
const cors = require('cors')
const pool = require('./db')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
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
    name: row.name,
    category: row.category,
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

// --- Каталог ---

app.get('/catalog', async (req, res) => {
  try {
    // Клиент видит только свой прайс; админ может смотреть от имени любого клиента
    const user = readToken(req)
    let clientId = null
    if (user?.role === 'client') clientId = user.clientId
    else if (user?.role === 'admin') clientId = req.query.clientId || null

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
      `SELECT p.*, active.price AS active_price, def.price AS default_price
       FROM products p
       LEFT JOIN price_list_items active ON active.product_id = p.id AND active.price_list_id = ?
       LEFT JOIN price_list_items def ON def.product_id = p.id AND def.price_list_id = ?
       ORDER BY p.id`,
      [activeListId, defaultListId]
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

    res.json(catalog)
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
      } catch (err) {
        rowErrors.push({ row: index + 1, code: row.code, errors: ['дубликат кода или ошибка записи'] })
      }
    }

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
      SELECT c.id, c.name, ca.price_list_id AS priceListId
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