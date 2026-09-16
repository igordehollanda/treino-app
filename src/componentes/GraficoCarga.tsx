import type { PontoProgressao } from '../lib/tipos'

/**
 * Barras: a carga mais pesada de cada dia naquele exercicio.
 * Dias, nao series — o que interessa e a tendencia entre treinos.
 */
export default function GraficoCarga({
  pontos, altura = 'h-32', maximo = 12,
}: {
  pontos: PontoProgressao[]
  altura?: string
  maximo?: number
}) {
  if (pontos.length === 0) return null

  const ultimos = pontos.slice(-maximo)
  const maior = Math.max(...ultimos.map((p) => p.carga))
  const primeiro = ultimos[0]
  const atual = ultimos[ultimos.length - 1]
  const delta = atual.carga - primeiro.carga

  return (
    <div>
      <div className={`flex items-end gap-1.5 ${altura}`}>
        {ultimos.map((p) => (
          <div key={p.dia} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[9px] tabular-nums text-suave">{p.carga}</span>
            <div
              className="w-full rounded-t bg-acento"
              style={{ height: `${Math.max(6, (p.carga / maior) * 100)}%` }}
              title={`${p.dia}: ${p.carga}kg${p.reps ? ` × ${p.reps}` : ''}`}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-sm text-suave">
        {delta > 0 && <span className="text-feito">+{arredonda(delta)}kg</span>}
        {delta < 0 && <span className="text-alerta">{arredonda(delta)}kg</span>}
        {delta === 0 && <span>mesma carga</span>}
        {ultimos.length > 1 && (
          <span className="ml-1">desde {dataCurta(primeiro.dia)}</span>
        )}
      </p>
    </div>
  )
}

const arredonda = (n: number) => Math.round(n * 10) / 10

const dataCurta = (dia: string) =>
  new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
