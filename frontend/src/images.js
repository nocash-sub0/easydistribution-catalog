import { API_URL, apiFetch } from './api'

const MAX_SIDE = 600

// Иконки-заглушки по исходной категории, пока у товара нет фото
const CATEGORY_ICONS = {
  Băuturi: '🥤',
  Carne: '🥩',
  Cereale: '🌾',
  Condimente: '🧂',
  Conserve: '🥫',
  Dulciuri: '🍫',
  Lactate: '🥛',
  'Legume-Fructe': '🥕',
  Panificație: '🍞',
  Ulei: '🫒',
}

export function categoryIcon(categoryCode) {
  return CATEGORY_ICONS[categoryCode] || '🛒'
}

export function imageUrl(product) {
  return product.imageVersion ? `${API_URL}/products/${product.id}/image?v=${product.imageVersion}` : null
}

// Уменьшает фото в браузере (до 600px, WebP) — в базу уходит ~30–80 КБ вместо мегабайтов с телефона
async function compressImage(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff' // прозрачный PNG не станет чёрным в JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.82))
  let blob = await toBlob('image/webp')
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg') // старые браузеры без WebP

  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000))
  return { mime: blob.type, data: btoa(binary) }
}

export async function uploadProductImage(productId, file) {
  const body = await compressImage(file)
  const res = await apiFetch(`/products/${productId}/image`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Upload failed')
  return data.imageVersion
}

export async function deleteProductImage(productId) {
  const res = await apiFetch(`/products/${productId}/image`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Delete failed')
}
