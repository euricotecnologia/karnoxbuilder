import { existsSync, readFileSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import type { DatabaseConnectionProfile, DatabaseKind } from './databaseExplorerService'

export interface ProjectDatabaseInfo {
  kind: DatabaseKind
  label: string
  database: string
  iniPath: string
  enabled: boolean
  source: 'project'
}

const DRIVER_KIND: Record<string, DatabaseKind> = {
  sqlite: 'sqlite',
  fb: 'firebird',
  firebird: 'firebird',
  mysql: 'mysql',
  pg: 'postgresql',
  postgresql: 'postgresql',
  mssql: 'sqlserver',
  sqlserver: 'sqlserver',
  ora: 'oracle',
  oracle: 'oracle'
}

const LABELS: Record<DatabaseKind, string> = {
  sqlite: 'SQLite', firebird: 'Firebird', mysql: 'MySQL', postgresql: 'PostgreSQL',
  sqlserver: 'SQL Server', oracle: 'Oracle'
}

function readDatabaseSection(content: string): Map<string, string> {
  const values = new Map<string, string>()
  let active = false
  for (const sourceLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    const section = line.match(/^\[([^\]]+)\]$/)
    if (section) {
      active = section[1].trim().toLowerCase() === 'database'
      continue
    }
    if (!active) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    values.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim())
  }
  return values
}

function enabled(value: string | undefined): boolean {
  return /^(?:true|yes|sim|1)$/i.test(value ?? '')
}

function projectPath(projectDir: string, value: string): string {
  if (!value || isAbsolute(value)) return value
  return resolve(projectDir, value)
}

interface StoredProjectConnection {
  id: string
  library: string
  componentClass: string
  componentName: string
  sourceFile: string
  driver?: string
  database?: string
  server?: string
  connectionName?: string
  confidence?: 'high' | 'medium' | 'low'
}

interface StoredProjectProfile {
  schemaVersion: number
  database?: {
    activeConnectionId?: string | null
    connections?: StoredProjectConnection[]
  }
}

function detectedKind(connection: StoredProjectConnection): DatabaseKind | null {
  const driver = (connection.driver ?? '').toLowerCase()
  const library = connection.library.toLowerCase()
  const database = (connection.database ?? '').toLowerCase()
  if (/sqlite/.test(driver) || /\.(?:sqlite|sqlite3|db)$/.test(database)) return 'sqlite'
  if (/^(?:fb|firebird|interbase|ib)$/i.test(driver) || /ibx|ibo|interbase/.test(library) || /\.(?:fdb|gdb|ib)$/.test(database)) return 'firebird'
  if (/mysql/.test(driver) || /mysql/.test(library)) return 'mysql'
  if (/postgres|pgsql|\bpg\b/.test(driver) || /postgres/.test(library)) return 'postgresql'
  if (/mssql|sqlserver|sql server/.test(driver) || /ado|dbgo/.test(library)) return 'sqlserver'
  if (/oracle|\bora\b/.test(driver) || /oracle/.test(library)) return 'oracle'
  return null
}

