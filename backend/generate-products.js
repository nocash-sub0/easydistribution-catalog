// Дополняет каталог до TARGET товаров: реалистичные названия (тип + бренд + фасовка),
// цены во всех прайс-листах и переводы RU/EN. Существующие товары, клиенты и заказы не трогает.
// Безопасно запускать повторно: если товаров уже TARGET или больше — ничего не делает.
//   node generate-products.js          -> до 800 товаров
//   node generate-products.js 1000     -> до 1000 товаров
const pool = require('./db')

const TARGET = parseInt(process.argv[2]) || 800

// Бренды по группам (остаются без перевода)
const BRANDS = {
  dairy: ['Lactis', 'JLC', 'Alba', 'Incomlac', 'Milli', 'Fabrika', 'Bucuria Laptelui'],
  water: ['Borjomi', 'Aqua Unica', 'Om', 'Izvorul Alb', 'Ciuflea', 'Nestle Pure Life'],
  juice: ['Rich', 'Real', 'Dobrîi', 'Sandora', 'Natur Bravo', 'Cappy', 'J7'],
  soda: ['Coca-Cola', 'Fanta', 'Sprite', 'Pepsi', 'Mirinda', 'Frutti Fresh'],
  coffee: ['Jacobs', 'Lavazza', 'Tchibo', 'Nescafe', 'Doncafe', 'Carte Noire'],
  tea: ['Lipton', 'Greenfield', 'Ahmad Tea', 'Tess', 'Curtis', 'Hilltop'],
  bakery: ['Franzeluța', 'Paniflor', 'Bardar', 'Pâinea Casei', 'Colac'],
  chocolate: ['Bucuria', 'Milka', 'Alpen Gold', 'Roshen', 'Kinder', 'Ritter Sport'],
  biscuits: ['Bucuria', 'Oreo', 'Roshen', 'Lu', 'Belvita', 'Jubileu', 'Tuc'],
  grains: ['Floarea Soarelui', 'Unicorn', 'Mistral', 'Uvelka', 'Pripravka', 'Moldova Grain'],
  pasta: ['Barilla', 'Panzani', 'Maestro', 'Divella', 'Makfa', 'Arte Pasta'],
  oil: ['Floris', 'Bunicuța', 'Monini', 'Borges', 'Oleina', 'Unirea'],
  canned: ['Bonduelle', 'Orhei-Vit', 'Natur Bravo', 'Hame', 'Lorado', 'Bunătăți'],
  spices: ['Kotanyi', 'Galeo', 'Santa Maria', 'Prymat', 'Kamis', 'Cosmin'],
  meat: ['Carmez', 'Basarabia-Nord', 'Pui de Aur', 'Cris-Tim', 'Doina', 'Elcarn'],
  produce: ['Moldova', 'Golden', 'Granny Smith', 'Fuji', 'Idared', 'Florina'],
  vegetables: ['Moldova', 'Grădina Bunicii', 'Agro-Sud', 'Eco Fresh', 'Verde'],
}

const VAT = { Băuturi: 20, Dulciuri: 20, Ulei: 20 }

