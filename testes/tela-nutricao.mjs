// Verificacao de tela do modulo de nutricao, com as respostas do Supabase
// simuladas por page.route. Nao precisa de banco nem de .env real.
//
//   npm run build && npx vite preview --port 4191
//   node testes/tela-nutricao.mjs
//
// O relogio e congelado antes do app rodar: quase tudo aqui depende de que
// dia da semana e hoje. PLAYWRIGHT e o caminho do pacote (global nesta
// maquina); FOTOS, onde salvar as capturas.
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')

const BASE = process.env.BASE ?? 'http://localhost:4191'
const PASTA = process.env.FOTOS ?? '/tmp'
const IGOR = '11111111-1111-4111-8111-111111111111'
const CAMILA = '22222222-2222-4222-8222-222222222222'
const CARLOS = '33333333-3333-4333-8333-333333333333'

const SEG = new Date('2026-09-28T08:00:00-03:00')   // segunda
const QUA = new Date('2026-09-30T08:00:00-03:00')   // quarta

let falhas = 0, n = 0
const ok = (cond, msg, extra = '') => {
  n++
  if (cond) console.log(`ok     ${n}. ${msg}`)
  else { falhas++; console.log(`FALHOU ${n}. ${msg}${extra ? `\n         ${extra}` : ''}`) }
}

// --- dados ------------------------------------------------------------

const op = (id, rotulo, ordem, padrao, kcal, prot, origem = 'nutricionista', itens = []) =>
  ({ id, refeicao_id: null, rotulo, ordem, padrao, itens, kcal, proteina_g: prot, origem, nota: null })

const ref = (id, nome, horario, tipo, ordem, opcoes, obrigatoria = true) => ({
  id, plano_id: 'pl-igor', nome, horario: `${horario}:00`, tipo_dia: tipo, ordem, obrigatoria,
  opcoes: opcoes.map((o) => ({ ...o, refeicao_id: id })),
})

const planoIgor = {
  id: 'pl-igor', perfil_id: IGOR, nome: 'Júnior Cordeiro + ajustes', ativo: true,
  dias_jiu_jitsu: [1, 2, 4], atividade_jiu_jitsu_id: 'a1',
  observacao: 'Proteína permitida: frango, carnes magras, ovos e peixe grelhado. '
    + 'Nenhum outro fruto do mar — alergia a crustáceos.',
  refeicoes: [
    ref('r1', 'Pré-treino', '05:45', 'ambos', 1, [op('o1', 'Café preto + banana', 1, true, 90, 1)]),
    ref('r2', 'Café da manhã', '07:45', 'ambos', 2, [
      op('o2', 'Opção 1 de Júnior + ajuste', 1, true, 590, 52, 'ajuste'),
      op('o3', 'Opção 3 de Júnior', 2, false, 390, 31),
    ]),
    ref('r3', 'Almoço', '13:00', 'ambos', 3, [
      op('o4', 'Frango, arroz e feijão verde', 1, true, 800, 75),
      op('o4b', 'Frango, arroz e batata', 2, false, 800, 75),
    ]),
    ref('r4', 'Lanche', '16:00', 'normal', 4, [op('o5', 'Opção 3 de Júnior', 1, true, 275, 31)]),
    ref('r5', 'Lanche', '16:00', 'jiu_jitsu', 5, [op('o6', 'Opção 3 de Júnior + banana', 1, true, 365, 32, 'ajuste')]),
    ref('r6', 'Pré-jiu-jitsu', '18:00', 'jiu_jitsu', 6, [op('o7', 'Frango, arroz e banana', 1, true, 480, 37, 'ajuste')]),
    ref('r7', 'Jantar', '19:30', 'normal', 7, [op('o8', 'Opção 1 de Júnior', 1, true, 470, 59)]),
    ref('r8', 'Ceia', '21:30', 'normal', 8, [op('o9', 'Whey', 1, true, 120, 20, 'ajuste')]),
    ref('r9', 'Pós-jiu-jitsu', '22:15', 'jiu_jitsu', 9, [op('o10', 'Shake de whey', 1, true, 120, 20, 'ajuste')], false),
  ],
}

