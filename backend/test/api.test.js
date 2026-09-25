// Автотесты API. Запуск: npm test (из папки backend).
// Работают на отдельной базе catalog_test, которая пересоздаётся перед запуском.
// Почта и бесплатный переводчик подменяются: настоящие письма не отправляются, сеть не нужна.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const zlib = require('zlib')
const { prepareTestDatabase, TEST_DB } = require('./setup')

// --- окружение: тестовая база, без Stripe, почта в память ---
process.env.DB_NAME = TEST_DB
process.env.STRIPE_SECRET_KEY = ''
process.env.STRIPE_WEBHOOK_SECRET = ''
process.env.SMTP_HOST = 'smtp.test'
process.env.SMTP_USER = 'shop@test.local'
process.env.SMTP_PASS = 'test'
process.env.ADMIN_EMAIL = 'admin@test.local'
process.env.FRONTEND_URL = 'http://shop.test'
process.env.RATE_LIMIT_SCALE = '4' // тесты шлют много запросов с одного IP

const sentMails = []
require('nodemailer').createTransport = () => ({ sendMail: async (mail) => sentMails.push(mail) })

// бесплатный переводчик MyMemory → предсказуемый ответ без сети
const realFetch = global.fetch
global.fetch = async (url, options) => {
  if (String(url).includes('api.mymemory.translated.net')) {
    const params = new URL(url).searchParams
    const to = params.get('langpair').split('|')[1]
    const text = params.get('q')
    return new Response(JSON.stringify({ responseData: { translatedText: `${to.toUpperCase()}:${text}` } }))
  }
  return realFetch(url, options)
}

let server, base, pool, adminToken

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await realFetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data, headers: res.headers }
}

let userCounter = 0
async function registerClient(name = 'Test Client') {
  const email = `client${++userCounter}.${Date.now()}@test.local`
  const res = await api('/register', { method: 'POST', body: { name, email, password: 'password123' } })
  assert.equal(res.status, 201, JSON.stringify(res.data))
  return { email, token: res.data.token }
}

async function waitFor(check, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const result = await check()
    if (result) return result
    await wait(50)
  }
  return check()
}

const orderBody = (items, extra = {}) => ({
  items,
  contactName: 'Ion Test',
  phone: '060000000',
  address: 'Chișinău, str. Test 1',
  paymentMethod: 'cash',
  ...extra,
})

