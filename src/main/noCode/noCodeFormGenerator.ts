import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { getDatabaseProfilePassword, listDatabaseProfiles, type DatabaseKind, type DatabaseProfileRow } from '../db/repositories/databaseProfilesRepo'
import { executeDatabaseQuery, loadDatabaseSchema } from '../db/databaseExplorerService'
import { buildCreateTableSql, buildDropTableSql, databaseDisplayName, quoteNoCodeIdentifier } from './noCodeSqlDialects'
import type { DelphiProfileId } from '../delphi/profiles'
import { resolveProjectDatabaseProfile } from '../db/projectDatabaseProfile'

export type NoCodeFieldType = 'text' | 'longText' | 'integer' | 'decimal' | 'date' | 'dateTime' | 'boolean' | 'email' | 'phone'

export interface NoCodeFormField {
  name: string
  label: string
  type: NoCodeFieldType
  required: boolean
  length?: number
}

export interface NoCodeDatabaseConnectionDraft {
  databasePath?: string
  installPath?: string
  host?: string
  port?: string
  databaseName?: string
  username?: string
  password?: string
}

export interface CreateNoCodeFormInput {
  projectDir: string
  dprojPath: string | null
  profile: DelphiProfileId
  caption: string
  tableName: string
  unitName: string
  formClass: string
  databaseKind: DatabaseKind
  fields: NoCodeFormField[]
  databaseConnection?: NoCodeDatabaseConnectionDraft
}

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/
const FIELD_TYPES = new Set<NoCodeFieldType>(['text', 'longText', 'integer', 'decimal', 'date', 'dateTime', 'boolean', 'email', 'phone'])

