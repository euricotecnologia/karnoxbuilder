import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { basename, extname, join } from 'path'

export interface ProjectContextSummary {
  projectName: string | null
  discoveredFiles: string[]
  includedFiles: string[]
  omittedFiles: string[]
  characterCount: number
  secretsRedacted: number
  preservedUnitCount: number
}

export interface ProjectContext {
  text: string
  summary: ProjectContextSummary
}

const SOURCE_EXTENSIONS = new Set(['.dpr', '.pas', '.dfm'])
const MAX_SINGLE_FILE_CHARS = 180_000
const LOCAL_CONTEXT_BUDGET = 42_000
const REMOTE_CONTEXT_BUDGET = 110_000

function decodeSource(path: string): string {
  const buffer = readFileSync(path)
  const utf8 = new TextDecoder('utf-8', { fatal: true })
  try {
    return utf8.decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buffer).replace(/^\uFEFF/, '')
  }
}

function redactSecrets(content: string): { content: string; count: number } {
  let count = 0
  const patterns = [
    /(\b(?:password|passwd|pwd|api[_ -]?key|access[_ -]?token|secret)\b\s*[:=]\s*)([^;\r\n'"}]*)/gi,
    /(Authorization\s*[:=]\s*(?:Bearer\s+)?)([^\s'";]+)/gi,
    /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)[\s\S]*?(-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/gi
  ]
  let safe = content
  for (const pattern of patterns) {
    safe = safe.replace(pattern, (_match, prefix: string, suffix?: string) => {
      count++
      return suffix?.startsWith('-----END') ? `${prefix}\n[REMOVIDO]\n${suffix}` : `${prefix}[REMOVIDO]`
    })
  }
  return { content: safe, count }
}

function priority(name: string): number {
  const extension = extname(name).toLowerCase()
  if (extension === '.dpr') return 0
  if (extension === '.pas') return 1
  return 2
}

export function collectProjectContext(projectDir: string, isLocalProvider: boolean): ProjectContext {
  const emptySummary: ProjectContextSummary = {
    projectName: null,
    discoveredFiles: [],
    includedFiles: [],
    omittedFiles: [],
    characterCount: 0,
    secretsRedacted: 0,
    preservedUnitCount: 0
  }
  if (!existsSync(projectDir)) return { text: '', summary: emptySummary }

  const files = readdirSync(projectDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => priority(a) - priority(b) || a.localeCompare(b))

  const projectFile = files.find((name) => extname(name).toLowerCase() === '.dpr')
  const summary: ProjectContextSummary = {
    ...emptySummary,
    projectName: projectFile ? basename(projectFile, '.dpr') : null,
    discoveredFiles: files
  }
  if (files.length === 0) return { text: '', summary }

  const budget = isLocalProvider ? LOCAL_CONTEXT_BUDGET : REMOTE_CONTEXT_BUDGET
  const sections: string[] = []
  let used = 0

  for (const name of files) {
    const fullPath = join(projectDir, name)
    if (statSync(fullPath).size > MAX_SINGLE_FILE_CHARS * 3) {
      summary.omittedFiles.push(name)
      continue
    }
    const redacted = redactSecrets(decodeSource(fullPath))
    const section = `@@KX:CURRENT_FILE ${name}\n${redacted.content}\n@@KX:END_CURRENT_FILE\n`
    if (used + section.length > budget) {
      summary.omittedFiles.push(name)
      continue
    }
    sections.push(section)
    summary.includedFiles.push(name)
    summary.secretsRedacted += redacted.count
    used += section.length
  }

  summary.characterCount = used
  const inventory = files.map((name) => `- ${name}`).join('\n')
  const omitted = summary.omittedFiles.length
    ? `\nArquivos cujo conteúdo não coube no limite de contexto (preserve-os no projeto):\n${summary.omittedFiles.map((name) => `- ${name}`).join('\n')}`
    : ''

  const text = `

## CONTEXTO DO PROJETO DELPHI ATUAL

Você está ALTERANDO um projeto existente. Analise o inventário e os arquivos abaixo antes de responder.
- Preserve o nome do projeto, os nomes das units, classes, componentes e eventos existentes, salvo quando o pedido exigir mudança.
- Retorne TODAS as units do inventário, inclusive as que não forem modificadas, pois a IDE reconstruirá o .dpr/.dproj a partir da sua resposta.
- Não remova telas, métodos ou componentes que não estejam relacionados ao pedido.
- Faça a menor alteração necessária e mantenha os pares .pas/.dfm consistentes.
- Preserve exatamente os blocos entre // <KARNOX-NOCODE:...> e // </KARNOX-NOCODE:...>; eles são gerenciados pelo editor visual da IDE.
- Valores sensíveis podem aparecer como [REMOVIDO]. Nunca substitua esse marcador por credenciais inventadas.

Inventário atual:
${inventory}${omitted}

Conteúdo disponibilizado:
${sections.join('\n')}`

  return { text, summary }
}
