// Добавляет заказам поле для id платёжной сессии Stripe. Безопасно запускать повторно.
const pool = require('./db')

async function migrateStripe() {
  try {
    try {
      await pool.query(`ALTER TABLE orders ADD COLUMN stripe_session_id VARCHAR(255)`)
      console.log('Колонка stripe_session_id добавлена')
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err
      console.log('Колонка stripe_session_id уже существует, пропускаем')
    }
    console.log('✅ Готово')
  } catch (err) {
    console.error('❌ Ошибка:', err.message)
  } finally {
    process.exit()
  }
}

migrateStripe()
