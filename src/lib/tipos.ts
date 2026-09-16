export type Papel = 'aluno' | 'personal'

export type Perfil = {
  id: string
  nome: string
  papel: Papel
  cor: string
}

export type Exercicio = {
  id: string
  nome: string
  grupo_muscular: string | null
  video_url: string | null
}

export type Treino = {
  id: string
  nome: string
  ordem: number
  observacoes: string | null
  ativo: boolean
  atualizado_em: string
}

/** `perfil_id: null` = o exercicio vale para os dois alunos. */
export type TreinoExercicio = {
  id: string
  treino_id: string
  exercicio_id: string
  perfil_id: string | null
  ordem: number
  series: number
  reps: string
  descanso_seg: number
  observacao: string | null
  exercicios: Exercicio | null
}

export type Sessao = {
  id: string
  perfil_id: string
  treino_id: string | null
  treino_nome: string
  iniciada_em: string
  finalizada_em: string | null
  observacao: string | null
}

export type SerieRegistro = {
  id: string
  sessao_id: string
  perfil_id: string
  exercicio_id: string | null
  exercicio_nome: string
  serie: number
  carga_kg: number | null
  reps: number | null
  registrada_em: string
}

export type UltimaCarga = {
  exercicio_id: string
  carga_kg: number | null
  reps: number | null
  registrada_em: string
}

/** Treino com tudo que a tela precisa, ja montado. */
export type TreinoCompleto = Treino & {
  alunos: string[]
  itens: TreinoExercicio[]
}
