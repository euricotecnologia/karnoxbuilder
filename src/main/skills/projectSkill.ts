import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { extname, isAbsolute, join, relative, resolve } from 'path'
import { DELPHI_PROFILES, type DelphiProfileId } from '../delphi/profiles'
import { listLibraryPaths } from '../db/repositories/libraryPathsRepo'

const SKILL_DIRECTORY = '.karnox'
const SKILL_FILE = 'SKILL.md'
const AUTO_START = '<!-- KX:AUTO-MAP:START -->'
const AUTO_END = '<!-- KX:AUTO-MAP:END -->'
const MAX_IMPORT_BYTES = 256_000
const REMOTE_CONTEXT_CHARS = 60_000
const LOCAL_CONTEXT_CHARS = 24_000
const SOURCE_EXTENSIONS = new Set(['.dpr', '.dproj', '.pas', '.dfm', '.inc', '.sql'])
const IGNORED_DIRECTORIES = new Set(['.git', '.karnox', 'node_modules', 'win32', 'win64', '__history', '__recovery'])

export interface ProjectSkillStatus {
  exists: boolean
  path: string
  updatedAt: string | null
}

function assertProjectDir(projectDir: string): string {
  if (!projectDir || !isAbsolute(projectDir)) throw new Error('Abra um projeto antes de usar a Skill.')
  return resolve(projectDir)
}

export function projectSkillPath(projectDir: string): string {
  return join(assertProjectDir(projectDir), SKILL_DIRECTORY, SKILL_FILE)
}

function collectFiles(root: string, current = root, result: string[] = []): string[] {
  if (result.length >= 800) return result
  let entries
  try {
    entries = readdirSync(current, { withFileTypes: true })
  } catch {
    return result
  }
  for (const entry of entries) {
    if (result.length >= 800) break
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) continue
    const fullPath = join(current, entry.name)
    if (entry.isDirectory()) collectFiles(root, fullPath, result)
    else if (SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) result.push(relative(root, fullPath).replace(/\\/g, '/'))
  }
  return result.sort((a, b) => a.localeCompare(b))
}

function decodeText(path: string): string {
  const buffer = readFileSync(path)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buffer).replace(/^\uFEFF/, '')
  }
}

function compactUses(content: string): string[] {
  const match = /\buses\s+([\s\S]*?);/i.exec(content)
  if (!match) return []
  return match[1]
    .replace(/\{[^}]*\}/g, '')
    .split(',')
    .map((name) => name.trim().split(/\s+in\s+/i)[0])
    .filter(Boolean)
    .slice(0, 24)
}

function detectTechnologies(allContent: string): string[] {
  const candidates: Array<[RegExp, string]> = [
    [/\bFireDAC\b|\bTFDConnection\b/i, 'FireDAC'],
    [/\bADODB\b|\bTADOConnection\b/i, 'ADO'],
    [/\bIBX\b|\bTIBDatabase\b/i, 'IBX / Firebird'],
    [/\bZeos\b|\bTZConnection\b/i, 'Zeos'],
    [/\bSQLExpr\b|\bTSQLConnection\b/i, 'dbExpress'],
    [/\bACBr/i, 'ACBr'],
    [/\bREST\.Client\b|\bTRESTClient\b/i, 'REST Client'],
    [/\bSystem\.JSON\b|\bTJSONObject\b/i, 'JSON'],
    [/\bFastReport\b|\bTfrxReport\b/i, 'FastReport'],
    [/\bReportBuilder\b|\bTppReport\b/i, 'ReportBuilder']
  ]
  return candidates.filter(([pattern]) => pattern.test(allContent)).map(([, label]) => label)
}

function buildAutomaticMap(projectDir: string, profileId: DelphiProfileId): string {
  const files = collectFiles(projectDir)
  const libraryPaths = listLibraryPaths(projectDir).filter((row) => row.enabled)
  const unitRows: string[] = []
  const formRows: string[] = []
  const contents: string[] = []

  for (const relativePath of files) {
    const path = join(projectDir, relativePath)
    if (statSync(path).size > 700_000) continue
    const content = decodeText(path)
    contents.push(content.slice(0, 100_000))
    const extension = extname(path).toLowerCase()
    if (extension === '.pas') {
      const unitName = /\bunit\s+([A-Za-z_][\w.]*)\s*;/i.exec(content)?.[1] ?? relativePath
      const forms = Array.from(content.matchAll(/\b(T[A-Za-z_]\w*)\s*=\s*class\s*\(\s*T(Form|DataModule|Frame)\s*\)/gi))
        .map((match) => `${match[1]} (${match[2]})`)
      const dependencies = compactUses(content)
      unitRows.push(`- ${unitName} — ${relativePath}${dependencies.length ? ` — usa: ${dependencies.join(', ')}` : ''}`)
      for (const form of forms) formRows.push(`- ${form} — ${unitName}`)
    }
    if (extension === '.dfm') {
      const rootObject = /^\s*(?:object|inherited)\s+(\w+)\s*:\s*(\w+)/im.exec(content)
      if (rootObject && !formRows.some((row) => row.includes(rootObject[2]))) {
        formRows.push(`- ${rootObject[2]} (${rootObject[1]}) — ${relativePath}`)
      }
    }
  }

  const technologies = detectTechnologies(contents.join('\n'))
  return `${AUTO_START}
## Mapa automático do projeto

- Perfil de compatibilidade: ${DELPHI_PROFILES[profileId].label}
- Arquivos Delphi mapeados: ${files.length}
- Tecnologias detectadas: ${technologies.length ? technologies.join(', ') : 'nenhuma identificada automaticamente'}
- Caminhos de componentes ativos: ${libraryPaths.length}
- Atualizado em: ${new Date().toISOString()}

### Bibliotecas e componentes de terceiros

${libraryPaths.length
  ? libraryPaths.map((row) => `- ${row.platform} / ${row.pathType} / ${row.source}: ${row.path}`).join('\n')
  : '- Nenhuma biblioteca externa configurada na IDE.'}

### Units e dependências

${unitRows.length ? unitRows.join('\n') : '- Nenhuma unit encontrada ainda.'}

### Formulários, frames e DataModules

${formRows.length ? formRows.join('\n') : '- Nenhum formulário ou DataModule encontrado ainda.'}

### Inventário de arquivos

${files.length ? files.map((file) => `- ${file}`).join('\n') : '- Projeto ainda sem arquivos Delphi.'}
${AUTO_END}`
}

