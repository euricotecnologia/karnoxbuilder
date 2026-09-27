import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'path'
import { buildDpr, buildDproj, type ProjectSpec, type UnitSpec } from './projectTemplate'
import { buildDatabaseDataModuleDfm, buildDatabaseDataModulePas } from '../noCode/noCodeFormGenerator'
import { DELPHI_PROFILES, normalizeDelphiProfile, type DelphiProfileId } from './profiles'

export interface ScaffoldProjectInput {
  projectDir: string
  profile?: DelphiProfileId
  projectName?: string
  includeDataModule?: boolean
  allowedExistingFiles?: string[]
}

export interface ScaffoldProjectResult {
  projectDir: string
  projectName: string
  dprPath: string
  dprojPath: string | null
  profile: DelphiProfileId
}

function projectIdentifier(value: string): string {
  const raw = value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const clean = raw.replace(/[^A-Za-z0-9_]+/g, '')
  if (!clean || !/^[A-Za-z]/.test(clean)) {
    throw new Error('A pasta do projeto deve ter um nome iniciado por letra e conter apenas letras, números ou "_".')
  }
  return clean
}

function mainPas(profile: DelphiProfileId): string {
  const units = DELPHI_PROFILES[profile].namespacedUnits
    ? 'System.Classes, Vcl.Controls, Vcl.Forms, Vcl.Dialogs'
    : 'Classes, Controls, Forms, Dialogs'
  return `unit UnitMain;

interface

uses
  ${units};

type
  TFormMain = class(TForm)
  end;

var
  FormMain: TFormMain;

implementation

{$R *.dfm}

end.
`
}

function legacyDatabaseDataModulePas(profile: DelphiProfileId): string {
  const units = DELPHI_PROFILES[profile].namespacedUnits ? 'System.Classes' : 'Classes'
  return `unit UnitDatabase;

interface

uses
  ${units};

type
  TdmDatabase = class(TDataModule)
  end;

var
  dmDatabase: TdmDatabase;

implementation

{$R *.dfm}

end.
`
}

function legacyDatabaseDataModuleDfm(): string {
  return `object dmDatabase: TdmDatabase
  Height = 150
  Width = 215
end
`
}

function mainDfm(projectName: string): string {
  return `object FormMain: TFormMain
  Left = 0
  Top = 0
  Caption = '${projectName}'
  ClientHeight = 520
  ClientWidth = 860
  Color = clBtnFace
  Font.Charset = DEFAULT_CHARSET
  Font.Color = clWindowText
  Font.Height = -12
  Font.Name = 'Segoe UI'
  Font.Style = []
  Position = poScreenCenter
  TextHeight = 15
end
`
}

function existingLeafEntries(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = join(directory, entry.name)
    if (!entry.isDirectory()) return [resolve(fullPath)]
    const children = existingLeafEntries(fullPath)
    return children.length ? children : [resolve(fullPath)]
  })
}

function allowedExistingDatabaseFiles(projectDir: string, paths: string[] | undefined): Set<string> {
  const root = resolve(projectDir)
  const extensions = new Set(['.sqlite', '.sqlite3', '.db', '.fdb', '.gdb'])
  return new Set((paths ?? []).map((file) => resolve(file)).filter((file) => {
    const child = relative(root, file)
    return child !== '' && !child.startsWith('..') && !isAbsolute(child) && extensions.has(extname(file).toLowerCase())
  }).map((file) => file.toLowerCase()))
}

export function scaffoldDelphiProject(input: ScaffoldProjectInput): ScaffoldProjectResult {
  const projectDir = input.projectDir.trim()
  const profile = normalizeDelphiProfile(input.profile)
  if (!projectDir) throw new Error('Selecione a pasta do novo projeto.')
  if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true })
  const existing = existingLeafEntries(projectDir)
  const allowed = allowedExistingDatabaseFiles(projectDir, input.allowedExistingFiles)
  const unexpected = existing.filter((file) => !allowed.has(file.toLowerCase()))
  if (unexpected.length > 0) {
    const sample = unexpected.slice(0, 3).map((file) => relative(resolve(projectDir), file)).join(', ')
    throw new Error(`A pasta escolhida precisa estar vazia para evitar mistura ou sobrescrita de arquivos. Item(ns) encontrado(s): ${sample}.`)
  }

  const projectName = projectIdentifier(input.projectName || basename(projectDir))
  const units: UnitSpec[] = [{
    unitName: 'UnitMain',
    pasContent: mainPas(profile),
    dfmContent: mainDfm(projectName),
    isMainForm: true,
    formClassName: 'TFormMain'
  }]
  const includeDataModule = input.includeDataModule !== false
  const fireDacDataModule = includeDataModule && profile === 'delphi10_13'
  if (includeDataModule) units.push({
    unitName: 'UnitDatabase',
    pasContent: fireDacDataModule ? buildDatabaseDataModulePas() : legacyDatabaseDataModulePas(profile),
    dfmContent: fireDacDataModule ? buildDatabaseDataModuleDfm() : legacyDatabaseDataModuleDfm(),
    isMainForm: false,
    formClassName: 'TdmDatabase'
  })
  const spec: ProjectSpec = { projectName, units }
  const dprPath = join(projectDir, `${projectName}.dpr`)
  const dprojPath = DELPHI_PROFILES[profile].buildSystem === 'msbuild'
    ? join(projectDir, `${projectName}.dproj`)
    : null

  for (const unit of units) {
    writeFileSync(join(projectDir, `${unit.unitName}.pas`), unit.pasContent, profile === 'delphi7_2007' ? 'latin1' : 'utf8')
    if (unit.dfmContent != null) writeFileSync(join(projectDir, `${unit.unitName}.dfm`), unit.dfmContent, profile === 'delphi7_2007' ? 'latin1' : 'utf8')
  }
  if (includeDataModule) writeFileSync(join(projectDir, 'database.ini'), `; Configuração de banco de dados do KarnoX Builder\r\n; Perfil: ${DELPHI_PROFILES[profile].label}\r\n; Preencha e altere Enabled=True quando desejar conectar.\r\n[Database]\r\nEnabled=False\r\nDriverID=\r\nDatabase=\r\n`, 'utf8')
  // Projetos MSBuild precisam manter {$R *.res}: o DPROJ gera nesse
  // recurso o manifesto de Common Controls usado pelos estilos visuais.
  // Removê-lo faz TBitBtn, TEdit e os demais controles voltarem ao tema clássico.
  let dpr = buildDpr(spec, profile)
  // Perfis compilados diretamente pelo DCC não recebem o manifesto do DPROJ.
  // XPMan ativa os estilos visuais nativos do Windows também nesses projetos.
  if (profile !== 'delphi10_13') {
    const xpManUnit = DELPHI_PROFILES[profile].namespacedUnits ? 'Vcl.XPMan' : 'XPMan'
    dpr = dpr.replace(/(\buses\s*\r?\n\s*(?:Vcl\.)?Forms,)/i, `$1\n  ${xpManUnit},`)
  }
  if (includeDataModule) {
    dpr = dpr.replace(
      '  Application.CreateForm(TFormMain, FormMain);\n  Application.CreateForm(TdmDatabase, dmDatabase);',
      '  Application.CreateForm(TdmDatabase, dmDatabase);\n  Application.CreateForm(TFormMain, FormMain);'
    )
  }
  writeFileSync(dprPath, dpr, profile === 'delphi7_2007' ? 'latin1' : 'utf8')
  if (dprojPath) writeFileSync(dprojPath, buildDproj(spec), 'utf8')

  return { projectDir, projectName, dprPath, dprojPath, profile }
}
