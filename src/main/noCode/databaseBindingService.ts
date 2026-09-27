import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { loadDatabaseSchema } from '../db/databaseExplorerService'
import type { DatabaseKind } from '../db/repositories/databaseProfilesRepo'
import { resolveProjectDatabaseProfile } from '../db/projectDatabaseProfile'

export interface DatabaseFilterCondition {
  field: string
  operator: '=' | '<>' | '>' | '<' | '>=' | '<=' | 'contains' | 'startsWith' | 'isNull' | 'isNotNull'
  value: string
}
export interface DatabaseSortRule { field: string; direction: 'ASC' | 'DESC' }
export interface DatabaseBindingInput { projectDir: string; databaseKind: DatabaseKind; schema: string; table: string; fields: string[]; readOnly: boolean; allowEdit: boolean; allowInsert: boolean; allowDelete: boolean; filters?: DatabaseFilterCondition[]; sort?: DatabaseSortRule[] }
export interface DatabaseBindingResult { dataSource: string; queryName: string; dataSourceName: string; dataModuleUnit: string; fields: string[] }
interface DataModuleInfo { unitName: string; instanceName: string; connectionName: string; pasPath: string; dfmPath: string }
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function identifier(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^\d/, '_$&') || 'Dados'
}
function findDataModule(projectDir: string): DataModuleInfo {
  for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.pas')) continue
    const pasPath = join(projectDir, entry.name), dfmPath = pasPath.replace(/\.pas$/i, '.dfm')
    if (!existsSync(dfmPath)) continue
    const pas = readFileSync(pasPath, 'utf8'), dfm = readFileSync(dfmPath, 'utf8')
    if (!/class\s*\(\s*TDataModule\s*\)/i.test(pas)) continue
    const connectionName = dfm.match(/^\s*object\s+([A-Za-z_]\w*)\s*:\s*TFDConnection\b/im)?.[1]
    const instanceName = dfm.match(/^\s*(?:object|inherited)\s+([A-Za-z_]\w*)\s*:/im)?.[1]
    const unitName = pas.match(/^\s*unit\s+([A-Za-z_]\w*)\s*;/im)?.[1]
    if (connectionName && instanceName && unitName) return { unitName, instanceName, connectionName, pasPath, dfmPath }
  }
  throw new Error('Nenhum DataModule com TFDConnection foi encontrado. Crie o projeto com DataModule ou use o Wizard No-Code.')
}
function quote(kind: DatabaseKind, value: string): string {
  if (!IDENTIFIER.test(value)) throw new Error(`Identificador de banco inválido: ${value}`)
  if (kind === 'mysql') return `\`${value}\``
  if (kind === 'sqlserver') return `[${value}]`
  return `"${value}"`
}
function tableName(kind: DatabaseKind, schema: string, table: string): string {
  // Firebird não tem conceito real de schema; "PUBLIC" é só um agrupamento
  // artificial do explorador e nunca deve ser usado para qualificar SQL.
  return kind === 'sqlite' || kind === 'firebird' || !schema || schema.toLowerCase() === 'main' ? quote(kind, table) : `${quote(kind, schema)}.${quote(kind, table)}`
}
function sqlLiteral(value: string): string {
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return value
  return `'${value.replace(/'/g, "''")}'`
}
function buildWhereClause(kind: DatabaseKind, filters: DatabaseFilterCondition[] | undefined, availableFields: Set<string>): string {
  const parts = (filters ?? []).filter((item) => availableFields.has(item.field)).map((item) => {
    const field = quote(kind, item.field)
    if (item.operator === 'isNull') return `${field} IS NULL`
    if (item.operator === 'isNotNull') return `${field} IS NOT NULL`
    if (item.operator === 'contains') return `${field} LIKE ${sqlLiteral(`%${item.value}%`)}`
    if (item.operator === 'startsWith') return `${field} LIKE ${sqlLiteral(`${item.value}%`)}`
    return `${field} ${item.operator} ${sqlLiteral(item.value)}`
  })
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : ''
}
function buildOrderByClause(kind: DatabaseKind, sort: DatabaseSortRule[] | undefined, availableFields: Set<string>): string {
  const parts = (sort ?? []).filter((item) => availableFields.has(item.field)).map((item) => `${quote(kind, item.field)} ${item.direction}`)
  return parts.length ? ` ORDER BY ${parts.join(', ')}` : ''
}
function backup(projectDir: string, paths: string[]): void {
  const dir = join(projectDir, '.karnox', 'backups', `database-binding-${Date.now()}`); mkdirSync(dir, { recursive: true })
  paths.forEach((path) => writeFileSync(join(dir, basename(path)), readFileSync(path)))
}

