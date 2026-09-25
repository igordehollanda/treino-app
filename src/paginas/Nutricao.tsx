/**
 * /nutricao — o plano e o histórico.
 *
 * Só os dois alunos entram: o personal não vê peso nem comida (RLS por
 * eh_aluno()), e o item nem aparece no menu dele.
 *
 * Como em Treinos, dá para abrir o do parceiro; ali é leitura, sem botão
 * de edição. Cada um edita só o próprio plano.
 */

import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  apagarOpcao, apagarRefeicaoDoPlano, buscarMedidas, buscarMetas, buscarPerfis,
  buscarPlanoAlimentar, buscarRegistrosDeRefeicao, perfisEmCache, salvarOpcao,
  salvarRefeicaoDoPlano,
} from '../lib/db'
import { chaveDia } from '../lib/datas'
import { aderenciaDoDia, aderenciaMedia, refeicoesDoDia, serieDePeso } from '../lib/nutricao'
import GraficoPeso from '../componentes/GraficoPeso'
import type {
  ItemAlimento, Medida, MetasNutricionais, OrigemOpcao, Perfil, PlanoCompleto,
  PlanoOpcao, RefeicaoComOpcoes, RefeicaoRegistro, TipoDiaRefeicao,
} from '../lib/tipos'

const JANELA_DIAS = 90

export default function Nutricao() {
  const { perfil, ehPersonal } = useAuth()
  const [aba, setAba] = useState<'plano' | 'historico'>('plano')
  const [perfis, setPerfis] = useState<Perfil[]>(perfisEmCache())
  const [vendo, setVendo] = useState<string>(perfil?.id ?? '')

  useEffect(() => {
    void buscarPerfis().then(setPerfis).catch(console.error)
  }, [])

  // Acesso direto pela URL tambem nao entra: a RLS ja devolveria vazio,
  // mas uma tela em branco e pior que um redirecionamento honesto.
  if (ehPersonal) return <Navigate to="/" replace />
  if (!perfil) return null

  const alunos = perfis.filter((p) => p.papel === 'aluno')
  const meu = vendo === perfil.id

  return (
    <div className="mx-auto max-w-lg p-5 md:max-w-3xl">
      <h1 className="mb-4 text-[26px] font-extrabold">Nutrição</h1>

      <div className="mb-4 flex gap-1 rounded-xl border border-borda bg-superficie p-1">
        <AbaBotao ativa={aba === 'plano'} aoTocar={() => setAba('plano')}>Plano</AbaBotao>
        <AbaBotao ativa={aba === 'historico'} aoTocar={() => setAba('historico')}>
          Histórico
        </AbaBotao>
      </div>

      {alunos.length > 1 && (
        <div className="mb-4 flex gap-2">
          {alunos.map((a) => (
            <button
              key={a.id}
              onClick={() => setVendo(a.id)}
              className={`min-h-12 flex-1 rounded-xl border px-3 text-sm font-semibold ${
                vendo === a.id
                  ? 'border-acento bg-acento/10 text-texto'
                  : 'border-borda bg-superficie text-suave active:bg-elevado'
              }`}
            >
              {a.id === perfil.id ? 'Meu' : primeiroNome(a.nome)}
            </button>
          ))}
        </div>
      )}

      {aba === 'plano'
        ? <AbaPlano perfilId={vendo} editavel={meu} />
        : <AbaHistorico perfilId={vendo} />}
    </div>
  )
}

function AbaBotao({
  ativa, aoTocar, children,
}: {
  ativa: boolean
  aoTocar: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={aoTocar}
      className={`min-h-12 flex-1 rounded-lg text-sm font-semibold ${
        ativa ? 'bg-acento text-white' : 'text-suave active:bg-elevado'
      }`}
    >
      {children}
    </button>
  )
}

const primeiroNome = (n: string) => n.split(' ')[0]

// --- plano ------------------------------------------------------------

const ROTULO_TIPO: Record<TipoDiaRefeicao, string> = {
  ambos: 'todo dia',
  normal: 'dia normal',
  jiu_jitsu: 'dia de jiu-jitsu',
}

