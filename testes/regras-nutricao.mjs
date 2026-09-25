// Testa o MODULO REAL, compilado de src/lib/nutricao.ts pelo esbuild.
// A copia transcrita a mao que existia antes foi o que deixou os nomes
// das colunas divergirem do schema sem ninguem perceber.
import {
  tipoDoDia, refeicoesDoDia, totaisDoDia, aderenciaDoDia, aderenciaMedia,
  serieDePeso, metaDoDia,
} from '../node_modules/.tmp/regras.mjs'

let falhas = 0, n = 0
const eq = (nome, achado, esperado) => {
  n++
  const a = JSON.stringify(achado), e = JSON.stringify(esperado)
  if (a !== e) { falhas++; console.log(`FALHOU ${n}. ${nome}\n  achado:   ${a}\n  esperado: ${e}`) }
  else console.log(`ok     ${n}. ${nome}`)
}

const plano = { dias_jiu_jitsu: [1, 2, 4], atividade_jiu_jitsu_id: 'jj' }
const seg = new Date('2026-09-28T12:00:00')  // segunda
const qua = new Date('2026-09-30T12:00:00')  // quarta
const dom = new Date('2026-09-27T12:00:00')  // domingo

// --- tipo do dia ---
eq('segunda e dia de jiu-jitsu pelo dia da semana', tipoDoDia(seg, plano, null, false), 'jiu_jitsu')
eq('quarta e dia normal', tipoDoDia(qua, plano, null, false), 'normal')
eq('atividade marcada transforma a quarta', tipoDoDia(qua, plano, null, true), 'jiu_jitsu')
eq('escolha manual vence o dia da semana', tipoDoDia(seg, plano, { tipo_dia: 'normal' }, true), 'normal')
eq('domingo e 0 no getDay(), nao 7', tipoDoDia(dom, { dias_jiu_jitsu: [0], atividade_jiu_jitsu_id: null }, null, false), 'jiu_jitsu')
eq('sem plano, dia normal', tipoDoDia(seg, null, null, true), 'normal')

// --- refeicoes do dia ---
const refeicoes = [
  { id: 'a', nome: 'Café', tipo_dia: 'ambos', ordem: 2, obrigatoria: true },
  { id: 'b', nome: 'Lanche', tipo_dia: 'normal', ordem: 4, obrigatoria: true },
  { id: 'c', nome: 'Lanche', tipo_dia: 'jiu_jitsu', ordem: 5, obrigatoria: true },
  { id: 'd', nome: 'Pós-jiu', tipo_dia: 'jiu_jitsu', ordem: 9, obrigatoria: false },
  { id: 'e', nome: 'Pré-treino', tipo_dia: 'ambos', ordem: 1, obrigatoria: true },
]
eq('dia normal esconde as de jiu-jitsu e ordena',
  refeicoesDoDia(refeicoes, 'normal').map((r) => r.id), ['e', 'a', 'b'])
eq('dia de jiu-jitsu troca o lanche e traz o pos',
  refeicoesDoDia(refeicoes, 'jiu_jitsu').map((r) => r.id), ['e', 'a', 'c', 'd'])

// --- totais ---
eq('pulada nao soma nem conta como lacuna',
  totaisDoDia([
    { estado: 'cumprida', kcal: 500, proteina_g: 40 },
    { estado: 'pulada', kcal: 300, proteina_g: 20 },
    { estado: 'fora_do_plano', kcal: null, proteina_g: null },
    { estado: 'cumprida', kcal: 120, proteina_g: 20 },
  ]),
  { kcal: 620, proteina_g: 60, semEstimativa: 1 })

// --- aderencia ---
const ad = aderenciaDoDia(refeicoes, [
  { refeicao_id: 'e', estado: 'cumprida' },
  { refeicao_id: 'a', estado: 'parcial' },
  { refeicao_id: 'd', estado: 'pulada' },      // nao obrigatoria: fora da conta
  { refeicao_id: null, estado: 'fora_do_plano' }, // extra: fora da conta
])
eq('denominador sao as registradas obrigatorias', ad, { percentual: 0.75, registradas: 2, naoRegistradas: 2 })
eq('dia em branco nao vira zero', aderenciaDoDia(refeicoes, []),
  { percentual: null, registradas: 0, naoRegistradas: 4 })
eq('media ignora os dias em branco',
  aderenciaMedia([{ percentual: 1 }, { percentual: null }, { percentual: 0.5 }]), 0.75)
eq('media de nada e nula', aderenciaMedia([{ percentual: null }]), null)

// --- peso ---
const pesagens = [
  { dia: '2026-09-21', peso_kg: 98.0 },
  { dia: '2026-09-22', peso_kg: 97.6 },
  { dia: '2026-09-23', peso_kg: null },
  { dia: '2026-09-24', peso_kg: 97.9 },
  { dia: '2026-09-25', peso_kg: 97.1 },
]
const serie = serieDePeso(pesagens)
eq('pesagem nula sai da serie', serie.length, 4)
eq('media so a partir da 4a pesagem na janela', serie.map((p) => p.media), [null, null, null, 97.7])

// --- metas ---
const metas = {
  kcal_normal: 2350, kcal_jiu_jitsu: 2450,
  proteina_g_normal: 235, proteina_g_jiu_jitsu: 215,
  agua_ml_normal: 4000, agua_ml_jiu_jitsu: 5000,
}
eq('meta do dia normal', metaDoDia(metas, 'normal'), { kcal: 2350, proteina_g: 235, agua_ml: 4000 })
eq('meta do dia de jiu-jitsu', metaDoDia(metas, 'jiu_jitsu'), { kcal: 2450, proteina_g: 215, agua_ml: 5000 })
eq('sem metas, tudo nulo', metaDoDia(null, 'normal'), { kcal: null, proteina_g: null, agua_ml: null })

console.log(`\n${n - falhas}/${n} passaram`)
process.exit(falhas ? 1 : 0)
