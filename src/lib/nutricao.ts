/**
 * Regras do modulo de nutricao: tipo do dia, totais e aderencia.
 *
 * Sem chamada de rede de proposito — tudo aqui e funcao pura sobre os
 * dados ja carregados, para poder ser conferido isoladamente.
 */

import type {
  Medida, MetasNutricionais, PlanoAlimentar, PlanoRefeicao, RefeicaoRegistro,
  TipoDia,
} from './tipos'

/**
 * Que tipo de dia e hoje, na ordem de precedencia da especificacao.
 *
 * O dia da semana (3) existe porque o pre-treino das 18h precisa aparecer
 * ANTES da aula, quando a atividade ainda nao foi marcada. O registro da
 * atividade (2) cobre a aula extra fora dos dias fixos. E a escolha manual
 * (1) vence as duas, porque quem sabe se vai treinar e a pessoa.
 */
export function tipoDoDia(
  dia: Date,
  plano: PlanoAlimentar | null,
  medida: Medida | null,
  atividadeRegistradaNoDia: boolean,
): TipoDia {
  if (medida?.tipo_dia) return medida.tipo_dia
  if (plano?.atividade_jiu_jitsu_id && atividadeRegistradaNoDia) return 'jiu_jitsu'
  if (plano?.dias_jiu_jitsu.includes(dia.getDay())) return 'jiu_jitsu'
  return 'normal'
}

/** As refeicoes que aparecem num dia desse tipo, na ordem do plano. */
export function refeicoesDoDia(refeicoes: PlanoRefeicao[], tipo: TipoDia) {
  return refeicoes
    .filter((r) => r.tipo_dia === 'ambos' || r.tipo_dia === tipo)
    .sort((a, b) => a.ordem - b.ordem)
}

export type TotaisDoDia = {
  kcal: number
  proteina_g: number
  /** Registros sem estimativa: aparecem como "+N sem estimativa", nunca como zero. */
  semEstimativa: number
}

/**
 * Soma do dia.
 *
 * `pulada` nao soma e nao conta como sem estimativa — foi uma escolha, nao
 * uma lacuna. Registro com kcal nulo e lacuna: exibir zero ali faria o
 * total mentir para baixo.
 */
export function totaisDoDia(registros: RefeicaoRegistro[]): TotaisDoDia {
  let kcal = 0
  let proteina_g = 0
  let semEstimativa = 0

  for (const r of registros) {
    if (r.estado === 'pulada') continue
    if (r.kcal == null) {
      semEstimativa++
      continue
    }
    kcal += r.kcal
    proteina_g += r.proteina_g ?? 0
  }
  return { kcal, proteina_g, semEstimativa }
}

const PESO_DO_ESTADO: Record<RefeicaoRegistro['estado'], number> = {
  cumprida: 1,
  parcial: 0.5,
  fora_do_plano: 0,
  pulada: 0,
}

export type Aderencia = {
  /** 0 a 1; null quando nenhuma obrigatoria foi registrada. */
  percentual: number | null
  registradas: number
  naoRegistradas: number
}

/**
 * Aderencia do dia sobre as refeicoes OBRIGATORIAS.
 *
 * O denominador sao as registradas, nao as previstas: quem esqueceu de
 * anotar nao levou nota zero. As nao registradas aparecem ao lado, em
 * numero — e a mesma logica do RIR e das faltas, onde vazio nao e falha.
 */
export function aderenciaDoDia(
  refeicoes: PlanoRefeicao[],
  registros: RefeicaoRegistro[],
): Aderencia {
  const obrigatorias = refeicoes.filter((r) => r.obrigatoria)
  const porRefeicao = new Map(
    registros.filter((r) => r.refeicao_id).map((r) => [r.refeicao_id as string, r]),
  )

  let soma = 0
  let registradas = 0
  for (const r of obrigatorias) {
    const reg = porRefeicao.get(r.id)
    if (!reg) continue
    registradas++
    soma += PESO_DO_ESTADO[reg.estado]
  }

  return {
    percentual: registradas === 0 ? null : soma / registradas,
    registradas,
    naoRegistradas: obrigatorias.length - registradas,
  }
}

/** Media dos dias que tem ao menos um registro; dias em branco nao entram. */
export function aderenciaMedia(dias: Aderencia[]) {
  const comRegistro = dias.filter((d) => d.percentual !== null)
  if (comRegistro.length === 0) return null
  return comRegistro.reduce((s, d) => s + (d.percentual ?? 0), 0) / comRegistro.length
}

export type PontoPeso = { dia: string; peso: number; media: number | null }

/**
 * Peso diario com media movel de 7 dias.
 *
 * A media so aparece com 4 pesagens ou mais na janela: com menos que isso
 * ela oscila com a agua do corpo e sugere tendencia onde nao ha.
 */
export function serieDePeso(
  medidas: { dia: string; peso_kg: number | null }[],
  minimoNaJanela = 4,
): PontoPeso[] {
  const pesagens = medidas
    .filter((m): m is { dia: string; peso_kg: number } => m.peso_kg != null)
    .sort((a, b) => a.dia.localeCompare(b.dia))

  return pesagens.map((m, i) => {
    const limite = new Date(`${m.dia}T12:00:00`)
    limite.setDate(limite.getDate() - 6)
    const janela = pesagens
      .slice(0, i + 1)
      .filter((p) => new Date(`${p.dia}T12:00:00`) >= limite)

    return {
      dia: m.dia,
      peso: m.peso_kg,
      media:
        janela.length >= minimoNaJanela
          ? Math.round((janela.reduce((s, p) => s + p.peso_kg, 0) / janela.length) * 10) / 10
          : null,
    }
  })
}

/** A meta que vale hoje, conforme o tipo do dia. */
export function metaDoDia(metas: MetasNutricionais | null, tipo: TipoDia) {
  if (!metas) return { kcal: null, proteina_g: null, agua_ml: null }
  const jj = tipo === 'jiu_jitsu'
  return {
    kcal: jj ? metas.kcal_jiu_jitsu : metas.kcal_normal,
    proteina_g: jj ? metas.proteina_g_jiu_jitsu : metas.proteina_g_normal,
    agua_ml: jj ? metas.agua_ml_jiu_jitsu : metas.agua_ml_normal,
  }
}
