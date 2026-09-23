const pool = require('./db')

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        base_unit VARCHAR(20) NOT NULL DEFAULT 'buc',
        sale_unit VARCHAR(20) NOT NULL DEFAULT 'bax',
        sale_unit_factor DECIMAL(10,2) NOT NULL,
        vat_rate DECIMAL(5,2) NOT NULL
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS price_lists (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS price_list_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        price_list_id INT NOT NULL,
        product_id INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        UNIQUE KEY unique_list_product (price_list_id, product_id),
        FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_assignments (
        client_id VARCHAR(50) PRIMARY KEY,
        price_list_id INT NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE
      )
    `)

    console.log('✅ Таблицы созданы успешно')
  } catch (err) {
    console.error('❌ Ошибка миграции:', err.message)
  } finally {
    process.exit()
  }
}

migrate()