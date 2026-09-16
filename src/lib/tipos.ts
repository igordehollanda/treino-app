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
  /** null = segue a periodizacao da semana; texto = excecao deste exercicio. */
  reps: string | null
  descanso_seg: number
  observacao: string | null
  /** Mesmo numero no mesmo treino = bi-set; null = exercicio solo. */
  grupo: number | null
  exercicios: Exercicio | null
}

export type Periodizacao = {
  semana: number
  reps: string
  observacao: string | null
}

/** Onde o ciclo esta hoje, ja resolvido para a tela. */
export type SemanaCiclo = {
  semana: number
  reps: string
  observacao: string | null
  /** quantas semanas tem o ciclo */
  total: number
  /** qual repeticao do ciclo estamos vivendo (1a, 2a, ...) */
  ciclo: number
  diasParaProxima: number
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
  /** 0 = falha; N = repeticoes em reserva; null = nao informado. */
  rir: number | null
  registrada_em: string
}

export type PontoProgressao = {
  dia: string
  carga: number
  reps: number | null
}

export type UltimaCarga = {
  exercicio_id: string
  carga_kg: number | null
  reps: number | null
  /** 0 = falha; N = repeticoes em reserva; null = nao informado. */
  rir: number | null
  registrada_em: string
}

/** Treino com tudo que a tela precisa, ja montado. */
export type TreinoCompleto = Treino & {
  alunos: string[]
  itens: TreinoExercicio[]
}