function updateDataModule(info: DataModuleInfo, queryName: string, sourceName: string, sql: string, input: DatabaseBindingInput): void {
  let pas = readFileSync(info.pasPath, 'utf8'), dfm = readFileSync(info.dfmPath, 'utf8')
  const nl = dfm.includes('\r\n') ? '\r\n' : '\n'
  if (!/\bData\.DB\b/i.test(pas)) pas = pas.replace(/\buses\s*\r?\n/i, (value) => `${value}  Data.DB,${nl}`)
  if (!new RegExp(`\\b${queryName}\\s*:\\s*TFDQuery\\b`, 'i').test(pas)) pas = pas.replace(/(=\s*class\s*\(\s*TDataModule\s*\)\s*\r?\n)/i, `$1    ${queryName}: TFDQuery;${nl}    ${sourceName}: TDataSource;${nl}`)
  if (!new RegExp(`\\bobject\\s+${queryName}\\s*:\\s*TFDQuery\\b`, 'i').test(dfm)) {
    const block = [`  object ${queryName}: TFDQuery`, `    Connection = ${info.connectionName}`, `    UpdateOptions.ReadOnly = ${input.readOnly ? 'True' : 'False'}`, `    UpdateOptions.EnableUpdate = ${!input.readOnly && input.allowEdit ? 'True' : 'False'}`, `    UpdateOptions.EnableInsert = ${!input.readOnly && input.allowInsert ? 'True' : 'False'}`, `    UpdateOptions.EnableDelete = ${!input.readOnly && input.allowDelete ? 'True' : 'False'}`, `    SQL.Strings = (`, `      '${sql.replace(/'/g, "''")}')`, '    Left = 96', '    Top = 24', '  end', `  object ${sourceName}: TDataSource`, `    DataSet = ${queryName}`, '    Left = 160', '    Top = 24', '  end'].join(nl)
    const end = dfm.lastIndexOf(`${nl}end`); if (end < 0) throw new Error('DFM do DataModule inválido.')
    dfm = `${dfm.slice(0, end)}${nl}${block}${dfm.slice(end)}`
  } else {
    const queryBlock = new RegExp(`(object\\s+${queryName}\\s*:\\s*TFDQuery[\\s\\S]*?)(?=^\\s*(?:object|end)\\b)`, 'im')
    dfm = dfm.replace(queryBlock, (block) => {
      const setBoolean = (source: string, property: string, value: boolean): string => {
        const pattern = new RegExp(`(^\\s*${property.replace('.', '\\.')}\\s*=\\s*)(True|False)`, 'im')
        return pattern.test(source) ? source.replace(pattern, `$1${value ? 'True' : 'False'}`) : source.replace(/(object[^\r\n]*\r?\n)/, `$1    ${property} = ${value ? 'True' : 'False'}${nl}`)
      }
      let next = block.replace(/(SQL\.Strings\s*=\s*\(\s*\r?\n\s*')[^']*('\))/i, `$1${sql.replace(/'/g, "''")}$2`)
      next = setBoolean(next, 'UpdateOptions.ReadOnly', input.readOnly)
      next = setBoolean(next, 'UpdateOptions.EnableUpdate', !input.readOnly && input.allowEdit)
      next = setBoolean(next, 'UpdateOptions.EnableInsert', !input.readOnly && input.allowInsert)
      next = setBoolean(next, 'UpdateOptions.EnableDelete', !input.readOnly && input.allowDelete)
      return next
    })
  }
  const queries = [...dfm.matchAll(/^\s*object\s+([A-Za-z_]\w*)\s*:\s*TFDQuery\b/gim)].map((item) => item[1])
  const block = `${nl}  // <KarnoX:OpenQueries>${nl}${queries.map((name) => `  if not ${name}.Active then ${name}.Open;`).join(nl)}${nl}  // </KarnoX:OpenQueries>`
  if (/\s*\/\/ <KarnoX:OpenQueries>[\s\S]*?\/\/ <\/KarnoX:OpenQueries>/i.test(pas)) pas = pas.replace(/\s*\/\/ <KarnoX:OpenQueries>[\s\S]*?\/\/ <\/KarnoX:OpenQueries>/i, block)
  else {
    const connected = new RegExp(`(${info.connectionName}\\.Connected\\s*:=\\s*True\\s*;)`, 'i')
    if (!connected.test(pas)) throw new Error('Não foi possível localizar a abertura da conexão no DataModule.')
    pas = pas.replace(connected, `$1${block}`)
  }
  writeFileSync(info.pasPath, pas, 'utf8'); writeFileSync(info.dfmPath, dfm, 'utf8')
}
export async function bindDatabaseTable(input: DatabaseBindingInput): Promise<DatabaseBindingResult> {
  if (!input.projectDir || !existsSync(input.projectDir)) throw new Error('Projeto inválido ou não encontrado.')
  const { profile } = resolveProjectDatabaseProfile(input.projectDir)
  if (profile.kind !== input.databaseKind) throw new Error(`O projeto usa ${profile.kind} no database.ini, mas o vínculo solicitou ${input.databaseKind}. Atualize o banco do projeto e tente novamente.`)
  const schema = await loadDatabaseSchema(input.databaseKind, profile)
  const table = schema.objects.find((item) => item.type === 'table' && item.name.toLowerCase() === input.table.toLowerCase() && (!input.schema || item.schema.toLowerCase() === input.schema.toLowerCase()))
  if (!table) throw new Error(`A tabela ${input.table} não existe no banco configurado.`)
  const available = new Map(table.columns.map((column) => [column.name.toLowerCase(), column.name]))
  const fields = [...new Set(input.fields.map((field) => available.get(field.toLowerCase())).filter((field): field is string => Boolean(field)))]
  if (!fields.length) throw new Error('Selecione pelo menos um campo da tabela.')
  const info = findDataModule(input.projectDir), suffix = identifier(`${table.schema.toLowerCase() === 'main' ? '' : `${table.schema}_`}${table.name}`)
  const queryName = `qry${suffix}`, dataSourceName = `ds${suffix}`
  const availableFields = new Set(table.columns.map((column) => column.name))
  const sql = `SELECT ${fields.map((field) => quote(input.databaseKind, field)).join(', ')} FROM ${tableName(input.databaseKind, table.schema, table.name)}`
    + buildWhereClause(input.databaseKind, input.filters, availableFields)
    + buildOrderByClause(input.databaseKind, input.sort, availableFields)
  backup(input.projectDir, [info.pasPath, info.dfmPath]); updateDataModule(info, queryName, dataSourceName, sql, input)
  return { dataSource: `${info.instanceName}.${dataSourceName}`, queryName, dataSourceName, dataModuleUnit: info.unitName, fields }
}