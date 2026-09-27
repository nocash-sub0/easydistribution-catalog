// Профиль покупателя (телефон, адрес, настройки, клиент Stripe для сохранённых карт) и акции. Безопасно запускать повторно.
const pool = require('./db')

async function addColumn(sql) {
  try {
    await pool.query(sql)
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err
  }
}

async function migrateV5() {
  try {
    await addColumn('ALTER TABLE clients ADD COLUMN phone VARCHAR(50) NULL')
    await addColumn('ALTER TABLE clients ADD COLUMN address VARCHAR(500) NULL')
    await addColumn('ALTER TABLE clients ADD COLUMN preferences TEXT NULL') // JSON: тема, язык, письма
    await addColumn('ALTER TABLE clients ADD COLUMN stripe_customer_id VARCHAR(100) NULL')

    // Акция: скидка в процентах на товар, категорию (product_id и category пустые — на весь каталог)
    // для всех клиентов или одного (client_id). Даты включительно, пустые — без ограничения.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS promotions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        percent DECIMAL(5,2) NOT NULL,
        product_id INT NULL,
        category VARCHAR(100) NULL,
        client_id VARCHAR(50) NULL,
        starts_at DATE NULL,
        ends_at DATE NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `)
    console.log('✅ Готово: clients.phone/address/preferences/stripe_customer_id, promotions')
  } catch (err) {
    console.error('❌ Ошибка:', err.message)
  } finally {
    process.exit()
  }
}

migrateV5()
