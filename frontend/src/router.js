import { useEffect, useState } from 'react'

// Простой роутинг на адресах вида /#/checkout: работает на любом хостинге без настройки сервера,
// кнопки «Назад»/«Вперёд» браузера и обновление страницы сохраняют текущий экран.

function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/'
}

export function navigate(path) {
  if (currentPath() === path) return
  window.location.hash = path
}

export function useRoute() {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const onChange = () => {
      setPath(currentPath())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return path
}
