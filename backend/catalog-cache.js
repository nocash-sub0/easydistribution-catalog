// Готовый каталог в памяти сервера. База Aiven далеко от Render: каждый запрос к ней — сотни мс,
// а каталог меняется редко. Любое изменение данных сбрасывает кэш целиком.
const TTL_MS = 10 * 60 * 1000 // страховка на случай правок в базе в обход сервера (скрипты, консоль)

const store = new Map()

// Храним промис: одновременные запросы одного и того же каталога ждут одну выборку из базы.
// Ответ, начатый до сброса, в кэш уже не вернётся — сброс удаляет запись целиком.
function cached(key, load) {
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise
  const promise = load()
  const entry = { promise, at: Date.now() }
  store.set(key, entry)
  promise.catch(() => {
    if (store.get(key) === entry) store.delete(key)
  })
  return promise
}

function invalidate() {
  store.clear()
}

module.exports = { cached, invalidate }
