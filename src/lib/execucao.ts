/**
 * Para onde vai o "ver execucao" de um exercicio.
 *
 * Se o personal cadastrou um video, usa o dele. Senao, cai numa busca do
 * YouTube pelo nome — o que faz o recurso valer para os 35 exercicios
 * desde o primeiro dia, sem ninguem precisar preencher 35 URLs.
 */
export function linkDeExecucao(nome: string, videoUrl: string | null) {
  if (videoUrl) return videoUrl
  const busca = encodeURIComponent(`${nome} execução correta academia`)
  return `https://www.youtube.com/results?search_query=${busca}`
}
