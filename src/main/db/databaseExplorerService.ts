import Database from 'better-sqlite3'
import { Client as PgClient } from 'pg'
import sqlServer from 'mssql'
import Firebird from 'node-firebird'
import oracledb from 'oracledb'
import mysql from 'mysql2/promise'
import { getDatabase } from './database'
import { decryptSecret } from '../security/secretStorage'
import { addQueryHistory, getMigration, setMigrationStatus } from './databaseExplorerRepository'

export type DatabaseKind = 'firebird' | 'sqlite' | 'mysql' | 'postgresql' | 'sqlserver' | 'oracle'
export type DatabaseObjectType = 'table' | 'view' | 'procedure' | 'trigger' | 'sequence'

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

export interface DatabaseConnectionProfile {
  kind: DatabaseKind
  databasePath: string
  host: string
  port: string
  databaseName: string
  username: string
  password: string
  options: Record<string, string | boolean>
}

function profileFor(kind: DatabaseKind, override?: DatabaseConnectionProfile): DatabaseConnectionProfile {
  if (override) {
    if (override.kind !== kind) throw new Error(`A conexão informada pertence a ${override.kind}, não a ${kind}.`)
    return override
  }
  const row = getDatabase().prepare('SELECT * FROM database_profiles WHERE kind=?').get(kind) as Record<string, unknown> | undefined
  if (!row) throw new Error(`Configure a conexão ${kind} em Configurações > Banco de dados.`)
  const encrypted = row.password_encrypted as Buffer | null
  let options: Record<string, string | boolean> = {}
  try { options = row.options_json ? JSON.parse(String(row.options_json)) : {} } catch { options = {} }
  return {
    kind,
    databasePath: String(row.database_path ?? ''), host: String(row.host ?? 'localhost'),
    port: String(row.port ?? ''), databaseName: String(row.database_name ?? ''),
    username: String(row.username ?? ''), password: encrypted ? (decryptSecret(encrypted) ?? '') : '', options
  }
}

function normalizeRows(rows: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return { value: row }
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      if (Buffer.isBuffer(value)) result[key] = value.toString('hex')
      else if (value instanceof Date) result[key] = value.toISOString()
      else result[key] = value
    }
    return result
  })
}

function statementType(sql: string): string {
  return sql.trim().split(/\s+/, 1)[0]?.toUpperCase() || 'SQL'
}

async function executeRaw(kind: DatabaseKind, sql: string, override?: DatabaseConnectionProfile): Promise<{ rows: Array<Record<string, unknown>>; affectedRows: number }> {
  const profile = profileFor(kind, override)
  if (kind === 'sqlite') {
    if (!profile.databasePath) throw new Error('Informe o arquivo SQLite nas configurações.')
    const db = new Database(profile.databasePath)
    try {
      const type = statementType(sql)
      if (['SELECT', 'PRAGMA', 'WITH', 'EXPLAIN'].includes(type)) {
        const rows = normalizeRows(db.prepare(sql).all())
        return { rows, affectedRows: rows.length }
      }
      const withoutFinalTerminator = sql.trim().replace(/;\s*$/u, '')
      if (withoutFinalTerminator.includes(';')) {
        db.exec(sql)
        return { rows: [], affectedRows: 0 }
      }
      const result = db.prepare(sql).run()
      return { rows: [], affectedRows: result.changes }
    } finally { db.close() }
  }

  if (kind === 'mysql') {
    const connection = await mysql.createConnection({
      host: profile.host,
      port: Number(profile.port || 3306),
      database: profile.databaseName,
      user: profile.username,
      password: profile.password,
      multipleStatements: true
    })
    try {
      const [result] = await connection.query(sql)
      if (Array.isArray(result)) {
        const rows = normalizeRows(result)
        return { rows, affectedRows: rows.length }
      }
      return { rows: [], affectedRows: Number((result as { affectedRows?: number }).affectedRows ?? 0) }
    } finally { await connection.end() }
  }

  if (kind === 'postgresql') {
    const client = new PgClient({ host: profile.host, port: Number(profile.port || 5432), database: profile.databaseName, user: profile.username, password: profile.password, ssl: profile.options.ssl ? { rejectUnauthorized: false } : undefined })
    await client.connect()
    try {
      const result = await client.query(sql)
      const last = Array.isArray(result) ? result[result.length - 1] : result
      return { rows: normalizeRows(last.rows), affectedRows: last.rowCount ?? 0 }
    } finally { await client.end() }
  }

  if (kind === 'sqlserver') {
    const pool = await sqlServer.connect({ server: profile.host, port: Number(profile.port || 1433), database: profile.databaseName, user: profile.username || undefined, password: profile.password || undefined, options: { encrypt: !!profile.options.encrypt, trustServerCertificate: profile.options.trustServerCertificate !== false }, pool: { max: 2, min: 0, idleTimeoutMillis: 10000 } })
    try {
      const result = await pool.request().query(sql)
      const rows = normalizeRows(result.recordset ?? [])
      return { rows, affectedRows: result.rowsAffected?.reduce((a, b) => a + b, 0) ?? rows.length }
    } finally { await pool.close() }
  }

  if (kind === 'oracle') {
    const connection = await oracledb.getConnection({ user: profile.username, password: profile.password, connectString: `${profile.host}:${profile.port || 1521}/${profile.databaseName}` })
    try {
      const result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: true })
      return { rows: normalizeRows(result.rows ?? []), affectedRows: result.rowsAffected ?? 0 }
    } finally { await connection.close() }
  }

  return await new Promise((resolve, reject) => {
    Firebird.attach({ host: profile.host, port: Number(profile.port || 3050), database: profile.databasePath || profile.databaseName, user: profile.username, password: profile.password, lowercase_keys: false, role: null, pageSize: 4096 }, (attachError, db) => {
      if (attachError) return reject(attachError)
      db.query(sql, (queryError, result) => {
        db.detach()
        if (queryError) reject(queryError)
        else {
          const rows = normalizeRows(result)
          resolve({ rows, affectedRows: rows.length })
        }
      })
    })
  })
}

