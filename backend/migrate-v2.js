// Таблицы для фото товаров и восстановления пароля. Безопасно запускать повторно.
const pool = require('./db')

async function migrateV2() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_images (
        product_id INT PRIMARY KEY,
        mime VARCHAR(50) NOT NULL,
        data MEDIUMBLOB NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        token_hash CHAR(64) PRIMARY KEY,
        client_id VARCHAR(50) NOT NULL,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `)

    console.log('✅ Готово: product_images, password_resets')
  } catch (err) {
    console.error('❌ Ошибка:', err.message)
  } finally {
    process.exit()
  }
}

migrateV2()
