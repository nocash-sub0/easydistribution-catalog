// Добавляет клиентам отдельный логин и личный случайный пароль.
// Безопасно запускать повторно: затрагивает только клиентов без логина.
// Запуск с флагом --reset выдаёт новые пароли ВСЕМ клиентам (логины остаются).
const crypto = require('crypto')
const pool = require('./db')
const bcrypt = require('bcryptjs')

const RESET = process.argv.includes('--reset')

function makeLogin(name, taken) {
  let base = name
    .replace(/\(.*?\)/g, '')
    .replace(/^\s*(SRL|SA|II|ÎI)\s+/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!base) base = 'client'
  let login = base
  for (let i = 2; taken.has(login); i++) login = `${base}${i}`
  taken.add(login)
  return login
}

function makePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join('')
}

async function migrateLogins() {
  try {
    try {
      await pool.query(`ALTER TABLE clients ADD COLUMN login VARCHAR(100) UNIQUE`)
      console.log('Колонка login добавлена')
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err
    }

    const [clients] = await pool.query('SELECT id, name, login FROM clients ORDER BY name')
    const taken = new Set(clients.map((c) => c.login).filter(Boolean))
    const issued = []

    for (const client of clients) {
      if (client.login && !RESET) continue
      const login = client.login || makeLogin(client.name, taken)
      const password = makePassword()
      const hash = await bcrypt.hash(password, 10)
      await pool.query('UPDATE clients SET login = ?, password_hash = ? WHERE id = ?', [login, hash, client.id])
      issued.push({ Клиент: client.name, Логин: login, Пароль: password })
    }

    if (issued.length === 0) {
      console.log('Новых клиентов без логина нет. Для сброса паролей: node migrate-logins.js --reset')
    } else {
      console.log('✅ Выданы доступы (пароли показываются только сейчас, сохраните их):')
      console.table(issued)
    }
  } catch (err) {
    console.error('❌ Ошибка:', err.message)
  } finally {
    process.exit()
  }
}

migrateLogins()
