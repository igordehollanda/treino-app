// Verificacao de tela: registrar um treino que foi FEITO mas nao iniciado
// no app, pelo Historico, e anotar as cargas dele depois.
//
//   npm run build && npx vite preview --port 4191 &
//   PLAYWRIGHT=$(npm root -g)/playwright/index.mjs node testes/tela-treino-retroativo.mjs
//
// O relogio e congelado antes do app rodar: o ponto da feature e a
// diferenca entre o dia do treino e o dia em que se digita.
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')

const BASE = process.env.BASE ?? 'http://localhost:4191'
const PASTA = process.env.FOTOS ?? '/tmp'
const IGOR = '11111111-1111-4111-8111-111111111111'

// Hoje e sexta, 09/10/2026. O treino esquecido foi na segunda, 05/10.
const HOJE = new Date('2026-10-09T15:00:00-03:00')
const SEGUNDA = 5

/** "2026-10-05 12:00:00" em Sao Paulo, seja qual for o fuso de quem roda. */
const emSP = (iso) =>
  new Date(iso).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' })

let falhas = 0, n = 0
const ok = (cond, msg, extra = '') => {
  n++
  if (cond) console.log(`ok     ${n}. ${msg}`)
  else { falhas++; console.log(`FALHOU ${n}. ${msg}${extra ? `\n         ${extra}` : ''}`) }
}

const exercicio = { id: 'e1', nome: 'Agachamento Smith', grupo_muscular: 'Quadríceps', video_url: null }
const treino = (id, nome, ordem) => ({
  id, nome, ordem, observacoes: null, ativo: true, atualizado_em: '2026-09-14T00:00:00Z',
  treino_alunos: [{ perfil_id: IGOR }],
  treino_exercicios: [{
    id: `i${id}`, treino_id: id, exercicio_id: 'e1', perfil_id: null, ordem: 10,
    series: 3, reps: null, descanso_seg: 90, observacao: null, grupo: null,
    exercicios: exercicio,
  }],
})

const TREINOS = [
  treino('t1', 'A — Quadríceps e Glúteos', 1),
  treino('t2', 'B — Ombro, Costas e Tríceps', 2),
  treino('t3', 'C — Posterior e Glúteos', 3),
]

async function abrir(nav, { faltas = [], sessoes = [], rota = '/historico' } = {}) {
  // Fuso de verdade: e em UTC-3 que "meio-dia local" vira 15:00Z e que
  // um treino das 22h cairia no dia seguinte se a conta fosse em UTC.
  const ctx = await nav.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    timezoneId: 'America/Sao_Paulo', locale: 'pt-BR',
  })
  const escritas = []
  const erros = []

  await ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))

  await ctx.route('**/rest/v1/**', (rota_) => {
    const req = rota_.request()
    const u = new URL(req.url())
    const t = u.pathname.split('/rest/v1/')[1]
    const json = (c, st = 200) =>
      rota_.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(c) })

    if (req.method() !== 'GET') {
      escritas.push({ tabela: t, metodo: req.method(), corpo: req.postDataJSON?.() ?? null })
      return json([], 201)
    }

    const eu = { id: IGOR, nome: 'Igor Hollanda', papel: 'aluno', cor: '#2563eb' }
    if (t === 'perfis') return json(u.searchParams.has('id') ? eu : [eu])
    if (t === 'treinos') return json(TREINOS)
    if (t === 'exercicios') return json([exercicio])
    if (t === 'sessoes') return json(sessoes)
    if (t === 'faltas') return json(faltas)
    if (t === 'series_registros') return json([])
    if (t === 'config') return json(null)
    if (t === 'periodizacao') return json([])
    return json([])
  })

  await ctx.addInitScript((ms) => {
    localStorage.setItem('sb-exemplo-auth-token', JSON.stringify({
      access_token: 'f', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(ms / 1000) + 3600, refresh_token: 'f',
      user: { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated',
        role: 'authenticated', email: 'i@e.com', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z' },
    }))
    const Real = Date
    globalThis.Date = new Proxy(Real, {
      construct: (alvo, args) => new alvo(...(args.length ? args : [ms])),
      apply: () => new Real(ms).toString(),
      get: (alvo, p) => (p === 'now' ? () => ms : Reflect.get(alvo, p)),
    })
  }, HOJE.getTime())

  const pg = await ctx.newPage()
  pg.on('pageerror', (e) => erros.push(e.message))
  pg.on('dialog', (d) => void d.accept())
  await pg.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' })
  await pg.waitForTimeout(600)
  return { ctx, pg, escritas, erros }
}

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const texto = (pg) => pg.locator('body').innerText()
const celulaDoDia = (pg, d) =>
  pg.getByRole('button', { name: new RegExp(`^${d} de `) }).first()

