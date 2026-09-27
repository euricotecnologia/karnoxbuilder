import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'path'
import { detectDefaultDelphiInstall } from './detect'

const IGNORED = new Set(['.git', '.karnox', 'node_modules', '__history', '__recovery', 'win32', 'win64', 'debug', 'release', 'bin', 'obj'])
const EXTENSIONS = new Set(['.dpr', '.dproj', '.groupproj', '.dpk', '.pas', '.dfm', '.fmx', '.inc', '.cfg', '.dof', '.ini', '.xml', '.json', '.sql'])
const MAX_FILES = 5000

export interface ProjectDatabaseEvidence {
  library: string; componentClass: string; componentName: string; sourceFile: string
  driver?: string; database?: string; server?: string; connectionName?: string
  confidence: 'high' | 'medium' | 'low'
}
export interface DelphiVersionEvidence {
  label: string
  profile: 'delphi7_2007' | 'delphi2009_xe' | 'delphi_xe2_xe8' | 'delphi10_13' | 'unknown'
  sourceFile?: string
  sourceValue?: string
  confidence: 'high' | 'medium' | 'low'
}
export interface MigrationComponentAssessment {
  className: string
  occurrences: number
  family: string
  strategy: 'keep-update' | 'native-candidate' | 'keep-required' | 'manual-review'
  risk: 'low' | 'medium' | 'high'
  nativeCandidates: string[]
  rationale: string
}
export interface ProjectMigrationAssessment {
  available: boolean
  sourceLabel: string
  targetLabel: string
  targetStudioPath?: string
  targetCompilerVersion?: string
  components: MigrationComponentAssessment[]
  notes: string[]
}
export interface ProjectAnalysis {
  version: number; analyzedAt: string; projectName: string; projectDir: string; manifestPath: string; summaryPath: string; profilePath: string
  counts: { files: number; projects: number; projectGroups: number; packages: number; units: number; forms: number; dataModules: number; frames: number; services: number; tests: number }
  projects: string[]
  forms: Array<{ name: string; className: string; file: string; kind: 'form' | 'data-module' | 'frame' | 'service' }>
  technologies: Array<{ name: string; category: string; files: string[] }>
  databaseConnections: ProjectDatabaseEvidence[]
  thirdPartyComponents: Array<{ className: string; occurrences: number; files: string[] }>
  databaseStatus: 'configured' | 'detected' | 'ambiguous' | 'not-detected'
  hasDatabaseIni: boolean; warnings: string[]
  delphiVersion: DelphiVersionEvidence
  migration: ProjectMigrationAssessment
}
interface ScannedFile { relativePath: string; extension: string; content: string }

function detectDelphiVersion(files: ScannedFile[]): DelphiVersionEvidence {
  for (const file of files.filter((item) => item.extension === '.dof')) {
    const value = /^\s*Version\s*=\s*([\d.]+)/im.exec(file.content)?.[1]
    if (!value) continue
    const major = Number.parseInt(value, 10)
    const versions: Record<number, { label: string; profile: DelphiVersionEvidence['profile'] }> = {
      7: { label: 'Delphi 7', profile: 'delphi7_2007' },
      9: { label: 'Delphi 2005', profile: 'delphi7_2007' },
      10: { label: 'Delphi 2006', profile: 'delphi7_2007' },
      11: { label: 'Delphi 2007', profile: 'delphi7_2007' }
    }
    const detected = versions[major]
    if (detected) return { ...detected, sourceFile: file.relativePath, sourceValue: `FileVersion=${value}`, confidence: 'high' }
  }

  for (const file of files.filter((item) => item.extension === '.dproj')) {
    const raw = /<ProjectVersion>\s*([^<]+)\s*<\/ProjectVersion>/i.exec(file.content)?.[1]?.trim()
    if (!raw) continue
    const version = Number.parseFloat(raw)
    let label = 'Delphi moderno'
    let profile: DelphiVersionEvidence['profile'] = 'delphi10_13'
    let confidence: DelphiVersionEvidence['confidence'] = 'medium'
    if (version <= 4) { label = 'Delphi 2007'; profile = 'delphi7_2007'; confidence = 'high' }
    else if (version < 13) { label = 'Delphi 2009 / 2010 / XE'; profile = 'delphi2009_xe' }
    else if (version < 16) { label = 'Delphi XE2 até XE7'; profile = 'delphi_xe2_xe8' }
    else if (version < 17) { label = 'Delphi XE8'; profile = 'delphi_xe2_xe8'; confidence = 'high' }
    else if (version < 18) { label = 'Delphi 10 Seattle'; confidence = 'high' }
    else if (version < 19) { label = 'Delphi 10.1 até 10.3' }
    else if (version < 20) { label = 'Delphi 10.4 / 11' }
    else { label = version >= 20.3 ? 'Delphi 13' : 'Delphi 12 / 13'; confidence = version >= 20.3 ? 'high' : 'medium' }
    return { label, profile, sourceFile: file.relativePath, sourceValue: `ProjectVersion=${raw}`, confidence }
  }

  const cfg = files.find((item) => item.extension === '.cfg' && /(?:borland\\delphi7|delphi7\\projects)/i.test(item.content))
  if (cfg) return { label: 'Delphi 7', profile: 'delphi7_2007', sourceFile: cfg.relativePath, sourceValue: 'Caminhos do Delphi 7', confidence: 'medium' }
  return { label: 'Não identificada', profile: 'unknown', confidence: 'low' }
}

