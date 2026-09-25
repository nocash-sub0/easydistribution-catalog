// Описание товара (оригинал в products, переводы в product_translations). Безопасно запускать повторно.
const pool = require('./db')

async function addColumn(sql) {
  try {
    await pool.query(sql)
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err
  }
}

async function migrateV4() {
  try {
    await addColumn('ALTER TABLE products ADD COLUMN description TEXT NULL')
    await addColumn('ALTER TABLE product_translations ADD COLUMN description TEXT NULL')
    console.log('✅ Готово: products.description, product_translations.description')
  } catch (err) {
    console.error('❌ Ошибка:', err.message)
  } finally {
    process.exit()
  }
}

migrateV4()