// --- 1. o painel oferece os treinos num dia passado -------------------
{
  const { ctx, pg, erros } = await abrir(nav)
  await celulaDoDia(pg, SEGUNDA).click()
  await pg.waitForTimeout(300)
  const t = await texto(pg)
  ok(/fiz um treino neste dia/i.test(t), '1. o dia passado oferece registrar o treino')
  const letras = await pg.getByRole('button', { name: 'A — Quadríceps e Glúteos' }).count()
  ok(letras === 1, '1. com um botão por treino do aluno, nomeado por extenso')
  ok(erros.length === 0, '1. sem erro de JS', erros.join(' ;; '))
  await pg.screenshot({ path: `${PASTA}/retro-1-painel.png`, fullPage: true })
  await ctx.close()
}

// --- 2. registrar grava a sessao no DIA CERTO -------------------------
{
  const { ctx, pg, escritas } = await abrir(nav)
  await celulaDoDia(pg, SEGUNDA).click()
  await pg.waitForTimeout(300)
  await pg.getByRole('button', { name: 'A — Quadríceps e Glúteos' }).click()
  await pg.waitForTimeout(700)

  const s = escritas.find((e) => e.tabela === 'sessoes')?.corpo
  ok(s != null, '2. a sessão subiu')
  ok(emSP(s.iniciada_em).startsWith('2026-10-05'),
    '2. com a data do treino (05/10), não a de hoje (09/10)', emSP(s.iniciada_em))
  ok(emSP(s.iniciada_em).includes(' 12:00'),
    '2. ancorada ao meio-dia local, a salvo de fuso', emSP(s.iniciada_em))
  ok(s.finalizada_em != null, '2. e já nasce finalizada: não há o que continuar')
  ok(s.treino_nome === 'A — Quadríceps e Glúteos', '2. com o nome do treino em snapshot')

  const t = await texto(pg)
  ok(!/fiz um treino neste dia/i.test(t), '2. a lista some depois de registrar')
  ok(t.includes('anotar as cargas'), '2. e aparece o caminho para as cargas')
  await pg.screenshot({ path: `${PASTA}/retro-2-registrado.png`, fullPage: true })
  await ctx.close()
}

// --- 3. o calendario e os contadores acendem --------------------------
{
  const { ctx, pg } = await abrir(nav)
  const antes = (await texto(pg)).match(/(\d+)\s*\n?\s*OUT/i)?.[1]
  await celulaDoDia(pg, SEGUNDA).click()
  await pg.waitForTimeout(300)
  await pg.getByRole('button', { name: 'B — Ombro, Costas e Tríceps' }).click()
  await pg.waitForTimeout(700)
  const nome = await celulaDoDia(pg, SEGUNDA).getAttribute('aria-label')
  ok(/treino B/.test(nome ?? ''), '3. a célula do calendário acende com a letra do treino', nome ?? '')
  const depois = (await texto(pg)).match(/(\d+)\s*\n?\s*OUT/i)?.[1]
  ok(Number(depois) === Number(antes ?? 0) + 1,
    `3. e o contador do mês sobe (${antes} → ${depois})`)
  await ctx.close()
}

