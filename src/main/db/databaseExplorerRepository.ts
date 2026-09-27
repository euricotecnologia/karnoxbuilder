import { randomUUID, createHash } from 'crypto'
import { getDatabase } from './database'

export interface QueryHistoryRow {
  id: string
  profileKind: string
  sql: string
  status: 'success' | 'error'
  durationMs: number
  error: string | null
  executedAt: string
}

export interface MigrationRow {
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

function ensureSchema(): void {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS database_query_history (
      id TEXT PRIMARY KEY,
      profile_kind TEXT NOT NULL,
      sql_text TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      error_text TEXT,
      executed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS database_migrations (
      id TEXT PRIMARY KEY,
      profile_kind TEXT NOT NULL,
      version TEXT NOT NULL,
      name TEXT NOT NULL,
      up_sql TEXT NOT NULL,
      down_sql TEXT NOT NULL,
      checksum TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      applied_at TEXT,
      UNIQUE(profile_kind, version)
    );
  `)
}

export function addQueryHistory(profileKind: string, sql: string, durationMs: number, error?: string): void {
  ensureSchema()
  getDatabase().prepare(`
    INSERT INTO database_query_history
      (id, profile_kind, sql_text, status, duration_ms, error_text, executed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), profileKind, sql, error ? 'error' : 'success', durationMs, error ?? null, new Date().toISOString())
}

export function listQueryHistory(profileKind?: string, limit = 200): QueryHistoryRow[] {
  ensureSchema()
  const rows = (profileKind
    ? getDatabase().prepare('SELECT * FROM database_query_history WHERE profile_kind=? ORDER BY executed_at DESC LIMIT ?').all(profileKind, limit)
    : getDatabase().prepare('SELECT * FROM database_query_history ORDER BY executed_at DESC LIMIT ?').all(limit)) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    id: String(row.id), profileKind: String(row.profile_kind), sql: String(row.sql_text),
    status: row.status as 'success' | 'error', durationMs: Number(row.duration_ms),
    error: row.error_text ? String(row.error_text) : null, executedAt: String(row.executed_at)
  }))
}

export function clearQueryHistory(profileKind?: string): void {
  ensureSchema()
  if (profileKind) getDatabase().prepare('DELETE FROM database_query_history WHERE profile_kind=?').run(profileKind)
  else getDatabase().prepare('DELETE FROM database_query_history').run()
}

export function saveMigration(input: Omit<MigrationRow, 'id' | 'checksum' | 'status' | 'appliedAt'>): MigrationRow {
  ensureSchema()
  const checksum = createHash('sha256').update(input.upSql).digest('hex')
  const existing = getDatabase().prepare('SELECT id, status, applied_at FROM database_migrations WHERE profile_kind=? AND version=?').get(input.profileKind, input.version) as Record<string, unknown> | undefined
  const id = existing ? String(existing.id) : randomUUID()
  getDatabase().prepare(`
    INSERT INTO database_migrations (id, profile_kind, version, name, up_sql, down_sql, checksum, status, applied_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_kind, version) DO UPDATE SET name=excluded.name, up_sql=excluded.up_sql,
      down_sql=excluded.down_sql, checksum=excluded.checksum
  `).run(id, input.profileKind, input.version, input.name, input.upSql, input.downSql, checksum,
    existing?.status ?? 'pending', existing?.applied_at ?? null)
  return getMigration(id)
}

function mapMigration(row: Record<string, unknown>): MigrationRow {
  return {
    id: String(row.id), profileKind: String(row.profile_kind), version: String(row.version),
    name: String(row.name), upSql: String(row.up_sql), downSql: String(row.down_sql),
    checksum: String(row.checksum), status: row.status as MigrationRow['status'],
    appliedAt: row.applied_at ? String(row.applied_at) : null
  }
}

export function getMigration(id: string): MigrationRow {
  ensureSchema()
  const row = getDatabase().prepare('SELECT * FROM database_migrations WHERE id=?').get(id) as Record<string, unknown> | undefined
  if (!row) throw new Error('Migração não encontrada.')
  return mapMigration(row)
}

export function listMigrations(profileKind: string): MigrationRow[] {
  ensureSchema()
  return (getDatabase().prepare('SELECT * FROM database_migrations WHERE profile_kind=? ORDER BY version').all(profileKind) as Array<Record<string, unknown>>).map(mapMigration)
}

export function setMigrationStatus(id: string, status: MigrationRow['status']): void {
  ensureSchema()
  getDatabase().prepare('UPDATE database_migrations SET status=?, applied_at=? WHERE id=?').run(
    status, status === 'applied' ? new Date().toISOString() : null, id
  )
}
