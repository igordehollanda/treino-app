// Mede o contraste de cada texto da pagina contra o fundo EFETIVO: as
// superficies com alfa (bg-feito/10 sobre superficie) mudam a conta, entao
// nao da para conferir por tabela de tokens.
//
//   ROTA=/nutricao PLAYWRIGHT=$(npm root -g)/playwright/index.mjs \
//     node testes/contraste.mjs
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright')
const IGOR = '11111111-1111-4111-8111-111111111111'
const SEG = new Date('2026-09-28T08:00:00-03:00').getTime()

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } })
await ctx.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
await ctx.route('**/rest/v1/**', async (r) => {
  const u = new URL(r.request().url())
  const t = u.pathname.split('/rest/v1/')[1]
  const j = (c) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(c) })
  if (r.request().method() !== 'GET') return j([])
  if (t === 'perfis') return j(u.searchParams.has('id')
    ? { id: IGOR, nome: 'Igor Hollanda', papel: 'aluno', cor: '#2563eb' }
    : [{ id: IGOR, nome: 'Igor Hollanda', papel: 'aluno', cor: '#2563eb' }])
  if (t === 'planos_alimentares') return j(JSON.parse(process.env.PLANO ?? 'null'))
  if (t === 'metas_nutricionais') return j(JSON.parse(process.env.METAS ?? 'null'))
  if (t === 'refeicao_registros') return j(JSON.parse(process.env.REGISTROS ?? '[]'))
  return j([])
})
await ctx.addInitScript((ms) => {
  localStorage.setItem('sb-exemplo-auth-token', JSON.stringify({
    access_token: 'f', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(ms / 1000) + 3600, refresh_token: 'f',
    user: { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated',
      email: 'i@e.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }))
  const Real = Date
  globalThis.Date = new Proxy(Real, {
    construct: (a, args) => new a(...(args.length ? args : [ms])),
    apply: () => new Real(ms).toString(),
    get: (a, p) => (p === 'now' ? () => ms : Reflect.get(a, p)),
  })
}, SEG)

const pg = await ctx.newPage()
await pg.goto(`${process.env.BASE ?? 'http://localhost:4191'}${process.env.ROTA ?? '/'}`, { waitUntil: 'networkidle' })
await pg.waitForTimeout(600)

const maus = await pg.evaluate(() => {
  const rgba = (s) => (s.match(/[\d.]+/g) ?? []).map(Number)
  const sobre = (f, b) => f[3] === undefined || f[3] === 1
    ? f.slice(0, 3)
    : f.slice(0, 3).map((c, i) => c * f[3] + b[i] * (1 - f[3]))
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

  const fundoDe = (el) => {
    let cor = [9, 13, 18]
    const cadeia = []
    for (let e = el; e; e = e.parentElement) cadeia.unshift(e)
    for (const e of cadeia) {
      const bg = rgba(getComputedStyle(e).backgroundColor)
      if (bg.length >= 3 && (bg[3] === undefined || bg[3] > 0)) cor = sobre(bg, cor)
    }
    return cor
  }

  const ruins = []
  const vistos = new Set()
  for (const el of document.querySelectorAll('*')) {
    const texto = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
    if (!texto) continue
    const st = getComputedStyle(el)
    const px = parseFloat(st.fontSize)
    const peso = Number(st.fontWeight) || 400
    const grande = px >= 24 || (px >= 18.66 && peso >= 700)
    const minimo = grande ? 3 : 4.5
    const r = razao(sobre(rgba(st.color), fundoDe(el)), fundoDe(el))
    const chave = `${st.color}|${px}|${peso}`
    if (r < minimo && !vistos.has(chave)) {
      vistos.add(chave)
      ruins.push(`${r.toFixed(2)}:1 (mín ${minimo}) — ${px}px/${peso} ${st.color} — "${texto.slice(0, 32)}" — <${el.tagName.toLowerCase()} class="${el.className}"> dentro de <${el.parentElement?.tagName.toLowerCase()} class="${el.parentElement?.className?.toString().slice(0,90)}">`)
    }
  }
  return ruins
})

console.log(maus.length === 0 ? 'ok  nenhuma combinação abaixo de AA' : maus.join('\n'))
await nav.close()
process.exit(maus.length ? 1 : 0)