function pascalString(value: string): string { return value.replace(/'/g, "''") }
function sqlName(value: string): string { return `"${value.replace(/"/g, '""')}"` }

function validate(input: CreateNoCodeFormInput): void {
  if (!existsSync(resolve(input.projectDir))) throw new Error('A pasta do projeto não existe.')
  if (!input.caption.trim()) throw new Error('Informe o título do formulário.')
  for (const [label, value] of [['tabela', input.tableName], ['unit', input.unitName], ['classe', input.formClass]] as const) {
    if (!IDENTIFIER.test(value)) throw new Error(`O nome da ${label} deve começar com uma letra e conter somente letras, números e sublinhado.`)
  }
  if (!input.formClass.startsWith('T')) throw new Error('A classe do formulário deve começar com T.')
  if (!input.fields.length) throw new Error('Adicione pelo menos um campo ao formulário.')
  const names = new Set<string>()
  for (const field of input.fields) {
    if (!IDENTIFIER.test(field.name)) throw new Error(`Nome de campo inválido: ${field.name || '(vazio)'}.`)
    if (!field.label.trim()) throw new Error(`Informe o rótulo do campo ${field.name}.`)
    if (!FIELD_TYPES.has(field.type)) throw new Error(`Tipo inválido para ${field.label}.`)
    const normalized = field.name.toLowerCase()
    if (normalized === 'id') throw new Error('O campo ID já é criado automaticamente.')
    if (names.has(normalized)) throw new Error(`O campo ${field.name} está duplicado.`)
    names.add(normalized)
  }
  if (input.profile !== 'delphi10_13') {
    throw new Error('O gerador visual de banco usa FireDAC moderno e requer o perfil Delphi 10/13.')
  }
}

function sqliteType(field: NoCodeFormField): string {
  if (field.type === 'integer' || field.type === 'boolean') return 'INTEGER'
  if (field.type === 'decimal') return 'NUMERIC'
  return 'TEXT'
}

export function buildSqliteCreateTable(tableName: string, fields: NoCodeFormField[]): string {
  return buildCreateTableSql('sqlite', tableName, fields)
}

type PreparedField = NoCodeFormField & { component: string; labelComponent: string }

function prepareFields(fields: NoCodeFormField[]): PreparedField[] {
  return fields.map((field, index) => ({ ...field, component: `edt${index + 1}_${field.name}`, labelComponent: `lbl${index + 1}_${field.name}` }))
}

function fieldClass(type: NoCodeFieldType): string {
  if (type === 'longText') return 'TMemo'
  if (type === 'boolean') return 'TCheckBox'
  if (type === 'date') return 'TDateTimePicker'
  if (type === 'phone' || type === 'dateTime') return 'TMaskEdit'
  return 'TEdit'
}

function paramAssignment(field: PreparedField, databaseKind: DatabaseKind): string[] {
  const param = `qrySave.ParamByName('${pascalString(field.name)}')`
  if (field.type === 'phone') {
    if (!field.required) return [`  if KarnoXOnlyDigits(${field.component}.Text) = '' then`, `    ${param}.Clear`, '  else', `    ${param}.AsString := ${field.component}.Text;`]
    return [`  ${param}.AsString := ${field.component}.Text;`]
  }
  if (field.type === 'dateTime') {
    const assignment = databaseKind === 'sqlite'
      ? `${param}.AsString := FormatDateTime('yyyy-mm-dd hh:nn:ss', StrToDateTime(${field.component}.Text));`
      : `${param}.AsDateTime := StrToDateTime(${field.component}.Text);`
    if (!field.required) return [`  if KarnoXOnlyDigits(${field.component}.Text) = '' then`, `    ${param}.Clear`, '  else', `    ${assignment}`]
    return [`  ${assignment}`]
  }
  if (!field.required && !['boolean', 'date'].includes(field.type)) {
    const property = field.type === 'integer' ? 'AsInteger' : field.type === 'decimal' ? 'AsFloat' : 'AsString'
    const value = field.type === 'integer' ? `StrToInt(${field.component}.Text)` : field.type === 'decimal' ? `StrToFloat(${field.component}.Text)` : `${field.component}.Text`
    return [`  if Trim(${field.component}.Text) = '' then`, `    ${param}.Clear`, '  else', `    ${param}.${property} := ${value};`]
  }
  if (field.type === 'integer') return [`  ${param}.AsInteger := StrToInt(${field.component}.Text);`]
  if (field.type === 'decimal') return [`  ${param}.AsFloat := StrToFloat(${field.component}.Text);`]
  if (field.type === 'date') return databaseKind === 'sqlite'
    ? [`  ${param}.AsString := FormatDateTime('yyyy-mm-dd', ${field.component}.Date);`]
    : [`  ${param}.AsDateTime := ${field.component}.Date;`]
  if (field.type === 'boolean') return databaseKind === 'sqlite' || databaseKind === 'oracle'
    ? [`  ${param}.AsInteger := Ord(${field.component}.Checked);`]
    : [`  ${param}.AsBoolean := ${field.component}.Checked;`]
  return [`  ${param}.AsString := ${field.component}.Text;`]
}

function buildSemanticValidations(fields: PreparedField[]): string {
  return fields.flatMap((field) => {
    const label = pascalString(field.label)
    if (field.type === 'email') return [`  if (Trim(${field.component}.Text) <> '') and
     (not TRegEx.IsMatch(Trim(${field.component}.Text), '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')) then
  begin
    ShowMessage('O campo ${label} possui um e-mail inválido.');
    ${field.component}.SetFocus;
    Exit;
  end;`]
    if (field.type === 'phone') return [`  if KarnoXOnlyDigits(${field.component}.Text) = '' then
  begin
${field.required ? `    ShowMessage('Informe ${label}.');
    ${field.component}.SetFocus;
    Exit;` : '    // Campo opcional não preenchido.'}
  end
  else if (Length(KarnoXOnlyDigits(${field.component}.Text)) <> 10) and
          (Length(KarnoXOnlyDigits(${field.component}.Text)) <> 11) then
  begin
    ShowMessage('O campo ${label} deve conter DDD e um telefone válido.');
    ${field.component}.SetFocus;
    Exit;
  end;`]
    if (field.type === 'dateTime') return [`  if KarnoXOnlyDigits(${field.component}.Text) = '' then
  begin
${field.required ? `    ShowMessage('Informe ${label}.');
    ${field.component}.SetFocus;
    Exit;` : '    // Campo opcional não preenchido.'}
  end
  else if not TryStrToDateTime(${field.component}.Text, LDateTime) then
  begin
    ShowMessage('O campo ${label} deve estar no formato DD/MM/AAAA HH:MM.');
    ${field.component}.SetFocus;
    Exit;
  end;`]
    if (field.type === 'integer') return [`  if (Trim(${field.component}.Text) <> '') and (not TryStrToInt(Trim(${field.component}.Text), LInteger)) then
  begin
    ShowMessage('O campo ${label} deve conter um número inteiro válido.');
    ${field.component}.SetFocus;
    Exit;
  end;`]
    if (field.type === 'decimal') return [`  if (Trim(${field.component}.Text) <> '') and (not TryStrToFloat(Trim(${field.component}.Text), LFloat)) then
  begin
    ShowMessage('O campo ${label} deve conter um número decimal válido.');
    ${field.component}.SetFocus;
    Exit;
  end;`]
    return []
  }).join('\n')
}

function buildValidationVariables(fields: PreparedField[]): string {
  const variables: string[] = []
  if (fields.some((field) => field.type === 'integer')) variables.push('  LInteger: Integer;')
  if (fields.some((field) => field.type === 'decimal')) variables.push('  LFloat: Double;')
  if (fields.some((field) => field.type === 'dateTime')) variables.push('  LDateTime: TDateTime;')
  return variables.length > 0 ? `var\n${variables.join('\n')}\n` : ''
}

function buildPascalHelpers(fields: PreparedField[]): string {
  if (!fields.some((field) => field.type === 'phone' || field.type === 'dateTime')) return ''
  return `function KarnoXOnlyDigits(const AValue: string): string;
var
  I: Integer;
begin
  Result := '';
  for I := 1 to Length(AValue) do
    if CharInSet(AValue[I], ['0'..'9']) then
      Result := Result + AValue[I];
end;
`
}
interface DatabaseDataModuleInfo {
  unitName: string
  className: string
  instanceName: string
  connectionName: string
  pasPath: string
  dfmPath: string
}

const DEFAULT_DATABASE_MODULE = {
  unitName: 'UnitDatabase',
  className: 'TdmDatabase',
  instanceName: 'dmDatabase',
  connectionName: 'conDatabase'
}

function findDatabaseDataModule(projectDir: string): DatabaseDataModuleInfo | null {
  for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.pas')) continue
    const pasPath = join(projectDir, entry.name)
    const pas = readFileSync(pasPath, 'utf8')
    const unitName = pas.match(/^\s*unit\s+([A-Za-z][A-Za-z0-9_]*)\s*;/im)?.[1]
    const className = pas.match(/^\s*(T[A-Za-z][A-Za-z0-9_]*)\s*=\s*class\s*\(\s*TDataModule\s*\)/im)?.[1]
    if (!unitName || !className) continue
    const dfmPath = pasPath.replace(/\.pas$/i, '.dfm')
    if (!existsSync(dfmPath)) continue
    const dfm = readFileSync(dfmPath, 'utf8')
    const connectionName = dfm.match(/^\s*object\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*TFDConnection\b/im)?.[1]
    if (!connectionName) continue
    const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const instanceName = pas.match(new RegExp(`^\\s*([A-Za-z][A-Za-z0-9_]*)\\s*:\\s*${escapedClass}\\s*;`, 'im'))?.[1]
      ?? className.slice(1, 2).toLowerCase() + className.slice(2)
    return { unitName, className, instanceName, connectionName, pasPath, dfmPath }
  }
  return null
}

function defaultDatabaseDataModule(projectDir: string): DatabaseDataModuleInfo {
  return {
    ...DEFAULT_DATABASE_MODULE,
    pasPath: join(projectDir, `${DEFAULT_DATABASE_MODULE.unitName}.pas`),
    dfmPath: join(projectDir, `${DEFAULT_DATABASE_MODULE.unitName}.dfm`)
  }
}

export function buildDatabaseIni(projectDir: string, profile: DatabaseProfileRow, passwordOverride?: string): string {
  const password = passwordOverride !== undefined ? passwordOverride : getDatabaseProfilePassword(profile.kind)
  const driverId: Record<DatabaseKind, string> = {
    sqlite: 'SQLite', firebird: 'FB', mysql: 'MySQL', postgresql: 'PG', sqlserver: 'MSSQL', oracle: 'Ora'
  }
  let database = profile.databasePath || profile.databaseName
  if (profile.kind === 'sqlite') {
    const relativeDatabase = relative(projectDir, profile.databasePath)
    database = relativeDatabase && !relativeDatabase.startsWith('..') ? relativeDatabase : profile.databasePath
  } else if (profile.kind === 'oracle') {
    database = [profile.host && `${profile.host}:${profile.port || 1521}`, profile.databaseName].filter(Boolean).join('/')
  }
  const lines = [
    '; Configuração de banco de dados do KarnoX Builder',
    '; Arquivo externo ao código-fonte. Proteja-o nas permissões de implantação.',
    '[Database]',
    'Enabled=True',
    `DriverID=${driverId[profile.kind]}`,
    `Database=${database}`
  ]
  if (!['sqlite', 'oracle'].includes(profile.kind)) lines.push(`Server=${profile.host || 'localhost'}`)
  if (!['sqlite', 'oracle'].includes(profile.kind) && profile.port) lines.push(`Port=${profile.port}`)
  const windowsAuth = profile.kind === 'sqlserver' && profile.options.windowsAuth === true
  if (!windowsAuth && profile.username) lines.push(`User_Name=${profile.username}`)
  if (!windowsAuth && password) lines.push(`Password=${password}`)
  if (windowsAuth) lines.push('OSAuthent=Yes')
  if (profile.kind === 'firebird' && profile.installPath) {
    const vendorLib = /fbclient\.dll$/i.test(profile.installPath) ? profile.installPath : join(profile.installPath, 'fbclient.dll')
    lines.push(`VendorLib=${vendorLib}`)
  }
  if (profile.kind === 'mysql') lines.push('CharacterSet=utf8mb4')
  if (profile.kind === 'postgresql' || profile.kind === 'firebird') lines.push('CharacterSet=UTF8')
  lines.push('', '; O KarnoX Builder copia este arquivo para a pasta do executável durante a compilação.', '')
  return lines.join('\r\n')
}

export function buildDatabaseDataModulePas(): string {
  return `unit ${DEFAULT_DATABASE_MODULE.unitName};

interface

uses
  System.SysUtils, System.Classes, System.IniFiles, System.IOUtils,
  FireDAC.Comp.Client, FireDAC.Stan.Def, FireDAC.Stan.Async,
  FireDAC.Stan.Param, FireDAC.DApt, FireDAC.UI.Intf, FireDAC.VCLUI.Wait,
  FireDAC.Phys, FireDAC.Phys.SQLite, FireDAC.Phys.SQLiteDef,
  FireDAC.Phys.SQLiteWrapper.Stat, FireDAC.Phys.FB, FireDAC.Phys.FBDef,
  FireDAC.Phys.PG, FireDAC.Phys.PGDef, FireDAC.Phys.MSSQL,
  FireDAC.Phys.MSSQLDef, FireDAC.Phys.MySQL, FireDAC.Phys.MySQLDef,
  FireDAC.Phys.Oracle, FireDAC.Phys.OracleDef;

type
  ${DEFAULT_DATABASE_MODULE.className} = class(TDataModule)
    ${DEFAULT_DATABASE_MODULE.connectionName}: TFDConnection;
    procedure DataModuleCreate(Sender: TObject);
  private
    function FindDatabaseIni: string;
  end;

var
  ${DEFAULT_DATABASE_MODULE.instanceName}: ${DEFAULT_DATABASE_MODULE.className};

implementation

{%R *.dfm}

function ${DEFAULT_DATABASE_MODULE.className}.FindDatabaseIni: string;
var
  BaseDir: string;
  Candidate: string;
  ParentDir: string;
  I: Integer;
begin
  BaseDir := ExcludeTrailingPathDelimiter(ExtractFilePath(ParamStr(0)));
  for I := 0 to 5 do
  begin
    Candidate := TPath.Combine(BaseDir, 'database.ini');
    if TFile.Exists(Candidate) then
      Exit(Candidate);
    ParentDir := ExtractFileDir(BaseDir);
    if SameText(ParentDir, BaseDir) then
      Break;
    BaseDir := ParentDir;
  end;
  raise EFileNotFoundException.CreateFmt(
    'Arquivo database.ini não encontrado próximo ao executável %s.',
    [ParamStr(0)]);
end;

procedure ${DEFAULT_DATABASE_MODULE.className}.DataModuleCreate(Sender: TObject);
var
  Ini: TIniFile;
  IniPath: string;
  DriverID: string;
  DatabaseValue: string;

  procedure ApplyParam(const Key: string; const ParamName: string);
  var
    Value: string;
    TargetName: string;
  begin
    Value := Trim(Ini.ReadString('Database', Key, ''));
    if Value = '' then
      Exit;
    TargetName := ParamName;
    ${DEFAULT_DATABASE_MODULE.connectionName}.Params.Values[TargetName] := Value;
  end;

begin
  IniPath := FindDatabaseIni;
  Ini := TIniFile.Create(IniPath);
  try
    if not SameText(Trim(Ini.ReadString('Database', 'Enabled', 'False')), 'True') and
       (Trim(Ini.ReadString('Database', 'Enabled', 'False')) <> '1') then
      Exit;

    DriverID := Trim(Ini.ReadString('Database', 'DriverID', ''));
    if DriverID = '' then
      raise Exception.CreateFmt('DriverID não informado em %s.', [IniPath]);

    DatabaseValue := Trim(Ini.ReadString('Database', 'Database', ''));
    if DatabaseValue = '' then
      raise Exception.CreateFmt('Database não informado em %s.', [IniPath]);
    if SameText(DriverID, 'SQLite') and (not TPath.IsPathRooted(DatabaseValue)) then
      DatabaseValue := TPath.GetFullPath(TPath.Combine(ExtractFilePath(IniPath), DatabaseValue));

    ${DEFAULT_DATABASE_MODULE.connectionName}.Connected := False;
    ${DEFAULT_DATABASE_MODULE.connectionName}.Params.Clear;
    ${DEFAULT_DATABASE_MODULE.connectionName}.Params.Values['DriverID'] := DriverID;
    ${DEFAULT_DATABASE_MODULE.connectionName}.Params.Values['Database'] := DatabaseValue;
    ApplyParam('Server', 'Server');
    ApplyParam('Port', 'Port');
    ApplyParam('User_Name', 'User_Name');
    ApplyParam('Password', 'Password');
    ApplyParam('Protocol', 'Protocol');
    ApplyParam('CharacterSet', 'CharacterSet');
    ApplyParam('VendorLib', 'VendorLib');
    ApplyParam('OSAuthent', 'OSAuthent');
    ApplyParam('SSLMode', 'SSLMode');
    ApplyParam('UseSSL', 'UseSSL');
    ${DEFAULT_DATABASE_MODULE.connectionName}.LoginPrompt := False;
    ${DEFAULT_DATABASE_MODULE.connectionName}.Connected := True;
  finally
    Ini.Free;
  end;
end;

end.
`.replace('{%R', '{$R')
}

export function buildDatabaseDataModuleDfm(): string {
  return `object ${DEFAULT_DATABASE_MODULE.instanceName}: ${DEFAULT_DATABASE_MODULE.className}
  OnCreate = DataModuleCreate
  Height = 160
  Width = 240
  object ${DEFAULT_DATABASE_MODULE.connectionName}: TFDConnection
    LoginPrompt = False
    Left = 32
    Top = 24
  end
end
`
}

function ensureDatabaseDataModuleFiles(projectDir: string, profile: DatabaseProfileRow, preserveExistingIni = false, passwordOverride?: string): { info: DatabaseDataModuleInfo; created: boolean; iniPath: string; iniCreated: boolean } {
  const iniPath = join(projectDir, 'database.ini')
  const iniCreated = !existsSync(iniPath)
  const desiredIni = buildDatabaseIni(projectDir, profile, passwordOverride)
  if (iniCreated) writeFileSync(iniPath, desiredIni, 'utf8')
  else if (!preserveExistingIni) {
    const current = readFileSync(iniPath, 'utf8')
    const currentDriver = current.match(/^\s*DriverID\s*=\s*([^;\r\n]+)/im)?.[1].trim().toLowerCase()
    const desiredDriver = desiredIni.match(/^\s*DriverID\s*=\s*([^;\r\n]+)/im)?.[1].trim().toLowerCase()
    const generatedByKarnoX = /Configura[^\r\n]*KarnoX Builder/i.test(current)
    if (generatedByKarnoX && current !== desiredIni) {
      const backupDir = join(projectDir, '.karnox', 'backups')
      mkdirSync(backupDir, { recursive: true })
      writeFileSync(join(backupDir, `database.ini.${Date.now()}.bak`), current, 'utf8')
      writeFileSync(iniPath, desiredIni, 'utf8')
    } else if (!generatedByKarnoX && currentDriver && desiredDriver && currentDriver !== desiredDriver) {
      throw new Error(`O database.ini manual usa o driver ${currentDriver}, mas a tela foi configurada para ${desiredDriver}. Ajuste o arquivo manualmente para evitar trocar a conexão sem autorização.`)
    }
  }
  const existing = findDatabaseDataModule(projectDir)
  if (existing) return { info: existing, created: false, iniPath, iniCreated }
  const info = defaultDatabaseDataModule(projectDir)
  if (existsSync(info.pasPath) || existsSync(info.dfmPath)) throw new Error('UnitDatabase já existe, mas não contém um TDataModule com TFDConnection válido.')
  writeFileSync(info.pasPath, buildDatabaseDataModulePas(), 'utf8')
  writeFileSync(info.dfmPath, buildDatabaseDataModuleDfm(), 'utf8')
  return { info, created: true, iniPath, iniCreated }
}

export function buildNoCodePas(input: CreateNoCodeFormInput, _databasePath: string, dataModule: DatabaseDataModuleInfo = defaultDatabaseDataModule(input.projectDir)): string {
  const fields = prepareFields(input.fields)
  const declarations = fields.map((field) => `    ${field.labelComponent}: TLabel;\n    ${field.component}: ${fieldClass(field.type)};`).join('\n')
  const requiredChecks = fields
    .filter((field) => field.required && !['boolean', 'date', 'phone', 'dateTime'].includes(field.type))
    .map((field) => `  if Trim(${field.component}.Text) = '' then\n  begin\n    ShowMessage('Informe ${pascalString(field.label)}.');\n    ${field.component}.SetFocus;\n    Exit;\n  end;`)
    .join('\n')
  const semanticChecks = buildSemanticValidations(fields)
  const validationVariables = buildValidationVariables(fields)
  const pascalHelpers = buildPascalHelpers(fields)
  const columns = fields.map((field) => quoteNoCodeIdentifier(input.databaseKind, field.name)).join(', ')
  const params = fields.map((field) => `:${field.name}`).join(', ')
  const assignments = fields.flatMap((field) => paramAssignment(field, input.databaseKind)).join('\n')
  const quotedTable = quoteNoCodeIdentifier(input.databaseKind, input.tableName)
  const fieldMarker = fields.map((field) => field.name).join(',')
  return `unit ${input.unitName};

interface

uses
  System.SysUtils, System.Classes, System.RegularExpressions, Vcl.Controls, Vcl.Forms, Vcl.Dialogs,
  Vcl.StdCtrls, Vcl.Buttons, Vcl.ExtCtrls, Vcl.ComCtrls, Vcl.Mask, FireDAC.Comp.Client, FireDAC.Stan.Param;

type
  ${input.formClass} = class(TForm)
    lblTitle: TLabel;
    lblSubtitle: TLabel;
    shpTopLine: TShape;
    shpBottomLine: TShape;
${declarations}
    btnSave: TBitBtn;
    btnCancel: TBitBtn;
    qrySave: TFDQuery;
    procedure btnSaveClick(Sender: TObject);
    procedure btnCancelClick(Sender: TObject);
  private
    procedure ValidateAndSave;
  end;

implementation

{ KX-NOCODE-DATABASE: ${input.databaseKind} }
{ KX-NOCODE-TABLE: ${input.tableName} }
{ KX-NOCODE-FIELDS: ${fieldMarker} }

uses
  ${dataModule.unitName};

{$R *.dfm}

${pascalHelpers}
procedure ${input.formClass}.btnSaveClick(Sender: TObject);
begin
  ValidateAndSave;
end;

procedure ${input.formClass}.btnCancelClick(Sender: TObject);
begin
  Close;
end;

procedure ${input.formClass}.ValidateAndSave;
${validationVariables}begin
${requiredChecks}
${semanticChecks}
  qrySave.Close;
  qrySave.SQL.Text := 'INSERT INTO ${quotedTable} (${columns}) VALUES (${params})';
${assignments}
  qrySave.ExecSQL;
  ShowMessage('Registro salvo com sucesso.');
  ModalResult := mrOk;
end;

end.
`
}

export function buildNoCodeDfm(input: CreateNoCodeFormInput, dataModule: DatabaseDataModuleInfo = defaultDatabaseDataModule(input.projectDir)): string {
  const fields = prepareFields(input.fields)
  let rowTop = 112
  let column = 0
  let tabOrder = 0
  const controls: string[] = []
  for (const field of fields) {
    const fullWidth = field.type === 'longText'
    if (fullWidth && column === 1) { rowTop += 82; column = 0 }
    const left = fullWidth ? 32 : column === 0 ? 32 : 396
    const width = fullWidth ? 696 : 332
    const controlTop = rowTop + 23
    const height = fullWidth ? 82 : 31
    if (field.type !== 'boolean') {
      controls.push(`  object ${field.labelComponent}: TLabel
    Left = ${left}
    Top = ${rowTop}
    Width = ${width}
    Height = 17
    AutoSize = False
    Caption = '${pascalString(field.label)}${field.required ? ' *' : ''}'
    Font.Color = 5263440
    ParentFont = False
  end`)
    }
    const props: string[] = ['    Anchors = [akLeft, akTop, akRight]']
    if (field.type === 'longText') props.push('    ScrollBars = ssVertical')
    if (field.type === 'date') props.push('    Kind = dtkDate')
    if (field.type === 'dateTime') props.push("    EditMask = '!00/00/0000 00:00;1;_'")
    if (field.type === 'boolean') props.push(`    Caption = '${pascalString(field.label)}'`)
    if (field.type === 'phone') props.push("    EditMask = '!\\(00\\) 00000-0000;1;_'")
    if (field.type === 'email') props.push("    TextHint = 'nome@exemplo.com'")
    controls.push(`  object ${field.component}: ${fieldClass(field.type)}
    Left = ${left}
    Top = ${field.type === 'boolean' ? rowTop + 18 : controlTop}
    Width = ${width}
    Height = ${height}
    TabOrder = ${tabOrder++}
${props.join('\n')}
  end`)
    if (fullWidth) rowTop += 134
    else if (column === 0) column = 1
    else { column = 0; rowTop += 82 }
  }
  if (column === 1) rowTop += 82
  const separatorTop = rowTop + 4
  const buttonTop = separatorTop + 24
  const clientHeight = Math.max(390, buttonTop + 64)
  return `object ${input.formClass.slice(1)}: ${input.formClass}
  Left = 0
  Top = 0
  Caption = '${pascalString(input.caption)}'
  ClientHeight = ${clientHeight}
  ClientWidth = 760
  Color = clWhite
  Constraints.MinHeight = 390
  Constraints.MinWidth = 776
  Font.Charset = DEFAULT_CHARSET
  Font.Color = 3158064
  Font.Height = -12
  Font.Name = 'Segoe UI'
  Font.Style = []
  Position = poScreenCenter
  Scaled = True
  PixelsPerInch = 96
  object lblTitle: TLabel
    Left = 32
    Top = 22
    Width = 696
    Height = 29
    AutoSize = False
    Caption = '${pascalString(input.caption)}'
    Font.Color = 2105376
    Font.Height = -21
    Font.Name = 'Segoe UI'
    Font.Style = []
    ParentFont = False
  end
  object lblSubtitle: TLabel
    Left = 32
    Top = 55
    Width = 696
    Height = 17
    AutoSize = False
    Caption = 'Preencha os dados abaixo. Os campos com * são obrigatórios.'
    Font.Color = 7895160
    ParentFont = False
  end
  object shpTopLine: TShape
    Left = 32
    Top = 87
    Width = 696
    Height = 1
    Brush.Color = 15198183
    Pen.Color = 15198183
  end
${controls.join('\n')}
  object shpBottomLine: TShape
    Left = 32
    Top = ${separatorTop}
    Width = 696
    Height = 1
    Anchors = [akLeft, akRight, akBottom]
    Brush.Color = 15198183
    Pen.Color = 15198183
  end
  object btnSave: TBitBtn
    Left = 496
    Top = ${buttonTop}
    Width = 112
    Height = 36
    Anchors = [akRight, akBottom]
    Caption = 'Salvar'
    Default = True
    TabOrder = ${tabOrder++}
    OnClick = btnSaveClick
  end
  object btnCancel: TBitBtn
    Left = 616
    Top = ${buttonTop}
    Width = 112
    Height = 36
    Anchors = [akRight, akBottom]
    Cancel = True
    Caption = 'Cancelar'
    TabOrder = ${tabOrder}
    OnClick = btnCancelClick
  end
  object qrySave: TFDQuery
    Connection = ${dataModule.instanceName}.${dataModule.connectionName}
    Left = 72
    Top = ${buttonTop}
  end
end
`
}

function addUnitToDpr(content: string, unitName: string, formClass: string): string {
  if (new RegExp(`\\b${unitName}\\b`, 'i').test(content)) return content
  const uses = /(\buses\b)([\s\S]*?);/i
  if (!uses.test(content)) throw new Error('Não foi possível localizar a seção uses do arquivo DPR.')
  return content.replace(uses, (_all, keyword: string, body: string) => `${keyword}${body.trimEnd()},\n  ${unitName} in '${unitName}.pas' {${formClass}};`)
}

function addUnitToDproj(content: string, unitName: string, formClass: string, formName = formClass.slice(1)): string {
  if (new RegExp(`DCCReference\\s+Include=["']${unitName}\\.pas["']`, 'i').test(content)) return content
  const reference = `        <DCCReference Include="${unitName}.pas">\n            <Form>${formName}</Form>\n            <FormType>dfm</FormType>\n        </DCCReference>\n`
  const groups = [...content.matchAll(/<ItemGroup>[\s\S]*?<\/ItemGroup>/gi)]
  const target = groups.find((match) => /<DCCReference\b/i.test(match[0]))
  if (!target || target.index == null) return content.replace(/<\/Project>\s*$/i, `    <ItemGroup>\n${reference}    </ItemGroup>\n</Project>`)
  const updated = target[0].replace(/<\/ItemGroup>/i, `${reference}    </ItemGroup>`)
  return content.slice(0, target.index) + updated + content.slice(target.index + target[0].length)
}

function ensureDataModuleCreate(content: string, dataModule: DatabaseDataModuleInfo): string {
  const escapedClass = dataModule.className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedInstance = dataModule.instanceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const createPattern = new RegExp(`Application\\.CreateForm\\(\\s*${escapedClass}\\s*,\\s*${escapedInstance}\\s*\\)\\s*;`, 'gi')
  const matches = content.match(createPattern) ?? []
  if (matches.length > 0) {
    let seen = false
    return content.replace(createPattern, (statement) => {
      if (seen) return ''
      seen = true
      return statement
    })
  }
  const statement = `  Application.CreateForm(${dataModule.className}, ${dataModule.instanceName});`
  const firstForm = /^(\s*)Application\.CreateForm\([^;]+;/im
  if (firstForm.test(content)) return content.replace(firstForm, (match) => `${statement}\n${match}`)
  if (/^\s*Application\.Run\s*;/im.test(content)) return content.replace(/^\s*Application\.Run\s*;/im, (match) => `${statement}\n${match}`)
  throw new Error('Não foi possível registrar o DataModule no DPR.')
}


function projectDatabaseConnection(projectDir: string): ReturnType<typeof resolveProjectDatabaseProfile>['profile'] | null {
  try {
    const { profile } = resolveProjectDatabaseProfile(projectDir)
    return profile
  } catch {
    return null
  }
}

function ensureProjectSqliteConnection(projectDir: string): ReturnType<typeof resolveProjectDatabaseProfile>['profile'] {
  const databasePath = join(projectDir, 'database.sqlite')
  if (!existsSync(databasePath)) writeFileSync(databasePath, Buffer.alloc(0))
  return { kind: 'sqlite', databasePath, host: '', port: '', databaseName: '', username: '', password: '', options: {} }
}

function connectionFromDraft(kind: DatabaseKind, draft: NoCodeDatabaseConnectionDraft): ReturnType<typeof resolveProjectDatabaseProfile>['profile'] {
  return {
    kind,
    databasePath: draft.databasePath?.trim() || '',
    host: draft.host?.trim() || '',
    port: draft.port?.trim() || '',
    databaseName: draft.databaseName?.trim() || '',
    username: draft.username?.trim() || '',
    password: draft.password || '',
    options: {}
  }
}

function toDatabaseProfileRow(connection: ReturnType<typeof resolveProjectDatabaseProfile>['profile']): DatabaseProfileRow {
  return {
    kind: connection.kind,
    enabled: true,
    installPath: '',
    databasePath: connection.databasePath,
    host: connection.host,
    port: connection.port,
    databaseName: connection.databaseName,
    username: connection.username,
    hasPassword: Boolean(connection.password),
    options: connection.options
  }
}

const DATABASE_KIND_LABELS: Record<DatabaseKind, string> = { sqlite: 'SQLite', firebird: 'Firebird', mysql: 'MySQL', postgresql: 'PostgreSQL', sqlserver: 'SQL Server', oracle: 'Oracle' }

export function getNoCodeFormOptions(projectDir?: string): Array<{ kind: DatabaseKind; label: string; detail: string; enabled: boolean; needsConnection: boolean }> {
  const projectConnection = projectDir ? projectDatabaseConnection(projectDir) : null
  if (projectConnection) {
    return (Object.keys(DATABASE_KIND_LABELS) as DatabaseKind[]).map((kind) => kind === projectConnection.kind
      ? { kind, label: DATABASE_KIND_LABELS[kind], detail: projectConnection.databasePath || [projectConnection.host, projectConnection.databaseName].filter(Boolean).join(' / '), enabled: true, needsConnection: false }
      : { kind, label: DATABASE_KIND_LABELS[kind], detail: 'detail:linked-to-other-db', enabled: false, needsConnection: false })
  }
  const globalProfiles = listDatabaseProfiles()
  return globalProfiles.map((profile) => {
    if (profile.kind === 'sqlite' && projectDir) {
      // Sem database.ini ainda: SQLite não depende de servidor, então o projeto ganha um arquivo
      // próprio ao criar a primeira tela, em vez de depender da configuração global.
      return { kind: profile.kind, label: DATABASE_KIND_LABELS.sqlite, detail: 'detail:sqlite-own-file', enabled: true, needsConnection: false }
    }
    if (projectDir && profile.kind !== 'sqlite') {
      // Projeto ainda sem conexão fixa: qualquer banco pode ser escolhido e configurado
      // na própria tela de criação da tela, sem depender de Configurações > Banco de dados.
      const detail = profile.enabled
        ? profile.databasePath || [profile.host, profile.databaseName].filter(Boolean).join(' / ')
        : 'detail:provide-connection-on-create'
      return { kind: profile.kind, label: DATABASE_KIND_LABELS[profile.kind], detail, enabled: true, needsConnection: true }
    }
    return { kind: profile.kind, label: DATABASE_KIND_LABELS[profile.kind], detail: profile.databasePath || [profile.host, profile.databaseName].filter(Boolean).join(' / '), enabled: profile.enabled, needsConnection: false }
  })
}

async function ensureNoCodeTable(input: CreateNoCodeFormInput, connection?: ReturnType<typeof resolveProjectDatabaseProfile>['profile']): Promise<boolean> {
  const validateExisting = async (): Promise<boolean> => {
    const schema = await loadDatabaseSchema(input.databaseKind, connection)
    const sameName = schema.objects.find((item) => item.name.toLowerCase() === input.tableName.toLowerCase())
    if (!sameName) return false
    if (sameName.type !== 'table') {
      throw new Error(`Já existe um objeto "${input.tableName}" do tipo ${sameName.type}. Escolha outro nome para a tabela.`)
    }
    const existingColumns = new Set(sameName.columns.map((column) => column.name.toLowerCase()))
    const missing = input.fields.filter((field) => !existingColumns.has(field.name.toLowerCase())).map((field) => field.name)
    if (missing.length) {
      throw new Error(`A tabela "${input.tableName}" já existe, mas não possui o(s) campo(s): ${missing.join(', ')}. Ajuste os campos, escolha outra tabela ou altere a estrutura pelo Explorador de banco de dados.`)
    }
    return true
  }

  if (await validateExisting()) return false
  try {
    await executeDatabaseQuery(input.databaseKind, buildCreateTableSql(input.databaseKind, input.tableName, input.fields), true, connection)
    return true
  } catch (error) {
    // Protege também contra outra criação ocorrida entre a leitura da
    // estrutura e o CREATE TABLE. Só reutiliza após validar todos os campos.
    if (await validateExisting()) return false
    throw error
  }
}

export async function createNoCodeForm(input: CreateNoCodeFormInput): Promise<{ pasPath: string; dfmPath: string; tableName: string; databasePath: string }> {
  validate(input)
  const projectConnection = projectDatabaseConnection(input.projectDir)
  if (projectConnection && projectConnection.kind !== input.databaseKind) {
    throw new Error(`Este projeto já está vinculado a ${databaseDisplayName(projectConnection.kind)} (database.ini). Selecione ${databaseDisplayName(projectConnection.kind)} para continuar, ou ajuste o database.ini do projeto antes de trocar de banco.`)
  }
  // SQLite não depende de servidor: sem database.ini prévio, provisiona o arquivo dentro do próprio projeto
  // em vez de reaproveitar a configuração global de Configurações > Banco de dados (que é compartilhada entre projetos).
  // Para os demais bancos, uma conexão digitada na própria tela também é gravada direto no database.ini do projeto.
  const resolvedConnection = projectConnection
    ?? (input.databaseKind === 'sqlite' ? ensureProjectSqliteConnection(input.projectDir) : null)
    ?? (input.databaseConnection ? connectionFromDraft(input.databaseKind, input.databaseConnection) : null)
  const profile = resolvedConnection
    ? { ...toDatabaseProfileRow(resolvedConnection), installPath: input.databaseConnection?.installPath?.trim() || '' }
    : listDatabaseProfiles().find((item) => item.kind === input.databaseKind && item.enabled)
  if (!profile) throw new Error(`Informe os dados de conexão do ${databaseDisplayName(input.databaseKind)} ou ative-o em Configurações > Banco de dados.`)
  if ((input.databaseKind === 'sqlite' || input.databaseKind === 'firebird') && !profile.databasePath) {
    throw new Error(`Informe o arquivo do banco ${databaseDisplayName(input.databaseKind)}.`)
  }
  if (!['sqlite', 'firebird'].includes(input.databaseKind) && !profile.databaseName) {
    throw new Error(`Informe o nome do banco/serviço ${databaseDisplayName(input.databaseKind)}.`)
  }
  if (!['sqlite', 'firebird', 'oracle'].includes(input.databaseKind) && !profile.host) {
    throw new Error(`Informe o servidor do banco ${databaseDisplayName(input.databaseKind)}.`)
  }

  const pasPath = join(input.projectDir, `${input.unitName}.pas`)
  const dfmPath = join(input.projectDir, `${input.unitName}.dfm`)
  if (existsSync(pasPath) || existsSync(dfmPath)) throw new Error(`A unit ${input.unitName} já existe no projeto.`)
  const dprPath = input.dprojPath?.replace(/\.dproj$/i, '.dpr') ?? null
  if (!dprPath || !existsSync(dprPath)) throw new Error('Não foi possível localizar o arquivo DPR ativo.')

  const originalDpr = readFileSync(dprPath, 'utf8')
  const originalDproj = input.dprojPath && existsSync(input.dprojPath) ? readFileSync(input.dprojPath, 'utf8') : null
  let createdDataModule: DatabaseDataModuleInfo | null = null
  let createdIniPath: string | null = null
  let tableCreated = false
  try {
    tableCreated = await ensureNoCodeTable(input, resolvedConnection ?? undefined)
    const dataModuleResult = ensureDatabaseDataModuleFiles(input.projectDir, profile, false, resolvedConnection ? resolvedConnection.password : undefined)
    if (dataModuleResult.created) createdDataModule = dataModuleResult.info
    if (dataModuleResult.iniCreated) createdIniPath = dataModuleResult.iniPath
    writeFileSync(pasPath, buildNoCodePas(input, profile.databasePath || profile.databaseName, dataModuleResult.info), 'utf8')
    writeFileSync(dfmPath, buildNoCodeDfm(input, dataModuleResult.info), 'utf8')
    let nextDpr = addUnitToDpr(originalDpr, dataModuleResult.info.unitName, dataModuleResult.info.className)
    nextDpr = ensureDataModuleCreate(nextDpr, dataModuleResult.info)
    nextDpr = addUnitToDpr(nextDpr, input.unitName, input.formClass)
    writeFileSync(dprPath, nextDpr, 'utf8')
    if (input.dprojPath && originalDproj != null) {
      let nextDproj = addUnitToDproj(originalDproj, dataModuleResult.info.unitName, dataModuleResult.info.className, dataModuleResult.info.instanceName)
      nextDproj = addUnitToDproj(nextDproj, input.unitName, input.formClass)
      writeFileSync(input.dprojPath, nextDproj, 'utf8')
    }
    return { pasPath, dfmPath, tableName: input.tableName, databasePath: profile.databasePath || profile.databaseName }
  } catch (error) {
    if (tableCreated) try { await executeDatabaseQuery(input.databaseKind, buildDropTableSql(input.databaseKind, input.tableName), false, resolvedConnection ?? undefined) } catch { /* preserva erro original */ }
    try { writeFileSync(dprPath, originalDpr, 'utf8') } catch { /* preserva erro original */ }
    if (input.dprojPath && originalDproj != null) try { writeFileSync(input.dprojPath, originalDproj, 'utf8') } catch { /* preserva erro original */ }
    for (const file of [pasPath, dfmPath, createdDataModule?.pasPath, createdDataModule?.dfmPath, createdIniPath]) if (file && existsSync(file)) try { unlinkSync(file) } catch { /* preserva erro original */ }
    throw error
  }
}

export interface ManagedNoCodeField extends NoCodeFormField {
  originalName: string
}

export interface ManagedNoCodeForm {
  unitName: string
  formClass: string
  caption: string
  tableName: string
  pasPath: string
  dfmPath: string
  databasePath: string
  databaseKind: DatabaseKind
  fields: ManagedNoCodeField[]
}

export interface UpdateNoCodeFormInput {
  projectDir: string
  dprojPath: string | null
  profile: DelphiProfileId
  unitName: string
  fields: Array<NoCodeFormField & { originalName?: string }>
}

function detectFieldType(name: string, className: string, block: string): NoCodeFieldType {
  if (/TCheckBox/i.test(className)) return 'boolean'
  if (/TDateTimePicker/i.test(className)) return 'date'
  if (/TMaskEdit/i.test(className) && /00\/00\/0000\s+00:00/i.test(block)) return 'dateTime'
  if (/TMemo/i.test(className)) return 'longText'
  if (/email|e_mail/i.test(name) || /nome@exemplo/i.test(block)) return 'email'
  if (/telefone|celular|fone/i.test(name) || /00000-0000/i.test(block)) return 'phone'
  return 'text'
}

function detectManagedForm(pasPath: string): ManagedNoCodeForm | null {
  const pas = readFileSync(pasPath, 'utf8')
  const unitName = pas.match(/^\s*unit\s+([A-Za-z][A-Za-z0-9_]*)\s*;/im)?.[1]
  const formClass = pas.match(/^\s*(T[A-Za-z][A-Za-z0-9_]*)\s*=\s*class\s*\(TForm\)/im)?.[1]
  const databaseKind = (pas.match(/KX-NOCODE-DATABASE:\s*(firebird|sqlite|mysql|postgresql|sqlserver|oracle)/i)?.[1]?.toLowerCase() ?? 'sqlite') as DatabaseKind
  const tableMarker = pas.match(/KX-NOCODE-TABLE:\s*([A-Za-z][A-Za-z0-9_]*)/i)?.[1]
  const fieldsMarker = pas.match(/KX-NOCODE-FIELDS:\s*([^}\r\n]+)/i)?.[1]
  const insert = pas.match(/qrySave\.SQL\.Text\s*:=\s*'INSERT INTO\s+"([^"]+)"\s*\(([^)]*)\)/i)
  const tableName = tableMarker ?? insert?.[1]
  if (!unitName || !formClass || !tableName) return null
  const dfmPath = pasPath.replace(/\.pas$/i, '.dfm')
  if (!existsSync(dfmPath)) return null
  const dfm = readFileSync(dfmPath, 'utf8')
  const caption = dfm.match(/^\s*Caption\s*=\s*'([^']*)'/im)?.[1] ?? formClass.slice(1)
  let projectDatabase = ''
  try {
    const resolved = resolveProjectDatabaseProfile(dirname(pasPath)).profile
    if (resolved.kind === databaseKind) projectDatabase = resolved.databasePath || resolved.databaseName
  } catch { /* o formul?rio continua list?vel; a tela exibir? a aus?ncia do perfil */ }
  const databasePath = pas.match(/Params\.Values\['Database'\]\s*:=\s*'([^']*)'/i)?.[1] ?? projectDatabase
  const names = fieldsMarker ? fieldsMarker.split(',').map((name) => name.trim()).filter(Boolean) : [...(insert?.[2] ?? '').matchAll(/"([^"]+)"/g)].map((match) => match[1])
  const fields: ManagedNoCodeField[] = names.map((name) => {
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const component = new RegExp(`object\\s+(edt\\d+_${safe})\\s*:\\s*([A-Za-z][A-Za-z0-9_]*)[\\s\\S]*?\\n  end`, 'i').exec(dfm)
    const label = new RegExp(`object\\s+lbl\\d+_${safe}\\s*:\\s*TLabel[\\s\\S]*?Caption\\s*=\\s*'([^']*)'[\\s\\S]*?\\n  end`, 'i').exec(dfm)
    const rawLabel = label?.[1] ?? name.replace(/_/g, ' ')
    const className = component?.[2] ?? 'TEdit'
    const block = component?.[0] ?? ''
    const required = /\*\s*$/.test(rawLabel)
    let type = detectFieldType(name, className, block)
    const parameterName = name
    if (new RegExp(`ParamByName\\('${parameterName}'\\)\\.AsFloat`, 'i').test(pas)) type = 'decimal'
    else if (new RegExp(`ParamByName\\('${parameterName}'\\)\\.AsInteger`, 'i').test(pas) && type !== 'boolean') type = 'integer'
    else if (/AAAA-MM-DD HH:MM:SS/i.test(block)) type = 'dateTime'
    return {
      originalName: name,
      name,
      label: rawLabel.replace(/\s*\*\s*$/, ''),
      type,
      required,
      length: 120
    }
  })
  return { unitName, formClass, caption, tableName, pasPath, dfmPath, databasePath, databaseKind, fields }
}

