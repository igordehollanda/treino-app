/** "2026-09-16" no fuso local — nunca o toISOString, que desloca o dia. */
export function chaveDia(d: Date) {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** A segunda-feira da semana de `d`. Semana de treino comeca na segunda. */
export function inicioDaSemana(d: Date = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