function decode(path: string): string {
  const value = readFileSync(path)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(value).replace(/^\uFEFF/, '') }
  catch { return new TextDecoder('windows-1252').decode(value).replace(/^\uFEFF/, '') }
}
function collect(root: string, current = root, result: ScannedFile[] = []): ScannedFile[] {
  if (result.length >= MAX_FILES) return result
  let entries
  try { entries = readdirSync(current, { withFileTypes: true }) } catch { return result }
  for (const entry of entries) {
    if (result.length >= MAX_FILES) break
    if (entry.isDirectory() && IGNORED.has(entry.name.toLowerCase())) continue
    const full = join(current, entry.name)
    if (entry.isDirectory()) { collect(root, full, result); continue }
    const extension = extname(entry.name).toLowerCase()
    if (!EXTENSIONS.has(extension)) continue
    try {
      if (statSync(full).size <= 2_000_000) result.push({ relativePath: relative(root, full).replace(/\\/g, '/'), extension, content: decode(full) })
    } catch { /* arquivo indisponível */ }
  }
  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}
function blocks(content: string): Array<{ name: string; className: string; block: string }> {
  const starts = Array.from(content.matchAll(/^\s*(?:object|inherited|inline)\s+(\w+)\s*:\s*([\w.]+)/gim))
  return starts.map((item, index) => ({ name: item[1], className: item[2], block: content.slice(item.index ?? 0, starts[index + 1]?.index ?? content.length) }))
}
function prop(block: string, names: string[]): string | undefined {
  const safe = block.replace(/^\s*(?:Password|Passwd|Senha)\s*=.*$/gim, '')
  for (const name of names) {
    const match = new RegExp('(?:^|[;\\r\\n])\\s*(?:\\x27)?' + name + '\\s*=\\s*(?:\\x27([^\\x27]*)\\x27|([^;\\r\\n]+))', 'i').exec(safe)
    const value = (match?.[1] ?? match?.[2])?.trim()
    if (value) return value.replace(/^[\x27"]|[\x27"]$/g, '')
  }
  return undefined
}
const DB_CLASSES: Array<[RegExp, string]> = [
  [/^TFDConnection$/i, 'FireDAC'], [/^(?:TADConnection|TADDatabase)$/i, 'AnyDAC'], [/^TZConnection$/i, 'Zeos'],
  [/^(?:TUniConnection|TMyConnection|TPgConnection|TOracleConnection|TMSConnection)$/i, 'UniDAC / Devart'],
  [/^TSQLConnection$/i, 'DBExpress'], [/^TADOConnection$/i, 'ADO / dbGo'],
  [/^(?:TIBDatabase|TIBODatabase)$/i, 'IBX / IBO'], [/^TSQLConnector$/i, 'SQLdb']
]
const TECH: Array<[RegExp, string, string]> = [
  [/\bFireDAC\b|\bTFD(?:Connection|Query|Table)\b/i, 'FireDAC', 'database'],
  [/\bZeos\b|\bTZ(?:Connection|Query|Table)\b/i, 'Zeos', 'database'],
  [/\bUniDAC\b|\bTUni(?:Connection|Query|Table)\b/i, 'UniDAC', 'database'],
  [/\bSQLExpr\b|\bTSQLConnection\b/i, 'DBExpress', 'database'],
  [/\bADODB\b|\bTADOConnection\b/i, 'ADO / dbGo', 'database'],
  [/\bIBDatabase\b|\bTIBDatabase\b/i, 'IBX', 'database'],
  [/\bACBr/i, 'ACBr', 'integration'], [/\bTcx\w+|\bDevExpress\b/i, 'DevExpress VCL', 'component'],
  [/\bTAdv\w+|\bTMS\b/i, 'TMS VCL', 'component'], [/\bTfrx\w+|\bFastReport\b/i, 'FastReport', 'report'],
  [/\bTpp\w+|\bReportBuilder\b/i, 'ReportBuilder', 'report'], [/\bREST\.Client\b|\bTRESTClient\b/i, 'REST Client', 'integration'],
  [/\bHorse\b|\bTHorse\b/i, 'Horse', 'framework'], [/\bSpring4D\b/i, 'Spring4D', 'framework']
]
type DelphiFormKind = 'form' | 'data-module' | 'frame' | 'service'
function formKind(name: string): DelphiFormKind {
  if (/datamodule/i.test(name)) return 'data-module'
  if (/frame/i.test(name)) return 'frame'
  if (/service/i.test(name)) return 'service'
  return 'form'
}
function installedDelphiLabel(version: string): string {
  const compiler = Number.parseFloat(version.replace(/[^\d.]/g, '')) || 0
  if (compiler >= 37) return 'Delphi 13'
  if (compiler >= 36) return 'Delphi 12'
  if (compiler >= 34) return 'Delphi 11'
  if (compiler >= 32) return 'Delphi 10.4'
  return /^Delphi\s/i.test(version) ? version : `RAD Studio / compilador ${version}`
}

