export type DatabaseKind = 'firebird' | 'sqlite' | 'mysql' | 'postgresql' | 'sqlserver' | 'oracle'
export type DatabaseObjectType = 'table' | 'view' | 'procedure' | 'trigger' | 'sequence'

export interface DatabaseProfile {
  kind: DatabaseKind
  enabled: boolean
  databasePath: string
  host: string
  port: string
  databaseName: string
  username: string
  hasPassword: boolean
}

export interface DatabaseColumn {
  name: string
  dataType: string
  nullable: boolean
  defaultValue: string | null
  position: number
  primaryKey: boolean
}

export interface DatabaseForeignKey {
  name: string
  column: string
  referencedTable: string
  referencedColumn: string
}

export interface DatabaseObject {
  name: string
  schema: string
  type: DatabaseObjectType
  columns: DatabaseColumn[]
  foreignKeys: DatabaseForeignKey[]
  definition?: string
}

export interface DatabaseSchema {
  profileKind: DatabaseKind
  databaseName: string
  objects: DatabaseObject[]
  loadedAt: string
}

export interface QueryResult {
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  affectedRows: number
  durationMs: number
  statementType: string
}

export interface QueryHistory {
  id: string
  profileKind: string
  sql: string
  status: 'success' | 'error'
  durationMs: number
  error: string | null
  executedAt: string
}

export interface Migration {
  id: string
  profileKind: string
  version: string
  name: string
  upSql: string
  downSql: string
  checksum: string
  status: 'pending' | 'applied' | 'rolled_back' | 'error'
  appliedAt: string | null
}

export const DATABASE_LABELS: Record<DatabaseKind, string> = {
  firebird: 'Firebird', sqlite: 'SQLite', mysql: 'MySQL', postgresql: 'PostgreSQL', sqlserver: 'SQL Server', oracle: 'Oracle'
}
