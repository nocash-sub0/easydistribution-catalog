// Создаёт таблицу переводов товаров и заполняет её переводами текущего каталога (RU и EN).
// Оригинальные названия (румынские) остаются в products. Безопасно запускать повторно.
const pool = require('./db')

const categories = {
  Băuturi: { ru: 'Напитки', en: 'Beverages' },
  Carne: { ru: 'Мясо', en: 'Meat' },
  Cereale: { ru: 'Крупы и злаки', en: 'Cereals & grains' },
  Condimente: { ru: 'Приправы и специи', en: 'Spices & seasonings' },
  Conserve: { ru: 'Консервы', en: 'Canned goods' },
  Dulciuri: { ru: 'Сладости', en: 'Sweets' },
  Lactate: { ru: 'Молочные продукты', en: 'Dairy' },
  'Legume-Fructe': { ru: 'Овощи и фрукты', en: 'Vegetables & fruits' },
  Panificație: { ru: 'Хлебобулочные изделия', en: 'Bakery' },
  Ulei: { ru: 'Масло', en: 'Oil' },
}

const products = {
  'Pâine albă': ['Белый хлеб', 'White bread'],
  'Pâine neagră': ['Чёрный хлеб', 'Dark rye bread'],
  'Chiflă cu susan': ['Булочка с кунжутом', 'Sesame bun'],
  'Covrigi cu mac': ['Бублики с маком', 'Poppy seed pretzels'],
  'Lapte 1L': ['Молоко 1 л', 'Milk 1 L'],
  'Chefir 1L': ['Кефир 1 л', 'Kefir 1 L'],
  'Brânză de vaci 400g': ['Творог 400 г', 'Cottage cheese 400 g'],
  'Smântână 400g': ['Сметана 400 г', 'Sour cream 400 g'],
  'Unt 200g': ['Сливочное масло 200 г', 'Butter 200 g'],
  'Cașcaval 300g': ['Сыр кашкавал 300 г', 'Kashkaval cheese 300 g'],
  'Suc de mere 1L': ['Яблочный сок 1 л', 'Apple juice 1 L'],
  'Apă minerală 1.5L': ['Минеральная вода 1,5 л', 'Mineral water 1.5 L'],
  'Cafea măcinată 250g': ['Молотый кофе 250 г', 'Ground coffee 250 g'],
  'Ceai verde 25pl': ['Зелёный чай 25 пак.', 'Green tea 25 bags'],
  'Limonadă 0.5L': ['Лимонад 0,5 л', 'Lemonade 0.5 L'],
  'Ciocolată cu lapte': ['Молочный шоколад', 'Milk chocolate'],
  'Bomboane asortate 300g': ['Конфеты ассорти 300 г', 'Assorted candies 300 g'],
  'Napolitane cu cremă': ['Вафли с кремом', 'Cream wafers'],
  'Biscuiți clasici': ['Классическое печенье', 'Classic biscuits'],
  'Halva 200g': ['Халва 200 г', 'Halva 200 g'],
  'Ulei de floarea-soarelui 1L': ['Подсолнечное масло 1 л', 'Sunflower oil 1 L'],
  'Ulei de măsline 0.5L': ['Оливковое масло 0,5 л', 'Olive oil 0.5 L'],
  'Orez 1kg': ['Рис 1 кг', 'Rice 1 kg'],
  'Hrișcă 1kg': ['Гречка 1 кг', 'Buckwheat 1 kg'],
  'Paste făinoase 500g': ['Макароны 500 г', 'Pasta 500 g'],
  'Fulgi de ovăz 500g': ['Овсяные хлопья 500 г', 'Oat flakes 500 g'],
  'Mălai 1kg': ['Кукурузная мука 1 кг', 'Cornmeal 1 kg'],
  'Roșii conservate 500g': ['Консервированные помидоры 500 г', 'Canned tomatoes 500 g'],
  'Mazăre verde 400g': ['Зелёный горошек 400 г', 'Green peas 400 g'],
  'Porumb dulce 340g': ['Сладкая кукуруза 340 г', 'Sweet corn 340 g'],
  'Castraveți murați 700g': ['Маринованные огурцы 700 г', 'Pickled cucumbers 700 g'],
  'Sare 1kg': ['Соль 1 кг', 'Salt 1 kg'],
  'Piper negru 50g': ['Чёрный перец 50 г', 'Black pepper 50 g'],
  'Boia dulce 50g': ['Сладкая паприка 50 г', 'Sweet paprika 50 g'],
  'Piept de pui 1kg': ['Куриная грудка 1 кг', 'Chicken breast 1 kg'],
  'Cârnați afumați 500g': ['Копчёные колбаски 500 г', 'Smoked sausages 500 g'],
  'Șuncă 300g': ['Ветчина 300 г', 'Ham 300 g'],
  'Mere 1kg': ['Яблоки 1 кг', 'Apples 1 kg'],
  'Cartofi 1kg': ['Картофель 1 кг', 'Potatoes 1 kg'],
  'Ceapă 1kg': ['Лук 1 кг', 'Onions 1 kg'],
}

async function migrateTranslations() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_translations (
        product_id INT NOT NULL,
        lang VARCHAR(5) NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        PRIMARY KEY (product_id, lang),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `)

    const [rows] = await pool.query('SELECT id, name, category FROM products')
    let saved = 0
    const missing = []

    for (const p of rows) {
      const tr = products[p.name]
      const cat = categories[p.category]
      if (!tr || !cat) {
        missing.push(p.name)
        continue
      }
      for (const [i, lang] of ['ru', 'en'].entries()) {
        await pool.query(
          `INSERT INTO product_translations (product_id, lang, name, category) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category)`,
          [p.id, lang, tr[i], cat[lang]]
        )
        saved++
      }
    }

    console.log(`✅ Сохранено переводов: ${saved}`)
    if (missing.length) console.log('Без готового перевода (останутся как есть):', missing.join(', '))
  } catch (err) {
    console.error('❌ Ошибка:', err.message)
  } finally {
    process.exit()
  }
}

migrateTranslations()
