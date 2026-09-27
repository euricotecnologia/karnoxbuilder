/**
 * Marcadores de texto usados para delimitar a resposta da IA. Escolhidos por
 * serem extremamente improváveis de aparecer dentro de código Pascal/DFM
 * gerado, para que a extração por texto simples (indexOf) nunca colida com
 * o conteúdo real.
 *
 * Usar um formato delimitado por marcadores em vez de JSON evita toda a
 * classe de erros de escaping (aspas, quebras de linha, barras invertidas
 * dentro de código Pascal quebrando JSON.parse) — especialmente comum em
 * modelos locais menores, que não são tão consistentes em escapar JSON
 * corretamente para blocos grandes de código.
 */
export const MARKERS = {
  PROJECT_NAME: '@@KX:PROJECT_NAME@@',
  EXPLANATION: '@@KX:EXPLANATION@@',
  UNIT: '@@KX:UNIT@@',
  END_UNIT: '@@KX:END_UNIT@@',
  NAME: '@@KX:NAME@@',
  FORM_CLASS: '@@KX:FORM_CLASS@@',
  IS_MAIN: '@@KX:IS_MAIN@@',
  PAS: '@@KX:PAS@@',
  DFM: '@@KX:DFM@@'
} as const
