// Бесплатный автоперевод названий новых товаров и категорий (румынский -> русский/английский).
//
// Название разбирается на части:
//  - бренд (остаётся как написан): текст в кавычках, слово с заглавной буквы не в начале названия
//    («Lapte Milli»), слова вроде «Coca-Cola» или «JACOBS», а первое слово — если оно не является
//    обычным словом (переводчик возвращает его без изменений);
//  - объём/вес («1L», «400g») — единицы переводятся локально;
//  - остальное — тип и описание товара: сначала встроенный словарь, затем бесплатный сервис MyMemory.
// При любой ошибке часть названия остаётся как в оригинале.
const pool = require('./db')

const TARGET_LANGS = ['ru', 'en']

// Словарь частых названий (ключи — без диакритики, в нижнем регистре): [ru, en]
const DICTIONARY = {
  lapte: ['молоко', 'milk'],
  branza: ['сыр', 'cheese'],
  'branza de vaci': ['творог', 'cottage cheese'],
  'branza telemea': ['брынза', 'telemea cheese'],
  telemea: ['брынза', 'telemea cheese'],
  smantana: ['сметана', 'sour cream'],
  unt: ['сливочное масло', 'butter'],
  cascaval: ['сыр кашкавал', 'kashkaval cheese'],
  iaurt: ['йогурт', 'yogurt'],
  chefir: ['кефир', 'kefir'],
  oua: ['яйца', 'eggs'],
  paine: ['хлеб', 'bread'],
  'paine alba': ['белый хлеб', 'white bread'],
  'paine neagra': ['чёрный хлеб', 'dark bread'],
  suc: ['сок', 'juice'],
  'suc de mere': ['яблочный сок', 'apple juice'],
  'suc de portocale': ['апельсиновый сок', 'orange juice'],
  apa: ['вода', 'water'],
  'apa minerala': ['минеральная вода', 'mineral water'],
  cafea: ['кофе', 'coffee'],
  'cafea macinata': ['молотый кофе', 'ground coffee'],
  'cafea boabe': ['кофе в зёрнах', 'coffee beans'],
  ceai: ['чай', 'tea'],
  'ceai verde': ['зелёный чай', 'green tea'],
  'ceai negru': ['чёрный чай', 'black tea'],
  bere: ['пиво', 'beer'],
  vin: ['вино', 'wine'],
  limonada: ['лимонад', 'lemonade'],
  ciocolata: ['шоколад', 'chocolate'],
  'ciocolata cu lapte': ['молочный шоколад', 'milk chocolate'],
  'ciocolata neagra': ['тёмный шоколад', 'dark chocolate'],
  bomboane: ['конфеты', 'candies'],
  biscuiti: ['печенье', 'biscuits'],
  napolitane: ['вафли', 'wafers'],
  ulei: ['масло', 'oil'],
  'ulei de floarea-soarelui': ['подсолнечное масло', 'sunflower oil'],
  'ulei de masline': ['оливковое масло', 'olive oil'],
  orez: ['рис', 'rice'],
  hrisca: ['гречка', 'buckwheat'],
  paste: ['макароны', 'pasta'],
  'paste fainoase': ['макароны', 'pasta'],
  faina: ['мука', 'flour'],
  zahar: ['сахар', 'sugar'],
  sare: ['соль', 'salt'],
  piper: ['перец', 'pepper'],
  'piper negru': ['чёрный перец', 'black pepper'],
  malai: ['кукурузная мука', 'cornmeal'],
  carne: ['мясо', 'meat'],
  pui: ['курица', 'chicken'],
  'piept de pui': ['куриная грудка', 'chicken breast'],
  porc: ['свинина', 'pork'],
  vita: ['говядина', 'beef'],
  carnati: ['колбаски', 'sausages'],
  salam: ['салями', 'salami'],
  sunca: ['ветчина', 'ham'],
  peste: ['рыба', 'fish'],
  mere: ['яблоки', 'apples'],
  pere: ['груши', 'pears'],
  banane: ['бананы', 'bananas'],
  cartofi: ['картофель', 'potatoes'],
  ceapa: ['лук', 'onions'],
  rosii: ['помидоры', 'tomatoes'],
  castraveti: ['огурцы', 'cucumbers'],
  morcovi: ['морковь', 'carrots'],
  mazare: ['горошек', 'peas'],
  porumb: ['кукуруза', 'corn'],
}

const CATEGORIES = {
  bauturi: ['Напитки', 'Beverages'],
  carne: ['Мясо', 'Meat'],
  cereale: ['Крупы и злаки', 'Cereals & grains'],
  condimente: ['Приправы и специи', 'Spices & seasonings'],
  conserve: ['Консервы', 'Canned goods'],
  dulciuri: ['Сладости', 'Sweets'],
  lactate: ['Молочные продукты', 'Dairy'],
  'legume-fructe': ['Овощи и фрукты', 'Vegetables & fruits'],
  panificatie: ['Хлебобулочные изделия', 'Bakery'],
  ulei: ['Масло', 'Oil'],
}

const UNITS = {
  l: ['л', 'L'],
  ml: ['мл', 'ml'],
  g: ['г', 'g'],
  gr: ['г', 'g'],
  kg: ['кг', 'kg'],
  pl: ['пак.', 'bags'],
  buc: ['шт.', 'pcs'],
}

