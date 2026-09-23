const pool = require('./db')

const products = [
  ['P001', 'Pâine albă', 'Panificație', 24, 8, 12.5],
  ['P002', 'Pâine neagră', 'Panificație', 20, 8, 11.0],
  ['P003', 'Chiflă cu susan', 'Panificație', 30, 8, 3.5],
  ['P004', 'Covrigi cu mac', 'Panificație', 25, 8, 4.2],
  ['P005', 'Lapte 1L', 'Lactate', 12, 8, 18.9],
  ['P006', 'Chefir 1L', 'Lactate', 12, 8, 17.5],
  ['P007', 'Brânză de vaci 400g', 'Lactate', 10, 8, 32.0],
  ['P008', 'Smântână 400g', 'Lactate', 15, 8, 24.0],
  ['P009', 'Unt 200g', 'Lactate', 20, 8, 28.0],
  ['P010', 'Cașcaval 300g', 'Lactate', 10, 8, 55.0],
  ['P011', 'Suc de mere 1L', 'Băuturi', 12, 20, 24.0],
  ['P012', 'Apă minerală 1.5L', 'Băuturi', 6, 20, 9.0],
  ['P013', 'Cafea măcinată 250g', 'Băuturi', 10, 20, 55.0],
  ['P014', 'Ceai verde 25pl', 'Băuturi', 20, 20, 18.0],
  ['P015', 'Limonadă 0.5L', 'Băuturi', 12, 20, 12.0],
  ['P016', 'Ciocolată cu lapte', 'Dulciuri', 15, 20, 19.5],
  ['P017', 'Bomboane asortate 300g', 'Dulciuri', 15, 20, 22.0],
  ['P018', 'Napolitane cu cremă', 'Dulciuri', 20, 20, 14.0],
  ['P019', 'Biscuiți clasici', 'Dulciuri', 20, 20, 9.5],
  ['P020', 'Halva 200g', 'Dulciuri', 15, 20, 26.0],
  ['P021', 'Ulei de floarea-soarelui 1L', 'Ulei', 6, 20, 45.0],
  ['P022', 'Ulei de măsline 0.5L', 'Ulei', 6, 20, 89.0],
  ['P023', 'Orez 1kg', 'Cereale', 10, 8, 21.0],
  ['P024', 'Hrișcă 1kg', 'Cereale', 10, 8, 23.0],
  ['P025', 'Paste făinoase 500g', 'Cereale', 15, 8, 14.0],
  ['P026', 'Fulgi de ovăz 500g', 'Cereale', 15, 8, 16.5],
  ['P027', 'Mălai 1kg', 'Cereale', 10, 8, 12.0],
  ['P028', 'Roșii conservate 500g', 'Conserve', 12, 8, 16.0],
  ['P029', 'Mazăre verde 400g', 'Conserve', 12, 8, 13.5],
  ['P030', 'Porumb dulce 340g', 'Conserve', 12, 8, 15.0],
  ['P031', 'Castraveți murați 700g', 'Conserve', 8, 8, 22.0],
  ['P032', 'Sare 1kg', 'Condimente', 20, 20, 6.0],
  ['P033', 'Piper negru 50g', 'Condimente', 20, 20, 15.0],
  ['P034', 'Boia dulce 50g', 'Condimente', 20, 20, 13.0],
  ['P035', 'Piept de pui 1kg', 'Carne', 6, 8, 68.0],
  ['P036', 'Cârnați afumați 500g', 'Carne', 8, 8, 55.0],
  ['P037', 'Șuncă 300g', 'Carne', 10, 8, 48.0],
  ['P038', 'Mere 1kg', 'Legume-Fructe', 10, 8, 14.0],
  ['P039', 'Cartofi 1kg', 'Legume-Fructe', 10, 8, 9.0],
  ['P040', 'Ceapă 1kg', 'Legume-Fructe', 10, 8, 7.5],
]

const clients = [
  ['client-vip', 'SRL Alfa (VIP)'],
  ['client-mic', 'SRL Beta (Mic)'],
  ['client-nou', 'SRL Gamma'],
]

async function seed() {
  try {
    // Очищаем в правильном порядке (сначала дочерние таблицы)
    await pool.query('DELETE FROM client_assignments')
    await pool.query('DELETE FROM price_list_items')
    await pool.query('DELETE FROM price_lists')
    await pool.query('DELETE FROM products')
    await pool.query('DELETE FROM clients')

    // Товары
    for (const [code, name, category, factor, vat, price] of products) {
      await pool.query(
        `INSERT INTO products (code, name, category, base_unit, sale_unit, sale_unit_factor, vat_rate)
         VALUES (?, ?, ?, 'buc', 'bax', ?, ?)`,
        [code, name, category, factor, vat]
      )
    }

    // Прайс-листы
    const [defaultResult] = await pool.query(
      `INSERT INTO price_lists (name, is_default) VALUES ('Preț implicit', TRUE)`
    )
    const [vipResult] = await pool.query(
      `INSERT INTO price_lists (name, is_default) VALUES ('Client VIP', FALSE)`
    )
    const [micResult] = await pool.query(
      `INSERT INTO price_lists (name, is_default) VALUES ('Client Mic', FALSE)`
    )

    const defaultListId = defaultResult.insertId
    const vipListId = vipResult.insertId
    const micListId = micResult.insertId

    // Получаем id товаров для использования в price_list_items
    const [allProducts] = await pool.query('SELECT id, code FROM products')

    // Дефолтный лист — цена на ВСЕ товары (базовая цена из массива выше)
    for (let i = 0; i < products.length; i++) {
      const product = allProducts.find((p) => p.code === products[i][0])
      const basePrice = products[i][5]
      await pool.query(
        `INSERT INTO price_list_items (price_list_id, product_id, price) VALUES (?, ?, ?)`,
        [defaultListId, product.id, basePrice]
      )
    }

    // VIP лист — скидка 15% на всё, КРОМЕ последнего товара (Ceapă) — намеренно отсутствует, для теста fallback
    for (let i = 0; i < products.length - 1; i++) {
      const product = allProducts.find((p) => p.code === products[i][0])
      const discountedPrice = Math.round(products[i][5] * 0.85 * 100) / 100
      await pool.query(
        `INSERT INTO price_list_items (price_list_id, product_id, price) VALUES (?, ?, ?)`,
        [vipListId, product.id, discountedPrice]
      )
    }

    // Client Mic — свои цены, чуть выше базовых (+5%), на все товары
    for (let i = 0; i < products.length; i++) {
      const product = allProducts.find((p) => p.code === products[i][0])
      const higherPrice = Math.round(products[i][5] * 1.05 * 100) / 100
      await pool.query(
        `INSERT INTO price_list_items (price_list_id, product_id, price) VALUES (?, ?, ?)`,
        [micListId, product.id, higherPrice]
      )
    }

    // Клиенты
    for (const [id, name] of clients) {
      await pool.query(`INSERT INTO clients (id, name) VALUES (?, ?)`, [id, name])
    }

    // Привязка клиентов к листам
    await pool.query(
      `INSERT INTO client_assignments (client_id, price_list_id) VALUES (?, ?)`,
      ['client-vip', vipListId]
    )
    await pool.query(
      `INSERT INTO client_assignments (client_id, price_list_id) VALUES (?, ?)`,
      ['client-mic', micListId]
    )
    // client-nou намеренно не привязан — получит дефолтный лист

    console.log(`✅ Сид завершён: ${products.length} товаров, 3 прайс-листа, ${clients.length} клиента`)
  } catch (err) {
    console.error('❌ Ошибка сида:', err.message)
  } finally {
    process.exit()
  }
}

seed()