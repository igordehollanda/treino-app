/**
 * Cartão "Alimentação" do Hoje.
 *
 * O princípio é o mesmo do treino: um toque registra. O ✓ da linha marca
 * a refeição cumprida com a opção padrão e acabou — tocar na linha só é
 * preciso quando o dia fugiu do plano.
 *
 * Nada aqui espera a rede: toda escrita é otimista e sobe pela fila.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  buscarMedidas, buscarMetas, buscarPlanoAlimentar, buscarRegistrosDeRefeicao,
  medidasEmCache, metasEmCache, planoAlimentarEmCache, registrarRefeicao,
  registrosDeRefeicaoEmCache, salvarMedida, apagarRegistroDeRefeicao,
} from '../lib/db'
import { chaveDia } from '../lib/datas'
import {
  aderenciaDoDia, metaDoDia, refeicoesDoDia, tipoDoDia, totaisDoDia,
} from '../lib/nutricao'
import type {
  EstadoRefeicao, Medida, MetasNutricionais, PlanoCompleto, PlanoOpcao,
  RefeicaoComOpcoes, RefeicaoRegistro, TipoDia,
} from '../lib/tipos'

const GOLE = 500

export default function CartaoAlimentacao({
  perfilId, atividadesDeHoje,
}: {
  perfilId: string
  /** Ids das atividades marcadas hoje. O plano diz qual delas vira dia de jiu-jitsu. */
  atividadesDeHoje: string[]
}) {
  const hoje = useMemo(() => new Date(), [])
  const dia = chaveDia(hoje)

  const [plano, setPlano] = useState<PlanoCompleto | null>(() => planoAlimentarEmCache(perfilId))
  const [metas, setMetas] = useState<MetasNutricionais | null>(() => metasEmCache(perfilId))
  const [registros, setRegistros] = useState<RefeicaoRegistro[]>(
    () => registrosDeRefeicaoEmCache(perfilId, dia, dia),
  )
  const [medida, setMedida] = useState<Medida | null>(
    () => medidasEmCache(perfilId, dia).find((m) => m.dia === dia) ?? null,
  )
  const [aberta, setAberta] = useState<RefeicaoComOpcoes | null>(null)
  const [extraAberto, setExtraAberto] = useState(false)
  const [alcoolAberto, setAlcoolAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void buscarPlanoAlimentar(perfilId).then(setPlano).catch(console.error)
    void buscarMetas(perfilId).then(setMetas).catch(console.error)
    void buscarRegistrosDeRefeicao(perfilId, dia, dia).then(setRegistros).catch(console.error)
    void buscarMedidas(perfilId, dia)
      .then((ms) => setMedida(ms.find((m) => m.dia === dia) ?? null))
      .catch(console.error)
  }, [perfilId, dia])

  const jiuJitsuMarcado =
    plano?.atividade_jiu_jitsu_id != null &&
    atividadesDeHoje.includes(plano.atividade_jiu_jitsu_id)
  const tipo = tipoDoDia(hoje, plano, medida, jiuJitsuMarcado)
  const refeicoes = useMemo(
    () => (plano ? (refeicoesDoDia(plano.refeicoes, tipo) as RefeicaoComOpcoes[]) : []),
    [plano, tipo],
  )
  const previstos = registros.filter((r) => r.refeicao_id)
  const extras = registros.filter((r) => !r.refeicao_id)
  const totais = totaisDoDia(registros)
  const meta = metaDoDia(metas, tipo)
  const aderencia = aderenciaDoDia(refeicoes, registros)

  // Plano sem números (o da Camila): mostrar "0 kcal" ali seria inventar
  // um dado que ninguém prescreveu.
  const temKcal = useMemo(
    () => plano?.refeicoes.some((r) => r.opcoes.some((o) => o.kcal != null)) ?? false,
    [plano],
  )

  if (!plano) return null

  /** Grava reaproveitando o id do registro que já existe: o índice único
      recusaria um id novo para a mesma refeição no mesmo dia. */
  async function registrar(
    refeicao: RefeicaoComOpcoes | null,
    estado: EstadoRefeicao,
    opcao: PlanoOpcao | null,
    extra?: { refeicao_nome: string; kcal: number | null; descricao: string | null },
  ) {
    const existente = refeicao
      ? registros.find((r) => r.refeicao_id === refeicao.id)
      : undefined

    const novo: RefeicaoRegistro = {
      id: existente?.id ?? crypto.randomUUID(),
      perfil_id: perfilId,
      dia,
      refeicao_id: refeicao?.id ?? null,
      opcao_id: opcao?.id ?? null,
      estado,
      refeicao_nome: extra?.refeicao_nome ?? refeicao?.nome ?? 'Fora do plano',
      opcao_rotulo: opcao?.rotulo ?? null,
      kcal: extra ? extra.kcal : estado === 'pulada' ? null : (opcao?.kcal ?? null),
      proteina_g: extra ? null : estado === 'pulada' ? null : (opcao?.proteina_g ?? null),
      descricao: extra?.descricao ?? null,
    }

    setRegistros((rs) => [...rs.filter((r) => r.id !== novo.id), novo])
    setAberta(null)
    setExtraAberto(false)
    try {
      await registrarRefeicao(novo)
      setErro(null)
    } catch (e) {
      console.error(e)
      setErro('Não consegui gravar. Vai subir quando a conexão voltar.')
    }
  }

  async function desfazer(registro: RefeicaoRegistro) {
    setRegistros((rs) => rs.filter((r) => r.id !== registro.id))
    setAberta(null)
    try {
      await apagarRegistroDeRefeicao(registro.id)
      setErro(null)
    } catch (e) {
      console.error(e)
      setErro('Não consegui apagar agora. Tente de novo com sinal.')
    }
  }

  /** Só as colunas mexidas: o peso da manhã e a água da tarde não podem
      se sobrescrever quando as duas estão na fila. */
  async function mudarMedida(campos: Partial<Omit<Medida, 'perfil_id' | 'dia'>>) {
    setMedida((m) => ({
      perfil_id: perfilId, dia, peso_kg: null, cintura_cm: null, abdomen_cm: null,
      agua_ml: null, alcool_doses: null, dormiu_no_horario: null, tipo_dia: null,
      nota: null, ...m, ...campos,
    }))
    try {
      await salvarMedida(perfilId, dia, campos)
      setErro(null)
    } catch (e) {
      console.error(e)
      setErro('Não consegui gravar. Vai subir quando a conexão voltar.')
    }
  }

  const agua = medida?.agua_ml ?? 0
  const ehQuarta = hoje.getDay() === 3
  const ehManha = hoje.getHours() < 12

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="rotulo">Alimentação</p>
        {aderencia.percentual !== null && (
          <p className="text-xs text-suave">
            <span className="valor text-texto">{Math.round(aderencia.percentual * 100)}%</span>{' '}
            do plano
            {aderencia.naoRegistradas > 0 && ` · ${aderencia.naoRegistradas} sem registro`}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-borda bg-superficie p-4">
        {erro && <p className="text-xs text-erro">{erro}</p>}

        <ChipTipoDia
          tipo={tipo}
          manual={medida?.tipo_dia != null}
          aoTrocar={() => void mudarMedida({ tipo_dia: tipo === 'normal' ? 'jiu_jitsu' : 'normal' })}
        />

        <Medidas
          medida={medida}
          pedirFita={ehQuarta}
          pedirSono={ehManha}
          aoMudar={(c) => void mudarMedida(c)}
        />

        <div className="flex flex-col gap-1.5">
          {refeicoes.map((r) => (
            <LinhaRefeicao
              key={r.id}
              refeicao={r}
              registro={previstos.find((x) => x.refeicao_id === r.id) ?? null}
              temKcal={temKcal}
              aoMarcar={() => void registrar(r, 'cumprida', padraoDe(r))}
              aoAbrir={() => setAberta(r)}
            />
          ))}
        </div>

        {extras.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-suave">
              {e.refeicao_nome}
              {e.descricao && <span className="text-fraco"> · {e.descricao}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              {temKcal && e.kcal != null && <span className="valor text-xs">{e.kcal} kcal</span>}
              <button onClick={() => void desfazer(e)} className="text-xs text-fraco underline">
                tirar
              </button>
            </span>
          </div>
        ))}

        <button
          onClick={() => setExtraAberto(true)}
          className="rounded-xl border border-dashed border-borda py-2.5 text-sm text-fraco active:bg-elevado"
        >
          + Fora do plano
        </button>

        <Agua
          ml={agua}
          meta={meta.agua_ml}
          aoBeber={() => void mudarMedida({ agua_ml: agua + GOLE })}
          aoDesfazer={() => void mudarMedida({ agua_ml: Math.max(0, agua - GOLE) })}
        />

        {alcoolAberto || medida?.alcool_doses != null ? (
          <Alcool
            doses={medida?.alcool_doses ?? 0}
            aoMudar={(d) => void mudarMedida({ alcool_doses: d })}
          />
        ) : (
          <button
            onClick={() => setAlcoolAberto(true)}
            className="self-start text-xs text-fraco underline"
          >
            Registrar álcool
          </button>
        )}

        {temKcal && (
          <div className="flex items-baseline justify-between border-t border-borda pt-3 text-sm">
            <span className="text-suave">
              <span className="valor text-base text-texto">{totais.kcal}</span>
              {meta.kcal != null && <span className="text-fraco"> / {meta.kcal}</span>} kcal
            </span>
            <span className="text-suave">
              <span className="valor text-base text-texto">{Math.round(totais.proteina_g)}</span>
              {meta.proteina_g != null && (
                <span className="text-fraco"> / {meta.proteina_g}</span>
              )}{' '}
              g prot.
            </span>
          </div>
        )}
        {temKcal && totais.semEstimativa > 0 && (
          <p className="-mt-1.5 text-xs text-fraco">
            +{totais.semEstimativa}{' '}
            {totais.semEstimativa > 1 ? 'itens sem estimativa' : 'item sem estimativa'}
          </p>
        )}
      </div>

      {aberta && (
        <FolhaRefeicao
          refeicao={aberta}
          registro={previstos.find((x) => x.refeicao_id === aberta.id) ?? null}
          temKcal={temKcal}
          aoRegistrar={(estado, opcao, extra) => void registrar(aberta, estado, opcao, extra)}
          aoDesfazer={(r) => void desfazer(r)}
          aoFechar={() => setAberta(null)}
        />
      )}

      {extraAberto && (
        <FolhaExtra
          temKcal={temKcal}
          aoRegistrar={(nome, kcal) =>
            void registrar(null, 'fora_do_plano', null, {
              refeicao_nome: nome, kcal, descricao: null,
            })}
          aoFechar={() => setExtraAberto(false)}
        />
      )}
    </section>
  )
}