// [ro, ru, en, категория, группа брендов, коэффициент bax, [[фасовка, цена за шт.], ...]]
const TYPES = [
  ['Lapte 2.5%', 'Молоко 2,5%', 'Milk 2.5%', 'Lactate', 'dairy', 12, [['1L', 19], ['0.5L', 11]]],
  ['Lapte 3.2%', 'Молоко 3,2%', 'Milk 3.2%', 'Lactate', 'dairy', 12, [['1L', 21], ['0.5L', 12]]],
  ['Chefir 2.5%', 'Кефир 2,5%', 'Kefir 2.5%', 'Lactate', 'dairy', 12, [['1L', 18], ['0.5L', 10]]],
  ['Iaurt natural', 'Натуральный йогурт', 'Natural yogurt', 'Lactate', 'dairy', 12, [['400g', 22], ['150g', 9]]],
  ['Iaurt cu căpșuni', 'Клубничный йогурт', 'Strawberry yogurt', 'Lactate', 'dairy', 12, [['400g', 24], ['150g', 10]]],
  ['Smântână 20%', 'Сметана 20%', 'Sour cream 20%', 'Lactate', 'dairy', 15, [['400g', 28], ['200g', 15]]],
  ['Unt 82.5%', 'Сливочное масло 82,5%', 'Butter 82.5%', 'Lactate', 'dairy', 20, [['200g', 45], ['100g', 24]]],
  ['Brânză de vaci 9%', 'Творог 9%', 'Cottage cheese 9%', 'Lactate', 'dairy', 10, [['400g', 38], ['200g', 20]]],
  ['Cașcaval', 'Сыр кашкавал', 'Kashkaval cheese', 'Lactate', 'dairy', 10, [['300g', 65], ['500g', 105]]],
  ['Brânză telemea', 'Брынза', 'Telemea cheese', 'Lactate', 'dairy', 10, [['400g', 55]]],
  ['Lapte bătut', 'Простокваша', 'Buttermilk', 'Lactate', 'dairy', 12, [['1L', 17]]],

  ['Apă minerală carbogazoasă', 'Газированная минеральная вода', 'Sparkling mineral water', 'Băuturi', 'water', 6, [['0.5L', 8], ['1.5L', 12]]],
  ['Apă plată', 'Питьевая вода', 'Still water', 'Băuturi', 'water', 6, [['0.5L', 6], ['1.5L', 9], ['5L', 22]]],
  ['Suc de mere', 'Яблочный сок', 'Apple juice', 'Băuturi', 'juice', 12, [['1L', 25], ['0.2L', 8]]],
  ['Suc de portocale', 'Апельсиновый сок', 'Orange juice', 'Băuturi', 'juice', 12, [['1L', 29], ['0.2L', 9]]],
  ['Suc de roșii', 'Томатный сок', 'Tomato juice', 'Băuturi', 'juice', 12, [['1L', 24]]],
  ['Nectar de piersici', 'Персиковый нектар', 'Peach nectar', 'Băuturi', 'juice', 12, [['1L', 27]]],
  ['Băutură răcoritoare', 'Газированный напиток', 'Soft drink', 'Băuturi', 'soda', 12, [['0.5L', 14], ['1.5L', 26], ['0.33L', 11]]],
  ['Cafea măcinată', 'Молотый кофе', 'Ground coffee', 'Băuturi', 'coffee', 12, [['250g', 75], ['500g', 140]]],
  ['Cafea boabe', 'Кофе в зёрнах', 'Coffee beans', 'Băuturi', 'coffee', 6, [['1kg', 280], ['500g', 150]]],
  ['Cafea instant', 'Растворимый кофе', 'Instant coffee', 'Băuturi', 'coffee', 12, [['100g', 95], ['200g', 175]]],
  ['Ceai negru', 'Чёрный чай', 'Black tea', 'Băuturi', 'tea', 24, [['25pl', 28], ['100pl', 95]]],
  ['Ceai verde', 'Зелёный чай', 'Green tea', 'Băuturi', 'tea', 24, [['25pl', 30], ['100pl', 99]]],
  ['Ceai de fructe', 'Фруктовый чай', 'Fruit tea', 'Băuturi', 'tea', 24, [['25pl', 32]]],

  ['Pâine albă feliată', 'Белый нарезной хлеб', 'Sliced white bread', 'Panificație', 'bakery', 20, [['500g', 13], ['300g', 9]]],
  ['Pâine integrală', 'Цельнозерновой хлеб', 'Wholegrain bread', 'Panificație', 'bakery', 20, [['400g', 16]]],
  ['Baton', 'Батон', 'Baguette loaf', 'Panificație', 'bakery', 20, [['400g', 11]]],
  ['Chifle pentru burger', 'Булочки для бургеров', 'Burger buns', 'Panificație', 'bakery', 15, [['4buc', 18]]],
  ['Pesmet', 'Панировочные сухари', 'Breadcrumbs', 'Panificație', 'bakery', 20, [['250g', 12]]],
  ['Cozonac cu stafide', 'Кулич с изюмом', 'Raisin sweet bread', 'Panificație', 'bakery', 10, [['500g', 45]]],

  ['Ciocolată cu lapte', 'Молочный шоколад', 'Milk chocolate', 'Dulciuri', 'chocolate', 20, [['100g', 22], ['90g', 20]]],
  ['Ciocolată neagră 70%', 'Тёмный шоколад 70%', 'Dark chocolate 70%', 'Dulciuri', 'chocolate', 20, [['100g', 28]]],
  ['Ciocolată cu alune', 'Шоколад с фундуком', 'Hazelnut chocolate', 'Dulciuri', 'chocolate', 20, [['100g', 26]]],
  ['Bomboane de ciocolată', 'Шоколадные конфеты', 'Chocolate candies', 'Dulciuri', 'chocolate', 12, [['200g', 48], ['500g', 110]]],
  ['Biscuiți cu cacao', 'Печенье с какао', 'Cocoa biscuits', 'Dulciuri', 'biscuits', 24, [['180g', 16]]],
  ['Biscuiți cu unt', 'Сливочное печенье', 'Butter biscuits', 'Dulciuri', 'biscuits', 24, [['200g', 18]]],
  ['Napolitane cu vanilie', 'Ванильные вафли', 'Vanilla wafers', 'Dulciuri', 'biscuits', 24, [['150g', 14]]],
  ['Crackeri sărați', 'Солёные крекеры', 'Salted crackers', 'Dulciuri', 'biscuits', 24, [['100g', 12]]],

  ['Orez bob rotund', 'Круглозерный рис', 'Round grain rice', 'Cereale', 'grains', 10, [['1kg', 28], ['500g', 15]]],
  ['Orez bob lung', 'Длиннозерный рис', 'Long grain rice', 'Cereale', 'grains', 10, [['1kg', 32]]],
  ['Hrișcă', 'Гречка', 'Buckwheat', 'Cereale', 'grains', 10, [['1kg', 34], ['800g', 28]]],
  ['Fulgi de ovăz', 'Овсяные хлопья', 'Oat flakes', 'Cereale', 'grains', 12, [['500g', 16], ['1kg', 29]]],
  ['Griș', 'Манная крупа', 'Semolina', 'Cereale', 'grains', 10, [['1kg', 18]]],
  ['Mei', 'Пшено', 'Millet', 'Cereale', 'grains', 10, [['1kg', 20]]],
  ['Făină de grâu', 'Пшеничная мука', 'Wheat flour', 'Cereale', 'grains', 10, [['2kg', 30], ['1kg', 16]]],
  ['Spaghete', 'Спагетти', 'Spaghetti', 'Cereale', 'pasta', 20, [['500g', 17], ['1kg', 31]]],
  ['Penne', 'Пенне', 'Penne pasta', 'Cereale', 'pasta', 20, [['500g', 18]]],
  ['Fusilli', 'Фузилли', 'Fusilli pasta', 'Cereale', 'pasta', 20, [['500g', 18]]],
  ['Tăiței de casă', 'Домашняя лапша', 'Homemade noodles', 'Cereale', 'pasta', 20, [['400g', 15]]],

  ['Ulei de floarea-soarelui rafinat', 'Рафинированное подсолнечное масло', 'Refined sunflower oil', 'Ulei', 'oil', 12, [['1L', 32], ['2L', 61], ['5L', 148]]],
  ['Ulei de floarea-soarelui nerafinat', 'Нерафинированное подсолнечное масло', 'Unrefined sunflower oil', 'Ulei', 'oil', 12, [['1L', 36]]],
  ['Ulei de măsline extravirgin', 'Оливковое масло Extra Virgin', 'Extra virgin olive oil', 'Ulei', 'oil', 6, [['0.5L', 95], ['1L', 180]]],
  ['Ulei de porumb', 'Кукурузное масло', 'Corn oil', 'Ulei', 'oil', 12, [['1L', 42]]],

  ['Mazăre verde', 'Зелёный горошек', 'Green peas', 'Conserve', 'canned', 12, [['400g', 16], ['800g', 29]]],
  ['Porumb dulce', 'Сладкая кукуруза', 'Sweet corn', 'Conserve', 'canned', 12, [['340g', 17]]],
  ['Fasole roșie', 'Красная фасоль', 'Red beans', 'Conserve', 'canned', 12, [['400g', 18]]],
  ['Castraveți murați', 'Маринованные огурцы', 'Pickled cucumbers', 'Conserve', 'canned', 8, [['700g', 26], ['350g', 15]]],
  ['Roșii în suc propriu', 'Помидоры в собственном соку', 'Tomatoes in own juice', 'Conserve', 'canned', 12, [['500g', 22]]],
  ['Pastă de tomate', 'Томатная паста', 'Tomato paste', 'Conserve', 'canned', 12, [['140g', 9], ['400g', 21]]],
  ['Zacuscă', 'Овощная икра закуска', 'Zacusca vegetable spread', 'Conserve', 'canned', 12, [['300g', 24]]],
  ['Gem de caise', 'Абрикосовый джем', 'Apricot jam', 'Conserve', 'canned', 12, [['370g', 28]]],

  ['Sare iodată', 'Йодированная соль', 'Iodized salt', 'Condimente', 'spices', 20, [['1kg', 7]]],
  ['Piper negru măcinat', 'Молотый чёрный перец', 'Ground black pepper', 'Condimente', 'spices', 30, [['50g', 14], ['20g', 7]]],
  ['Boia dulce', 'Сладкая паприка', 'Sweet paprika', 'Condimente', 'spices', 30, [['50g', 12]]],
  ['Frunze de dafin', 'Лавровый лист', 'Bay leaves', 'Condimente', 'spices', 30, [['10g', 6]]],
  ['Condimente pentru pui', 'Приправа для курицы', 'Chicken seasoning', 'Condimente', 'spices', 30, [['30g', 9]]],
  ['Oregano uscat', 'Сушёный орегано', 'Dried oregano', 'Condimente', 'spices', 30, [['10g', 8]]],

  ['Piept de pui congelat', 'Замороженная куриная грудка', 'Frozen chicken breast', 'Carne', 'meat', 8, [['1kg', 89]]],
  ['Pulpe de pui', 'Куриные бёдра', 'Chicken thighs', 'Carne', 'meat', 8, [['1kg', 62]]],
  ['Carne tocată de porc', 'Свиной фарш', 'Minced pork', 'Carne', 'meat', 8, [['500g', 52]]],
  ['Crenvurști', 'Сосиски', 'Frankfurters', 'Carne', 'meat', 10, [['400g', 42], ['1kg', 98]]],
  ['Salam afumat', 'Копчёная колбаса', 'Smoked salami', 'Carne', 'meat', 10, [['400g', 68]]],
  ['Parizer', 'Варёная колбаса', 'Bologna sausage', 'Carne', 'meat', 10, [['500g', 48]]],
  ['Bacon afumat', 'Копчёный бекон', 'Smoked bacon', 'Carne', 'meat', 10, [['200g', 38]]],

  ['Mere', 'Яблоки', 'Apples', 'Legume-Fructe', 'produce', 10, [['1kg', 14], ['2kg', 26]]],
  ['Pere', 'Груши', 'Pears', 'Legume-Fructe', 'produce', 10, [['1kg', 22]]],
  ['Cartofi', 'Картофель', 'Potatoes', 'Legume-Fructe', 'vegetables', 10, [['2kg', 17], ['5kg', 40]]],
  ['Ceapă galbenă', 'Жёлтый лук', 'Yellow onions', 'Legume-Fructe', 'vegetables', 10, [['1kg', 8], ['3kg', 22]]],
  ['Morcovi', 'Морковь', 'Carrots', 'Legume-Fructe', 'vegetables', 10, [['1kg', 9]]],
  ['Varză albă', 'Белокочанная капуста', 'White cabbage', 'Legume-Fructe', 'vegetables', 10, [['1kg', 7]]],
  ['Roșii', 'Помидоры', 'Tomatoes', 'Legume-Fructe', 'vegetables', 10, [['1kg', 29]]],
  ['Castraveți', 'Огурцы', 'Cucumbers', 'Legume-Fructe', 'vegetables', 10, [['1kg', 24]]],
  ['Ardei gras', 'Болгарский перец', 'Bell peppers', 'Legume-Fructe', 'vegetables', 10, [['1kg', 32]]],
  ['Sfeclă roșie', 'Свёкла', 'Beetroot', 'Legume-Fructe', 'vegetables', 10, [['1kg', 8]]],
  ['Usturoi', 'Чеснок', 'Garlic', 'Legume-Fructe', 'vegetables', 20, [['250g', 15]]],
  ['Smântână 15%', 'Сметана 15%', 'Sour cream 15%', 'Lactate', 'dairy', 15, [['400g', 25]]],
  ['Lapte condensat', 'Сгущённое молоко', 'Condensed milk', 'Conserve', 'canned', 12, [['380g', 27]]],
  ['Ketchup', 'Кетчуп', 'Ketchup', 'Conserve', 'canned', 12, [['500g', 24]]],
  ['Maioneză 67%', 'Майонез 67%', 'Mayonnaise 67%', 'Conserve', 'canned', 12, [['400g', 26]]],
]

