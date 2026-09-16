// Gera os PNGs do PWA sem dependencia externa: halter branco em fundo escuro.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTabela = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTabela[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const pedaco = (tipo, dados) => {
  const tam = Buffer.alloc(4)
  tam.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const soma = Buffer.alloc(4)
  soma.writeUInt32BE(crc(corpo))
  return Buffer.concat([tam, corpo, soma])
}

function icone(tamanho, saida) {
  const px = (x, y) => {
    const u = x / tamanho, v = y / tamanho
    // halter: barra central + dois pesos, em coordenadas normalizadas
    const naBarra = v > 0.45 && v < 0.55 && u > 0.2 && u < 0.8
    const pesoEsq = u > 0.14 && u < 0.3 && v > 0.3 && v < 0.7
    const pesoDir = u > 0.7 && u < 0.86 && v > 0.3 && v < 0.7
    return naBarra || pesoEsq || pesoDir ? [255, 255, 255] : [15, 23, 42]
  }
  const linhas = []
  for (let y = 0; y < tamanho; y++) {
    const linha = Buffer.alloc(1 + tamanho * 3)
    for (let x = 0; x < tamanho; x++) {
      const [r, g, b] = px(x, y)
      linha[1 + x * 3] = r
      linha[2 + x * 3] = g
      linha[3 + x * 3] = b
    }
    linhas.push(linha)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tamanho, 0)
  ihdr.writeUInt32BE(tamanho, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 2 // RGB
  writeFileSync(saida, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco('IHDR', ihdr),
    pedaco('IDAT', deflateSync(Buffer.concat(linhas), { level: 9 })),
    pedaco('IEND', Buffer.alloc(0)),
  ]))
  console.log('gerado', saida)
}

icone(192, 'public/icone-192.png')
icone(512, 'public/icone-512.png')