function padraoDe(r: RefeicaoComOpcoes) {
  return r.opcoes.find((o) => o.padrao) ?? r.opcoes[0] ?? null
}

// --- pedaços ----------------------------------------------------------

function ChipTipoDia({
  tipo, manual, aoTrocar,
}: {
  tipo: TipoDia
  manual: boolean
  aoTrocar: () => void
}) {
  const jj = tipo === 'jiu_jitsu'
  return (
    <button
      onClick={aoTrocar}
      className={`flex items-center gap-2 self-start rounded-full border px-3.5 py-2 text-sm font-semibold ${
        jj ? 'border-biset/40 bg-biset/10 text-texto' : 'border-borda bg-elevado text-suave'
      }`}
    >
      {jj ? '🥋 Dia de jiu-jitsu' : 'Dia normal'}
      <span className="text-xs font-normal text-fraco">{manual ? 'fixado' : 'trocar'}</span>
    </button>
  )
}

/** Peso em jejum; às quartas, também a fita métrica. */
function Medidas({
  medida, pedirFita, pedirSono, aoMudar,
}: {
  medida: Medida | null
  pedirFita: boolean
  pedirSono: boolean
  aoMudar: (c: Partial<Omit<Medida, 'perfil_id' | 'dia'>>) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <CampoNumero
          rotulo="Peso em jejum"
          sufixo="kg"
          valor={medida?.peso_kg ?? null}
          aoMudar={(v) => aoMudar({ peso_kg: v })}
        />
        {pedirFita && (
          <>
            <CampoNumero
              rotulo="Cintura"
              sufixo="cm"
              valor={medida?.cintura_cm ?? null}
              aoMudar={(v) => aoMudar({ cintura_cm: v })}
            />
            <CampoNumero
              rotulo="Abdômen"
              sufixo="cm"
              valor={medida?.abdomen_cm ?? null}
              aoMudar={(v) => aoMudar({ abdomen_cm: v })}
            />
          </>
        )}
      </div>

      {pedirSono && medida?.dormiu_no_horario == null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-suave">Dormiu no horário ontem?</span>
          <button
            onClick={() => aoMudar({ dormiu_no_horario: true })}
            className="min-h-11 rounded-lg border border-borda px-3 text-sm active:bg-elevado"
          >
            sim
          </button>
          <button
            onClick={() => aoMudar({ dormiu_no_horario: false })}
            className="min-h-11 rounded-lg border border-borda px-3 text-sm active:bg-elevado"
          >
            não
          </button>
        </div>
      )}
    </div>
  )
}

