import { getDatabase } from '../database'
import { decryptSecret, encryptSecret } from '../../security/secretStorage'

export type DatabaseKind = 'firebird' | 'sqlite' | 'mysql' | 'postgresql' | 'sqlserver' | 'oracle'

export interface DatabaseProfileRow {
  kind: DatabaseKind
  enabled: boolean
  installPath: string
  databasePath: string
  host: string
  port: string
  databaseName: string
  username: string
  hasPassword: boolean
  options: Record<string, string | boolean>
}

interface RawRow {
  kind: DatabaseKind
  enabled: number
  install_path: string | null
  database_path: string | null
  host: string | null
  port: string | null
  database_name: string | null
  username: string | null
  password_encrypted: Buffer | null
  options_json: string | null
}

const KINDS: DatabaseKind[] = ['firebird', 'sqlite', 'mysql', 'postgresql', 'sqlserver', 'oracle']
const DEFAULT_PORTS: Partial<Record<DatabaseKind, string>> = {
  firebird: '3050',
  mysql: '3306',
  postgresql: '5432',
  sqlserver: '1433',
  oracle: '1521'
}

function parseOptions(value: string | null): Record<string, string | boolean> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function toProfile(raw: RawRow): DatabaseProfileRow {
  return {
    kind: raw.kind,
    enabled: raw.enabled === 1,
    installPath: raw.install_path ?? '',
    databasePath: raw.database_path ?? '',
    host: raw.host ?? '',
    port: raw.port ?? DEFAULT_PORTS[raw.kind] ?? '',
    databaseName: raw.database_name ?? '',
    username: raw.username ?? '',
    hasPassword: !!raw.password_encrypted?.length,
    options: parseOptions(raw.options_json)
  }
}

export function listDatabaseProfiles(): DatabaseProfileRow[] {
  const rows = getDatabase().prepare('SELECT * FROM database_profiles').all() as RawRow[]
  const byKind = new Map(rows.map((row) => [row.kind, toProfile(row)]))
  return KINDS.map(
    (kind) =>
      byKind.get(kind) ?? {
        kind,
        enabled: false,
        installPath: '',
        databasePath: '',
        host: kind === 'sqlite' ? '' : 'localhost',
        port: DEFAULT_PORTS[kind] ?? '',
        databaseName: '',
        username: '',
        hasPassword: false,
        options: {}
      }
  )
}

export function upsertDatabaseProfile(input: Omit<DatabaseProfileRow, 'hasPassword'> & { password?: string }): void {
  const db = getDatabase()
  let encryptedPassword: Buffer | null | undefined
  if (input.password !== undefined) {
    encryptedPassword = input.password ? encryptSecret(input.password) : null
  }

  const existing = db.prepare('SELECT kind FROM database_profiles WHERE kind = ?').get(input.kind)
  const values = [
    input.enabled ? 1 : 0,
    input.installPath || null,
    input.databasePath || null,
    input.host || null,
    input.port || null,
    input.databaseName || null,
    input.username || null,
    JSON.stringify(input.options ?? {})
  ]

  if (existing) {
    if (encryptedPassword !== undefined) {
      db.prepare(
        'UPDATE database_profiles SET enabled=?, install_path=?, database_path=?, host=?, port=?, database_name=?, username=?, options_json=?, password_encrypted=? WHERE kind=?'
      ).run(...values, encryptedPassword, input.kind)
    } else {
      db.prepare(
        'UPDATE database_profiles SET enabled=?, install_path=?, database_path=?, host=?, port=?, database_name=?, username=?, options_json=? WHERE kind=?'
      ).run(...values, input.kind)
    }
    return
  }

  db.prepare(
    'INSERT INTO database_profiles (enabled, install_path, database_path, host, port, database_name, username, options_json, password_encrypted, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(...values, encryptedPassword ?? null, input.kind)
}

export function buildDatabaseContextForAi(): string {
  const enabled = listDatabaseProfiles().filter((profile) => profile.enabled)
  if (enabled.length === 0) return ''

  const lines = enabled.map((profile) => {
    const parts = [`tipo=${profile.kind}`]
    if (profile.installPath) parts.push(`instalação=${profile.installPath}`)
    if (profile.databasePath) parts.push(`arquivo=${profile.databasePath}`)
    if (profile.host) parts.push(`host=${profile.host}`)
    if (profile.port) parts.push(`porta=${profile.port}`)
    if (profile.databaseName) parts.push(`banco/serviço=${profile.databaseName}`)
    if (profile.username) parts.push(`usuário=${profile.username}`)
    if (profile.hasPassword) parts.push('senha=CONFIGURADA (não incluir a senha no código-fonte)')
    for (const [key, value] of Object.entries(profile.options)) parts.push(`${key}=${value}`)
    return `- ${parts.join('; ')}`
  })

  return `\n\nContexto de bancos de dados configurado na IDE:\n${lines.join('\n')}\nUse estes dados quando forem relevantes ao pedido. Nunca grave senhas diretamente no código-fonte; use configuração externa ou placeholder seguro.`
}

export function getDatabaseProfilePassword(kind: DatabaseKind): string {
  const row = getDatabase().prepare('SELECT password_encrypted FROM database_profiles WHERE kind = ?').get(kind) as { password_encrypted: Buffer | null } | undefined
  return row?.password_encrypted ? (decryptSecret(row.password_encrypted) ?? '') : ''
}
