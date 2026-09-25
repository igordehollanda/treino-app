/**
 * Peso ao longo do tempo.
 *
 * Os pontos diários oscilam com a água do corpo; quem responde "estou
 * perdendo peso?" é a média móvel. Por isso ela é a linha grossa e o
 * ponto do dia é só um pingo.
 *
 * As faixas dos checkpoints entram como bandas: a meta não é um número
 * exato num dia exato, é estar dentro da faixa naquela data.
 */

import type { PontoPeso } from '../lib/nutricao'
import type { CheckpointPeso } from '../lib/tipos'

const L = 34   // eixo da esquerda
const TOPO = 8
const BASE = 18
const ALTURA = 150

export default function GraficoPeso({
  pontos, alvo, checkpoints,
}: {
  pontos: PontoPeso[]
  alvo: number | null
  checkpoints: CheckpointPeso[]
}) {
  if (pontos.length === 0) {
    return (
      <p className="rounded-xl border border-borda bg-elevado p-4 text-center text-sm text-suave">
        Sem pesagens ainda. O peso em jejum entra pelo cartão Alimentação, no Hoje.
      </p>
    )
  }

  const dias = [...pontos.map((p) => p.dia), ...checkpoints.map((c) => c.dia)].sort()
  const t0 = new Date(`${dias[0]}T12:00:00`).getTime()
  const t1 = new Date(`${dias[dias.length - 1]}T12:00:00`).getTime()

  const valores = [
    ...pontos.map((p) => p.peso),
    ...checkpoints.flatMap((c) => [c.min, c.max]),
    ...(alvo != null ? [alvo] : []),
  ]
  const min = Math.floor(Math.min(...valores) - 0.5)
  const max = Math.ceil(Math.max(...valores) + 0.5)

  const LARGURA = 320
  const x = (dia: string) => {
    const t = new Date(`${dia}T12:00:00`).getTime()
    if (t1 === t0) return L + (LARGURA - L) / 2
    return L + ((t - t0) / (t1 - t0)) * (LARGURA - L - 4)
  }
  const y = (v: number) => TOPO + ((max - v) / (max - min)) * (ALTURA - TOPO - BASE)

  const comMedia = pontos.filter((p) => p.media != null)
  const linha = comMedia.map((p) => `${x(p.dia)},${y(p.media as number)}`).join(' ')

  return (
    <div>
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="w-full"
        role="img"
        aria-label="Peso ao longo do tempo"
      >
        {/* faixas dos checkpoints */}
        {checkpoints.map((c) => (
          <rect
            key={c.dia}
            x={x(c.dia) - 7}
            y={y(c.max)}
            width={14}
            height={Math.max(2, y(c.min) - y(c.max))}
            rx={3}
            className="fill-acento/25"
          />
        ))}

        {alvo != null && (
          <>
            <line
              x1={L} x2={LARGURA} y1={y(alvo)} y2={y(alvo)}
              className="stroke-feito" strokeWidth={1} strokeDasharray="3 3"
            />
            <text x={2} y={y(alvo) + 3.5} className="fill-feito" fontSize={9}>
              {alvo.toFixed(1)}
            </text>
          </>
        )}

        <text x={2} y={y(max) + 3.5} className="fill-fraco" fontSize={9}>{max.toFixed(0)}</text>
        <text x={2} y={y(min) + 3.5} className="fill-fraco" fontSize={9}>{min.toFixed(0)}</text>

        {/* pesagens do dia */}
        {pontos.map((p) => (
          <circle key={p.dia} cx={x(p.dia)} cy={y(p.peso)} r={2} className="fill-suave" />
        ))}

        {/* Media movel. Com uma so, nao ha linha a tracar — mas o dado
            existe, entao ele aparece como ponto em vez de sumir. */}
        {comMedia.length > 1 ? (
          <polyline points={linha} fill="none" className="stroke-acento-texto" strokeWidth={2} />
        ) : comMedia.length === 1 ? (
          <circle
            cx={x(comMedia[0].dia)}
            cy={y(comMedia[0].media as number)}
            r={3.5}
            className="fill-acento-texto"
          />
        ) : null}

        <text x={L} y={ALTURA - 4} className="fill-fraco" fontSize={9}>
          {curta(pontos[0].dia)}
        </text>
        <text x={LARGURA} y={ALTURA - 4} textAnchor="end" className="fill-fraco" fontSize={9}>
          {curta(pontos[pontos.length - 1].dia)}
        </text>
      </svg>

      <p className="mt-1 text-xs text-fraco">
        Pontos: pesagem do dia. Linha: média de 7 dias, que só aparece com 4 pesagens ou mais
        na janela.
      </p>

      {checkpoints.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {checkpoints.map((c) => {
            const doDia = pontos.find((p) => p.dia === c.dia)
            return (
              <p key={c.dia} className="flex items-baseline justify-between text-xs">
                <span className="text-suave">
                  {curta(c.dia)} · {c.min.toFixed(1)} a {c.max.toFixed(1)} kg
                </span>
                <span className={classeDoCheckpoint(doDia?.peso, c)}>
                  {rotuloDoCheckpoint(doDia?.peso, c)}
                </span>
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}

function rotuloDoCheckpoint(peso: number | undefined, c: CheckpointPeso) {
  if (peso == null) return 'sem pesagem'
  if (peso < c.min) return `${peso.toFixed(1)} · abaixo`
  if (peso > c.max) return `${peso.toFixed(1)} · acima`
  return `${peso.toFixed(1)} · dentro`
}

function classeDoCheckpoint(peso: number | undefined, c: CheckpointPeso) {
  if (peso == null) return 'text-fraco'
  if (peso > c.max) return 'text-alerta'
  return 'text-feito'
}

const curta = (dia: string) =>
  new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