export function listManagedNoCodeForms(projectDir: string): ManagedNoCodeForm[] {
  const result: ManagedNoCodeForm[] = []
  for (const name of readdirSync(projectDir)) {
    if (!/^UnitCadastro.*\.pas$/i.test(name)) continue
    try {
      const form = detectManagedForm(join(projectDir, name))
      if (form) result.push(form)
    } catch { /* arquivo manual ou inacessível */ }
  }
  return result.sort((a, b) => a.caption.localeCompare(b.caption))
}

function defaultSqlValue(field: NoCodeFormField): string {
  if (field.type === 'integer' || field.type === 'decimal' || field.type === 'boolean') return '0'
  if (field.type === 'date') return "date('now')"
  if (field.type === 'dateTime') return "datetime('now')"
  return "''"
}

function rebuildSqliteTable(db: Database.Database, form: ManagedNoCodeForm, fields: Array<NoCodeFormField & { originalName?: string }>): void {
  const temporary = `__kx_${form.tableName}_${Date.now()}`
  const schemaObjects = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL").all(form.tableName) as Array<{ sql: string }>
  db.exec(buildSqliteCreateTable(temporary, fields))
  const destinations = fields.map((field) => sqlName(field.name))
  const expressions = fields.map((field) => {
    if (!field.originalName) return defaultSqlValue(field)
    const source = sqlName(field.originalName)
    const cast = `CAST(${source} AS ${sqliteType(field)})`
    return field.required ? `COALESCE(${cast}, ${defaultSqlValue(field)})` : cast
  })
  db.exec(`INSERT INTO ${sqlName(temporary)} ("id"${destinations.length ? `, ${destinations.join(', ')}` : ''}) SELECT "id"${expressions.length ? `, ${expressions.join(', ')}` : ''} FROM ${sqlName(form.tableName)}`)
  db.exec(`DROP TABLE ${sqlName(form.tableName)}`)
  db.exec(`ALTER TABLE ${sqlName(temporary)} RENAME TO ${sqlName(form.tableName)}`)
  for (const item of schemaObjects) db.exec(item.sql)
}

