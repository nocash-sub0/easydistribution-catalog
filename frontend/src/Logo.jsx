import { APP_NAME } from './i18n'

// Название магазина в шапке — ссылка на главную страницу (витрину) с любой страницы.
// onClick — если странице нужно что-то сделать перед переходом (сбросить фильтры, убрать ?payment=...).
export default function Logo({ onClick }) {
  return (
    <a
      className="logo"
      href="#/"
      onClick={(e) => {
        if (!onClick) return
        e.preventDefault()
        onClick()
      }}
    >
      {APP_NAME}
    </a>
  )
}
