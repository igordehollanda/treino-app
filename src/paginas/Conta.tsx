import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import {
  apagarAtividade, buscarAtividades, buscarMetas, buscarPlano, buscarPlanoAlimentar,
  buscarTreinos, definirDiaDoPlano, metasEmCache, planoEmCache, salvarAtividade,
  salvarMetas, salvarPlanoAlimentar, treinosEmCache,
} from '../lib/db'
import type {
  Atividade, CheckpointPeso, MetasNutricionais, PlanoCompleto, TreinoCompleto,
} from '../lib/tipos'

// Segunda primeiro: e como uma semana de treino e pensada.
const DIAS: [number, string][] = [
  [1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'],
  [5, 'Sexta'], [6, 'Sábado'], [0, 'Domingo'],
]

/** Trocar a propria senha sem depender de e-mail chegar. */
export default function Conta() {
  const { perfil, sessao, sair } = useAuth()
  const navegar = useNavigate()
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [estado, setEstado] = useState<'parado' | 'salvando' | 'salva'>('parado')
  const [abrindoSenha, setAbrindoSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (senha !== repetida) {
      setErro('As duas senhas não são iguais.')
      return
    }
    if (senha.length < 6) {
      setErro('Use pelo menos 6 caracteres.')
      return
    }
    setEstado('salvando')
    setErro(null)
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setErro(error.message)
      setEstado('parado')
    } else {
      setSenha('')
      setRepetida('')
      setEstado('salva')
    }
  }

  return (
    <div className="mx-auto max-w-lg p-5 md:max-w-xl">
      <button onClick={() => navegar('/')} className="mb-4 text-sm text-suave">
        ← Hoje
      </button>

      <h1 className="text-2xl font-bold">{perfil?.nome}</h1>
      <p className="mt-0.5 text-sm text-suave">{sessao?.user.email}</p>
      <p className="mt-1 text-sm text-fraco">
        {perfil?.papel === 'personal' ? 'Personal' : 'Aluno'}
      </p>

      <PlanoDaSemana perfilId={perfil?.id ?? ''} ehPersonal={perfil?.papel === 'personal'} />

      <Extras perfilId={perfil?.id ?? ''} />

      {/* Metas de comida so existem para os alunos: o personal nao ve
          nada do modulo de nutricao. */}
      {perfil && perfil.papel === 'aluno' && <Metas perfilId={perfil.id} />}

      {/* Trocar senha e raro: fica recolhido para nao ocupar o topo da
          tela com o que quase nunca se usa. */}
      <section className="mt-8">
        <button
          onClick={() => setAbrindoSenha((a) => !a)}
          className="flex w-full items-center justify-between py-1 text-left"
        >
          <span className="text-sm font-medium text-texto">Trocar a senha</span>
          <span className="text-fraco">{abrindoSenha ? '−' : '+'}</span>
        </button>

        {abrindoSenha && (
      <form onSubmit={salvar} className="mt-3 flex flex-col gap-3">
        <p className="text-xs text-fraco">
          Com senha você entra mesmo quando o e-mail do link não chega.
        </p>

        <input
          type="password"
          autoComplete="new-password"
          placeholder="nova senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="rounded-xl border border-borda bg-superficie px-4 py-3.5 text-base outline-none focus:border-acento"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="repita a senha"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          className="rounded-xl border border-borda bg-superficie px-4 py-3.5 text-base outline-none focus:border-acento"
        />

        <button
          type="submit"
          disabled={estado === 'salvando'}
          className="rounded-xl bg-acento py-3.5 font-semibold text-white active:bg-acento-forte disabled:opacity-50"
        >
          {estado === 'salvando' ? 'Salvando…' : 'Salvar senha'}
        </button>

        {estado === 'salva' && (
          <p className="rounded-xl border border-feito/30 bg-feito/10 px-3 py-2.5 text-sm text-feito">
            Senha salva. Já dá para entrar com ela.
          </p>
        )}
        {erro && (
          <p className="rounded-xl border border-erro/30 bg-erro/10 px-3 py-2.5 text-sm text-erro">
            {erro}
          </p>
        )}
      </form>
        )}
      </section>

      <button
        onClick={() => void sair()}
        className="mt-8 w-full rounded-xl border border-borda py-3 text-sm text-suave"
      >
        Sair
      </button>
    </div>
  )
}

