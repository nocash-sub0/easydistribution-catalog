// Остатки на складе: products.stock (NULL — остаток не ведётся, товар всегда в наличии).
// Безопасно запускать повторно.
const pool = require('./db')

async function migrateV3() {
  try {
    try {
      await pool.query('ALTER TABLE products ADD COLUMN stock INT NULL')
      console.log('Колонка stock добавлена')
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err
      console.log('Колонка stock уже существует, пропускаем')
    }
    console.log('✅ Готово')
  } catch (err) {
    console.error('❌ Ошибка:', err.message)
  } finally {
    process.exit()
  }
}

migrateV3()
