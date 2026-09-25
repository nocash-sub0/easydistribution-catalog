// Подготовка отдельной тестовой базы: пересоздаём её с нуля, прогоняем все миграции и сид.
// Боевая база (DB_NAME из .env) не затрагивается.
const path = require('path')
const { spawnSync } = require('child_process')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const mysql = require('mysql2/promise')

const TEST_DB = process.env.TEST_DB_NAME || 'catalog_test'
// имя боевой базы запоминаем сразу — тесты потом подменяют DB_NAME на тестовую
const PROD_DB = process.env.DB_NAME
const BACKEND_DIR = path.join(__dirname, '..')

// Порядок важен: каждая миграция опирается на таблицы из предыдущих
const STEPS = [
  ['migrate.js'],
  ['migrate-auth.js'],
  ['migrate-logins.js'],
  ['migrate-shop.js'],
  ['migrate-stripe.js'],
  ['migrate-translations.js'],
  ['migrate-v2.js'],
  ['migrate-v3.js'],
  ['migrate-v4.js'],
  ['seed.js', '--force'],
  ['migrate-translations.js'], // переводы для товаров из сида
  ['migrate-logins.js'], // логины alfa/beta/gamma и пароли клиентам из сида
]

async function prepareTestDatabase() {
  if (!/test/i.test(TEST_DB) || TEST_DB === PROD_DB) {
    throw new Error(`Тестовая база должна содержать "test" в имени и отличаться от боевой (сейчас: ${TEST_DB})`)
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })
  await conn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``)
  await conn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await conn.end()

  for (const [script, ...args] of STEPS) {
    const run = spawnSync(process.execPath, [script, ...args], {
      cwd: BACKEND_DIR,
      env: { ...process.env, DB_NAME: TEST_DB },
      encoding: 'utf8',
    })
    const out = (run.stdout || '') + (run.stderr || '')
    // скрипты ловят свои ошибки и печатают «❌», поэтому смотрим и на код выхода, и на вывод
    if (run.status !== 0 || out.includes('❌')) throw new Error(`${script} failed:\n${out}`)
  }
}

module.exports = { prepareTestDatabase, TEST_DB }