/** Que treino em cada dia. Dia sem treino e descanso. */
function PlanoDaSemana({ perfilId, ehPersonal }: { perfilId: string; ehPersonal: boolean }) {
  const [treinos, setTreinos] = useState<TreinoCompleto[]>(treinosEmCache())
  const [plano, setPlano] = useState<Record<number, string>>(planoEmCache(perfilId))
  const [salvando, setSalvando] = useState<number | null>(null)

  useEffect(() => {
    if (!perfilId) return
    void buscarTreinos().then(setTreinos).catch(console.error)
    void buscarPlano(perfilId).then(setPlano).catch(console.error)
  }, [perfilId])

  const meus = treinos.filter(
    (t) => t.ativo && (ehPersonal || t.alunos.includes(perfilId)),
  )

  async function mudar(dia: number, treinoId: string) {
    setSalvando(dia)
    const alvo = treinoId || null
    // Otimista: o select responde na hora, a rede confirma depois.
    setPlano((p) => {
      const novo = { ...p }
      if (alvo) novo[dia] = alvo
      else delete novo[dia]
      return novo
    })
    try {
      await definirDiaDoPlano(perfilId, dia, alvo)
    } catch (e) {
      console.error(e)
      await buscarPlano(perfilId).then(setPlano).catch(console.error)
    } finally {
      setSalvando(null)
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-texto">Plano da semana</h2>
      <p className="mt-1 text-xs text-fraco">
        É daqui que a tela Hoje sabe qual é o treino do dia.
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        {DIAS.map(([dia, nome]) => (
          <label key={dia} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-suave">{nome}</span>
            <select
              value={plano[dia] ?? ''}
              disabled={salvando === dia}
              onChange={(e) => void mudar(dia, e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-borda bg-superficie px-3 py-2.5 text-sm outline-none focus:border-acento disabled:opacity-50"
            >
              <option value="">descanso</option>
              {meus.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  )
}

/** Jiu-jitsu, cardio, corrida: o que voce marca sem serie nem carga. */
function Extras({ perfilId }: { perfilId: string }) {
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [nome, setNome] = useState('')
  const [emoji, setEmoji] = useState('')
  const [meta, setMeta] = useState('')

  const recarregar = () =>
    buscarAtividades(perfilId).then(setAtividades).catch(console.error)

  useEffect(() => {
    if (perfilId) void recarregar()
     
  }, [perfilId])

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    await salvarAtividade({
      nome: nome.trim(),
      emoji: emoji.trim() || null,
      perfil_id: perfilId,
      meta_semanal: meta.trim() ? Math.min(14, Math.max(1, Number(meta))) : null,
      ordem: atividades.length,
    })
    setNome('')
    setEmoji('')
    setMeta('')
    await recarregar()
  }

  async function remover(a: Atividade) {
    if (!confirm(`Remover "${a.nome}"? Os dias já marcados saem junto.`)) return
    await apagarAtividade(a.id)
    await recarregar()
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-texto">Extras</h2>
      <p className="mt-1 text-xs text-fraco">
        Atividades que você só marca que fez — sem série nem carga. A meta semanal é
        opcional.
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {atividades.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-xl border border-borda px-3 py-2.5"
          >
            <span className="text-lg leading-none">{a.emoji ?? '•'}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{a.nome}</span>
              <span className="text-xs text-fraco">
                {a.meta_semanal ? `meta: ${a.meta_semanal}× por semana` : 'sem meta'}
              </span>
            </span>
            <button
              onClick={() => void remover(a)}
              aria-label={`Remover ${a.nome}`}
              className="px-2 text-erro"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={adicionar} className="mt-3 flex gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="🏃"
          maxLength={4}
          className="w-14 rounded-xl border border-borda bg-superficie px-2 py-2.5 text-center text-base outline-none focus:border-acento"
        />
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="nova atividade"
          className="min-w-0 flex-1 rounded-xl border border-borda bg-superficie px-3 py-2.5 text-sm outline-none focus:border-acento"
        />
        <input
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          inputMode="numeric"
          placeholder="3×"
          className="w-14 rounded-xl border border-borda bg-superficie px-2 py-2.5 text-center text-sm outline-none focus:border-acento"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-acento px-4 text-sm font-semibold text-white active:bg-acento-forte"
        >
          +
        </button>
      </form>
    </section>
  )
}

/**
 * Metas de nutrição.
 *
 * Os números do dia normal e do dia de jiu-jitsu são diferentes de
 * propósito: nos dias de aula come-se mais carboidrato e menos proteína,
 * porque o jantar sólido sai e entra o pré-treino leve.
 */
function Metas({ perfilId }: { perfilId: string }) {
  const [metas, setMetas] = useState<MetasNutricionais | null>(() => metasEmCache(perfilId))
  const [plano, setPlano] = useState<PlanoCompleto | null>(null)
  const [salvo, setSalvo] = useState(false)

  useEffect(() => {
    void buscarMetas(perfilId).then(setMetas).catch(console.error)
    void buscarPlanoAlimentar(perfilId).then(setPlano).catch(console.error)
  }, [perfilId])

  const atual: MetasNutricionais = metas ?? {
    perfil_id: perfilId, peso_alvo_kg: null, data_alvo: null, checkpoints: [],
    regra_corte: null, agua_ml_normal: null, agua_ml_jiu_jitsu: null,
    kcal_normal: null, kcal_jiu_jitsu: null,
    proteina_g_normal: null, proteina_g_jiu_jitsu: null,
  }

  function mudar(campos: Partial<MetasNutricionais>) {
    const novo = { ...atual, ...campos }
    setMetas(novo)
    setSalvo(false)
    void salvarMetas(novo)
      .then(() => setSalvo(true))
      .catch(console.error)
  }

  function mudarDia(dia: number) {
    if (!plano) return
    const dias = plano.dias_jiu_jitsu.includes(dia)
      ? plano.dias_jiu_jitsu.filter((d) => d !== dia)
      : [...plano.dias_jiu_jitsu, dia].sort()
    setPlano({ ...plano, dias_jiu_jitsu: dias })
    void salvarPlanoAlimentar({
      id: plano.id, perfil_id: plano.perfil_id, nome: plano.nome,
      dias_jiu_jitsu: dias, atividade_jiu_jitsu_id: plano.atividade_jiu_jitsu_id,
    }).catch(console.error)
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-texto">Metas de nutrição</h2>
      <p className="mt-1 text-xs text-fraco">
        São elas que o cartão Alimentação compara com o dia. Em branco, ele só não mostra a
        comparação.
      </p>

      <div className="mt-3 flex gap-2">
        <CampoMeta
          rotulo="Peso alvo" sufixo="kg" valor={atual.peso_alvo_kg}
          aoMudar={(v) => mudar({ peso_alvo_kg: v })}
        />
        <label className="flex-1 rounded-xl border border-borda bg-superficie px-3 py-2">
          <span className="rotulo block text-[10px]">Até</span>
          <input
            type="date"
            value={atual.data_alvo ?? ''}
            onChange={(e) => mudar({ data_alvo: e.target.value || null })}
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
      </div>

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr>
            <th />
            <th className="rotulo pb-1 text-center text-[10px]">dia normal</th>
            <th className="rotulo pb-1 text-center text-[10px]">jiu-jitsu</th>
          </tr>
        </thead>
        <tbody>
          <LinhaMeta
            rotulo="Água (ml)" a={atual.agua_ml_normal} b={atual.agua_ml_jiu_jitsu}
            aoMudarA={(v) => mudar({ agua_ml_normal: v })}
            aoMudarB={(v) => mudar({ agua_ml_jiu_jitsu: v })}
          />
          <LinhaMeta
            rotulo="Kcal" a={atual.kcal_normal} b={atual.kcal_jiu_jitsu}
            aoMudarA={(v) => mudar({ kcal_normal: v })}
            aoMudarB={(v) => mudar({ kcal_jiu_jitsu: v })}
          />
          <LinhaMeta
            rotulo="Proteína (g)" a={atual.proteina_g_normal} b={atual.proteina_g_jiu_jitsu}
            aoMudarA={(v) => mudar({ proteina_g_normal: v })}
            aoMudarB={(v) => mudar({ proteina_g_jiu_jitsu: v })}
          />
        </tbody>
      </table>

      {plano && (
        <div className="mt-4">
          <p className="rotulo">Dias de jiu-jitsu no plano</p>
          <p className="mt-1 text-xs text-fraco">
            Servem para o pré-treino das 18h aparecer antes da aula, quando a atividade ainda
            não foi marcada.
          </p>
          <div className="mt-2 flex gap-1">
            {DIAS.map(([dia, nome]) => (
              <button
                key={dia}
                onClick={() => mudarDia(dia)}
                className={`min-h-12 flex-1 rounded-lg border text-xs ${
                  plano.dias_jiu_jitsu.includes(dia)
                    ? 'border-biset/50 bg-biset/15 text-texto'
                    : 'border-borda text-suave'
                }`}
              >
                {nome.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}

      <Checkpoints
        checkpoints={atual.checkpoints}
        aoMudar={(c) => mudar({ checkpoints: c })}
      />

      <label className="mt-3 block">
        <span className="rotulo">Regra de corte</span>
        <textarea
          value={atual.regra_corte ?? ''}
          onChange={(e) => mudar({ regra_corte: e.target.value || null })}
          rows={2}
          placeholder="O que fazer se um checkpoint não fechar"
          className="mt-1 w-full rounded-xl border border-borda bg-superficie px-3 py-2 text-sm outline-none focus:border-acento"
        />
      </label>

      {salvo && <p className="mt-2 text-xs text-feito">Metas salvas.</p>}
    </section>
  )
}

function CampoMeta({
  rotulo, sufixo, valor, aoMudar,
}: {
  rotulo: string
  sufixo: string
  valor: number | null
  aoMudar: (v: number | null) => void
}) {
  const [texto, setTexto] = useState(valor?.toString() ?? '')
  useEffect(() => setTexto(valor?.toString() ?? ''), [valor])
  return (
    <label className="flex-1 rounded-xl border border-borda bg-superficie px-3 py-2">
      <span className="rotulo block text-[10px]">{rotulo}</span>
      <span className="flex items-baseline gap-1">
        <input
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => aoMudar(texto === '' ? null : Number(texto))}
          placeholder="—"
          className="valor w-full min-w-0 bg-transparent text-base outline-none"
        />
        <span className="text-xs text-fraco">{sufixo}</span>
      </span>
    </label>
  )
}

function LinhaMeta({
  rotulo, a, b, aoMudarA, aoMudarB,
}: {
  rotulo: string
  a: number | null
  b: number | null
  aoMudarA: (v: number | null) => void
  aoMudarB: (v: number | null) => void
}) {
  return (
    <tr>
      <td className="py-1 pr-2 text-sm text-suave">{rotulo}</td>
      <td className="py-1 pr-1"><CelulaMeta valor={a} aoMudar={aoMudarA} /></td>
      <td className="py-1"><CelulaMeta valor={b} aoMudar={aoMudarB} /></td>
    </tr>
  )
}

function CelulaMeta({ valor, aoMudar }: { valor: number | null; aoMudar: (v: number | null) => void }) {
  const [texto, setTexto] = useState(valor?.toString() ?? '')
  useEffect(() => setTexto(valor?.toString() ?? ''), [valor])
  return (
    <input
      inputMode="numeric"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => aoMudar(texto === '' ? null : Number(texto))}
      placeholder="—"
      className="valor min-h-12 w-full rounded-lg border border-borda bg-superficie px-2 text-center text-sm outline-none focus:border-acento"
    />
  )
}

/** Faixa de peso esperada numa data: a meta não é um número exato. */
function Checkpoints({
  checkpoints, aoMudar,
}: {
  checkpoints: CheckpointPeso[]
  aoMudar: (c: CheckpointPeso[]) => void
}) {
  const troca = (n: number, campos: Partial<CheckpointPeso>) =>
    aoMudar(checkpoints.map((c, i) => (i === n ? { ...c, ...campos } : c)))

  return (
    <div className="mt-4">
      <p className="rotulo">Checkpoints de peso</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {checkpoints.map((c, n) => (
          <div key={n} className="flex gap-1.5">
            <input
              type="date"
              value={c.dia}
              onChange={(e) => troca(n, { dia: e.target.value })}
              className="min-h-12 flex-1 rounded-lg border border-borda bg-superficie px-2 text-xs outline-none focus:border-acento"
            />
            <input
              inputMode="decimal"
              value={c.min}
              onChange={(e) => troca(n, { min: Number(e.target.value) })}
              className="valor min-h-12 w-16 rounded-lg border border-borda bg-superficie px-2 text-center text-xs outline-none focus:border-acento"
            />
            <input
              inputMode="decimal"
              value={c.max}
              onChange={(e) => troca(n, { max: Number(e.target.value) })}
              className="valor min-h-12 w-16 rounded-lg border border-borda bg-superficie px-2 text-center text-xs outline-none focus:border-acento"
            />
            <button
              onClick={() => aoMudar(checkpoints.filter((_, i) => i !== n))}
              aria-label="Tirar checkpoint"
              className="min-h-12 w-11 shrink-0 rounded-lg border border-borda text-fraco"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => aoMudar([...checkpoints, { dia: '', min: 0, max: 0 }])}
          className="min-h-12 rounded-lg border border-dashed border-borda text-xs text-fraco active:bg-elevado"
        >
          + checkpoint
        </button>
      </div>
    </div>
  )
}
