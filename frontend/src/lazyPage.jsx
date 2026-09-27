import { lazy, useState } from 'react'

// Как React.lazy, но с preload(): если код страницы уже скачан заранее, она показывается сразу,
// без заглушки «Загрузка…» (обычный lazy показывает её на мгновение даже для скачанного кода).
export default function lazyPage(load) {
  let loaded = null
  let promise = null
  const preload = () =>
    (promise ??= load()
      .then((m) => (loaded = m.default))
      .catch((err) => {
        promise = null // сеть моргнула — при следующей попытке скачаем заново
        throw err
      }))
  const Lazy = lazy(() => preload().then(() => ({ default: loaded })))

  function Page(props) {
    // выбираем один раз на монтирование: смена типа компонента сбросила бы состояние страницы
    const [Component] = useState(() => loaded || Lazy)
    return <Component {...props} />
  }
  Page.preload = () => preload().catch(() => {}) // фоновая загрузка: ошибка не важна, повторим при открытии
  return Page
}
