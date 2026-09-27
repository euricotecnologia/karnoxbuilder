import type { DatabaseColumn, DatabaseKind, DatabaseObject } from './types'

export function quoteIdentifier(kind: DatabaseKind, name: string): string {
  if (kind === 'sqlserver') return `[${name.replace(/]/g, ']]')}]`
  if (kind === 'mysql') return `\`${name.replace(/`/g, '``')}\``
  return `"${name.replace(/"/g, '""')}"`
}

export function qualifiedName(kind: DatabaseKind, object: DatabaseObject): string {
  const table = quoteIdentifier(kind, object.name)
  // Firebird não tem conceito real de schema; "PUBLIC" é só um agrupamento
  // artificial do explorador e nunca deve ser usado para qualificar SQL.
  if (kind === 'sqlite' || kind === 'firebird' || !object.schema) return table
  return `${quoteIdentifier(kind, object.schema)}.${table}`
}

export function selectRowsSql(kind: DatabaseKind, object: DatabaseObject, limit = 200): string {
  const target = qualifiedName(kind, object)
  if (kind === 'sqlserver') return `SELECT TOP ${limit} * FROM ${target};`
  if (kind === 'oracle') return `SELECT * FROM ${target} FETCH FIRST ${limit} ROWS ONLY;`
  if (kind === 'firebird') return `SELECT FIRST ${limit} * FROM ${target};`
  return `SELECT * FROM ${target} LIMIT ${limit};`
}