const LANG_INDEX = { ru: 0, en: 1 }

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

const cache = new Map()

async function myMemory(text, to) {
  const key = to + ':' + text
  if (cache.has(key)) return cache.get(key)
  let out = null
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ro|${to}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (res.ok) {
      const data = await res.json()
      const t = data?.responseData?.translatedText
      if (!data.quotaFinished && t && !/MYMEMORY|INVALID|QUERY LENGTH/i.test(t)) out = t.trim()
    }
  } catch {
    out = null
  }
  cache.set(key, out)
  return out
}

function formatUnit(number, unit, lang) {
  const u = UNITS[unit.toLowerCase()]
  if (!u) return null
  const num = lang === 'ru' ? number.replace('.', ',') : number.replace(',', '.')
  return `${num} ${u[LANG_INDEX[lang]]}`
}

function looksLikeBrand(word, index) {
  if (/^[A-ZĂÂÎȘŞȚŢ][^\s]*[A-Z]/.test(word)) return true // Coca-Cola, McDonald, JACOBS
  if (index > 0 && /^[A-ZĂÂÎȘŞȚŢ]/.test(word)) return true // «Lapte Milli»: заглавная не в начале
  return false
}

function isKnownWordStart(word) {
  const w = normalize(word)
  return Object.keys(DICTIONARY).some((k) => k === w || k.startsWith(w + ' '))
}

// Разбивает название на сегменты: { type: 'brand' | 'unit' | 'text', value, number?, unit? }
async function splitName(name) {
  const segments = []
  const re = /["“„«]([^"”»]+)["”»]|(\d+(?:[.,]\d+)?)\s*(kg|ml|gr|g|l|pl|buc)\b|(\d+(?:[.,]\d+)?%?)(?=\s|$)|(\S+)/gi
  let m
  let wordIndex = 0
  while ((m = re.exec(name))) {
    if (m[1]) {
      segments.push({ type: 'brand', value: m[1].trim() })
    } else if (m[2]) {
      segments.push({ type: 'unit', value: m[0], number: m[2], unit: m[3] })
    } else if (m[4]) {
      segments.push({ type: 'number', value: m[4] })
    } else {
      const word = m[5]
      let type = looksLikeBrand(word, wordIndex) ? 'brand' : 'text'
      // первое слово: если его нет в словаре и переводчик не может его перевести — это бренд
      if (type === 'text' && wordIndex === 0 && !isKnownWordStart(word) && /^[A-ZĂÂÎȘŞȚŢ]/.test(word)) {
        const ru = await myMemory(word, 'ru')
        if (!ru || !/[А-Яа-яЁё]/.test(ru)) type = 'brand'
      }
      segments.push({ type, value: word })
    }
    wordIndex++
  }

  // соседние слова одного типа склеиваем во фразы («cu lapte», «de floarea-soarelui»)
  const merged = []
  for (const s of segments) {
    const last = merged[merged.length - 1]
    if (last && s.type === last.type && s.type !== 'unit' && s.type !== 'number') last.value += ' ' + s.value
    else merged.push({ ...s })
  }
  return merged
}

async function translatePhrase(phrase, lang) {
  const fromDict = DICTIONARY[normalize(phrase)]
  if (fromDict) return fromDict[LANG_INDEX[lang]]
  return (await myMemory(phrase, lang)) || phrase
}

async function translateName(name, lang) {
  const segments = await splitName(name)
  const parts = []
  for (const [i, s] of segments.entries()) {
    if (s.type === 'brand') {
      parts.push(s.value)
    } else if (s.type === 'number') {
      parts.push(lang === 'ru' ? s.value.replace('.', ',') : s.value.replace(',', '.'))
    } else if (s.type === 'unit') {
      parts.push(formatUnit(s.number, s.unit, lang) || s.value)
    } else {
      let text = await translatePhrase(s.value, lang)
      // тип товара в начале — с заглавной, в середине — со строчной
      text = i === 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text.charAt(0).toLowerCase() + text.slice(1)
      parts.push(text)
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

// Категория, которая уже есть у другого товара, переводится одинаково
async function translateCategory(category, lang) {
  const [rows] = await pool.query(
    `SELECT tr.category FROM product_translations tr JOIN products p ON p.id = tr.product_id
     WHERE p.category = ? AND tr.lang = ? LIMIT 1`,
    [category, lang]
  )
  if (rows.length > 0) return rows[0].category
  const known = CATEGORIES[normalize(category)]
  if (known) return known[LANG_INDEX[lang]]
  const t = await myMemory(category, lang)
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : category
}

async function autoTranslateProduct(productId, name, category) {
  for (const lang of TARGET_LANGS) {
    try {
      const translatedName = (await translateName(name, lang)).slice(0, 255)
      const translatedCategory = (await translateCategory(category, lang)).slice(0, 100)
      await pool.query(
        `INSERT INTO product_translations (product_id, lang, name, category) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category)`,
        [productId, lang, translatedName, translatedCategory]
      )
    } catch (err) {
      console.error('Auto-translate failed:', err.message)
    }
  }
}

module.exports = { autoTranslateProduct, translateName, TARGET_LANGS }
