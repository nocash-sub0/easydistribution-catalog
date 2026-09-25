// Автоперевод названий новых товаров и категорий (румынский -> русский/английский).
// Использует бесплатный сервис MyMemory. Это best-effort: при любой ошибке перевод просто
// не сохраняется, и на витрине показывается исходное название.
const pool = require('./db')

const TARGET_LANGS = ['ru', 'en']

async function translateText(text, to) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ro|${to}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const out = data?.responseData?.translatedText
    if (data.quotaFinished || !out || /MYMEMORY|INVALID|QUERY LENGTH/i.test(out)) return null
    return out.trim()
  } catch {
    return null
  }
}

// Категория переводится один раз: если у такой же категории уже есть перевод, берём его
async function categoryTranslation(category, lang) {
  const [rows] = await pool.query(
    `SELECT tr.category FROM product_translations tr JOIN products p ON p.id = tr.product_id
     WHERE p.category = ? AND tr.lang = ? LIMIT 1`,
    [category, lang]
  )
  if (rows.length > 0) return rows[0].category
  return (await translateText(category, lang)) || category
}

async function autoTranslateProduct(productId, name, category) {
  for (const lang of TARGET_LANGS) {
    try {
      const translatedName = await translateText(name, lang)
      if (!translatedName) continue
      const translatedCategory = await categoryTranslation(category, lang)
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

module.exports = { autoTranslateProduct, TARGET_LANGS }