function profileRank(profile: DelphiVersionEvidence['profile']): number {
  return { unknown: 0, delphi7_2007: 1, delphi2009_xe: 2, delphi_xe2_xe8: 3, delphi10_13: 4 }[profile]
}

function assessThirdPartyComponent(item: { className: string; occurrences: number }): MigrationComponentAssessment {
  const name = item.className
  if (/^TACBr/i.test(name)) return { ...item, family: 'ACBr', strategy: 'keep-update', risk: 'medium', nativeCandidates: [], rationale: 'O ACBr deve ser mantido. A migração apenas verificará compatibilidade e atualização para a versão instalada no Delphi de destino.' }
  if (/^Tpp/i.test(name)) return { ...item, family: 'ReportBuilder', strategy: 'keep-required', risk: 'high', nativeCandidates: [], rationale: 'Relatórios ReportBuilder possuem bandas, pipelines e expressões próprias. Não existe substituição nativa equivalente sem redesenho funcional.' }
  if (/^(?:TZConnection|TUniConnection|TMyConnection|TPgConnection|TOracleConnection|TMSConnection)$/i.test(name)) return { ...item, family: 'Acesso a dados', strategy: 'native-candidate', risk: 'high', nativeCandidates: ['TFDConnection'], rationale: 'FireDAC é candidato moderno, mas parâmetros, transações, drivers e eventos precisam ser migrados individualmente.' }
  if (/^(?:TZQuery|TUniQuery|TMyQuery|TPgQuery|TOracleQuery|TMSQuery)$/i.test(name)) return { ...item, family: 'Acesso a dados', strategy: 'native-candidate', risk: 'high', nativeCandidates: ['TFDQuery'], rationale: 'A SQL pode ser preservada, porém macros, parâmetros, campos persistentes e eventos exigem validação.' }
  if (/^TcxButton/i.test(name)) return { ...item, family: 'DevExpress', strategy: 'native-candidate', risk: 'medium', nativeCandidates: ['TBitBtn', 'TButton'], rationale: 'A ação básica é compatível, mas estilos, imagens e propriedades DevExpress podem ser perdidos.' }
  if (/^Tcx(?:TextEdit|MaskEdit)/i.test(name)) return { ...item, family: 'DevExpress', strategy: 'native-candidate', risk: 'medium', nativeCandidates: ['TEdit', 'TMaskEdit'], rationale: 'Texto e máscara podem ser migrados; validações e propriedades avançadas precisam de revisão.' }
  if (/^TcxLabel/i.test(name)) return { ...item, family: 'DevExpress', strategy: 'native-candidate', risk: 'low', nativeCandidates: ['TLabel'], rationale: 'Caption, posição e fonte possuem equivalência direta; aparência avançada deve ser revisada.' }
  if (/^TcxGrid/i.test(name)) return { ...item, family: 'DevExpress', strategy: 'native-candidate', risk: 'high', nativeCandidates: ['TDBGrid'], rationale: 'O TDBGrid não cobre agrupamento, summaries, repositories e views do TcxGrid. Exige redesenho e teste funcional.' }
  if (/^TAdv(?:Edit|Memo)/i.test(name)) return { ...item, family: 'TMS VCL', strategy: 'native-candidate', risk: 'medium', nativeCandidates: [/Memo/i.test(name) ? 'TMemo' : 'TEdit'], rationale: 'O controle nativo cobre a edição básica, mas recursos TMS precisam ser inventariados.' }
  return { ...item, family: 'Terceiro não catalogado', strategy: 'manual-review', risk: 'high', nativeCandidates: [], rationale: 'Sem equivalência comprovada. A IDE não fará substituição por nome ou semântica aproximada.' }
}

