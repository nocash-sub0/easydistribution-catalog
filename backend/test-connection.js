const pool = require('./db')

async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result')
    console.log('✅ Подключение работает! Результат:', rows[0].result)
  } catch (err) {
    console.error('❌ Ошибка подключения:', err.message)
  } finally {
    process.exit()
  }
}

testConnection()