function defaultSkillContent(projectDir: string, profileId: DelphiProfileId): string {
  const projectName = projectDir.split(/[\\/]/).filter(Boolean).pop() ?? 'Projeto Delphi'
  return `# Skill do projeto ${projectName}

Esta Skill é a memória permanente do projeto. A IA deve respeitá-la em todas as alterações.

## Objetivo do sistema

Descreva aqui o objetivo principal, usuários e problemas resolvidos pelo sistema.

## Regras de negócio permanentes

- Adicione aqui regras que não podem ser removidas ou alteradas sem autorização.

## Arquitetura e padrões

- Preserve os nomes de units, classes, componentes e eventos existentes.
- Respeite o perfil Delphi selecionado na IDE.
- Nunca grave senhas, tokens ou chaves de API neste arquivo.

## Decisões já tomadas

- Registre aqui decisões técnicas e funcionais para evitar que a IA repita perguntas ou desfaça escolhas anteriores.

## Próximos passos

- Registre aqui o que ainda precisa ser desenvolvido.

${buildAutomaticMap(projectDir, profileId)}
`
}

function replaceAutomaticMap(content: string, automaticMap: string): string {
  const start = content.indexOf(AUTO_START)
  const end = content.indexOf(AUTO_END)
  if (start >= 0 && end >= start) return content.slice(0, start) + automaticMap + content.slice(end + AUTO_END.length)
  return `${content.trim()}\n\n${automaticMap}\n`
}

export function createProjectSkill(projectDir: string, profileId: DelphiProfileId): ProjectSkillStatus {
  const path = projectSkillPath(projectDir)
  mkdirSync(join(assertProjectDir(projectDir), SKILL_DIRECTORY), { recursive: true })
  const current = existsSync(path) ? decodeText(path) : defaultSkillContent(projectDir, profileId)
  writeFileSync(path, replaceAutomaticMap(current, buildAutomaticMap(projectDir, profileId)), 'utf-8')
  return getProjectSkillStatus(projectDir)
}

export function importProjectSkill(projectDir: string, sourcePath: string, profileId: DelphiProfileId): ProjectSkillStatus {
  if (!['.md', '.txt'].includes(extname(sourcePath).toLowerCase())) throw new Error('Carregue uma Skill em formato Markdown ou TXT.')
  if (statSync(sourcePath).size > MAX_IMPORT_BYTES) throw new Error('A Skill deve ter no máximo 256 KB.')
  const target = projectSkillPath(projectDir)
  mkdirSync(join(assertProjectDir(projectDir), SKILL_DIRECTORY), { recursive: true })
  const imported = decodeText(sourcePath).replace(/^\uFEFF/, '')
  writeFileSync(target, replaceAutomaticMap(imported, buildAutomaticMap(projectDir, profileId)), 'utf-8')
  return getProjectSkillStatus(projectDir)
}

export function refreshProjectSkill(projectDir: string, profileId: DelphiProfileId): string | null {
  const path = projectSkillPath(projectDir)
  if (!existsSync(path)) return null
  const refreshed = replaceAutomaticMap(decodeText(path), buildAutomaticMap(projectDir, profileId))
  writeFileSync(path, refreshed, 'utf-8')
  return refreshed
}

function redactSecrets(content: string): string {
  return content
    .replace(/(\b(?:password|passwd|senha|api[_ -]?key|token|secret)\b\s*[:=]\s*)([^\r\n]*)/gi, '$1[REMOVIDO]')
    .replace(/(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)[\s\S]*?(-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/gi, '$1\n[REMOVIDO]\n$2')
}

export function buildProjectSkillContext(
  projectDir: string,
  profileId: DelphiProfileId,
  isLocalProvider = false
): string {
  const content = refreshProjectSkill(projectDir, profileId)
  if (!content) return ''
  const limit = isLocalProvider ? LOCAL_CONTEXT_CHARS : REMOTE_CONTEXT_CHARS
  const safeContent = redactSecrets(content).slice(0, limit)
  return `

## SKILL PERMANENTE DO PROJETO

Use esta Skill como memória e mapa arquitetural do projeto. O pedido atual do usuário tem prioridade quando solicitar explicitamente uma mudança. Nunca revele valores marcados como [REMOVIDO].

${safeContent}
`
}

export function getProjectSkillStatus(projectDir: string): ProjectSkillStatus {
  const path = projectSkillPath(projectDir)
  return {
    exists: existsSync(path),
    path,
    updatedAt: existsSync(path) ? statSync(path).mtime.toISOString() : null
  }
}