const planoCamila = {
  id: 'pl-cam', perfil_id: CAMILA, nome: 'Prato dividido', ativo: true,
  dias_jiu_jitsu: [], atividade_jiu_jitsu_id: null, observacao: null,
  refeicoes: [
    { id: 'c1', plano_id: 'pl-cam', nome: 'Café da manhã', horario: '07:45:00', tipo_dia: 'ambos', ordem: 1, obrigatoria: true,
      opcoes: [{ id: 'co1', refeicao_id: 'c1', rotulo: 'Prato dividido', ordem: 1, padrao: true, itens: [], kcal: null, proteina_g: null, origem: 'generico', nota: 'Proteína + carboidrato + fruta' }] },
    { id: 'c2', plano_id: 'pl-cam', nome: 'Almoço', horario: '13:00:00', tipo_dia: 'ambos', ordem: 2, obrigatoria: true,
      opcoes: [{ id: 'co2', refeicao_id: 'c2', rotulo: 'Prato dividido', ordem: 1, padrao: true, itens: [], kcal: null, proteina_g: null, origem: 'generico', nota: 'Metade salada' }] },
  ],
}

const metasIgor = {
  perfil_id: IGOR, peso_alvo_kg: 94, data_alvo: '2026-10-16',
  checkpoints: [{ dia: '2026-09-30', min: 97.0, max: 97.5 }],
  regra_corte: 'Acima de 97,8 kg em 30/09, a meta passa a 95,0 kg',
  agua_ml_normal: 4000, agua_ml_jiu_jitsu: 5000,
  kcal_normal: 2350, kcal_jiu_jitsu: 2450,
  proteina_g_normal: 235, proteina_g_jiu_jitsu: 215,
}

// --- ambiente ---------------------------------------------------------

