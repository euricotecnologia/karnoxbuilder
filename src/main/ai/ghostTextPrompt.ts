export const GHOST_TEXT_SYSTEM_PROMPT =
  'Você é um mecanismo de completação de código Object Pascal (Delphi) embutido num editor, estilo "ghost text". ' +
  'Devolva SOMENTE o texto exato que deve ser inserido no lugar de <CURSOR>, continuando o código de forma natural e sintaticamente válida. ' +
  'Nunca repita o código que já está antes ou depois de <CURSOR>. Nunca use blocos de markdown (```), nunca explique nada, nunca adicione comentários sobre o que você está fazendo. ' +
  'Se não houver nada sensato para completar, devolva uma resposta vazia. Prefira sugestões curtas (poucas linhas).'

const MAX_CONTEXT_CHARS = 2000

export function buildGhostTextPrompt(prefix: string, suffix: string): string {
  const trimmedPrefix = prefix.length > MAX_CONTEXT_CHARS ? prefix.slice(-MAX_CONTEXT_CHARS) : prefix
  const trimmedSuffix = suffix.length > MAX_CONTEXT_CHARS ? suffix.slice(0, MAX_CONTEXT_CHARS) : suffix
  return `${trimmedPrefix}<CURSOR>${trimmedSuffix}`
}