export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replace(/'/g, "''")}'`
}

export function updateRowSql(kind: DatabaseKind, object: DatabaseObject, original: Record<string, unknown>, edited: Record<string, unknown>): string {
  const changed = object.columns.filter((column) => String(original[column.name] ?? '') !== String(edited[column.name] ?? ''))
  if (!changed.length) return ''
  const keys = object.columns.filter((column) => column.primaryKey)
  const whereColumns = keys.length ? keys : object.columns.slice(0, 1)
  const setClause = changed.map((column) => `${quoteIdentifier(kind, column.name)} = ${sqlLiteral(edited[column.name])}`).join(', ')
  const where = whereColumns.map((column) => `${quoteIdentifier(kind, column.name)} ${original[column.name] == null ? 'IS NULL' : `= ${sqlLiteral(original[column.name])}`}`).join(' AND ')
  return `UPDATE ${qualifiedName(kind, object)} SET ${setClause} WHERE ${where};`
}

export function deleteRowSql(kind: DatabaseKind, object: DatabaseObject, row: Record<string, unknown>): string {
  const keys = object.columns.filter((column) => column.primaryKey)
  const whereColumns = keys.length ? keys : object.columns.slice(0, 1)
  const where = whereColumns.map((column) => `${quoteIdentifier(kind, column.name)} ${row[column.name] == null ? 'IS NULL' : `= ${sqlLiteral(row[column.name])}`}`).join(' AND ')
  return `DELETE FROM ${qualifiedName(kind, object)} WHERE ${where};`
}

export function insertRowSql(kind: DatabaseKind, object: DatabaseObject, row: Record<string, unknown>): string {
  const columns = object.columns.filter((column) => row[column.name] !== undefined && row[column.name] !== '')
  return `INSERT INTO ${qualifiedName(kind, object)} (${columns.map((column) => quoteIdentifier(kind, column.name)).join(', ')}) VALUES (${columns.map((column) => sqlLiteral(row[column.name])).join(', ')});`
}

export function generateSqlScript(kind: DatabaseKind, object: DatabaseObject): string {
  if (object.definition) return `${object.definition.trim().replace(/;?$/, ';')}\n`
  if (object.type !== 'table') return `-- Definição de ${object.type}: ${object.schema}.${object.name}\n`
  const columns = object.columns.map((column) => {
    const nullable = column.nullable ? '' : ' NOT NULL'
    const defaultValue = column.defaultValue ? ` DEFAULT ${column.defaultValue}` : ''
    return `  ${quoteIdentifier(kind, column.name)} ${column.dataType}${nullable}${defaultValue}`
  })
  const primary = object.columns.filter((column) => column.primaryKey)
  if (primary.length) columns.push(`  PRIMARY KEY (${primary.map((column) => quoteIdentifier(kind, column.name)).join(', ')})`)
  for (const fk of object.foreignKeys) columns.push(`  CONSTRAINT ${quoteIdentifier(kind, fk.name)} FOREIGN KEY (${quoteIdentifier(kind, fk.column)}) REFERENCES ${quoteIdentifier(kind, fk.referencedTable)} (${quoteIdentifier(kind, fk.referencedColumn)})`)
  return `CREATE TABLE ${qualifiedName(kind, object)} (\n${columns.join(',\n')}\n);\n`
}

function pascalName(value: string): string {
  const result = value.split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase()).join('')
  return /^\d/.test(result) ? `N${result}` : result || 'Registro'
}

function pascalType(column: DatabaseColumn): string {
  const type = column.dataType.toLowerCase()
  if (/bigint|int64/.test(type)) return 'Int64'
  if (/smallint|integer|\bint\b|serial/.test(type)) return 'Integer'
  if (/decimal|numeric|money|currency/.test(type)) return 'Currency'
  if (/float|double|real/.test(type)) return 'Double'
  if (/bool/.test(type)) return 'Boolean'
  if (/date|time/.test(type)) return 'TDateTime'
  if (/blob|binary|bytea|raw/.test(type)) return 'TBytes'
  return 'string'
}

export function generateDelphiEntity(object: DatabaseObject): { name: string; content: string } {
  const entity = pascalName(object.name)
  const unitName = `Entity.${entity}`
  const fields = object.columns.map((column) => `    F${pascalName(column.name)}: ${pascalType(column)};`).join('\n')
  const properties = object.columns.map((column) => `    property ${pascalName(column.name)}: ${pascalType(column)} read F${pascalName(column.name)} write F${pascalName(column.name)};`).join('\n')
  return { name: `${unitName}.pas`, content: `unit ${unitName};\n\ninterface\n\nuses\n  System.SysUtils, System.Classes;\n\ntype\n  T${entity} = class\n  private\n${fields}\n  public\n${properties}\n  end;\n\nimplementation\n\nend.\n` }
}

export function generateDelphiDataModule(object: DatabaseObject): Array<{ name: string; content: string }> {
  const suffix = pascalName(object.name)
  const unitName = `DataModule.${suffix}`
  return [
    { name: `${unitName}.pas`, content: `unit ${unitName};\n\ninterface\n\nuses\n  System.SysUtils, System.Classes, FireDAC.Comp.Client, FireDAC.Stan.Param, Data.DB;\n\ntype\n  Tdm${suffix} = class(TDataModule)\n    Connection: TFDConnection;\n    Query: TFDQuery;\n  public\n    procedure Open;\n  end;\n\nimplementation\n\n{%CLASSGROUP 'Vcl.Controls.TControl'}\n{$R *.dfm}\n\nprocedure Tdm${suffix}.Open;\nbegin\n  Query.Close;\n  Query.SQL.Text := 'SELECT * FROM ${object.name}';\n  Query.Open;\nend;\n\nend.\n` },
    { name: `${unitName}.dfm`, content: `object dm${suffix}: Tdm${suffix}\n  Height = 240\n  Width = 320\n  object Connection: TFDConnection\n    LoginPrompt = False\n    Left = 64\n    Top = 48\n  end\n  object Query: TFDQuery\n    Connection = Connection\n    Left = 152\n    Top = 48\n  end\nend\n` }
  ]
}

export function generateDelphiCrud(object: DatabaseObject): Array<{ name: string; content: string }> {
  const suffix = pascalName(object.name)
  const unitName = `View.${suffix}Crud`
  return [
    { name: `${unitName}.pas`, content: `unit ${unitName};\n\ninterface\n\nuses\n  Winapi.Windows, System.SysUtils, System.Classes, Vcl.Forms, Vcl.Controls,\n  Vcl.StdCtrls, Vcl.Buttons, Vcl.ExtCtrls, Vcl.DBGrids, Data.DB;\n\ntype\n  Tfrm${suffix}Crud = class(TForm)\n    pnlActions: TPanel;\n    btnNew: TBitBtn;\n    btnEdit: TBitBtn;\n    btnSave: TBitBtn;\n    btnDelete: TBitBtn;\n    grdData: TDBGrid;\n  end;\n\nimplementation\n\n{$R *.dfm}\n\nend.\n` },
    { name: `${unitName}.dfm`, content: `object frm${suffix}Crud: Tfrm${suffix}Crud\n  Left = 0\n  Top = 0\n  Caption = 'Cadastro de ${object.name}'\n  ClientHeight = 520\n  ClientWidth = 820\n  Position = poScreenCenter\n  object pnlActions: TPanel\n    Align = alTop\n    Height = 48\n    object btnNew: TBitBtn\n      Left = 12\n      Top = 10\n      Width = 80\n      Height = 28\n      Caption = 'Novo'\n    end\n    object btnEdit: TBitBtn\n      Left = 100\n      Top = 10\n      Width = 80\n      Height = 28\n      Caption = 'Editar'\n    end\n    object btnSave: TBitBtn\n      Left = 188\n      Top = 10\n      Width = 80\n      Height = 28\n      Caption = 'Salvar'\n    end\n    object btnDelete: TBitBtn\n      Left = 276\n      Top = 10\n      Width = 80\n      Height = 28\n      Caption = 'Excluir'\n    end\n  end\n  object grdData: TDBGrid\n    Align = alClient\n    TabOrder = 1\n  end\nend\n` }
  ]
}
