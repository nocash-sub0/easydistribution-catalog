import { useEffect, useLayoutEffect, useState } from 'react'

// Простой роутинг на адресах вида /#/checkout: работает на любом хостинге без настройки сервера,
// кнопки «Назад»/«Вперёд» браузера и обновление страницы сохраняют текущий экран.

function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/'
}

export function navigate(path) {
  if (currentPath() === path) return
  window.location.hash = path
}

// На витрину возвращаемся туда же, где были (после страницы товара), остальные экраны — сверху
const RESTORE_SCROLL = ['/']
const scrollPositions = {}
let lastPath = currentPath()

export function useRoute() {
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const onChange = () => {
      // запоминаем прокрутку до того, как страница сменится
      scrollPositions[lastPath] = window.scrollY
      lastPath = currentPath()
      setPath(lastPath)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  useLayoutEffect(() => {
    window.scrollTo(0, RESTORE_SCROLL.includes(path) ? scrollPositions[path] || 0 : 0)
  }, [path])

  return path
}