function resolveDetectedProjectProfile(projectDir: string, profilePath: string): { profile: DatabaseConnectionProfile; info: ProjectDatabaseInfo } {
  let stored: StoredProjectProfile
  try { stored = JSON.parse(readFileSync(profilePath, 'utf8')) as StoredProjectProfile }
  catch { throw new Error('O project-profile.json do projeto está inválido. Execute novamente o diagnóstico do projeto.') }
  const connections = stored.database?.connections ?? []
  const activeId = stored.database?.activeConnectionId ?? null
  const connection = activeId
    ? connections.find((item) => item.id === activeId)
    : connections.length === 1 ? connections[0] : null
  if (!connection) {
    if (connections.length > 1) throw new Error('O projeto possui várias conexões detectadas. Selecione a conexão ativa no perfil do projeto antes de usar recursos No-Code.')
    throw new Error('Nenhuma conexão de banco foi confirmada no perfil deste projeto.')
  }
  const kind = detectedKind(connection)
  if (!kind) throw new Error(`Não foi possível determinar com segurança o banco da conexão ${connection.componentName}. Confirme o driver no perfil do projeto.`)
  const rawDatabase = (connection.database ?? '').replace(/^:([A-Za-z]:[\\/])/, '$1').trim()
  if (!rawDatabase) throw new Error(`A conexão ${connection.componentName} foi detectada, mas o caminho ou nome do banco não está informado no projeto Delphi.`)
  const databasePath = kind === 'sqlite' || kind === 'firebird' ? projectPath(projectDir, rawDatabase) : ''
  const databaseName = kind === 'sqlite' || kind === 'firebird' ? '' : rawDatabase
  const defaultPorts: Partial<Record<DatabaseKind, string>> = { firebird: '3050', mysql: '3306', postgresql: '5432', sqlserver: '1433', oracle: '1521' }
  const profile: DatabaseConnectionProfile = {
    kind,
    databasePath,
    host: connection.server ?? 'localhost',
    port: defaultPorts[kind] ?? '',
    databaseName,
    username: '',
    password: '',
    options: { windowsAuth: false, ssl: false, encrypt: false, trustServerCertificate: true }
  }
  return {
    profile,
    info: {
      kind,
      label: LABELS[kind],
      database: databasePath || databaseName,
      iniPath: profilePath,
      enabled: true,
      source: 'project'
    }
  }
}
export function resolveProjectDatabaseProfile(projectDir: string): { profile: DatabaseConnectionProfile; info: ProjectDatabaseInfo } {
  if (!projectDir) throw new Error('Nenhum projeto est\u00e1 aberto.')
  const iniPath = join(projectDir, 'database.ini')
  if (!existsSync(iniPath)) {
    const profilePath = join(projectDir, '.karnox', 'project-profile.json')
    if (!existsSync(profilePath)) {
      throw new Error('O projeto aberto não possui database.ini nem project-profile.json. Execute o diagnóstico para identificar a conexão deste projeto.')
    }
    return resolveDetectedProjectProfile(projectDir, profilePath)
  }
  const values = readDatabaseSection(readFileSync(iniPath, 'utf8'))
  if (!enabled(values.get('enabled'))) {
    throw new Error('O database.ini do projeto est\u00e1 desativado. Altere Enabled=True depois de configurar a conex\u00e3o do projeto.')
  }
  const driver = (values.get('driverid') ?? '').toLowerCase()
  const kind = DRIVER_KIND[driver]
  if (!kind) throw new Error(`DriverID inv\u00e1lido no database.ini do projeto: ${values.get('driverid') || '(vazio)'}.`)

  const rawDatabase = values.get('database') ?? ''
  if (!rawDatabase) throw new Error('Informe Database na se\u00e7\u00e3o [Database] do database.ini do projeto.')
  const databasePath = kind === 'sqlite' || kind === 'firebird' ? projectPath(projectDir, rawDatabase) : ''
  let host = values.get('server') ?? 'localhost'
  let port = values.get('port') ?? ''
  let databaseName = kind === 'sqlite' || kind === 'firebird' ? '' : rawDatabase
  if (kind === 'oracle') {
    const match = rawDatabase.match(/^([^/:]+)(?::(\d+))?\/(.+)$/)
    if (match) {
      host = match[1]
      port = match[2] ?? '1521'
      databaseName = match[3]
    }
  }
  const profile: DatabaseConnectionProfile = {
    kind,
    databasePath,
    host,
    port,
    databaseName,
    username: values.get('user_name') ?? values.get('username') ?? '',
    password: values.get('password') ?? '',
    options: {
      windowsAuth: /^(?:yes|true|1)$/i.test(values.get('osauthent') ?? ''),
      ssl: /^(?:yes|true|1)$/i.test(values.get('ssl') ?? ''),
      encrypt: /^(?:yes|true|1)$/i.test(values.get('encrypt') ?? ''),
      trustServerCertificate: !/^(?:no|false|0)$/i.test(values.get('trustservercertificate') ?? '')
    }
  }
  return {
    profile,
    info: {
      kind,
      label: LABELS[kind],
      database: databasePath || databaseName,
      iniPath,
      enabled: true,
      source: 'project'
    }
  }
}