export async function executeDatabaseQuery(kind: DatabaseKind, sql: string, recordHistory = true, override?: DatabaseConnectionProfile): Promise<QueryResult> {
  if (!sql.trim()) throw new Error('Informe um comando SQL.')
  const started = Date.now()
  try {
    const result = await executeRaw(kind, sql, override)
    const durationMs = Date.now() - started
    if (recordHistory) addQueryHistory(kind, sql, durationMs)
    const columns = result.rows.length ? Object.keys(result.rows[0]) : []
    return { columns, rows: result.rows, rowCount: result.rows.length, affectedRows: result.affectedRows, durationMs, statementType: statementType(sql) }
  } catch (error) {
    const message = (error as Error).message
    if (recordHistory) addQueryHistory(kind, sql, Date.now() - started, message)
    throw new Error(message)
  }
}

function value(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const key = Object.keys(row).find((item) => item.toLowerCase() === name.toLowerCase())
    if (key) return row[key]
  }
  return undefined
}

function text(row: Record<string, unknown>, ...names: string[]): string { return String(value(row, ...names) ?? '').trim() }
function bool(row: Record<string, unknown>, ...names: string[]): boolean {
  const raw = value(row, ...names)
  return raw === true || raw === 1 || String(raw).toUpperCase() === 'YES' || String(raw).toUpperCase() === 'Y'
}

async function metadataQuery(kind: DatabaseKind, sql: string, override?: DatabaseConnectionProfile): Promise<Array<Record<string, unknown>>> {
  return (await executeDatabaseQuery(kind, sql, false, override)).rows
}