before(async () => {
  await prepareTestDatabase()
  const app = require('../servers')
  pool = require('../db')
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`

  const login = await api('/login', {
    method: 'POST',
    body: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD },
  })
  assert.equal(login.status, 200, 'вход админа')
  adminToken = login.data.token
})

after(async () => {
  server?.close()
  await pool?.end()
})

test('каталог открыт гостям, сжимается и переводится', async () => {
  const ro = await api('/catalog')
  assert.equal(ro.status, 200)
  assert.equal(ro.data.length, 40)
  assert.equal(ro.data[0].name, 'Pâine albă')
  assert.equal(ro.data[0].categoryCode, 'Panificație')

  const ru = await api('/catalog?lang=ru')
  assert.equal(ru.data[0].name, 'Белый хлеб')
  assert.equal(ru.data[0].category, 'Хлебобулочные изделия')

  const raw = await realFetch(base + '/catalog', { headers: { 'accept-encoding': 'gzip' } })
  assert.equal(raw.headers.get('content-encoding'), 'gzip')
})

test('админские маршруты закрыты для гостей и клиентов', async () => {
  const client = await registerClient()
  for (const path of ['/orders', '/clients', '/admin/clients', '/price-lists']) {
    assert.equal((await api(path)).status, 401, `${path} без токена`)
    assert.equal((await api(path, { token: client.token })).status, 403, `${path} с токеном клиента`)
    assert.equal((await api(path, { token: adminToken })).status, 200, `${path} с токеном админа`)
  }
})

test('регистрация и вход', async () => {
  assert.equal((await api('/register', { method: 'POST', body: { name: 'X', email: 'bad', password: 'password123' } })).status, 400)
  assert.equal((await api('/register', { method: 'POST', body: { name: 'X', email: 'a@b.md', password: 'short' } })).status, 400)

  const { email } = await registerClient('Maria')
  const dup = await api('/register', { method: 'POST', body: { name: 'Maria', email, password: 'password123' } })
  assert.equal(dup.status, 409)

  const ok = await api('/login', { method: 'POST', body: { username: email.toUpperCase(), password: 'password123' } })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.role, 'client')
  assert.equal((await api('/login', { method: 'POST', body: { username: email, password: 'wrong-pass' } })).status, 401)
})

test('заказ: цена считается на сервере, клиент видит только свои заказы', async () => {
  const a = await registerClient('Client A')
  const b = await registerClient('Client B')
  const catalog = (await api('/catalog', { token: a.token })).data
  const product = catalog[0]

  // подделанная цена из браузера игнорируется
  const res = await api('/orders', { method: 'POST', token: a.token, body: orderBody([{ productId: product.id, qty: 2, price: 0.01 }]) })
  assert.equal(res.status, 201, JSON.stringify(res.data))
  assert.equal(res.data.total, Math.round(2 * product.saleUnitPriceWithVat * 100) / 100)

  assert.equal((await api('/orders', { method: 'POST', token: a.token, body: orderBody([{ productId: product.id, qty: 0 }]) })).status, 400)
  assert.equal((await api('/orders', { method: 'POST', token: a.token, body: orderBody([], {}) })).status, 400)
  assert.equal((await api('/orders', { method: 'POST', body: orderBody([{ productId: product.id, qty: 1 }]) })).status, 401)

  const mineA = (await api('/my/orders', { token: a.token })).data
  assert.equal(mineA.length, 1)
  assert.equal((await api('/my/orders', { token: b.token })).data.length, 0)
  assert.equal((await api(`/orders/${res.data.id}`, { token: b.token })).status, 404, 'чужой заказ недоступен')
})

test('остатки: списание, нехватка, возврат при отмене', async () => {
  const client = await registerClient()
  const product = (await api('/catalog')).data[5]
  const edit = await api(`/admin/products/${product.id}`, { token: adminToken })
  const put = await api(`/catalog/products/${product.id}`, {
    method: 'PUT',
    token: adminToken,
    body: { ...edit.data, stock: 5, translations: edit.data.translations },
  })
  assert.equal(put.status, 200, JSON.stringify(put.data))

  const stock = async () => (await api('/catalog')).data.find((p) => p.id === product.id).stock
  const o1 = await api('/orders', { method: 'POST', token: client.token, body: orderBody([{ productId: product.id, qty: 3 }]) })
  assert.equal(o1.status, 201)
  assert.equal(await stock(), 2)

  const tooMany = await api('/orders', { method: 'POST', token: client.token, body: orderBody([{ productId: product.id, qty: 3 }]) })
  assert.equal(tooMany.status, 400)
  assert.match(tooMany.data.error, /^Stoc insuficient/)

  const setStatus = (status) => api(`/orders/${o1.data.id}/status`, { method: 'PATCH', token: adminToken, body: { status } })
  assert.equal((await setStatus('cancelled')).status, 200)
  assert.equal(await stock(), 5, 'отмена возвращает товар')
  await setStatus('cancelled')
  assert.equal(await stock(), 5, 'повторная отмена ничего не меняет')
  await setStatus('confirmed')
  assert.equal(await stock(), 2, 'снятие отмены снова списывает')
  assert.equal((await setStatus('weird')).status, 400)
  assert.equal((await api('/orders/999999/status', { method: 'PATCH', token: adminToken, body: { status: 'shipped' } })).status, 404)
})

test('письма о новом заказе: админу и клиенту на его языке', async () => {
  const client = await registerClient('Mail Client')
  sentMails.length = 0
  const product = (await api('/catalog')).data[1]
  const res = await api('/orders', { method: 'POST', token: client.token, body: orderBody([{ productId: product.id, qty: 1 }], { lang: 'en' }) })
  assert.equal(res.status, 201)

  await waitFor(() => sentMails.length >= 2)
  const adminMail = sentMails.find((m) => m.to === 'admin@test.local')
  const clientMail = sentMails.find((m) => m.to === client.email)
  assert.ok(adminMail, 'письмо админу')
  assert.match(adminMail.subject, new RegExp(`№${res.data.id}`))
  assert.ok(clientMail, 'письмо клиенту')
  assert.match(clientMail.subject, /Your order/)
  assert.match(clientMail.text, new RegExp(product.name))
})

test('редактирование товара: ручной и автоматический перевод, описание, удаление', async () => {
  const created = await api('/catalog/products', {
    method: 'POST',
    token: adminToken,
    body: { code: 'T-EDIT', name: 'Lapte Test 1L', category: 'Lactate', saleUnit: 'bax', saleUnitFactor: 12, vatRate: 8, price: 10 },
  })
  assert.equal(created.status, 201)
  const id = created.data.id
  const current = (await api(`/admin/products/${id}`, { token: adminToken })).data

  const put = await api(`/catalog/products/${id}`, {
    method: 'PUT',
    token: adminToken,
    body: {
      ...current,
      name: 'Lapte Nou 1L',
      description: 'Lapte proaspăt de vacă.',
      translations: { ru: { name: 'Новое молоко 1 л', category: '', description: '' }, en: { name: '', category: '', description: '' } },
    },
  })
  assert.equal(put.status, 200)

  // EN переводится автоматически в фоне, RU остаётся как ввёл админ
  const tr = await waitFor(async () => {
    const p = (await api(`/admin/products/${id}`, { token: adminToken })).data
    return p.translations.en?.description ? p.translations : null
  })
  assert.equal(tr.ru.name, 'Новое молоко 1 л')
  // «Lapte» — из словаря, «Nou» с заглавной буквы считается брендом и не переводится
  assert.equal(tr.en.name, 'Milk Nou 1 L')
  assert.equal(tr.en.description, 'EN:Lapte proaspăt de vacă.')

  const desc = await api(`/products/${id}/description?lang=en`)
  assert.equal(desc.data.description, 'EN:Lapte proaspăt de vacă.')
  assert.equal((await api(`/products/${id}/description`)).data.description, 'Lapte proaspăt de vacă.')

  const dupCode = await api(`/catalog/products/${id}`, { method: 'PUT', token: adminToken, body: { ...current, code: 'P001' } })
  assert.equal(dupCode.status, 400)

  assert.equal((await api(`/catalog/products/${id}`, { method: 'DELETE', token: adminToken })).status, 200)
  assert.equal((await api(`/admin/products/${id}`, { token: adminToken })).status, 404)
})

test('фото товара: загрузка, выдача с кэшированием, удаление', async () => {
  const productId = (await api('/catalog')).data[2].id
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  assert.equal((await api(`/products/${productId}/image`, { method: 'PUT', body: { mime: 'image/png', data: png } })).status, 401)
  assert.equal((await api(`/products/${productId}/image`, { method: 'PUT', token: adminToken, body: { mime: 'text/html', data: png } })).status, 400)

  const up = await api(`/products/${productId}/image`, { method: 'PUT', token: adminToken, body: { mime: 'image/png', data: png } })
  assert.equal(up.status, 200)
  assert.equal((await api('/catalog')).data.find((p) => p.id === productId).imageVersion, up.data.imageVersion)

  const img = await realFetch(`${base}/products/${productId}/image?v=${up.data.imageVersion}`)
  assert.equal(img.status, 200)
  assert.equal(img.headers.get('content-type'), 'image/png')
  assert.match(img.headers.get('cache-control'), /immutable/)

  assert.equal((await api(`/products/${productId}/image`, { method: 'DELETE', token: adminToken })).status, 200)
  assert.equal((await realFetch(`${base}/products/${productId}/image`)).status, 404)
})

test('клиенты в админке: новый пароль, удаление только без заказов', async () => {
  const client = await registerClient('Admin Managed')
  const list = (await api('/admin/clients', { token: adminToken })).data
  const row = list.find((c) => c.email === client.email)
  assert.ok(row)

  const reset = await api(`/admin/clients/${row.id}/reset-password`, { method: 'POST', token: adminToken })
  assert.equal(reset.status, 200)
  assert.equal((await api('/login', { method: 'POST', body: { username: client.email, password: reset.data.password } })).status, 200)

  const withOrders = list.find((c) => c.orderCount > 0)
  assert.ok(withOrders, 'есть клиент с заказами из предыдущих тестов')
  assert.equal((await api(`/admin/clients/${withOrders.id}`, { method: 'DELETE', token: adminToken })).status, 400)
  assert.equal((await api(`/admin/clients/${row.id}`, { method: 'DELETE', token: adminToken })).status, 200)
})

test('восстановление пароля по почте', async () => {
  const client = await registerClient('Forgetful')
  sentMails.length = 0

  assert.equal((await api('/password/forgot', { method: 'POST', body: { email: 'nobody@test.local', lang: 'ru' } })).status, 200)
  assert.equal(sentMails.length, 0, 'на незарегистрированный адрес письмо не уходит')

  assert.equal((await api('/password/forgot', { method: 'POST', body: { email: client.email, lang: 'ru' } })).status, 200)
  assert.equal(sentMails.length, 1)
  assert.match(sentMails[0].subject, /Восстановление пароля/)
  const token = sentMails[0].text.match(/#\/reset\/([a-f0-9]{64})/)[1]

  assert.equal((await api('/password/reset', { method: 'POST', body: { token, password: 'short' } })).status, 400)
  const ok = await api('/password/reset', { method: 'POST', body: { token, password: 'newpassword123' } })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.role, 'client')
  assert.equal((await api('/password/reset', { method: 'POST', body: { token, password: 'another123' } })).status, 400, 'ссылка одноразовая')
  assert.equal((await api('/login', { method: 'POST', body: { username: client.email, password: 'password123' } })).status, 401)
  assert.equal((await api('/login', { method: 'POST', body: { username: client.email, password: 'newpassword123' } })).status, 200)
})

test('прайс-лист клиента: VIP видит свои цены', async () => {
  const guest = (await api('/catalog')).data[0]
  // пароли клиентам из сида случайные (migrate-logins.js), поэтому выдаём новый через админку
  const clients = (await api('/admin/clients', { token: adminToken })).data
  const vipRow = clients.find((c) => c.id === 'client-vip')
  assert.equal(vipRow.login, 'alfa')
  const reset = await api(`/admin/clients/${vipRow.id}/reset-password`, { method: 'POST', token: adminToken })
  const login = await api('/login', { method: 'POST', body: { username: 'alfa', password: reset.data.password } })
  assert.equal(login.status, 200, JSON.stringify(login.data))

  const vipProduct = (await api('/catalog', { token: login.data.token })).data[0]
  assert.equal(vipProduct.priceSource, 'client')
  assert.ok(vipProduct.price < guest.price, `VIP ${vipProduct.price} < базовой ${guest.price}`)

  // гость не может подсмотреть чужие цены через ?clientId
  assert.equal((await api('/catalog?clientId=client-vip')).data[0].price, guest.price)
})

test('защита от подбора: после лимита запросы отклоняются', async () => {
  // лимит «Забыли пароль?» — 5 в час (×RATE_LIMIT_SCALE в тестах)
  const limit = 5 * Number(process.env.RATE_LIMIT_SCALE)
  const statuses = []
  for (let i = 0; i <= limit; i++) {
    statuses.push((await api('/password/forgot', { method: 'POST', body: { email: `x${i}@test.local` } })).status)
  }
  assert.equal(statuses.at(-1), 429)
  assert.ok(statuses.includes(200), 'до лимита запросы проходят')
})
