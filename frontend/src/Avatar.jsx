// Кружок с первой буквой имени пользователя (в шапке и в личном кабинете)
export default function Avatar({ name, size = 32 }) {
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }} aria-hidden="true">
      {letter}
    </span>
  )
}