function CampoNumero({
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
    <label className="flex-1 rounded-xl border border-borda bg-elevado px-3 py-2">
      <span className="rotulo block text-[10px]">{rotulo}</span>
      <span className="flex items-baseline gap-1">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => aoMudar(texto === '' ? null : Number(texto))}
          placeholder="—"
          className="valor w-full min-w-0 bg-transparent text-lg outline-none"
        />
        <span className="text-xs text-fraco">{sufixo}</span>
      </span>
    </label>
  )
}

const CORES: Record<EstadoRefeicao, string> = {
  cumprida: 'border-feito/40 bg-feito/10',
  parcial: 'border-alerta/40 bg-alerta/10',
  fora_do_plano: 'border-alerta/40 bg-alerta/10',
  pulada: 'border-borda bg-elevado',
}

const MARCA: Record<EstadoRefeicao, string> = {
  cumprida: '✓',
  parcial: '½',
  fora_do_plano: '≠',
  pulada: '—',
}

function LinhaRefeicao({
  refeicao, registro, temKcal, aoMarcar, aoAbrir,
}: {
  refeicao: RefeicaoComOpcoes
  registro: RefeicaoRegistro | null
  temKcal: boolean
  aoMarcar: () => void
  aoAbrir: () => void
}) {
  const opcao = registro?.opcao_rotulo ?? padraoDe(refeicao)?.rotulo ?? null
  const origem = padraoDe(refeicao)?.origem

  return (
    <div
      className={`flex items-stretch gap-2 rounded-xl border ${
        registro ? CORES[registro.estado] : 'border-borda bg-elevado'
      }`}
    >
      {/* 56 px de alvo: é o toque que se dá com o celular numa mão. */}
      <button
        onClick={aoMarcar}
        aria-label={`Marcar ${refeicao.nome} como cumprida`}
        className={`flex w-14 shrink-0 items-center justify-center rounded-l-xl text-xl ${
          registro ? 'text-texto' : 'text-fraco active:bg-superficie'
        }`}
      >
        {registro ? MARCA[registro.estado] : '○'}
      </button>

      <button onClick={aoAbrir} className="flex-1 py-2.5 pr-3 text-left">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold">{refeicao.nome}</span>
          <span className="shrink-0 text-xs text-fraco">{refeicao.horario.slice(0, 5)}</span>
        </span>
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs text-suave">
            {registro?.descricao ?? opcao ?? 'sem opção'}
            {origem === 'ajuste' && !registro && (
              <span className="text-alerta"> · ajuste</span>
            )}
          </span>
          {temKcal && registro?.kcal != null && (
            <span className="shrink-0 text-xs text-fraco">{registro.kcal} kcal</span>
          )}
        </span>
      </button>
    </div>
  )
}