function buildMigrationAssessment(
  source: DelphiVersionEvidence,
  components: Array<{ className: string; occurrences: number }>
): ProjectMigrationAssessment {
  const install = detectDefaultDelphiInstall()
  const targetLabel = install ? installedDelphiLabel(install.version) : 'Nenhuma instalação Delphi detectada'
  const targetRank = install && !install.isLegacy ? 4 : install && /2007/i.test(install.version) ? 1 : install ? 1 : 0
  const available = !!install && source.profile !== 'unknown' && profileRank(source.profile) < targetRank
  return {
    available,
    sourceLabel: source.label,
    targetLabel,
    targetStudioPath: install?.studioPath,
    targetCompilerVersion: install?.version,
    components: components.map(assessThirdPartyComponent),
    notes: [
      'Nenhuma substituição será executada sem seleção explícita e backup completo.',
      'DFM, eventos, propriedades e dependências serão avaliados antes de converter cada classe.',
      'ACBr será mantido e somente atualizado/validado contra a instalação de destino.',
      'Componentes sem equivalência comprovada permanecerão bloqueados para migração automática.'
    ]
  }
}

function buildSummary(value: ProjectAnalysis): string {
  const lines = ['# Diagnóstico do projeto ' + value.projectName, '', 'Gerado automaticamente pela KarnoX Builder em ' + value.analyzedAt + '.', '', '## Resumo', '',
    '- Versão do Delphi: ' + value.delphiVersion.label + (value.delphiVersion.sourceValue ? ' (' + value.delphiVersion.sourceValue + ')' : ''),
    '- Projetos: ' + value.counts.projects, '- Grupos: ' + value.counts.projectGroups, '- Packages: ' + value.counts.packages,
    '- Units: ' + value.counts.units, '- Formulários: ' + value.counts.forms, '- DataModules: ' + value.counts.dataModules,
    '- Frames: ' + value.counts.frames, '- Serviços: ' + value.counts.services,
    '- Tecnologias: ' + (value.technologies.map((item) => item.name).join(', ') || 'nenhuma identificada'),
    '- Situação do banco: ' + value.databaseStatus, '', '## Conexões de banco detectadas', '']
  if (!value.databaseConnections.length) lines.push('- Nenhuma conexão identificada.')
  for (const item of value.databaseConnections) {
    const details = [item.driver && 'driver: ' + item.driver, item.database && 'banco: ' + item.database, item.server && 'servidor: ' + item.server].filter(Boolean).join(' — ')
    lines.push('- **' + item.library + '**: ' + item.componentName + ' (' + item.componentClass + ') em ' + item.sourceFile + (details ? ' — ' + details : ''))
  }
  lines.push('', '> Senhas e credenciais nunca são gravadas. Havendo mais de uma conexão, a IDE exige uma escolha explícita antes do uso No-Code.', '', '## Componentes de terceiros', '')
  if (!value.thirdPartyComponents.length) lines.push('- Nenhum identificado automaticamente.')
  else value.thirdPartyComponents.forEach((item) => lines.push('- ' + item.className + ': ' + item.occurrences + ' ocorrência(s)'))
  lines.push('', '## Avisos', '')
  if (!value.warnings.length) lines.push('- Nenhum aviso.')
  else value.warnings.forEach((item) => lines.push('- ' + item))
  return lines.join('\n') + '\n'
}

