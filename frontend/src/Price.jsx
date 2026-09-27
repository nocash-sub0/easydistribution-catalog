/* eslint-disable react-refresh/only-export-components */
import { formatMDL } from './catalog'
import { useLang } from './i18n'

const LOCALES = { ru: 'ru-RU', ro: 'ro-MD', en: 'en-GB' }

// Дата из сервера (YYYY-MM-DD) в формате языка сайта
export function formatDay(iso, lang) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString(LOCALES[lang] || 'ro-MD', { day: 'numeric', month: 'long' })
}

// Цена за упаковку: при акции — зачёркнутая обычная цена и цена со скидкой
export function PriceMain({ product, className = '' }) {
  const { unit } = useLang()
  const promo = product.promo
  return (
    <div className={'price-main ' + className + (promo ? ' on-promo' : '')}>
      {promo && <span className="price-old">{formatMDL(product.regularSaleUnitPriceWithVat)}</span>}
      {formatMDL(product.saleUnitPriceWithVat)} <small>/ {unit(product.saleUnit)}</small>
    </div>
  )
}

// Подпись под ценой: до какого числа действует акция и персональная ли она
export function PromoNote({ product }) {
  const { t, lang } = useLang()
  const promo = product.promo
  if (!promo) return null
  const parts = []
  if (promo.personal) parts.push(t('promoPersonal'))
  if (promo.endsAt) parts.push(t('promoUntil', { date: formatDay(promo.endsAt, lang) }))
  if (parts.length === 0) return null
  return <div className="promo-note">{parts.join(' · ')}</div>
}

export function PromoBadge({ product }) {
  return product.promo ? <span className="tag-promo">−{product.promo.percent}%</span> : null
}
