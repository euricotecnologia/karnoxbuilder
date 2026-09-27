import { ipcMain } from 'electron'
import { listDatabaseProfiles, type DatabaseKind } from '../db/repositories/databaseProfilesRepo'
import {
  applyMigration,
  compareDatabaseSchemas,
  createFirebirdDatabase,
  executeDatabaseQuery,
  loadDatabaseSchema,
  testDatabaseConnection,
  type CreateFirebirdDatabaseInput
} from '../db/databaseExplorerService'
import {
  clearQueryHistory,
  listMigrations,
  listQueryHistory,
  saveMigration
} from '../db/databaseExplorerRepository'
import { resolveProjectDatabaseProfile } from '../db/projectDatabaseProfile'

const KINDS = new Set<DatabaseKind>(['firebird', 'sqlite', 'mysql', 'postgresql', 'sqlserver', 'oracle'])

function kind(value: unknown): DatabaseKind {
  if (!KINDS.has(value as DatabaseKind)) throw new Error('Provedor de banco inválido.')
  return value as DatabaseKind
}

export function registerDatabaseExplorerHandlers(): void {
  ipcMain.handle('databaseExplorer:profiles', () => listDatabaseProfiles())
  ipcMain.handle('databaseExplorer:projectInfo', (_event, projectDir: unknown) =>
    resolveProjectDatabaseProfile(String(projectDir ?? '')).info
  )
  ipcMain.handle('databaseExplorer:projectTest', (_event, projectDir: unknown) => {
    const { profile } = resolveProjectDatabaseProfile(String(projectDir ?? ''))
    return testDatabaseConnection(profile.kind, profile)
  })
  ipcMain.handle('databaseExplorer:projectSchema', (_event, projectDir: unknown) => {
    const { profile } = resolveProjectDatabaseProfile(String(projectDir ?? ''))
    return loadDatabaseSchema(profile.kind, profile)
  })
  ipcMain.handle('databaseExplorer:test', (_event, profileKind: unknown) => testDatabaseConnection(kind(profileKind)))
  ipcMain.handle('databaseExplorer:createFirebirdDatabase', (_event, input: CreateFirebirdDatabaseInput) => createFirebirdDatabase(input))
  ipcMain.handle('databaseExplorer:schema', (_event, profileKind: unknown) => loadDatabaseSchema(kind(profileKind)))
  ipcMain.handle('databaseExplorer:query', (_event, args: { kind: unknown; sql: string }) =>
    executeDatabaseQuery(kind(args.kind), String(args.sql ?? ''))
  )
  ipcMain.handle('databaseExplorer:projectQuery', (_event, args: { projectDir: unknown; sql: string }) => {
    const { profile } = resolveProjectDatabaseProfile(String(args.projectDir ?? ''))
    return executeDatabaseQuery(profile.kind, String(args.sql ?? ''), true, profile)
  })
  ipcMain.handle('databaseExplorer:history', (_event, profileKind?: unknown, limit?: number) =>
    listQueryHistory(profileKind ? kind(profileKind) : undefined, Math.min(1000, Math.max(1, Number(limit) || 200)))
  )
  ipcMain.handle('databaseExplorer:clearHistory', (_event, profileKind?: unknown) =>
    clearQueryHistory(profileKind ? kind(profileKind) : undefined)
  )
  ipcMain.handle('databaseExplorer:compare', (_event, args: { left: unknown; right: unknown }) =>
    compareDatabaseSchemas(kind(args.left), kind(args.right))
  )
  ipcMain.handle('databaseExplorer:migrations', (_event, profileKind: unknown) => listMigrations(kind(profileKind)))
  ipcMain.handle('databaseExplorer:saveMigration', (_event, input: {
    profileKind: unknown; version: string; name: string; upSql: string; downSql: string
  }) => saveMigration({
    profileKind: kind(input.profileKind), version: String(input.version ?? '').trim(),
    name: String(input.name ?? '').trim(), upSql: String(input.upSql ?? ''), downSql: String(input.downSql ?? '')
  }))
  ipcMain.handle('databaseExplorer:applyMigration', (_event, args: { id: string; direction: 'up' | 'down' }) => {
    if (args.direction !== 'up' && args.direction !== 'down') throw new Error('Direção de migração inválida.')
    return applyMigration(String(args.id), args.direction)
  })
}