// --- 4. registrar treino apaga a falta do mesmo dia -------------------
{
  const { ctx, pg, escritas } = await abrir(nav, {
    faltas: [{ perfil_id: IGOR, dia: '2026-10-05', motivo: null }],
  })
  await celulaDoDia(pg, SEGUNDA).click()
  await pg.waitForTimeout(300)
  ok((await texto(pg)).includes('Não treinei'), '4. o dia começa marcado como falta')
  await pg.getByRole('button', { name: 'A — Quadríceps e Glúteos' }).click()
  await pg.waitForTimeout(700)
  ok(!(await texto(pg)).includes('Não treinei'),
    '4. registrar o treino tira a opção de falta — um dia não é as duas coisas')
  const apagou = escritas.some((e) => e.tabela === 'faltas' && e.metodo === 'DELETE')
  ok(apagou, '4. e a falta é apagada no servidor', JSON.stringify(escritas.map((e) => `${e.metodo} ${e.tabela}`)))
  await ctx.close()
}

// --- 5. "anotar as cargas" abre a sessao, e a carga vai no dia certo ---
{
  const { ctx, pg, escritas, erros } = await abrir(nav)
  await celulaDoDia(pg, SEGUNDA).click()
  await pg.waitForTimeout(300)
  await pg.getByRole('button', { name: 'A — Quadríceps e Glúteos' }).click()
  await pg.waitForTimeout(700)
  await pg.getByRole('button', { name: 'anotar as cargas' }).click()
  await pg.waitForTimeout(900)

  ok(pg.url().includes('/executar/'), '5. "anotar as cargas" abre a tela de execução')
  const t = await texto(pg)
  ok(t.includes('Agachamento Smith'),
    '5. e a sessão carrega mesmo criada agora para um dia passado', t.slice(0, 200))
  ok(erros.length === 0, '5. sem erro de JS', erros.join(' ;; '))

  // Marcar a primeira serie.
  const campos = pg.locator('input[inputmode="decimal"], input[type="number"]')
  await campos.first().fill('80')
  await pg.locator('button').filter({ hasText: /^✓$/ }).first().click()
  await pg.waitForTimeout(800)

  const serie = escritas.find((e) => e.tabela === 'series_registros')?.corpo
  ok(serie != null, '5. a série subiu', JSON.stringify(escritas.map((e) => e.tabela)))
  if (serie) {
    ok(emSP(serie.registrada_em).startsWith('2026-10-05'),
      '5. datada no DIA DO TREINO (05/10), não no dia em que foi digitada (09/10)',
      emSP(serie.registrada_em))
  }
  await pg.screenshot({ path: `${PASTA}/retro-3-execucao.png`, fullPage: true })
  await ctx.close()
}

// --- 6. numa sessao de hoje, a serie continua com a hora de agora -----
{
  const hoje = '2026-10-09T15:00:00.000Z'
  const { ctx, pg, escritas } = await abrir(nav, {
    rota: '/executar/s-hoje',
    sessoes: [{
      id: 's-hoje', perfil_id: IGOR, treino_id: 't1', treino_nome: 'A — Quadríceps e Glúteos',
      iniciada_em: new Date('2026-10-09T13:00:00-03:00').toISOString(),
      finalizada_em: null, observacao: null,
    }],
  })
  await pg.waitForTimeout(500)
  const campos = pg.locator('input[inputmode="decimal"], input[type="number"]')
  await campos.first().fill('70')
  await pg.locator('button').filter({ hasText: /^✓$/ }).first().click()
  await pg.waitForTimeout(800)
  const serie = escritas.find((e) => e.tabela === 'series_registros')?.corpo
  ok(serie != null, '6. série de uma sessão de hoje subiu')
  if (serie) {
    ok(emSP(serie.registrada_em).startsWith('2026-10-09 15:00'),
      '6. e mantém a hora de agora: o comportamento ao vivo não mudou',
      emSP(serie.registrada_em))
  }
  void hoje
  await ctx.close()
}

// --- 7. dia futuro nao abre -------------------------------------------
{
  const { ctx, pg } = await abrir(nav)
  const futuro = celulaDoDia(pg, 20)
  const clicavel = await futuro.count()
  ok(clicavel === 0, '7. dia futuro não é botão: não dá para registrar treino que não aconteceu')
  await ctx.close()
}

console.log(`\n${n - falhas}/${n} passaram`)
await nav.close()
process.exit(falhas ? 1 : 0)