async function abrir(nav, {
  quem = IGOR, papel = 'aluno', agora = SEG, atividades = [], medidas = [],
  registros = [], rota = '/', viewport = { width: 390, height: 844 },
} = {}) {
  const ctx = await nav.newContext({ viewport, deviceScaleFactor: 2 })
  const escritas = []
  const erros = []

  await ctx.route('**/auth/v1/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))

  await ctx.route('**/rest/v1/**', async (rota_) => {
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
    const ela = { id: CAMILA, nome: 'Camila Cabral', papel: 'aluno', cor: '#db2777' }
    const ele = { id: CARLOS, nome: 'Carlos Neto', papel: 'personal', cor: '#15c07a' }
    const todos = [eu, ela, ele]

    if (t === 'perfis') {
      return json(u.searchParams.has('id') ? todos.find((p) => p.id === quem) : todos)
    }
    if (t === 'planos_alimentares') {
      // O personal nao le nada do modulo: a RLS devolve vazio.
      if (papel === 'personal') return json(null)
      const alvo = u.searchParams.get('perfil_id')?.replace('eq.', '')
      const p = alvo === CAMILA ? planoCamila : planoIgor
      return json(alvo === IGOR || alvo === CAMILA ? p : null)
    }
    if (t === 'metas_nutricionais') {
      if (papel === 'personal') return json(null)
      const alvo = u.searchParams.get('perfil_id')?.replace('eq.', '')
      return json(alvo === IGOR ? metasIgor : null)
    }
    if (t === 'refeicao_registros') return json(papel === 'personal' ? [] : registros)
    if (t === 'medidas_diarias') return json(papel === 'personal' ? [] : medidas)
    if (t === 'atividades') return json([
      { id: 'a1', nome: 'Jiu-jitsu', emoji: '🥋', perfil_id: IGOR, meta_semanal: 3, ativa: true, ordem: 0 },
    ])
    if (t === 'atividade_registros') return json(atividades)
    if (t === 'treinos') return json([])
    if (t === 'config') return json(null)
    if (t === 'periodizacao') return json([])
    return json([])
  })

  await ctx.addInitScript(([id, ms]) => {
    localStorage.setItem('sb-exemplo-auth-token', JSON.stringify({
      access_token: 'f', token_type: 'bearer', expires_in: 3600,
      // Contra o relogio CONGELADO, nao o real: com a data adiantada o
      // supabase-js consideraria a sessao expirada e cairia no login.
      expires_at: Math.floor(ms / 1000) + 3600, refresh_token: 'f',
      user: { id, aud: 'authenticated', role: 'authenticated', email: 'i@e.com',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }))
    // Congelar o relogio ANTES do app rodar: o tipo do dia vem de new Date().
    // Chamado sem `new`, um Date normal devolve string; uma classe
    // lancaria. Por isso Proxy, e nao `class ... extends Date`.
    const Real = Date
    globalThis.Date = new Proxy(Real, {
      construct: (alvo, args) => new alvo(...(args.length ? args : [ms])),
      apply: () => new Real(ms).toString(),
      get: (alvo, p) => (p === 'now' ? () => ms : Reflect.get(alvo, p)),
    })
  }, [quem, agora.getTime()])

  const pg = await ctx.newPage()
  pg.on('pageerror', (e) => erros.push(e.message))
  await pg.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' })
  await pg.waitForTimeout(500)
  return { ctx, pg, escritas, erros }
}

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const texto = (pg) => pg.locator('body').innerText()

// --- 1. segunda sem jiu-jitsu marcado ---------------------------------
{
  const { ctx, pg, erros } = await abrir(nav, { agora: SEG })
  const t = await texto(pg)
  ok(t.includes('Pré-jiu-jitsu'), '1. segunda mostra Pré-jiu-jitsu sem a atividade marcada')
  ok(t.includes('Pós-jiu-jitsu'), '1. segunda mostra Pós-jiu-jitsu')
  ok(!t.includes('Jantar') && !t.includes('Ceia'), '1. segunda esconde Jantar e Ceia')
  ok(t.includes('Dia de jiu-jitsu'), '1. chip diz "Dia de jiu-jitsu"')
  ok(erros.length === 0, '1. sem erro de JS na página', erros.join(' ;; '))
  await pg.screenshot({ path: `${PASTA}/nut-1-segunda.png`, fullPage: true })
  await ctx.close()
}

// --- 2. quarta com a atividade registrada -----------------------------
{
  const { ctx, pg } = await abrir(nav, {
    agora: QUA,
    atividades: [{ atividade_id: 'a1', perfil_id: IGOR, dia: '2026-09-30', duracao_min: null }],
  })
  const t = await texto(pg)
  ok(t.includes('Dia de jiu-jitsu'), '2. quarta com a atividade registrada vira dia de jiu-jitsu')
  ok(t.includes('Pré-jiu-jitsu') && !t.includes('Jantar'), '2. e as refeições trocam junto')
  await ctx.close()
}

// --- 2b. quarta sem nada marcado e dia normal -------------------------
{
  const { ctx, pg } = await abrir(nav, { agora: QUA })
  const t = await texto(pg)
  ok(t.includes('Dia normal'), '2b. quarta sem atividade é dia normal')
  ok(t.includes('Jantar') && t.includes('Ceia') && !t.includes('Pré-jiu-jitsu'),
    '2b. e mostra Jantar e Ceia')
  await ctx.close()
}

// --- 3. chip manual vence o dia da semana -----------------------------
{
  const { ctx, pg, escritas } = await abrir(nav, { agora: SEG })
  await pg.getByRole('button', { name: /Dia de jiu-jitsu/ }).click()
  await pg.waitForTimeout(400)
  const t = await texto(pg)
  ok(t.includes('Dia normal'), '3. tocar no chip numa segunda troca para Dia normal')
  ok(t.includes('Jantar') && !t.includes('Pré-jiu-jitsu'), '3. e o plano do dia troca junto')
  const w = escritas.find((e) => e.tabela === 'medidas_diarias')
  ok(w?.corpo?.tipo_dia === 'normal', '3. o override vai para medidas_diarias.tipo_dia',
    JSON.stringify(w?.corpo))
  ok(Object.keys(w?.corpo ?? {}).sort().join(',') === 'atualizado_em,dia,perfil_id,tipo_dia',
    '3. e vai SÓ com a coluna mexida', JSON.stringify(w?.corpo))
  await ctx.close()
}

// --- 4 e 5. registro offline, fila, e troca de estado reusando o id ---
{
  const { ctx, pg, escritas } = await abrir(nav, { agora: QUA })
  await ctx.setOffline(true)

  const linha = pg.locator('div').filter({ hasText: /^○Almoço/ }).last()
  await pg.getByRole('button', { name: 'Marcar Almoço como cumprida' }).click()
  await pg.waitForTimeout(300)
  ok((await texto(pg)).includes('800 kcal'), '4. o ✓ aparece na hora, sem rede')
  ok(escritas.length === 0, '4. e nada subiu enquanto estava offline')

  const fila = await pg.evaluate(() => JSON.parse(localStorage.getItem('treino:fila') ?? '[]'))
  ok(fila.length === 1 && fila[0].tabela === 'refeicao_registros', '4. o registro entrou na fila')
  const idNaFila = fila[0].dados.id

  await ctx.setOffline(false)
  await pg.evaluate(() => window.dispatchEvent(new Event('online')))
  await pg.waitForTimeout(800)
  const subiram = escritas.filter((e) => e.tabela === 'refeicao_registros')
  ok(subiram.length === 1, `4. subiu uma vez só ao reconectar (${subiram.length})`)
  ok((await pg.evaluate(() => JSON.parse(localStorage.getItem('treino:fila') ?? '[]'))).length === 0,
    '4. e a fila esvaziou')

  // 5. mudar de cumprida para pulada reusa o id
  await pg.getByRole('button', { name: /Almoço/ }).last().click()
  await pg.waitForTimeout(300)
  await pg.getByRole('button', { name: 'Pulei' }).click()
  await pg.waitForTimeout(600)
  const depois = escritas.filter((e) => e.tabela === 'refeicao_registros')
  ok(depois.length === 2, `5. a troca de estado gerou uma segunda escrita (${depois.length})`)
  ok(depois[1].corpo.id === idNaFila, '5. com o MESMO id do registro anterior',
    `${depois[1].corpo.id} != ${idNaFila}`)
  ok(depois[1].corpo.estado === 'pulada' && depois[1].corpo.kcal === null,
    '5. e pulada não soma kcal')
  await ctx.close()
}

// --- 6. o registro leva snapshot, nao referencia ----------------------
{
  const { ctx, pg, escritas } = await abrir(nav, { agora: QUA })
  await pg.getByRole('button', { name: 'Marcar Almoço como cumprida' }).click()
  await pg.waitForTimeout(600)
  const c = escritas.find((e) => e.tabela === 'refeicao_registros')?.corpo
  ok(c?.refeicao_nome === 'Almoço' && c?.opcao_rotulo === 'Frango, arroz e feijão verde'
     && c?.kcal === 800 && c?.proteina_g === 75,
    '6. o registro grava nome, rótulo, kcal e proteína do momento', JSON.stringify(c))
  await ctx.close()
}

// --- 7. Camila: sem kcal; plano do Igor em leitura --------------------
{
  const { ctx, pg } = await abrir(nav, { quem: CAMILA, agora: QUA })
  const t = await texto(pg)
  ok(t.includes('Café da manhã') && t.includes('Almoço'), '7. o cartão da Camila tem as refeições')
  ok(!/\d+\s*kcal/.test(t) && !/g prot\./.test(t), '7. e nenhum número de kcal ou proteína', t.slice(0, 400))
  await ctx.close()
}
{
  const { ctx, pg } = await abrir(nav, { quem: CAMILA, agora: QUA, rota: '/nutricao' })
  await pg.getByRole('button', { name: 'Igor' }).click()
  await pg.waitForTimeout(600)
  await pg.getByText('Pré-jiu-jitsu').first().click()
  await pg.waitForTimeout(300)
  const t = await texto(pg)
  ok(t.includes('Frango, arroz e banana'), '7. o plano do Igor abre para a Camila')
  ok(!t.includes('+ Opção') && !t.includes('apagar refeição'),
    '7. e sem nenhum botão de edição')
  await ctx.close()
}

// --- 8. o personal nao ve nutricao ------------------------------------
{
  const { ctx, pg } = await abrir(nav, { quem: CARLOS, papel: 'personal', agora: QUA })
  const t = await texto(pg)
  ok(!t.includes('Comida'), '8. "Comida" não aparece no menu do personal')
  ok(!t.includes('Alimentação'), '8. nem o cartão Alimentação no Hoje')
  await pg.goto(`${BASE}/nutricao`, { waitUntil: 'networkidle' })
  await pg.waitForTimeout(500)
  const t2 = await texto(pg)
  ok(!t2.includes('Nutrição') && !t2.includes('Peso'),
    '8. e o acesso direto a /nutricao não carrega nada', t2.slice(0, 200))
  await ctx.close()
}

// --- 9. agua: 8 toques = 4000 ml; meta 5000 em dia de jiu-jitsu -------
{
  const { ctx, pg, escritas } = await abrir(nav, { agora: QUA })
  ok((await texto(pg)).includes('/ 4.0 L'), '9. meta de água num dia normal: 4,0 L')
  for (let i = 0; i < 8; i++) {
    await pg.getByRole('button', { name: '+500 ml' }).click()
    await pg.waitForTimeout(80)
  }
  await pg.waitForTimeout(400)
  ok((await texto(pg)).includes('4.0 / 4.0 L'), '9. 8 toques completam 4,0 L',
    (await texto(pg)).match(/[\d.]+ \/ [\d.]+ L/)?.[0])
  const ultima = escritas.filter((e) => e.tabela === 'medidas_diarias').at(-1)
  ok(ultima?.corpo?.agua_ml === 4000, '9. e a água vai como total do dia, não como incremento',
    JSON.stringify(ultima?.corpo))
  await ctx.close()
}
{
  const { ctx, pg } = await abrir(nav, { agora: SEG })
  ok((await texto(pg)).includes('/ 5.0 L'), '9. num dia de jiu-jitsu a meta é 5,0 L')
  await ctx.close()
}

// --- 10. media movel so com 4 pesagens --------------------------------
const pesagens = (q) => [
  { perfil_id: IGOR, dia: '2026-09-24', peso_kg: 98.0 },
  { perfil_id: IGOR, dia: '2026-09-25', peso_kg: 97.6 },
  { perfil_id: IGOR, dia: '2026-09-26', peso_kg: 97.9 },
  { perfil_id: IGOR, dia: '2026-09-27', peso_kg: 97.1 },
].slice(0, q).map((m) => ({ ...m, cintura_cm: null, abdomen_cm: null, agua_ml: null,
  alcool_doses: null, dormiu_no_horario: null, tipo_dia: null, nota: null }))

for (const [q, esperado] of [[3, false], [4, true]]) {
  const { ctx, pg } = await abrir(nav, { agora: QUA, rota: '/nutricao', medidas: pesagens(q) })
  await pg.getByRole('button', { name: 'Histórico' }).click()
  await pg.waitForTimeout(600)
  const linhas = await pg.locator('svg polyline, svg circle.fill-acento-texto').count()
  ok((linhas > 0) === esperado,
    `10. ${q} pesagens → ${esperado ? 'com' : 'sem'} linha de média móvel`)
  if (q === 4) await pg.screenshot({ path: `${PASTA}/nut-2-historico.png`, fullPage: true })
  await ctx.close()
}

// --- 11. a opcional nao derruba a aderencia ---------------------------
{
  const reg = (id, rid, nome, estado, kcal) => ({
    id, perfil_id: IGOR, dia: '2026-09-28', refeicao_id: rid, opcao_id: null, estado,
    refeicao_nome: nome, opcao_rotulo: null, kcal, proteina_g: null, descricao: null,
    registrado_em: '2026-09-28T12:00:00Z',
  })
  const { ctx, pg } = await abrir(nav, {
    agora: SEG,
    registros: [
      reg('x1', 'r1', 'Pré-treino', 'cumprida', 90),
      reg('x2', 'r2', 'Café da manhã', 'cumprida', 590),
    ],
  })
  const t = await texto(pg)
  ok(t.includes('100%'), '11. o Pós-jiu-jitsu não registrado não derruba a aderência',
    t.match(/\d+% do plano/)?.[0])
  ok(/\d+ sem registro/.test(t), '11. e as não registradas aparecem ao lado, em número',
    t.match(/\d+ sem registro/)?.[0])
  await ctx.close()
}

// --- 13. a alergia aparece na tela ------------------------------------
{
  const { ctx, pg } = await abrir(nav, { agora: SEG })
  ok((await texto(pg)).includes('Regras do plano e alergia'),
    '13. o cartão traz as regras do plano ao alcance de um toque')
  await pg.getByRole('button', { name: 'Regras do plano e alergia' }).click()
  await pg.waitForTimeout(200)
  ok((await texto(pg)).includes('alergia a crustáceos'),
    '13. e a alergia aparece por extenso')
  await ctx.close()
}
{
  const { ctx, pg } = await abrir(nav, { agora: SEG, rota: '/nutricao' })
  ok((await texto(pg)).includes('alergia a crustáceos'),
    '13. na aba Plano ela fica aberta, antes das refeições')
  await ctx.close()
}

// --- 12. alvos de toque -----------------------------------------------
{
  const { ctx, pg } = await abrir(nav, { agora: SEG })
  const pequenos = await pg.evaluate(() => {
    const maus = []
    for (const b of document.querySelectorAll('button')) {
      const r = b.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      // Links de texto ("trocar", "tirar") sao alvos secundarios dentro de
      // uma linha maior; o que precisa de 48px e o controle principal.
      if (b.className.includes('underline')) continue
      if (r.height < 48) maus.push(`${b.innerText.trim().slice(0, 24) || b.ariaLabel} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return maus
  })
  ok(pequenos.length === 0, '12. todo controle principal tem 48px ou mais de altura',
    pequenos.join(' | '))

  const alvoCheck = await pg.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.ariaLabel?.startsWith('Marcar'))
    const r = b.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  })
  ok(alvoCheck.w >= 48 && alvoCheck.h >= 48,
    `12. o ✓ da refeição tem ${alvoCheck.w}x${alvoCheck.h} px`)
  await ctx.close()
}

console.log(`\n${n - falhas}/${n} passaram`)
await nav.close()
process.exit(falhas ? 1 : 0)