export function updateManagedNoCodeForm(input: UpdateNoCodeFormInput): ManagedNoCodeForm {
  const form = listManagedNoCodeForms(input.projectDir).find((item) => item.unitName.toLowerCase() === input.unitName.toLowerCase())
  if (!form) throw new Error('A tela No-Code selecionada não foi encontrada ou não possui vínculo com tabela.')
  if (form.databaseKind !== 'sqlite') throw new Error(`A edição estrutural de tabelas ${databaseDisplayName(form.databaseKind)} exige uma migração versionada. Nesta versão, use o Editor SQL; a criação inicial já respeita integralmente o dialeto selecionado.`)
  const projectDatabase = resolveProjectDatabaseProfile(input.projectDir).profile
  if (projectDatabase.kind !== 'sqlite') throw new Error(`A tela usa SQLite, mas o perfil do projeto aponta para ${databaseDisplayName(projectDatabase.kind)}.`)
  if (!projectDatabase.databasePath) throw new Error('O perfil deste projeto n\u00e3o informa o arquivo SQLite.')
  const profile: DatabaseProfileRow = {
    kind: 'sqlite', enabled: true, installPath: '', databasePath: projectDatabase.databasePath,
    host: projectDatabase.host, port: projectDatabase.port, databaseName: projectDatabase.databaseName,
    username: projectDatabase.username, hasPassword: Boolean(projectDatabase.password), options: projectDatabase.options
  }
  const normalized = input.fields.map((field) => ({ ...field, originalName: field.originalName?.trim() || undefined }))
  validate({ projectDir: input.projectDir, dprojPath: input.dprojPath, profile: input.profile, caption: form.caption, tableName: form.tableName, unitName: form.unitName, formClass: form.formClass, databaseKind: 'sqlite', fields: normalized })

  const db = new Database(profile.databasePath, { fileMustExist: true })
  const tableExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND lower(name) = lower(?) LIMIT 1").get(form.tableName)
  if (!tableExists) {
    db.close()
    throw new Error(`A tabela \"${form.tableName}\" n\u00e3o existe no banco deste projeto: ${profile.databasePath}. Nenhum outro banco foi consultado ou alterado.`)
  }
  const originalPas = readFileSync(form.pasPath, 'utf8')
  const originalDfm = readFileSync(form.dfmPath, 'utf8')
  const dprPath = input.dprojPath?.replace(/\.dproj$/i, '.dpr') ?? null
  const originalDpr = dprPath && existsSync(dprPath) ? readFileSync(dprPath, 'utf8') : null
  const originalDproj = input.dprojPath && existsSync(input.dprojPath) ? readFileSync(input.dprojPath, 'utf8') : null
  let createdDataModule: DatabaseDataModuleInfo | null = null
  let createdIniPath: string | null = null
  const backupDir = join(input.projectDir, '.karnox', 'backups', `nocode-${Date.now()}`)
  mkdirSync(backupDir, { recursive: true })
  writeFileSync(join(backupDir, `${form.unitName}.pas`), originalPas, 'utf8')
  writeFileSync(join(backupDir, `${form.unitName}.dfm`), originalDfm, 'utf8')
  const generatedInput: CreateNoCodeFormInput = {
    projectDir: input.projectDir,
    dprojPath: input.dprojPath,
    profile: input.profile,
    caption: form.caption,
    tableName: form.tableName,
    unitName: form.unitName,
    formClass: form.formClass,
    databaseKind: form.databaseKind,
    fields: normalized
  }
  try {
    db.exec('BEGIN IMMEDIATE')
    rebuildSqliteTable(db, form, normalized)
    const dataModuleResult = ensureDatabaseDataModuleFiles(input.projectDir, profile, true)
    if (dataModuleResult.created) createdDataModule = dataModuleResult.info
    if (dataModuleResult.iniCreated) createdIniPath = dataModuleResult.iniPath
    writeFileSync(form.pasPath, buildNoCodePas(generatedInput, profile.databasePath, dataModuleResult.info), 'utf8')
    writeFileSync(form.dfmPath, buildNoCodeDfm(generatedInput, dataModuleResult.info), 'utf8')
    if (dprPath && originalDpr != null) {
      const nextDpr = ensureDataModuleCreate(addUnitToDpr(originalDpr, dataModuleResult.info.unitName, dataModuleResult.info.className), dataModuleResult.info)
      writeFileSync(dprPath, nextDpr, 'utf8')
    }
    if (input.dprojPath && originalDproj != null) {
      writeFileSync(input.dprojPath, addUnitToDproj(originalDproj, dataModuleResult.info.unitName, dataModuleResult.info.className, dataModuleResult.info.instanceName), 'utf8')
    }
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* transação já encerrada */ }
    writeFileSync(form.pasPath, originalPas, 'utf8')
    writeFileSync(form.dfmPath, originalDfm, 'utf8')
    if (dprPath && originalDpr != null) writeFileSync(dprPath, originalDpr, 'utf8')
    if (input.dprojPath && originalDproj != null) writeFileSync(input.dprojPath, originalDproj, 'utf8')
    for (const file of [createdDataModule?.pasPath, createdDataModule?.dfmPath, createdIniPath]) if (file && existsSync(file)) try { unlinkSync(file) } catch { /* preserva erro original */ }
    throw error
  } finally {
    db.close()
  }
  return detectManagedForm(form.pasPath) ?? form
}