function Agua({
  ml, meta, aoBeber, aoDesfazer,
}: {
  ml: number
  meta: number | null
  aoBeber: () => void
  aoDesfazer: () => void
}) {
  const pct = meta ? Math.min(100, (ml / meta) * 100) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-suave">Água</span>
        <span className="text-suave">
          <span className="valor text-texto">{(ml / 1000).toFixed(1)}</span>
          {meta && <span className="text-fraco"> / {(meta / 1000).toFixed(1)}</span>} L
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-elevado">
        <div className="h-full rounded-full bg-acento" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={aoBeber}
          className="min-h-11 flex-1 rounded-xl bg-acento text-sm font-semibold text-white active:bg-acento-forte"
        >
          +500 ml
        </button>
        {ml > 0 && (
          <button
            onClick={aoDesfazer}
            className="min-h-11 rounded-xl border border-borda px-4 text-sm text-suave active:bg-elevado"
          >
            desfazer
          </button>
        )}
      </div>
    </div>
  )
}

function Alcool({ doses, aoMudar }: { doses: number; aoMudar: (d: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-suave">Álcool hoje</span>
      <span className="flex items-center gap-2">
        <button
          onClick={() => aoMudar(Math.max(0, doses - 1))}
          className="h-11 w-11 rounded-lg border border-borda text-lg active:bg-elevado"
        >
          −
        </button>
        <span className="valor w-8 text-center text-lg">{doses}</span>
        <button
          onClick={() => aoMudar(doses + 1)}
          className="h-11 w-11 rounded-lg border border-borda text-lg active:bg-elevado"
        >
          +
        </button>
      </span>
    </div>
  )
}

// --- folhas -----------------------------------------------------------

function Folha({ titulo, aoFechar, children }: {
  titulo: string
  aoFechar: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-fundo/80 md:items-center">
      <div
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-borda bg-superficie p-4 md:rounded-2xl"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <p className="text-base font-bold">{titulo}</p>
          <button onClick={aoFechar} className="min-h-11 text-sm text-suave underline">
            fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const ROTULO_ORIGEM: Record<PlanoOpcao['origem'], string> = {
  nutricionista: 'do nutricionista',
  ajuste: 'ajuste nosso, a validar',
  generico: 'orientação geral',
}

function FolhaRefeicao({
  refeicao, registro, temKcal, aoRegistrar, aoDesfazer, aoFechar,
}: {
  refeicao: RefeicaoComOpcoes
  registro: RefeicaoRegistro | null
  temKcal: boolean
  aoRegistrar: (
    estado: EstadoRefeicao,
    opcao: PlanoOpcao | null,
    extra?: { refeicao_nome: string; kcal: number | null; descricao: string | null },
  ) => void
  aoDesfazer: (r: RefeicaoRegistro) => void
  aoFechar: () => void
}) {
  const [escolhida, setEscolhida] = useState<PlanoOpcao | null>(
    refeicao.opcoes.find((o) => o.id === registro?.opcao_id) ?? padraoDe(refeicao),
  )
  const [fora, setFora] = useState(registro?.estado === 'fora_do_plano')
  const [texto, setTexto] = useState(registro?.descricao ?? '')
  const [kcal, setKcal] = useState(registro?.kcal?.toString() ?? '')

  const kcalNum = kcal === '' ? null : Number(kcal)

  return (
    <Folha titulo={`${refeicao.nome} · ${refeicao.horario.slice(0, 5)}`} aoFechar={aoFechar}>
      {!fora && (
        <div className="mb-3 flex flex-col gap-1.5">
          {refeicao.opcoes.map((o) => (
            <button
              key={o.id}
              onClick={() => { setEscolhida(o); setKcal(o.kcal?.toString() ?? '') }}
              className={`rounded-xl border p-3 text-left ${
                escolhida?.id === o.id
                  ? 'border-acento bg-acento/10'
                  : 'border-borda bg-elevado active:bg-superficie'
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{o.rotulo}</span>
                {temKcal && o.kcal != null && (
                  <span className="shrink-0 text-xs text-fraco">
                    {o.kcal} kcal · {o.proteina_g ?? 0} g
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-suave">
                {o.itens.length > 0
                  ? o.itens.map(descreverItem).join(' · ')
                  : (o.nota ?? '')}
              </span>
              <span className="mt-1 block text-[11px] text-fraco">
                {ROTULO_ORIGEM[o.origem]}
                {o.itens.length > 0 && o.nota ? ` · ${o.nota}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {fora ? (
        <div className="mb-3 flex flex-col gap-2">
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="O que comeu?"
            className="min-h-12 rounded-xl border border-borda bg-elevado px-3 text-sm outline-none focus:border-acento"
          />
          {temKcal && (
            <input
              type="number"
              inputMode="numeric"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              placeholder="kcal (se souber)"
              className="min-h-12 rounded-xl border border-borda bg-elevado px-3 text-sm outline-none focus:border-acento"
            />
          )}
        </div>
      ) : (
        temKcal && (
          <label className="mb-3 flex items-center gap-2 text-sm text-suave">
            kcal
            <input
              type="number"
              inputMode="numeric"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              placeholder={escolhida?.kcal?.toString() ?? '—'}
              className="valor min-h-11 w-24 rounded-lg border border-borda bg-elevado px-2 text-center outline-none focus:border-acento"
            />
            <span className="text-xs text-fraco">para quando comeu só uma parte</span>
          </label>
        )
      )}

      <div className="grid grid-cols-2 gap-2">
        <BotaoFolha
          cor="bg-feito text-fundo"
          onClick={() => aoRegistrar('cumprida', escolhida)}
          escondido={fora}
        >
          Cumprida
        </BotaoFolha>
        <BotaoFolha
          cor="border border-alerta/50 text-alerta"
          onClick={() =>
            aoRegistrar('parcial', escolhida, {
              refeicao_nome: refeicao.nome,
              kcal: kcalNum ?? escolhida?.kcal ?? null,
              descricao: null,
            })}
          escondido={fora}
        >
          Só uma parte
        </BotaoFolha>
        <BotaoFolha
          cor="border border-alerta/50 text-alerta"
          onClick={() => {
            if (!fora) { setFora(true); return }
            aoRegistrar('fora_do_plano', null, {
              refeicao_nome: refeicao.nome, kcal: kcalNum, descricao: texto || null,
            })
          }}
        >
          {fora ? 'Salvar' : 'Comi outra coisa'}
        </BotaoFolha>
        <BotaoFolha
          cor="border border-borda text-suave"
          onClick={() => aoRegistrar('pulada', null)}
          escondido={fora}
        >
          Pulei
        </BotaoFolha>
      </div>

      {registro && (
        <button
          onClick={() => aoDesfazer(registro)}
          className="mt-3 min-h-11 w-full text-sm text-fraco underline"
        >
          apagar este registro
        </button>
      )}
    </Folha>
  )
}

function FolhaExtra({
  temKcal, aoRegistrar, aoFechar,
}: {
  temKcal: boolean
  aoRegistrar: (nome: string, kcal: number | null) => void
  aoFechar: () => void
}) {
  const [nome, setNome] = useState('')
  const [kcal, setKcal] = useState('')

  return (
    <Folha titulo="Fora do plano" aoFechar={aoFechar}>
      <div className="flex flex-col gap-2">
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="O que comeu?"
          className="min-h-12 rounded-xl border border-borda bg-elevado px-3 text-sm outline-none focus:border-acento"
        />
        {temKcal && (
          <input
            type="number"
            inputMode="numeric"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            placeholder="kcal (se souber)"
            className="min-h-12 rounded-xl border border-borda bg-elevado px-3 text-sm outline-none focus:border-acento"
          />
        )}
        <button
          disabled={!nome.trim()}
          onClick={() => aoRegistrar(nome.trim(), kcal === '' ? null : Number(kcal))}
          className="min-h-12 rounded-xl bg-acento text-sm font-semibold text-white disabled:opacity-40"
        >
          Registrar
        </button>
      </div>
    </Folha>
  )
}

function BotaoFolha({
  cor, onClick, escondido, children,
}: {
  cor: string
  onClick: () => void
  escondido?: boolean
  children: React.ReactNode
}) {
  if (escondido) return null
  return (
    <button
      onClick={onClick}
      className={`min-h-12 rounded-xl text-sm font-semibold ${cor}`}
    >
      {children}
    </button>
  )
}

function descreverItem(i: { alimento: string; qtd: number | null; unidade: string }) {
  return i.qtd == null ? `${i.alimento} (${i.unidade})` : `${i.alimento} ${i.qtd}${i.unidade}`
}
