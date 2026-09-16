import type { Periodizacao, SemanaCiclo, TreinoExercicio } from './tipos'

/**
 * Em que semana do ciclo estamos hoje.
 *
 * O ciclo se repete indefinidamente a partir de `inicio`: com 4 semanas
 * cadastradas, o dia 29 de um ciclo iniciado no dia 1 volta a ser semana 1.
 * Assim o personal define a periodizacao uma vez e ela roda sozinha.
 */
export function semanaDoCiclo(
  inicio: string | null,
  semanas: Periodizacao[],
  hoje: Date = new Date(),
): SemanaCiclo | null {
  if (!inicio || semanas.length === 0) return null

  // Meio-dia nos dois lados: imune a horario de verao e a fuso.
  const dia0 = new Date(`${inicio}T12:00:00`)
  const diaHoje = new Date(hoje)
  diaHoje.setHours(12, 0, 0, 0)

  const dias = Math.floor((diaHoje.getTime() - dia0.getTime()) / 864e5)
  if (dias < 0) return null // ciclo ainda nao comecou

  const ordenadas = [...semanas].sort((a, b) => a.semana - b.semana)
  const semanasCorridas = Math.floor(dias / 7)
  const atual = ordenadas[semanasCorridas % ordenadas.length]

  return {
    semana: atual.semana,
    reps: atual.reps,
    observacao: atual.observacao,
    total: ordenadas.length,
    ciclo: Math.floor(semanasCorridas / ordenadas.length) + 1,
    diasParaProxima: 7 - (dias % 7),
  }
}

/**
 * A repeticao que vale para este exercicio hoje.
 * O valor gravado no exercicio e uma EXCECAO; o normal e seguir a semana.
 */
export function repsDoDia(item: TreinoExercicio, semana: SemanaCiclo | null): string {
  return item.reps ?? semana?.reps ?? '—'
}