export function analyzeDelphiProject(projectDir: string): ProjectAnalysis {
  if (!projectDir || !isAbsolute(projectDir) || !existsSync(projectDir)) throw new Error('Diretório do projeto inválido.')
  const root = resolve(projectDir)
  const files = collect(root)
  const inheritedKinds = new Map<string, DelphiFormKind>()
  for (const file of files.filter((item) => item.extension === '.pas')) {
    for (const match of file.content.matchAll(/\b(T\w+)\s*=\s*class\s*\(\s*T(Form|DataModule|Frame|Service)\b/gim)) {
      const base = match[2].toLowerCase()
      inheritedKinds.set(match[1].toLowerCase(), base === 'datamodule' ? 'data-module' : base as DelphiFormKind)
    }
  }
  const projects = files.filter((item) => ['.dpr', '.dproj', '.dpk'].includes(item.extension))
  const forms: ProjectAnalysis['forms'] = []
  const databaseConnections: ProjectDatabaseEvidence[] = []
  const technologies = new Map<string, { name: string; category: string; files: string[] }>()
  const thirdParty = new Map<string, { className: string; occurrences: number; files: Set<string> }>()
  for (const file of files) {
    if (['.dfm', '.fmx'].includes(file.extension)) {
      const rootObject = /^\s*(?:object|inherited)\s+(\w+)\s*:\s*([\w.]+)/im.exec(file.content)
      if (rootObject) forms.push({ name: rootObject[1], className: rootObject[2], file: file.relativePath, kind: inheritedKinds.get(rootObject[2].toLowerCase()) ?? formKind(rootObject[2]) })
      for (const component of blocks(file.content)) {
        const dbClass = DB_CLASSES.find(([pattern]) => pattern.test(component.className))
        if (dbClass) {
          const driver = prop(component.block, ['DriverName', 'DriverID', 'ProviderName', 'Protocol'])
          const database = prop(component.block, ['Database', 'DatabaseName', 'CatalogName'])
          const server = prop(component.block, ['Server', 'ServerName', 'HostName', 'Host'])
          const connectionName = prop(component.block, ['ConnectionDefName', 'ConnectionName'])
          databaseConnections.push({ library: dbClass[1], componentClass: component.className, componentName: component.name, sourceFile: file.relativePath, driver, database, server, connectionName, confidence: database || connectionName ? 'high' : driver || server ? 'medium' : 'low' })
        }
        if (/^(?:Tcx|Tdx|TAdv|Tfrx|Tpp|TZ|TUni|TMy|TPg|TOracle|TMS|TACBr|Tww|Tsc|TEl)/i.test(component.className)) {
          const row = thirdParty.get(component.className) ?? { className: component.className, occurrences: 0, files: new Set<string>() }
          row.occurrences += 1
          row.files.add(file.relativePath)
          thirdParty.set(component.className, row)
        }
      }
    }
    for (const [pattern, name, category] of TECH) {
      if (!pattern.test(file.content)) continue
      const row = technologies.get(name) ?? { name, category, files: [] }
      if (row.files.length < 12 && !row.files.includes(file.relativePath)) row.files.push(file.relativePath)
      technologies.set(name, row)
    }
  }
  const hasDatabaseIni = existsSync(join(root, 'database.ini'))
  const distinct = new Set(databaseConnections.map((item) => [item.library, item.database ?? '', item.server ?? '', item.connectionName ?? ''].join('|').toLowerCase()))
  const databaseStatus: ProjectAnalysis['databaseStatus'] = hasDatabaseIni ? 'configured' : !databaseConnections.length ? 'not-detected' : distinct.size === 1 ? 'detected' : 'ambiguous'
  const warnings: string[] = []
  if (!hasDatabaseIni && databaseConnections.length) warnings.push('warning:database-ini-missing')
  if (databaseStatus === 'ambiguous') warnings.push('warning:database-ambiguous')
  if (files.length >= MAX_FILES) warnings.push(`warning:scan-limit:${MAX_FILES}`)
  const outputDir = join(root, '.karnox')
  const manifestPath = join(outputDir, 'project-analysis.json')
  const summaryPath = join(outputDir, 'PROJECT_SUMMARY.md')
  const profilePath = join(outputDir, 'project-profile.json')
  const preferred = projects.find((item) => item.extension === '.dproj') ?? projects[0]
  const delphiVersion = detectDelphiVersion(files)
  const thirdPartyComponents = [...thirdParty.values()].map((item) => ({ ...item, files: [...item.files] }))
  const value: ProjectAnalysis = {
    version: 2, analyzedAt: new Date().toISOString(),
    projectName: preferred ? basename(preferred.relativePath).replace(/\.(?:dproj|dpr|dpk)$/i, '') : basename(root),
    projectDir: root, manifestPath, summaryPath, profilePath,
    counts: {
      files: files.length, projects: projects.filter((item) => ['.dpr', '.dproj'].includes(item.extension)).length,
      projectGroups: files.filter((item) => item.extension === '.groupproj').length, packages: files.filter((item) => item.extension === '.dpk').length,
      units: files.filter((item) => item.extension === '.pas').length, forms: forms.filter((item) => item.kind === 'form').length,
      dataModules: forms.filter((item) => item.kind === 'data-module').length, frames: forms.filter((item) => item.kind === 'frame').length,
      services: forms.filter((item) => item.kind === 'service').length, tests: files.filter((item) => /(?:test|teste|dunit|dunitx)/i.test(item.relativePath)).length
    },
    projects: projects.map((item) => item.relativePath), forms, technologies: [...technologies.values()],
    databaseConnections, thirdPartyComponents,
    databaseStatus, hasDatabaseIni, warnings, delphiVersion, migration: buildMigrationAssessment(delphiVersion, thirdPartyComponents)
  }
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(manifestPath, JSON.stringify(value, null, 2), 'utf8')
  writeFileSync(summaryPath, buildSummary(value), 'utf8')

  const connectionMap = new Map<string, ProjectDatabaseEvidence & { id: string }>()
  for (const connection of databaseConnections) {
    const signature = [connection.library, connection.driver ?? '', connection.database ?? '', connection.server ?? '', connection.connectionName ?? '']
      .join('|').toLowerCase()
    if (!connectionMap.has(signature)) connectionMap.set(signature, { ...connection, id: `connection-${connectionMap.size + 1}` })
  }
  const detectedConnections = [...connectionMap.values()]
  let previousActiveConnectionId: string | null = null
  if (existsSync(profilePath)) {
    try {
      const previous = JSON.parse(readFileSync(profilePath, 'utf8')) as { database?: { activeConnectionId?: string | null } }
      previousActiveConnectionId = previous.database?.activeConnectionId ?? null
    } catch { /* perfil anterior inválido será reconstruído pelo diagnóstico */ }
  }
  const activeConnectionId = previousActiveConnectionId && detectedConnections.some((item) => item.id === previousActiveConnectionId)
    ? previousActiveConnectionId
    : (!hasDatabaseIni && detectedConnections.length === 1 ? detectedConnections[0].id : null)
  const projectProfile = {
    schemaVersion: 1,
    generatedBy: 'KarnoX Builder',
    analyzedAt: value.analyzedAt,
    project: {
      name: value.projectName,
      root,
      files: value.projects,
      delphi: value.delphiVersion
    },
    inventory: {
      counts: value.counts,
      forms: value.forms,
      technologies: value.technologies,
      thirdPartyComponents: value.thirdPartyComponents
    },
    database: {
      source: hasDatabaseIni ? 'database.ini' : detectedConnections.length ? 'detected' : 'not-detected',
      activeConnectionId,
      connections: detectedConnections,
      credentialsStored: false
    }
  }
  writeFileSync(profilePath, JSON.stringify(projectProfile, null, 2), 'utf8')
  return value
}