// Добавляет клиентам email (регистрация) и создаёт таблицы заказов.
// Безопасно запускать повторно.
const pool = require('./db')

async function migrateShop() {
  try {
    try {
      await pool.query(`ALTER TABLE clients ADD COLUMN email VARCHAR(255) UNIQUE`)
      console.log('Колонка email добавлена')
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'new',
        payment_method VARCHAR(20) NOT NULL,
        contact_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        address VARCHAR(500) NOT NULL,
        comment VARCHAR(1000),
        total DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        sale_unit VARCHAR(20) NOT NULL,
        qty INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )
    `)

    console.log('✅ Готово: clients.email, orders, order_items')
  } catch (err) {
    console.error('❌ Ошибка:', err.message)
  } finally {
    process.exit()
  }
}

migrateShop()
