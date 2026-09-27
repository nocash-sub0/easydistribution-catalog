// npm run db:init: создаёт таблицы и заливает тестовые данные в пустую базу.
// База берётся из DB_NAME в backend/.env.
// Список миграций общий с тестами (test/setup.js), чтобы не держать две копии и не путаться.
// Если товары в базе уже есть, скрипт выходит и ничего не трогает: seed.js --force снёс бы всё.
// Снести и залить заново можно только осознанно: npm run db:init -- --force
const path = require('path')
const { spawnSync } = require('child_process')
require('dotenv').config({ path: path.join(__dirname, '.env') })
const mysql = require('mysql2/promise')
const { STEPS } = require('./test/setup')

const FORCE = process.argv.includes('--force')

async function hasProducts() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
  })
  try {
    const [rows] = await conn.query('SELECT COUNT(*) AS n FROM products')
    return rows[0].n > 0
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return false
    throw err
  } finally {
    await conn.end()
  }
}

async function main() {
  if (!process.env.DB_HOST || !process.env.DB_NAME) {
    console.error('❌ Нет backend/.env: скопируйте backend/.env.example и впишите данные базы')
    process.exit(1)
  }

  if ((await hasProducts()) && !FORCE) {
    console.log(`В базе ${process.env.DB_NAME} уже есть товары, ничего не трогаю.`)
    console.log('Пересоздать данные с нуля: npm run db:init -- --force (всё текущее удалится)')
    return
  }

  for (const [script, ...args] of STEPS) {
    console.log(`→ ${script} ${args.join(' ')}`)
    const run = spawnSync(process.execPath, [script, ...args], {
      cwd: __dirname,
      encoding: 'utf8',
    })
    const out = (run.stdout || '') + (run.stderr || '')
    process.stdout.write(out)
    if (run.status !== 0 || out.includes('❌')) {
      console.error(`❌ Остановился на ${script}`)
      process.exit(1)
    }
  }
  console.log('✅ База готова. Логины и пароли клиентов напечатал migrate-logins.js выше.')
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exit(1)
})