const UNITS = { l: ['л', 'L'], g: ['г', 'g'], kg: ['кг', 'kg'], pl: ['пак.', 'bags'], buc: ['шт.', 'pcs'] }

function localizeSize(size, lang) {
  const m = size.match(/^(\d+(?:\.\d+)?)(kg|g|l|pl|buc)$/i)
  const [ru, en] = UNITS[m[2].toLowerCase()]
  return lang === 'ru' ? `${m[1].replace('.', ',')} ${ru}` : `${m[1]} ${en}`
}

// Детерминированный генератор случайных чисел — при каждом запуске одинаковые цены
let seed = 20260925
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}

const round2 = (n) => Math.round(n * 100) / 100

function buildCandidates() {
  const list = []
  for (const [ro, ru, en, category, group, factor, sizes] of TYPES) {
    for (const brand of BRANDS[group]) {
      for (const [size, basePrice] of sizes) {
        list.push({
          name: `${ro} ${brand} ${size}`,
          ru: `${ru} ${brand} ${localizeSize(size, 'ru')}`,
          en: `${en} ${brand} ${localizeSize(size, 'en')}`,
          category,
          factor,
          vat: VAT[category] || 8,
          price: round2(basePrice * (0.85 + random() * 0.35)), // разброс цен между брендами
        })
      }
    }
  }
  // перемешиваем, чтобы в каталоге были разные категории вперемешку, а не 50 молок подряд
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

async function generate() {
  const conn = await pool.getConnection()
  try {
    const [[{ n: current }]] = await conn.query('SELECT COUNT(*) AS n FROM products')
    const need = TARGET - current
    if (need <= 0) {
      console.log(`В каталоге уже ${current} товаров (цель ${TARGET}) — ничего не добавляю.`)
      return
    }

    const [existing] = await conn.query('SELECT name, code FROM products')
    const names = new Set(existing.map((p) => p.name.toLowerCase()))
    const candidates = buildCandidates().filter((c) => !names.has(c.name.toLowerCase()))
    if (candidates.length < need) {
      throw new Error(`Недостаточно вариантов товаров: нужно ${need}, есть ${candidates.length}`)
    }
    const batch = candidates.slice(0, need)

    // следующие свободные коды P041, P042, ...
    const maxCode = existing.reduce((max, p) => Math.max(max, parseInt(String(p.code).replace(/\D/g, '')) || 0), 0)
    batch.forEach((p, i) => (p.code = 'P' + String(maxCode + i + 1).padStart(3, '0')))

    const [lists] = await conn.query('SELECT id, name, is_default FROM price_lists')
    const defaultList = lists.find((l) => l.is_default)
    const vip = lists.find((l) => l.name === 'Client VIP')
    const mic = lists.find((l) => l.name === 'Client Mic')

    await conn.beginTransaction()

    const CHUNK = 200
    for (let i = 0; i < batch.length; i += CHUNK) {
      const part = batch.slice(i, i + CHUNK)
      await conn.query(
        'INSERT INTO products (code, name, category, base_unit, sale_unit, sale_unit_factor, vat_rate) VALUES ?',
        [part.map((p) => [p.code, p.name, p.category, 'buc', 'bax', p.factor, p.vat])]
      )
    }

    const [rows] = await conn.query('SELECT id, code FROM products WHERE code IN (?)', [batch.map((p) => p.code)])
    const idByCode = new Map(rows.map((r) => [r.code, r.id]))

    const prices = []
    const translations = []
    for (const p of batch) {
      const id = idByCode.get(p.code)
      prices.push([defaultList.id, id, p.price])
      if (vip) prices.push([vip.id, id, round2(p.price * 0.85)]) // как в seed.js: VIP −15%
      if (mic) prices.push([mic.id, id, round2(p.price * 1.05)]) // Client Mic +5%
      translations.push([id, 'ru', p.ru, null], [id, 'en', p.en, null])
    }

    // категории переводим так же, как у уже существующих товаров
    const [catRows] = await conn.query(
      `SELECT DISTINCT p.category, tr.lang, tr.category AS translated
       FROM product_translations tr JOIN products p ON p.id = tr.product_id`
    )
    const catMap = new Map(catRows.map((r) => [r.category + '|' + r.lang, r.translated]))
    for (const t of translations) {
      const product = batch.find((p) => idByCode.get(p.code) === t[0])
      t[3] = catMap.get(product.category + '|' + t[1]) || product.category
    }

    for (let i = 0; i < prices.length; i += 500) {
      await conn.query('INSERT INTO price_list_items (price_list_id, product_id, price) VALUES ?', [prices.slice(i, i + 500)])
    }
    for (let i = 0; i < translations.length; i += 500) {
      await conn.query('INSERT INTO product_translations (product_id, lang, name, category) VALUES ?', [
        translations.slice(i, i + 500),
      ])
    }

    await conn.commit()
    console.log(`✅ Добавлено товаров: ${batch.length}. Теперь в каталоге: ${current + batch.length}`)
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error('❌ Ошибка:', err.message)
  } finally {
    conn.release()
    process.exit()
  }
}

generate()