async function sqliteSchema(override?: DatabaseConnectionProfile): Promise<DatabaseObject[]> {
  const master = await metadataQuery('sqlite', "SELECT name, type, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','view','trigger') ORDER BY type,name", override)
  const objects: DatabaseObject[] = []
  for (const item of master) {
    const type = text(item, 'type') as 'table' | 'view' | 'trigger'
    const name = text(item, 'name')
    const object: DatabaseObject = { name, schema: 'main', type, columns: [], foreignKeys: [], definition: text(item, 'sql') }
    if (type === 'table' || type === 'view') {
      const escaped = name.replace(/"/g, '""')
      object.columns = (await metadataQuery('sqlite', `PRAGMA table_info("${escaped}")`, override)).map((row) => ({
        name: text(row, 'name'), dataType: text(row, 'type') || 'TEXT', nullable: !bool(row, 'notnull'),
        defaultValue: value(row, 'dflt_value') == null ? null : text(row, 'dflt_value'), position: Number(value(row, 'cid') ?? 0), primaryKey: Number(value(row, 'pk') ?? 0) > 0
      }))
      object.foreignKeys = (await metadataQuery('sqlite', `PRAGMA foreign_key_list("${escaped}")`, override)).map((row) => ({
        name: `FK_${name}_${text(row, 'id')}`, column: text(row, 'from'), referencedTable: text(row, 'table'), referencedColumn: text(row, 'to')
      }))
    }
    objects.push(object)
  }
  return objects
}

function groupColumns(objects: DatabaseObject[], rows: Array<Record<string, unknown>>): void {
  for (const row of rows) {
    const table = text(row, 'table_name', 'relation_name')
    const schema = text(row, 'table_schema', 'owner') || 'public'
    const object = objects.find((item) => item.name === table && (item.schema.toLowerCase() === schema.toLowerCase() || !schema))
    if (!object) continue
    object.columns.push({
      name: text(row, 'column_name', 'field_name'), dataType: text(row, 'data_type', 'field_type'),
      nullable: text(row, 'is_nullable', 'null_flag').toUpperCase() !== 'NO',
      defaultValue: value(row, 'column_default', 'default_source') == null ? null : text(row, 'column_default', 'default_source'),
      position: Number(value(row, 'ordinal_position', 'field_position') ?? object.columns.length), primaryKey: bool(row, 'is_primary')
    })
  }
}

async function standardSchema(kind: Exclude<DatabaseKind, 'sqlite'>, override?: DatabaseConnectionProfile): Promise<DatabaseObject[]> {
  let objectSql = '', columnSql = '', extras: Array<{ type: DatabaseObjectType; sql: string }> = [], fkSql = '', pkSql = ''
  if (kind === 'mysql') {
    objectSql = "SELECT TABLE_SCHEMA table_schema,TABLE_NAME table_name,CASE WHEN TABLE_TYPE='VIEW' THEN 'view' ELSE 'table' END object_type FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()"
    columnSql = "SELECT TABLE_SCHEMA table_schema,TABLE_NAME table_name,COLUMN_NAME column_name,DATA_TYPE data_type,IS_NULLABLE is_nullable,COLUMN_DEFAULT column_default,ORDINAL_POSITION ordinal_position,CASE WHEN COLUMN_KEY='PRI' THEN 1 ELSE 0 END is_primary FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION"
    fkSql = "SELECT CONSTRAINT_NAME constraint_name,TABLE_SCHEMA table_schema,TABLE_NAME table_name,COLUMN_NAME column_name,REFERENCED_TABLE_NAME referenced_table,REFERENCED_COLUMN_NAME referenced_column FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL"
    extras = [
      { type: 'procedure', sql: "SELECT ROUTINE_SCHEMA table_schema,ROUTINE_NAME object_name FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()" },
      { type: 'trigger', sql: "SELECT TRIGGER_SCHEMA table_schema,TRIGGER_NAME object_name FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()" }
    ]
  } else if (kind === 'postgresql') {
    objectSql = "SELECT table_schema, table_name, CASE WHEN table_type='VIEW' THEN 'view' ELSE 'table' END object_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')"
    columnSql = "SELECT c.table_schema,c.table_name,c.column_name,c.data_type,c.is_nullable,c.column_default,c.ordinal_position,CASE WHEN tc.constraint_type='PRIMARY KEY' THEN 1 ELSE 0 END is_primary FROM information_schema.columns c LEFT JOIN information_schema.key_column_usage kcu ON kcu.table_schema=c.table_schema AND kcu.table_name=c.table_name AND kcu.column_name=c.column_name LEFT JOIN information_schema.table_constraints tc ON tc.constraint_name=kcu.constraint_name AND tc.constraint_type='PRIMARY KEY' WHERE c.table_schema NOT IN ('pg_catalog','information_schema') ORDER BY c.table_schema,c.table_name,c.ordinal_position"
    fkSql = "SELECT tc.constraint_name,kcu.table_schema,kcu.table_name,kcu.column_name,ccu.table_name referenced_table,ccu.column_name referenced_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name WHERE tc.constraint_type='FOREIGN KEY'"
    extras = [
      { type: 'procedure', sql: "SELECT routine_schema table_schema,routine_name object_name FROM information_schema.routines WHERE routine_schema NOT IN ('pg_catalog','information_schema')" },
      { type: 'trigger', sql: "SELECT trigger_schema table_schema,trigger_name object_name FROM information_schema.triggers" },
      { type: 'sequence', sql: "SELECT sequence_schema table_schema,sequence_name object_name FROM information_schema.sequences" }
    ]
  } else if (kind === 'sqlserver') {
    objectSql = "SELECT TABLE_SCHEMA table_schema,TABLE_NAME table_name,CASE WHEN TABLE_TYPE='VIEW' THEN 'view' ELSE 'table' END object_type FROM INFORMATION_SCHEMA.TABLES"
    columnSql = "SELECT c.TABLE_SCHEMA table_schema,c.TABLE_NAME table_name,c.COLUMN_NAME column_name,c.DATA_TYPE data_type,c.IS_NULLABLE is_nullable,c.COLUMN_DEFAULT column_default,c.ORDINAL_POSITION ordinal_position,CASE WHEN k.COLUMN_NAME IS NULL THEN 0 ELSE 1 END is_primary FROM INFORMATION_SCHEMA.COLUMNS c LEFT JOIN (SELECT ku.TABLE_SCHEMA,ku.TABLE_NAME,ku.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME=ku.CONSTRAINT_NAME WHERE tc.CONSTRAINT_TYPE='PRIMARY KEY') k ON k.TABLE_SCHEMA=c.TABLE_SCHEMA AND k.TABLE_NAME=c.TABLE_NAME AND k.COLUMN_NAME=c.COLUMN_NAME"
    fkSql = "SELECT fk.name constraint_name,SCHEMA_NAME(pt.schema_id) table_schema,pt.name table_name,pc.name column_name,rt.name referenced_table,rc.name referenced_column FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id=fkc.constraint_object_id JOIN sys.tables pt ON fkc.parent_object_id=pt.object_id JOIN sys.columns pc ON pc.object_id=pt.object_id AND pc.column_id=fkc.parent_column_id JOIN sys.tables rt ON fkc.referenced_object_id=rt.object_id JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fkc.referenced_column_id"
    extras = [
      { type: 'procedure', sql: "SELECT SCHEMA_NAME(schema_id) table_schema,name object_name FROM sys.procedures" },
      { type: 'trigger', sql: "SELECT SCHEMA_NAME(o.schema_id) table_schema,t.name object_name FROM sys.triggers t JOIN sys.objects o ON t.parent_id=o.object_id" },
      { type: 'sequence', sql: "SELECT SCHEMA_NAME(schema_id) table_schema,name object_name FROM sys.sequences" }
    ]
  } else if (kind === 'oracle') {
    objectSql = "SELECT USER table_schema,table_name,'table' object_type FROM user_tables UNION ALL SELECT USER,view_name,'view' FROM user_views"
    columnSql = "SELECT USER table_schema,c.table_name,c.column_name,c.data_type,c.nullable is_nullable,c.data_default column_default,c.column_id ordinal_position,CASE WHEN pk.column_name IS NULL THEN 0 ELSE 1 END is_primary FROM user_tab_columns c LEFT JOIN (SELECT cc.table_name,cc.column_name FROM user_constraints co JOIN user_cons_columns cc ON co.constraint_name=cc.constraint_name WHERE co.constraint_type='P') pk ON pk.table_name=c.table_name AND pk.column_name=c.column_name"
    fkSql = "SELECT c.constraint_name,USER table_schema,c.table_name,cc.column_name,r.table_name referenced_table,rcc.column_name referenced_column FROM user_constraints c JOIN user_cons_columns cc ON c.constraint_name=cc.constraint_name JOIN user_constraints r ON c.r_constraint_name=r.constraint_name JOIN user_cons_columns rcc ON r.constraint_name=rcc.constraint_name AND cc.position=rcc.position WHERE c.constraint_type='R'"
    extras = [
      { type: 'procedure', sql: "SELECT USER table_schema,object_name FROM user_procedures WHERE object_type IN ('PROCEDURE','FUNCTION','PACKAGE')" },
      { type: 'trigger', sql: "SELECT USER table_schema,trigger_name object_name FROM user_triggers" },
      { type: 'sequence', sql: "SELECT USER table_schema,sequence_name object_name FROM user_sequences" }
    ]
  } else {
    objectSql = "SELECT TRIM(rdb$relation_name) table_name,CASE WHEN rdb$view_blr IS NULL THEN 'table' ELSE 'view' END object_type FROM rdb$relations WHERE COALESCE(rdb$system_flag,0)=0"
    columnSql = "SELECT TRIM(rf.rdb$relation_name) table_name,TRIM(rf.rdb$field_name) column_name,CASE f.rdb$field_type WHEN 7 THEN 'SMALLINT' WHEN 8 THEN 'INTEGER' WHEN 10 THEN 'FLOAT' WHEN 12 THEN 'DATE' WHEN 13 THEN 'TIME' WHEN 14 THEN 'CHAR' WHEN 16 THEN 'BIGINT' WHEN 27 THEN 'DOUBLE' WHEN 35 THEN 'TIMESTAMP' WHEN 37 THEN 'VARCHAR' WHEN 261 THEN 'BLOB' ELSE 'UNKNOWN' END data_type,CASE WHEN rf.rdb$null_flag=1 THEN 'NO' ELSE 'YES' END is_nullable,rf.rdb$default_source column_default,rf.rdb$field_position ordinal_position FROM rdb$relation_fields rf JOIN rdb$fields f ON f.rdb$field_name=rf.rdb$field_source JOIN rdb$relations r ON r.rdb$relation_name=rf.rdb$relation_name WHERE COALESCE(r.rdb$system_flag,0)=0"
    pkSql = "SELECT TRIM(rc.rdb$relation_name) table_name,TRIM(seg.rdb$field_name) column_name FROM rdb$relation_constraints rc JOIN rdb$index_segments seg ON seg.rdb$index_name=rc.rdb$index_name WHERE rc.rdb$constraint_type='PRIMARY KEY'"
    fkSql = "SELECT TRIM(rc.rdb$constraint_name) constraint_name,'PUBLIC' table_schema,TRIM(rc.rdb$relation_name) table_name,TRIM(seg.rdb$field_name) column_name,TRIM(refc.rdb$relation_name) referenced_table,TRIM(refseg.rdb$field_name) referenced_column FROM rdb$relation_constraints rc JOIN rdb$ref_constraints ref ON ref.rdb$constraint_name=rc.rdb$constraint_name JOIN rdb$relation_constraints refc ON refc.rdb$constraint_name=ref.rdb$const_name_uq JOIN rdb$index_segments seg ON seg.rdb$index_name=rc.rdb$index_name JOIN rdb$index_segments refseg ON refseg.rdb$index_name=refc.rdb$index_name AND refseg.rdb$field_position=seg.rdb$field_position WHERE rc.rdb$constraint_type='FOREIGN KEY'"
    extras = [
      { type: 'procedure', sql: "SELECT 'PUBLIC' table_schema,TRIM(rdb$procedure_name) object_name FROM rdb$procedures WHERE COALESCE(rdb$system_flag,0)=0" },
      { type: 'trigger', sql: "SELECT 'PUBLIC' table_schema,TRIM(rdb$trigger_name) object_name FROM rdb$triggers WHERE COALESCE(rdb$system_flag,0)=0" },
      { type: 'sequence', sql: "SELECT 'PUBLIC' table_schema,TRIM(rdb$generator_name) object_name FROM rdb$generators WHERE COALESCE(rdb$system_flag,0)=0" }
    ]
  }

  const objectRows = await metadataQuery(kind, objectSql, override)
  const objects: DatabaseObject[] = objectRows.map((row) => ({
    name: text(row, 'table_name'), schema: text(row, 'table_schema') || (kind === 'firebird' ? 'PUBLIC' : 'public'),
    type: text(row, 'object_type').toLowerCase() as 'table' | 'view', columns: [], foreignKeys: []
  }))
  groupColumns(objects, await metadataQuery(kind, columnSql, override))
  if (pkSql) {
    for (const row of await metadataQuery(kind, pkSql, override)) {
      const object = objects.find((item) => item.name.toLowerCase() === text(row, 'table_name').toLowerCase())
      const column = object?.columns.find((item) => item.name.toLowerCase() === text(row, 'column_name').toLowerCase())
      if (column) column.primaryKey = true
    }
  }
  if (fkSql) {
    for (const row of await metadataQuery(kind, fkSql, override)) {
      const object = objects.find((item) => item.name.toLowerCase() === text(row, 'table_name').toLowerCase() && (!text(row, 'table_schema') || item.schema.toLowerCase() === text(row, 'table_schema').toLowerCase()))
      object?.foreignKeys.push({ name: text(row, 'constraint_name'), column: text(row, 'column_name'), referencedTable: text(row, 'referenced_table'), referencedColumn: text(row, 'referenced_column') })
    }
  }
  for (const extra of extras) {
    for (const row of await metadataQuery(kind, extra.sql, override)) objects.push({ name: text(row, 'object_name'), schema: text(row, 'table_schema') || 'PUBLIC', type: extra.type, columns: [], foreignKeys: [] })
  }
  return objects
}

export async function loadDatabaseSchema(kind: DatabaseKind, override?: DatabaseConnectionProfile): Promise<DatabaseSchema> {
  const profile = profileFor(kind, override)
  const objects = kind === 'sqlite' ? await sqliteSchema(override) : await standardSchema(kind, override)
  return { profileKind: kind, databaseName: profile.databaseName || profile.databasePath, objects, loadedAt: new Date().toISOString() }
}

export async function testDatabaseConnection(kind: DatabaseKind, override?: DatabaseConnectionProfile): Promise<{ ok: true; durationMs: number }> {
  const started = Date.now()
  const probe = kind === 'oracle' ? 'SELECT 1 AS OK FROM DUAL' : kind === 'firebird' ? 'SELECT 1 AS OK FROM RDB$DATABASE' : 'SELECT 1 AS ok'
  await executeDatabaseQuery(kind, probe, false, override)
  return { ok: true, durationMs: Date.now() - started }
}

export interface CreateFirebirdDatabaseInput {
  databasePath: string
  host?: string
  port?: string
  username?: string
  password?: string
}

export async function createFirebirdDatabase(input: CreateFirebirdDatabaseInput): Promise<void> {
  if (!input.databasePath.trim()) throw new Error('Informe o caminho do arquivo do banco Firebird.')
  await new Promise<void>((resolvePromise, reject) => {
    Firebird.create({
      host: input.host?.trim() || 'localhost',
      port: Number(input.port) || 3050,
      database: input.databasePath,
      user: input.username?.trim() || 'SYSDBA',
      password: input.password || 'masterkey',
      lowercase_keys: false,
      role: null,
      pageSize: 4096
    }, (error, db) => {
      if (error) { reject(error instanceof Error ? error : new Error(String(error))); return }
      db.detach()
      resolvePromise()
    })
  })
}

export async function compareDatabaseSchemas(leftKind: DatabaseKind, rightKind: DatabaseKind): Promise<{ left: DatabaseSchema; right: DatabaseSchema; onlyLeft: string[]; onlyRight: string[]; changed: Array<{ object: string; details: string[] }> }> {
  const [left, right] = await Promise.all([loadDatabaseSchema(leftKind), loadDatabaseSchema(rightKind)])
  const key = (item: DatabaseObject): string => `${item.type}:${item.schema}.${item.name}`.toLowerCase()
  const leftMap = new Map(left.objects.map((item) => [key(item), item]))
  const rightMap = new Map(right.objects.map((item) => [key(item), item]))
  const onlyLeft = [...leftMap.keys()].filter((item) => !rightMap.has(item))
  const onlyRight = [...rightMap.keys()].filter((item) => !leftMap.has(item))
  const changed: Array<{ object: string; details: string[] }> = []
  for (const [itemKey, leftObject] of leftMap) {
    const rightObject = rightMap.get(itemKey)
    if (!rightObject || !['table', 'view'].includes(leftObject.type)) continue
    const details: string[] = []
    const leftCols = new Map(leftObject.columns.map((column) => [column.name.toLowerCase(), column]))
    const rightCols = new Map(rightObject.columns.map((column) => [column.name.toLowerCase(), column]))
    for (const [name, column] of leftCols) {
      const other = rightCols.get(name)
      if (!other) details.push(`Coluna somente na origem: ${column.name}`)
      else if (column.dataType.toLowerCase() !== other.dataType.toLowerCase() || column.nullable !== other.nullable) details.push(`${column.name}: ${column.dataType}${column.nullable ? '' : ' NOT NULL'} → ${other.dataType}${other.nullable ? '' : ' NOT NULL'}`)
    }
    for (const [name, column] of rightCols) if (!leftCols.has(name)) details.push(`Coluna somente no destino: ${column.name}`)
    if (details.length) changed.push({ object: `${leftObject.schema}.${leftObject.name}`, details })
  }
  return { left, right, onlyLeft, onlyRight, changed }
}

export async function applyMigration(id: string, direction: 'up' | 'down'): Promise<void> {
  const migration = getMigration(id)
  try {
    await executeDatabaseQuery(migration.profileKind as DatabaseKind, direction === 'up' ? migration.upSql : migration.downSql)
    setMigrationStatus(id, direction === 'up' ? 'applied' : 'rolled_back')
  } catch (error) {
    setMigrationStatus(id, 'error')
    throw error
  }
}
