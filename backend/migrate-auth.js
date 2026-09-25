const pool = require('./db')
const bcrypt = require('bcryptjs')

async function migrateAuth() {
  try {
    try {
      await pool.query(`ALTER TABLE clients ADD COLUMN password_hash VARCHAR(255)`)
      console.log('Колонка password_hash добавлена')
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('Колонка password_hash уже существует, пропускаем')
      } else {
        throw err
      }
    }

    const hash = await bcrypt.hash('parola123', 10)
    await pool.query(`UPDATE clients SET password_hash = ? WHERE password_hash IS NULL`, [hash])

    console.log('✅ Готово. Временный пароль клиентов: parola123')
  } catch (err) {
    console.error('❌ Ошибка:', err.message)
  } finally {
    process.exit()
  }
}

migrateAuth()