const ROTULO_ORIGEM: Record<OrigemOpcao, string> = {
  nutricionista: 'do nutricionista',
  ajuste: 'ajuste a validar',
  generico: 'orientação geral',
}

function AbaPlano({ perfilId, editavel }: { perfilId: string; editavel: boolean }) {
  const [plano, setPlano] = useState<PlanoCompleto | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<string | null>(null)

  const recarregar = useMemo(
    () => () =>
      buscarPlanoAlimentar(perfilId)
        .then(setPlano)
        .catch(console.error)
        .finally(() => setCarregando(false)),
    [perfilId],
  )

  useEffect(() => {
    setCarregando(true)
    void recarregar()
  }, [recarregar])

  if (carregando) return <p className="text-sm text-suave">carregando...</p>
  if (!plano) {
    return (
      <p className="rounded-2xl border border-borda bg-superficie p-6 text-center text-sm text-suave">
        Sem plano alimentar ativo.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-suave">{plano.nome}</p>

      {plano.refeicoes.map((r) => (
        <CartaoRefeicao
          key={r.id}
          refeicao={r}
          editavel={editavel}
          aberta={editando === r.id}
          aoAbrir={() => setEditando(editando === r.id ? null : r.id)}
          aoMudar={() => void recarregar()}
        />
      ))}

      {editavel && (
        <button
          onClick={() => {
            const ordem = Math.max(0, ...plano.refeicoes.map((r) => r.ordem)) + 1
            void salvarRefeicaoDoPlano({
              plano_id: plano.id, nome: 'Nova refeição', horario: '12:00',
              tipo_dia: 'ambos', ordem, obrigatoria: true,
            }).then(recarregar).catch(console.error)
          }}
          className="min-h-12 rounded-xl border border-dashed border-borda text-sm text-fraco active:bg-elevado"
        >
          + Refeição
        </button>
      )}
    </div>
  )
}

function CartaoRefeicao({
  refeicao, editavel, aberta, aoAbrir, aoMudar,
}: {
  refeicao: RefeicaoComOpcoes
  editavel: boolean
  aberta: boolean
  aoAbrir: () => void
  aoMudar: () => void
}) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie">
      <button onClick={aoAbrir} className="flex w-full items-baseline gap-2 p-4 text-left">
        <span className="valor text-sm text-suave">{refeicao.horario.slice(0, 5)}</span>
        <span className="flex-1 truncate font-bold">{refeicao.nome}</span>
        <span className="shrink-0 text-xs text-fraco">
          {ROTULO_TIPO[refeicao.tipo_dia]}
          {!refeicao.obrigatoria && ' · opcional'}
        </span>
      </button>

      {aberta && (
        <div className="flex flex-col gap-2 border-t border-borda p-4">
          {editavel && <EditorRefeicao refeicao={refeicao} aoMudar={aoMudar} />}

          {refeicao.opcoes.map((o) =>
            editavel
              ? <EditorOpcao key={o.id} opcao={o} aoMudar={aoMudar} />
              : <OpcaoSomenteLeitura key={o.id} opcao={o} />,
          )}

          {editavel && (
            <button
              onClick={() => {
                const ordem = Math.max(0, ...refeicao.opcoes.map((o) => o.ordem)) + 1
                void salvarOpcao({
                  refeicao_id: refeicao.id, rotulo: 'Nova opção', ordem,
                  padrao: refeicao.opcoes.length === 0, itens: [],
                  kcal: null, proteina_g: null, origem: 'ajuste', nota: null,
                }).then(aoMudar).catch(console.error)
              }}
              className="min-h-12 rounded-xl border border-dashed border-borda text-sm text-fraco active:bg-elevado"
            >
              + Opção
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function OpcaoSomenteLeitura({ opcao }: { opcao: PlanoOpcao }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        opcao.padrao ? 'border-acento/40 bg-acento/5' : 'border-borda bg-elevado'
      }`}
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{opcao.rotulo}</span>
        {opcao.kcal != null && (
          <span className="shrink-0 text-xs text-fraco">
            {opcao.kcal} kcal · {opcao.proteina_g ?? 0} g
          </span>
        )}
      </p>
      {opcao.itens.length > 0 && (
        <ul className="mt-1 text-xs text-suave">
          {opcao.itens.map((i, n) => <li key={n}>{descreverItem(i)}</li>)}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-fraco">
        {ROTULO_ORIGEM[opcao.origem]}
        {opcao.nota && ` · ${opcao.nota}`}
      </p>
    </div>
  )
}

function EditorRefeicao({
  refeicao, aoMudar,
}: {
  refeicao: RefeicaoComOpcoes
  aoMudar: () => void
}) {
  const [nome, setNome] = useState(refeicao.nome)
  const [horario, setHorario] = useState(refeicao.horario.slice(0, 5))
  const [tipo, setTipo] = useState<TipoDiaRefeicao>(refeicao.tipo_dia)
  const [obrigatoria, setObrigatoria] = useState(refeicao.obrigatoria)

  const gravar = (campos: Partial<Parameters<typeof salvarRefeicaoDoPlano>[0]> = {}) =>
    void salvarRefeicaoDoPlano({
      id: refeicao.id, plano_id: refeicao.plano_id, nome, horario,
      tipo_dia: tipo, ordem: refeicao.ordem, obrigatoria, ...campos,
    }).then(aoMudar).catch(console.error)

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-borda bg-elevado p-3">
      <div className="flex gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => gravar()}
          className="min-h-12 flex-1 rounded-lg border border-borda bg-superficie px-3 text-sm outline-none focus:border-acento"
        />
        <input
          type="time"
          value={horario}
          onChange={(e) => setHorario(e.target.value)}
          onBlur={() => gravar({ horario: horario })}
          className="min-h-12 w-28 rounded-lg border border-borda bg-superficie px-2 text-sm outline-none focus:border-acento"
        />
      </div>

      <div className="flex gap-1.5">
        {(['ambos', 'normal', 'jiu_jitsu'] as TipoDiaRefeicao[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTipo(t); gravar({ tipo_dia: t }) }}
            className={`min-h-12 flex-1 rounded-lg border px-2 text-xs ${
              tipo === t ? 'border-acento bg-acento/10' : 'border-borda text-suave'
            }`}
          >
            {ROTULO_TIPO[t]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => { setObrigatoria(!obrigatoria); gravar({ obrigatoria: !obrigatoria }) }}
          className="min-h-12 text-xs text-suave underline"
        >
          {obrigatoria ? 'entra na aderência' : 'opcional, fora da aderência'}
        </button>
        <button
          onClick={() => {
            if (!confirm(`Apagar "${refeicao.nome}" e suas opções?`)) return
            void apagarRefeicaoDoPlano(refeicao.id).then(aoMudar).catch(console.error)
          }}
          className="min-h-12 text-xs text-erro underline"
        >
          apagar refeição
        </button>
      </div>
    </div>
  )
}

function EditorOpcao({ opcao, aoMudar }: { opcao: PlanoOpcao; aoMudar: () => void }) {
  const [rotulo, setRotulo] = useState(opcao.rotulo)
  const [kcal, setKcal] = useState(opcao.kcal?.toString() ?? '')
  const [prot, setProt] = useState(opcao.proteina_g?.toString() ?? '')
  const [nota, setNota] = useState(opcao.nota ?? '')
  const [itens, setItens] = useState<ItemAlimento[]>(opcao.itens)

  const gravar = (campos: Partial<Parameters<typeof salvarOpcao>[0]> = {}) =>
    void salvarOpcao({
      id: opcao.id, refeicao_id: opcao.refeicao_id, rotulo, ordem: opcao.ordem,
      padrao: opcao.padrao, itens,
      kcal: kcal === '' ? null : Number(kcal),
      proteina_g: prot === '' ? null : Number(prot),
      origem: opcao.origem, nota: nota || null, ...campos,
    }).then(aoMudar).catch(console.error)

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-3 ${
        opcao.padrao ? 'border-acento/40 bg-acento/5' : 'border-borda bg-elevado'
      }`}
    >
      <input
        value={rotulo}
        onChange={(e) => setRotulo(e.target.value)}
        onBlur={() => gravar()}
        className="min-h-12 rounded-lg border border-borda bg-superficie px-3 text-sm font-semibold outline-none focus:border-acento"
      />

      <div className="flex flex-col gap-1.5">
        {itens.map((it, n) => (
          <div key={n} className="flex gap-1.5">
            <input
              value={it.alimento}
              onChange={(e) => setItens(troca(itens, n, { alimento: e.target.value }))}
              onBlur={() => gravar({ itens })}
              placeholder="alimento"
              className="min-h-12 flex-1 rounded-lg border border-borda bg-superficie px-2 text-xs outline-none focus:border-acento"
            />
            <input
              value={it.qtd ?? ''}
              onChange={(e) =>
                setItens(troca(itens, n, {
                  qtd: e.target.value === '' ? null : Number(e.target.value),
                }))}
              onBlur={() => gravar({ itens })}
              inputMode="decimal"
              placeholder="qtd"
              className="valor min-h-12 w-14 rounded-lg border border-borda bg-superficie px-2 text-center text-xs outline-none focus:border-acento"
            />
            <input
              value={it.unidade}
              onChange={(e) => setItens(troca(itens, n, { unidade: e.target.value }))}
              onBlur={() => gravar({ itens })}
              placeholder="un"
              className="min-h-12 w-14 rounded-lg border border-borda bg-superficie px-2 text-center text-xs outline-none focus:border-acento"
            />
            <button
              onClick={() => {
                const sem = itens.filter((_, i) => i !== n)
                setItens(sem)
                gravar({ itens: sem })
              }}
              aria-label="Tirar item"
              className="min-h-12 w-11 shrink-0 rounded-lg border border-borda text-fraco"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => setItens([...itens, { alimento: '', qtd: null, unidade: 'g' }])}
          className="min-h-12 rounded-lg border border-dashed border-borda text-xs text-fraco active:bg-superficie"
        >
          + item
        </button>
      </div>

      <div className="flex gap-2">
        <label className="flex flex-1 items-center gap-1.5 text-xs text-suave">
          kcal
          <input
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            onBlur={() => gravar()}
            inputMode="numeric"
            className="valor min-h-12 w-full rounded-lg border border-borda bg-superficie px-2 text-center text-sm outline-none focus:border-acento"
          />
        </label>
        <label className="flex flex-1 items-center gap-1.5 text-xs text-suave">
          prot.
          <input
            value={prot}
            onChange={(e) => setProt(e.target.value)}
            onBlur={() => gravar()}
            inputMode="decimal"
            className="valor min-h-12 w-full rounded-lg border border-borda bg-superficie px-2 text-center text-sm outline-none focus:border-acento"
          />
        </label>
      </div>

      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        onBlur={() => gravar()}
        placeholder="nota"
        className="min-h-12 rounded-lg border border-borda bg-superficie px-3 text-xs outline-none focus:border-acento"
      />

      {/* A origem e o que faz a conversa com o nutricionista ser sobre
          linhas concretas: ela fica visivel e trocavel, nao escondida. */}
      <div className="flex gap-1.5">
        {(['nutricionista', 'ajuste', 'generico'] as OrigemOpcao[]).map((o) => (
          <button
            key={o}
            onClick={() => gravar({ origem: o })}
            className={`min-h-12 flex-1 rounded-lg border px-1 text-[11px] ${
              opcao.origem === o ? 'border-acento bg-acento/10' : 'border-borda text-suave'
            }`}
          >
            {ROTULO_ORIGEM[o]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        {opcao.padrao ? (
          <span className="text-xs text-acento-texto">opção padrão do ✓</span>
        ) : (
          <button
            onClick={() => gravar({ padrao: true })}
            className="min-h-12 text-xs text-suave underline"
          >
            tornar padrão
          </button>
        )}
        <button
          onClick={() => {
            if (!confirm(`Apagar a opção "${opcao.rotulo}"?`)) return
            void apagarOpcao(opcao.id).then(aoMudar).catch(console.error)
          }}
          className="min-h-12 text-xs text-erro underline"
        >
          apagar
        </button>
      </div>
    </div>
  )
}

function troca(itens: ItemAlimento[], n: number, campos: Partial<ItemAlimento>) {
  return itens.map((it, i) => (i === n ? { ...it, ...campos } : it))
}

function descreverItem(i: ItemAlimento) {
  return i.qtd == null ? `${i.alimento} (${i.unidade})` : `${i.alimento} — ${i.qtd} ${i.unidade}`
}

// --- historico --------------------------------------------------------

function AbaHistorico({ perfilId }: { perfilId: string }) {
  const [plano, setPlano] = useState<PlanoCompleto | null>(null)
  const [metas, setMetas] = useState<MetasNutricionais | null>(null)
  const [registros, setRegistros] = useState<RefeicaoRegistro[]>([])
  const [medidas, setMedidas] = useState<Medida[]>([])
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [diaAberto, setDiaAberto] = useState<string | null>(null)

  useEffect(() => {
    const desde = chaveDia(new Date(Date.now() - JANELA_DIAS * 864e5))
    const ate = chaveDia(new Date())
    void buscarPlanoAlimentar(perfilId).then(setPlano).catch(console.error)
    void buscarMetas(perfilId).then(setMetas).catch(console.error)
    void buscarRegistrosDeRefeicao(perfilId, desde, ate).then(setRegistros).catch(console.error)
    void buscarMedidas(perfilId, desde).then(setMedidas).catch(console.error)
  }, [perfilId])

  const serie = useMemo(() => serieDePeso(medidas), [medidas])

  // Aderencia de cada dia do mes. O tipo do dia importa: num dia de
  // jiu-jitsu as refeicoes previstas sao outras.
  const porDia = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof aderenciaDoDia>>()
    if (!plano) return mapa
    const dias = new Set(registros.map((r) => r.dia))
    for (const dia of dias) {
      const medida = medidas.find((m) => m.dia === dia) ?? null
      const tipo = medida?.tipo_dia
        ?? (plano.dias_jiu_jitsu.includes(new Date(`${dia}T12:00:00`).getDay())
          ? 'jiu_jitsu' : 'normal')
      mapa.set(
        dia,
        aderenciaDoDia(refeicoesDoDia(plano.refeicoes, tipo), registros.filter((r) => r.dia === dia)),
      )
    }
    return mapa
  }, [plano, registros, medidas])

  const media = aderenciaMedia([...porDia.values()])
  const noMes = medidas.filter((m) => m.dia.startsWith(chaveDia(mes).slice(0, 7)))
  const comAgua = noMes.filter((m) => m.agua_ml != null)
  const mediaAgua = comAgua.length
    ? comAgua.reduce((s, m) => s + (m.agua_ml ?? 0), 0) / comAgua.length
    : null
  const diasComAlcool = noMes.filter((m) => (m.alcool_doses ?? 0) > 0).length

  return (
    <div className="flex flex-col gap-5">
      <section>
        <p className="rotulo mb-2">Peso</p>
        <GraficoPeso
          pontos={serie}
          alvo={metas?.peso_alvo_kg ?? null}
          checkpoints={metas?.checkpoints ?? []}
        />
        {metas?.regra_corte && (
          <p className="mt-2 rounded-xl border border-alerta/40 bg-alerta/10 p-3 text-xs text-texto">
            {metas.regra_corte}
          </p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="rotulo">Aderência</p>
          {media !== null && (
            <p className="text-xs text-suave">
              média de <span className="valor text-texto">{Math.round(media * 100)}%</span> nos
              dias registrados
            </p>
          )}
        </div>
        <Calendario
          mes={mes}
          porDia={porDia}
          aoTrocarMes={setMes}
          diaAberto={diaAberto}
          aoTocarDia={(d) => setDiaAberto(d === diaAberto ? null : d)}
        />
        {diaAberto && (
          <ListaDoDia dia={diaAberto} registros={registros.filter((r) => r.dia === diaAberto)} />
        )}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Numero
          rotulo="Água por dia"
          valor={mediaAgua == null ? '—' : `${(mediaAgua / 1000).toFixed(1)} L`}
          nota={`${comAgua.length} dia${comAgua.length === 1 ? '' : 's'} com registro`}
        />
        <Numero
          rotulo="Dias com álcool"
          valor={String(diasComAlcool)}
          nota={mesPorExtenso(mes)}
        />
      </section>
    </div>
  )
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="rounded-xl border border-borda bg-superficie p-4">
      <p className="rotulo">{rotulo}</p>
      <p className="valor mt-1 text-2xl">{valor}</p>
      <p className="mt-0.5 text-xs text-fraco">{nota}</p>
    </div>
  )
}

const SIGLAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function Calendario({
  mes, porDia, aoTrocarMes, diaAberto, aoTocarDia,
}: {
  mes: Date
  porDia: Map<string, ReturnType<typeof aderenciaDoDia>>
  aoTrocarMes: (d: Date) => void
  diaAberto: string | null
  aoTocarDia: (dia: string) => void
}) {
  const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1)
  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const hoje = chaveDia(new Date())

  return (
    <div className="rounded-2xl border border-borda bg-superficie p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => aoTrocarMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
          aria-label="Mês anterior"
          className="h-12 w-12 rounded-lg text-suave active:bg-elevado"
        >
          ‹
        </button>
        <p className="text-sm font-semibold">{mesPorExtenso(mes)}</p>
        <button
          onClick={() => aoTrocarMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
          aria-label="Próximo mês"
          className="h-12 w-12 rounded-lg text-suave active:bg-elevado"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {SIGLAS.map((s, i) => (
          <span key={i} className="rotulo pb-1 text-center text-[10px]">{s}</span>
        ))}
        {Array.from({ length: primeiro.getDay() }, (_, i) => <span key={`v${i}`} />)}
        {Array.from({ length: diasNoMes }, (_, i) => {
          const dia = chaveDia(new Date(mes.getFullYear(), mes.getMonth(), i + 1))
          const a = porDia.get(dia)
          const pct = a?.percentual ?? null
          return (
            <button
              key={dia}
              onClick={() => aoTocarDia(dia)}
              disabled={!a}
              className={`flex aspect-square items-center justify-center rounded-lg border text-xs ${
                diaAberto === dia ? 'border-acento' : 'border-transparent'
              } ${corDaAderencia(pct)} ${dia === hoje ? 'font-extrabold' : ''}`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      <p className="mt-2 text-[11px] text-fraco">
        Verde: dia todo cumprido. Amarelo: em parte. Cinza vazio: sem registro — que não é o
        mesmo que ter furado.
      </p>
    </div>
  )
}

function corDaAderencia(pct: number | null) {
  if (pct === null) return 'bg-elevado text-fraco'
  if (pct >= 0.85) return 'bg-feito/25 text-texto'
  if (pct >= 0.5) return 'bg-alerta/25 text-texto'
  return 'bg-erro/20 text-texto'
}

const ESTADO: Record<RefeicaoRegistro['estado'], string> = {
  cumprida: 'cumprida',
  parcial: 'em parte',
  fora_do_plano: 'fora do plano',
  pulada: 'pulada',
}

function ListaDoDia({ dia, registros }: { dia: string; registros: RefeicaoRegistro[] }) {
  return (
    <div className="mt-3 rounded-xl border border-acento/40 bg-elevado p-3">
      <p className="mb-2 text-sm font-bold">
        {new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', {
          weekday: 'long', day: '2-digit', month: 'long',
        })}
      </p>
      {registros.length === 0 ? (
        <p className="text-xs text-suave">Nada registrado neste dia.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {registros.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">
                <span className="font-semibold">{r.refeicao_nome}</span>
                <span className="text-suave"> · {r.opcao_rotulo ?? r.descricao ?? '—'}</span>
              </span>
              <span className="shrink-0 text-fraco">
                {ESTADO[r.estado]}
                {r.kcal != null && ` · ${r.kcal} kcal`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const mesPorExtenso = (d: Date) =>
  d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
