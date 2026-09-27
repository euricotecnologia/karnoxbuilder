import type { UnitSpec } from '../delphi/projectTemplate'
import { DELPHI_PROFILES, type DelphiProfileId } from '../delphi/profiles'
import { AIProviderError } from './types'
import { isCataloguedClass, isKnownProperty } from './vclPropertyCatalog'

/**
 * Mapa de tipo VCL/RTL -> unit que o declara. Usado para detectar componentes
 * referenciados no .pas que a IA esqueceu de importar no "uses", causando
 * "Undeclared identifier" na compilação.
 */
const COMPONENT_UNIT_MAP: Record<string, string> = {
  TButton: 'Vcl.StdCtrls',
  TEdit: 'Vcl.StdCtrls',
  TLabel: 'Vcl.StdCtrls',
  TMemo: 'Vcl.StdCtrls',
  TListBox: 'Vcl.StdCtrls',
  TComboBox: 'Vcl.StdCtrls',
  TCheckBox: 'Vcl.StdCtrls',
  TRadioButton: 'Vcl.StdCtrls',
  TGroupBox: 'Vcl.StdCtrls',
  TScrollBar: 'Vcl.StdCtrls',
  TStaticText: 'Vcl.StdCtrls',
  TStatusBar: 'Vcl.ComCtrls',
  TProgressBar: 'Vcl.ComCtrls',
  TPageControl: 'Vcl.ComCtrls',
  TTabSheet: 'Vcl.ComCtrls',
  TTrackBar: 'Vcl.ComCtrls',
  TTreeView: 'Vcl.ComCtrls',
  TListView: 'Vcl.ComCtrls',
  TDateTimePicker: 'Vcl.ComCtrls',
  TToolBar: 'Vcl.ComCtrls',
  TRichEdit: 'Vcl.ComCtrls',
  TUpDown: 'Vcl.ComCtrls',
  TMonthCalendar: 'Vcl.ComCtrls',
  THeaderControl: 'Vcl.ComCtrls',
  TAnimate: 'Vcl.ComCtrls',
  TPanel: 'Vcl.ExtCtrls',
  TColorBox: 'Vcl.ExtCtrls',
  TScrollBox: 'Vcl.Forms',
  TFrame: 'Vcl.Forms',
  TImage: 'Vcl.ExtCtrls',
  TBevel: 'Vcl.ExtCtrls',
  TTimer: 'Vcl.ExtCtrls',
  TShape: 'Vcl.ExtCtrls',
  TSplitter: 'Vcl.ExtCtrls',
  TRadioGroup: 'Vcl.ExtCtrls',
  TXPManifest: 'Vcl.XPMan',
  TTrayIcon: 'Vcl.ExtCtrls',
  TActionManager: 'Vcl.ActnMan',
  TBalloonHint: 'Vcl.Controls',
  TOpenDialog: 'Vcl.Dialogs',
  TSaveDialog: 'Vcl.Dialogs',
  TColorDialog: 'Vcl.Dialogs',
  TFontDialog: 'Vcl.Dialogs',
  TPrintDialog: 'Vcl.Dialogs',
  TOpenPictureDialog: 'Vcl.ExtDlgs',
  TMainMenu: 'Vcl.Menus',
  TMenuItem: 'Vcl.Menus',
  TPopupMenu: 'Vcl.Menus',
  TBitBtn: 'Vcl.Buttons',
  TSpeedButton: 'Vcl.Buttons',
  TStringGrid: 'Vcl.Grids',
  TDrawGrid: 'Vcl.Grids',
  TDBGrid: 'Vcl.DBGrids',
  TDBNavigator: 'Vcl.DBCtrls',
  TDBComboBox: 'Vcl.DBCtrls',
  TDBListBox: 'Vcl.DBCtrls',
  TDBCtrlGrid: 'Vcl.DBCGrids',
  TDBEdit: 'Vcl.DBCtrls',
  TDBText: 'Vcl.DBCtrls',
  TDBLookupComboBox: 'Vcl.DBCtrls',
  TDBLookupListBox: 'Vcl.DBCtrls',
  TDBMemo: 'Vcl.DBCtrls',
  TDBCheckBox: 'Vcl.DBCtrls',
  TDBRadioGroup: 'Vcl.DBCtrls',
  TDBImage: 'Vcl.DBCtrls',
  TDataSource: 'Data.DB',
  TFDConnection: 'FireDAC.Comp.Client',
  TFDQuery: 'FireDAC.Comp.Client',
  TFDTable: 'FireDAC.Comp.Client',
  TFDStoredProc: 'FireDAC.Comp.Client',
  TFDMemTable: 'FireDAC.Comp.Client',
  TMaskEdit: 'Vcl.Mask',
  TActionList: 'Vcl.ActnList',
  TAction: 'System.Actions',
  TImageList: 'Vcl.ImgList',
  TChart: 'VclTee.Chart'
}

function findUsesClause(content: string, fromIndex: number): { start: number; end: number; body: string } | null {
  const usesRegex = /\buses\b([\s\S]*?);/i
  const sub = content.slice(fromIndex)
  const match = usesRegex.exec(sub)
  if (!match) return null
  const start = fromIndex + match.index
  const end = start + match[0].length
  return { start, end, body: match[1] }
}

function parseUnitNames(usesBody: string): Set<string> {
  return new Set(
    usesBody
      .split(',')
      .map((s) => s.trim().replace(/\s+in\s+'[^']*'/i, ''))
      .filter(Boolean)
      .map((s) => s.toLowerCase())
  )
}

function insertIntoExistingUses(
  content: string,
  clause: { start: number; end: number; body: string },
  unitsToAdd: string[]
): string {
  const existing = parseUnitNames(clause.body)
  const newOnes = unitsToAdd.filter((u) => !existing.has(u.toLowerCase()))
  if (newOnes.length === 0) return content

  const semicolonPos = clause.end - 1
  const insertion = ',\n  ' + newOnes.join(',\n  ')
  return content.slice(0, semicolonPos) + insertion + content.slice(semicolonPos)
}

function ensureInterfaceUses(content: string, unitsToAdd: string[]): string {
  if (unitsToAdd.length === 0) return content

  const interfaceMatch = /\binterface\b/i.exec(content)
  if (!interfaceMatch) return content

  const searchFrom = interfaceMatch.index + interfaceMatch[0].length
  const clause = findUsesClause(content, searchFrom)
  if (!clause) return content

  return insertIntoExistingUses(content, clause, unitsToAdd)
}

function ensureImplementationUses(content: string, unitsToAdd: string[]): string {
  if (unitsToAdd.length === 0) return content

  const implMatch = /\bimplementation\b/i.exec(content)
  if (!implMatch) return content

  const searchFrom = implMatch.index + implMatch[0].length
  const restOfFile = content.slice(searchFrom)

  // Só considera uma cláusula "uses" pertencente à implementation se ela vier
  // antes de qualquer "begin"/"procedure"/"function"/"{$R" — caso contrário
  // pode ser um "uses" dentro de um bloco de código (raro, mas defensivo).
  const boundaryMatch = /\b(procedure|function|begin|\{\$R)/i.exec(restOfFile)
  const boundary = boundaryMatch ? searchFrom + boundaryMatch.index : content.length

  const usesRegex = /\buses\b([\s\S]*?);/i
  const localMatch = usesRegex.exec(content.slice(searchFrom, boundary))

  if (localMatch) {
    const start = searchFrom + localMatch.index
    const end = start + localMatch[0].length
    return insertIntoExistingUses(content, { start, end, body: localMatch[1] }, unitsToAdd)
  }

  // Não existe "uses" na implementation ainda — cria um novo logo após "implementation".
  const insertPos = searchFrom
  const newUsesBlock = `\n\nuses\n  ${unitsToAdd.join(',\n  ')};\n`
  return content.slice(0, insertPos) + newUsesBlock + content.slice(insertPos)
}

/**
 * Corrige determinísticamente as cláusulas "uses" de cada unit gerada pela IA:
 * - adiciona o unit VCL/RTL de qualquer componente usado que não foi importado.
 * - adiciona (na seção implementation, para evitar referência circular) o unit
 *   de qualquer outro form do projeto cuja classe seja referenciada.
 *
 * Isso não depende do modelo de IA "acertar" o uses sempre — é uma rede de
 * segurança determinística aplicada antes de gravar os arquivos em disco.
 */
const LEGACY_UNIT_NAMES: Record<string, string> = {
  'Vcl.StdCtrls': 'StdCtrls', 'Vcl.ComCtrls': 'ComCtrls', 'Vcl.ExtCtrls': 'ExtCtrls',
  'Vcl.Dialogs': 'Dialogs', 'Vcl.ExtDlgs': 'ExtDlgs', 'Vcl.Menus': 'Menus', 'Vcl.Buttons': 'Buttons',
  'Vcl.Grids': 'Grids', 'Vcl.DBGrids': 'DBGrids', 'Vcl.DBCtrls': 'DBCtrls', 'Vcl.DBCGrids': 'DBCGrids',
  'Vcl.Mask': 'Mask', 'Vcl.ImgList': 'ImgList', 'Vcl.ActnList': 'ActnList', 'Vcl.ActnMan': 'ActnMan', 'Vcl.XPMan': 'XPMan', 'Vcl.Forms': 'Forms',
  'Vcl.Controls': 'Controls', 'Vcl.Graphics': 'Graphics', 'VclTee.Chart': 'Chart', 'Data.DB': 'DB',
  'System.SysUtils': 'SysUtils', 'System.Classes': 'Classes', 'System.Variants': 'Variants',
  'System.Types': 'Types', 'System.Math': 'Math', 'Winapi.Windows': 'Windows',
  'Winapi.Messages': 'Messages', 'System.Actions': 'ActnList'
}

function normalizeUnitNamespaces(content: string, profileId: DelphiProfileId): string {
  if (DELPHI_PROFILES[profileId].namespacedUnits) return content
  let normalized = content
  for (const [modern, legacy] of Object.entries(LEGACY_UNIT_NAMES)) {
    normalized = normalized.replace(new RegExp(`\\b${modern.replace('.', '\\.')}\\b`, 'g'), legacy)
  }
  return normalized
}

/**
 * Rede de segurança determinística contra propriedades que a IA "alucina" no
 * .pas — inventa uma propriedade plausível (existe em componentes parecidos)
 * mas que não existe de verdade na classe VCL real declarada, causando
 * "Undeclared identifier" (ex.: TStringGrid não tem "ReadOnly"; essa
 * propriedade existe em TDBGrid/TEdit/TMemo, não em TStringGrid/TDrawGrid).
 * Valida cada atribuição "Campo.Propriedade := valor;" contra o catálogo real
 * de propriedades por classe (vclPropertyCatalog, organizado por herança da
 * VCL) — cobre de uma vez toda propriedade de toda classe cadastrada lá, sem
 * precisar de um caso especial por propriedade inventada relatada.
 */
const PROPERTY_TRANSLATIONS: Record<string, (fieldName: string, valueExpr: string) => string> = {
  // TStringGrid/TDrawGrid não têm propriedade ReadOnly; a edição de célula é
  // controlada pela flag goEditing dentro de Options.
  'tstringgrid.readonly': readOnlyToGoEditing,
  'tdrawgrid.readonly': readOnlyToGoEditing
}

function readOnlyToGoEditing(fieldName: string, valueExpr: string): string {
  const literal = valueExpr.trim().replace(/;$/, '')
  if (/^true$/i.test(literal)) return `${fieldName}.Options := ${fieldName}.Options - [goEditing];`
  if (/^false$/i.test(literal)) return `${fieldName}.Options := ${fieldName}.Options + [goEditing];`
  return `if ${literal} then\n    ${fieldName}.Options := ${fieldName}.Options - [goEditing]\n  else\n    ${fieldName}.Options := ${fieldName}.Options + [goEditing];`
}

function findTypedFields(content: string): Map<string, string> {
  const fields = new Map<string, string>()
  const re = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_.]*)\s*;/gm
  let match: RegExpExecArray | null
  while ((match = re.exec(content))) fields.set(match[1], match[2])
  return fields
}

export function fixInvalidComponentProperties(content: string): { content: string; fixed: string[] } {
  let result = content
  const fixed: string[] = []
  const fields = findTypedFields(result)
  for (const [fieldName, className] of fields) {
    if (!isCataloguedClass(className)) continue
    const assignRegex = new RegExp(
      '^([ \\t]*)' + fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.([A-Za-z_][A-Za-z0-9_]*)\\s*:=\\s*([^\\n;]+);[ \\t]*$',
      'gm'
    )
    result = result.replace(assignRegex, (full: string, indent: string, propertyName: string, valueExpr: string) => {
      if (isKnownProperty(className, propertyName)) return full
      fixed.push(`${fieldName}.${propertyName}`)
      const translate = PROPERTY_TRANSLATIONS[`${className.toLowerCase()}.${propertyName.toLowerCase()}`]
      // Sem tradução conhecida para a API real: remove a linha por completo.
      // Uma atribuição a menos é sempre preferível a "Undeclared identifier"
      // impedindo TODO o projeto de compilar.
      return translate ? indent + translate(fieldName, valueExpr) : ''
    })
  }
  return { content: result, fixed }
}

/**
 * Rede de segurança determinística contra o erro mais comum em código gerado
 * por IA: um método (procedure/function) declarado na classe (private, public
 * ou published — não só os OnClick/OnChange ligados a componentes do DFM) sem
 * a implementação correspondente. Isso gera "Unsatisfied forward or external
 * declaration" e impede TODO o projeto de compilar, mesmo que o resto do
 * código esteja correto. O prompt já instrui a IA a nunca esquecer isso, mas
 * aqui garantimos de verdade: qualquer método declarado sem corpo recebe um
 * stub vazio antes da compilação, para que o projeto sempre compile mesmo
 * quando o modelo esquece de implementar um método auxiliar.
 */
function findClassDeclarations(content: string): string[] {
  const names: string[] = []
  const re = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*class\s*\(/gim
  let match: RegExpExecArray | null
  while ((match = re.exec(content))) names.push(match[1])
  return names
}

interface DeclaredMethod {
  isClass: boolean
  kind: 'procedure' | 'function'
  name: string
  params: string
  returnType: string
  abstract: boolean
}

function ensureClassMethodsImplemented(content: string, className: string): { content: string; added: string[] } {
  const classPattern = new RegExp('\\b' + className.replace('.', '\\.') + '\\s*=\\s*class\\s*\\([^)]*\\)', 'i')
  const classMatch = classPattern.exec(content)
  if (!classMatch) return { content, added: [] }

  const bodyStart = classMatch.index + classMatch[0].length
  const classEndMatch = /^[ \t]*end\s*;/im.exec(content.slice(bodyStart))
  if (!classEndMatch) return { content, added: [] }
  const classBody = content.slice(bodyStart, bodyStart + classEndMatch.index)

  const methodRegex = /^[ \t]*(class\s+)?(procedure|function)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\([^)]*\))?\s*(:\s*[A-Za-z_][A-Za-z0-9_.<>,[\]]*)?\s*;((?:\s*(?:override|virtual|dynamic|reintroduce|overload|abstract|stdcall|cdecl|register|safecall)\s*;)*)/gim
  const declared: DeclaredMethod[] = []
  let match: RegExpExecArray | null
  while ((match = methodRegex.exec(classBody))) {
    const [, classKeyword, kind, name, params, returnType, modifiers] = match
    declared.push({
      isClass: Boolean(classKeyword),
      kind: kind.toLowerCase() as 'procedure' | 'function',
      name,
      params: params ?? '',
      returnType: returnType ? returnType.replace(/^:\s*/, '').trim() : '',
      abstract: /\babstract\b/i.test(modifiers ?? '')
    })
  }

  const missing = declared.filter((method) => {
    if (method.abstract) return false
    const implRegex = new RegExp(
      '\\b' + (method.isClass ? 'class\\s+' : '') + method.kind + '\\s+' +
      className.replace('.', '\\.') + '\\.' + method.name + '\\s*[\\(;:]',
      'i'
    )
    return !implRegex.test(content)
  })
  if (!missing.length) return { content, added: [] }

  const finalEnd = /\bend\.\s*$/i.exec(content)
  if (!finalEnd) return { content, added: [] }

  const stubs = missing.map((method) => [
    `${method.isClass ? 'class ' : ''}${method.kind} ${className}.${method.name}${method.params}${method.kind === 'function' ? `: ${method.returnType || 'Integer'}` : ''};`,
    'begin',
    '',
    'end;',
    ''
  ].join('\n')).join('\n')

  const updatedContent = content.slice(0, finalEnd.index) + stubs + content.slice(finalEnd.index)
  return { content: updatedContent, added: missing.map((method) => method.name) }
}

export function ensureAllMethodsImplemented(content: string): { content: string; added: string[] } {
  let result = content
  const added: string[] = []
  for (const className of findClassDeclarations(content)) {
    const repair = ensureClassMethodsImplemented(result, className)
    result = repair.content
    added.push(...repair.added)
  }
  return { content: result, added }
}

/**
 * Rede de segurança determinística contra a causa mais comum de
 * "Undeclared identifier" em código gerado: um contador de "for" usado sem
 * ter sido declarado em nenhum "var" da rotina (ex.: "for I := 0 to N do"
 * sem "I: Integer;" antes do "begin"). O prompt já instrui a IA a nunca
 * esquecer isso, mas — como em toda regra baseada só em texto — não há
 * garantia de que o modelo obedeça sempre. Localiza cada rotina
 * "TClasse.Metodo" pelo par begin/end real (contando profundidade, inclusive
 * de blocos "case...end" sem "begin" correspondente), extrai os
 * identificadores usados como contador de "for" dentro dela, e declara em
 * "Integer" qualquer um que não esteja nem no "var" da própria rotina nem na
 * lista de parâmetros do cabeçalho. Nunca reduz nem apaga nada — no pior caso
 * (contador não é Integer) o código ainda compila com um var a mais e sem
 * uso aparente fora do loop, o que gera no máximo um aviso, nunca um erro.
 */
function findMatchingEnd(content: string, fromIndex: number): number {
  const tokenRegex = /\b(begin|end|case)\b/gi
  tokenRegex.lastIndex = fromIndex
  let depth = 0
  let match: RegExpExecArray | null
  while ((match = tokenRegex.exec(content))) {
    const token = match[0].toLowerCase()
    if (token === 'begin' || token === 'case') depth++
    else {
      depth--
      if (depth === 0) return match.index
    }
  }
  return -1
}

function parseParamNames(paramList: string): Set<string> {
  const names = new Set<string>()
  // "const A, B: Integer; var C: string; D: TObject" -> nomes antes de cada ":"
  for (const group of paramList.split(';')) {
    const namesPart = group.replace(/^\s*(const|var|out)\s+/i, '').split(':')[0]
    for (const name of namesPart.split(',')) {
      const clean = name.trim().replace(/^\[[^\]]*\]/, '').trim()
      if (clean) names.add(clean.toLowerCase())
    }
  }
  return names
}

interface RoutineSpan { headerStart: number; headerEnd: number; varStart: number; bodyStart: number; bodyEnd: number; params: Set<string> }

function findRoutineSpans(content: string): RoutineSpan[] {
  const spans: RoutineSpan[] = []
  const headerRegex = /^[ \t]*(?:class\s+)?(?:procedure|function)\s+[A-Za-z_]\w*\.[A-Za-z_]\w*\s*(\([^)]*\))?\s*(?::\s*[\w.<>[\],\s]+)?;/gm
  let match: RegExpExecArray | null
  while ((match = headerRegex.exec(content))) {
    const headerStart = match.index
    const headerEnd = headerStart + match[0].length
    const params = parseParamNames(match[1] ? match[1].slice(1, -1) : '')

    // Localiza o "begin" que abre o corpo desta rotina, pulando por cima de
    // uma seção "var"/"const"/"type" opcional. Se aparecer outro cabeçalho de
    // rotina antes de qualquer "begin", esta declaração não tem corpo próprio
    // aqui (raro/malformado) — pula com segurança.
    const nextHeaderMatch = /^[ \t]*(?:class\s+)?(?:procedure|function)\s+[A-Za-z_]/m.exec(content.slice(headerEnd))
    const beginMatch = /^[ \t]*begin\b/m.exec(content.slice(headerEnd))
    if (!beginMatch) continue
    if (nextHeaderMatch && nextHeaderMatch.index < beginMatch.index) continue

    const bodyStart = headerEnd + beginMatch.index
    const bodyEnd = findMatchingEnd(content, bodyStart)
    if (bodyEnd === -1) continue

    const varMatch = /\bvar\b/i.exec(content.slice(headerEnd, bodyStart))
    const varStart = varMatch ? headerEnd + varMatch.index : bodyStart

    spans.push({ headerStart, headerEnd, varStart, bodyStart, bodyEnd, params })
  }
  return spans
}

export function ensureForLoopVariablesDeclared(content: string): { content: string; added: string[] } {
  const spans = findRoutineSpans(content)
  if (!spans.length) return { content, added: [] }

  let result = content
  let offset = 0
  const added: string[] = []

  for (const span of spans) {
    const varSectionText = content.slice(span.varStart, span.bodyStart)
    const declared = new Set(
      Array.from(varSectionText.matchAll(/^[ \t]*([A-Za-z_]\w*)\s*(?:,\s*[A-Za-z_]\w*\s*)*:/gm))
        .flatMap((m) => content.slice(span.varStart, span.bodyStart).slice(m.index, m.index! + m[0].length - 1).split(','))
        .map((name) => name.trim().toLowerCase())
    )

    const bodyText = content.slice(span.bodyStart, span.bodyEnd)
    const missing = new Set<string>()
    for (const forMatch of bodyText.matchAll(/\bfor\s+([A-Za-z_]\w*)\s*:=/gi)) {
      const name = forMatch[1]
      const key = name.toLowerCase()
      if (span.params.has(key) || declared.has(key)) continue
      missing.add(name)
    }
    if (!missing.size) continue

    const declarations = Array.from(missing).map((name) => `  ${name}: Integer;`).join('\n')
    const hasExistingVar = /\bvar\b/i.test(content.slice(span.headerEnd, span.bodyStart))
    // Com "var" existente: insere logo após a palavra-chave "var".
    // Sem "var": insere a seção inteira ("var\n...\n") antes do "begin" do corpo.
    const insertAt = hasExistingVar ? span.varStart + offset + 3 : span.varStart + offset
    const insertText = hasExistingVar ? `\n${declarations}` : `var\n${declarations}\n`
    result = result.slice(0, insertAt) + insertText + result.slice(insertAt)
    offset += insertText.length
    added.push(...Array.from(missing))
  }

  return { content: result, added }
}

interface DfmEventSpec {
  componentName: string
  eventName: string
  methodName: string
}

function extractDfmEvents(dfmContent: string): DfmEventSpec[] {
  const stack: string[] = []
  const events: DfmEventSpec[] = []
  for (const line of dfmContent.split(/\r?\n/)) {
    const open = line.match(/^\s*(?:object|inherited|inline)\s+([A-Za-z][A-Za-z0-9_]*)\s*:/i)
    if (open) stack.push(open[1])
    const event = line.match(/^\s*(On[A-Za-z0-9_]+)\s*=\s*([A-Za-z][A-Za-z0-9_]*)\s*$/i)
    if (event && stack.length) events.push({ componentName: stack[stack.length - 1], eventName: event[1], methodName: event[2] })
    if (/^\s*end\s*$/i.test(line) && stack.length) stack.pop()
  }
  return events.filter((event, index, all) => all.findIndex((item) => item.methodName.toLowerCase() === event.methodName.toLowerCase()) === index)
}

function eventParameters(eventName: string): string {
  if (/^OnKey(?:Down|Up)$/i.test(eventName)) return 'Sender: TObject; var Key: Word; Shift: TShiftState'
  if (/^OnKeyPress$/i.test(eventName)) return 'Sender: TObject; var Key: Char'
  if (/^OnMouse(?:Down|Up)$/i.test(eventName)) return 'Sender: TObject; Button: TMouseButton; Shift: TShiftState; X, Y: Integer'
  if (/^OnMouseMove$/i.test(eventName)) return 'Sender: TObject; Shift: TShiftState; X, Y: Integer'
  return 'Sender: TObject'
}

function ensureDfmEventHandlers(content: string, rootClass: string, events: DfmEventSpec[]): { content: string; added: string[] } {
  if (!events.length) return { content, added: [] }
  const classPattern = new RegExp('\\b' + rootClass.replace('.', '\\.') + '\\s*=\\s*class\\s*\\([^)]*\\)', 'i')
  const classMatch = classPattern.exec(content)
  if (!classMatch) return { content, added: [] }

  const bodyStart = classMatch.index + classMatch[0].length
  const classEndMatch = /^[ \t]*end\s*;/im.exec(content.slice(bodyStart))
  if (!classEndMatch) return { content, added: [] }
  const classBody = content.slice(bodyStart, bodyStart + classEndMatch.index)
  const declarationMissing = events.filter((event) =>
    !new RegExp('\\bprocedure\\s+' + event.methodName + '\\s*\\(', 'i').test(classBody)
  )
  const implementationMissing = events.filter((event) =>
    !new RegExp('\\bprocedure\\s+' + rootClass.replace('.', '\\.') + '\\.' + event.methodName + '\\s*\\(', 'i').test(content)
  )

  if (declarationMissing.length) {
    const declarations = declarationMissing
      .map((event) => `    procedure ${event.methodName}(${eventParameters(event.eventName)});`)
      .join('\n')
    content = content.slice(0, bodyStart) + '\n' + declarations + content.slice(bodyStart)
  }

  if (implementationMissing.length) {
    const finalEnd = /\bend\.\s*$/i.exec(content)
    if (!finalEnd) return { content, added: declarationMissing.map((event) => event.methodName) }
    const implementations = implementationMissing.map((event) => [
      `procedure ${rootClass}.${event.methodName}(${eventParameters(event.eventName)});`,
      'begin',
      '',
      'end;',
      ''
    ].join('\n')).join('\n')
    content = content.slice(0, finalEnd.index) + implementations + content.slice(finalEnd.index)
  }

  const added = [...declarationMissing, ...implementationMissing]
    .filter((event, index, all) => all.findIndex((item) => item.methodName.toLowerCase() === event.methodName.toLowerCase()) === index)
    .map((event) => event.methodName)
  return { content, added }
}
function normalizeDfmFieldOrder(
  content: string,
  rootClass: string,
  fields: Array<{ name: string; className: string }>
): string {
  if (!fields.length) return content
  const classPattern = new RegExp('\\b' + rootClass.replace('.', '\\.') + '\\s*=\\s*class\\s*\\([^)]*\\)', 'i')
  const classMatch = classPattern.exec(content)
  if (!classMatch) return content

  const bodyStart = classMatch.index + classMatch[0].length
  const classEnd = /^[ \t]*end\s*;/im.exec(content.slice(bodyStart))
  if (!classEnd) return content
  const bodyEnd = bodyStart + classEnd.index
  let body = content.slice(bodyStart, bodyEnd)
  const unique = fields.filter((field, index, all) => all.findIndex((item) => item.name.toLowerCase() === field.name.toLowerCase()) === index)

  // Remove as declarações existentes da posição atual. Isso também
  // recupera units que uma versão anterior deixou depois de procedures.
  for (const field of unique) {
    const escapedName = field.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escapedClass = field.className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    body = body.replace(new RegExp('^[ \\t]*' + escapedName + '\\s*:\\s*' + escapedClass + '\\s*;[ \\t]*(?:\\r?\\n)?', 'gim'), '')
  }

  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  // Campos órfãos ou manuais também não podem permanecer depois de métodos.
  // Reorganiza somente a seção implícita da classe, antes de private/public,
  // preservando a visibilidade dos demais membros.
  const visibility = /^[ \t]*(?:strict\s+private|strict\s+protected|private|protected|public|published)\s*$/im.exec(body)
  const implicitEnd = visibility?.index ?? body.length
  let implicit = body.slice(0, implicitEnd)
  const rest = body.slice(implicitEnd)
  const orphanFields: Array<{ name: string; declaration: string }> = []
  implicit = implicit.replace(/^([ \t]*)([A-Za-z][A-Za-z0-9_]*)\s*:\s*([A-Za-z][A-Za-z0-9_.]*(?:\s*<[^;]+>)?)\s*;[ \t]*(?:\r?\n)?/gim, (_line, indent, name, typeName) => {
    if (!unique.some((field) => field.name.toLowerCase() === String(name).toLowerCase())) {
      orphanFields.push({ name, declaration: `${indent || '    '}${name}: ${String(typeName).trim()};` })
    }
    return ''
  })
  const declarations = [
    ...unique.map((field) => '    ' + field.name + ': ' + field.className + ';'),
    ...orphanFields.map((field) => field.declaration)
  ].join(eol)
  const remaining = (implicit + rest).replace(/^(?:\r?\n)+/, '')
  return content.slice(0, bodyStart) + eol + declarations + eol + remaining + content.slice(bodyEnd)
}

export interface DfmPasRepairResult {
  content: string
  addedUnits: string[]
  addedFields: string[]
  addedEvents: string[]
  addedMethods: string[]
  fixedProperties: string[]
  addedVariables: string[]
}

/**
 * Sincroniza deterministicamente um formulÃ¡rio salvo pelo Designer com sua
 * unit Pascal. Classes de componentes no DFM precisam estar vinculadas por
 * suas units em tempo de execuÃ§Ã£o; caso contrÃ¡rio o projeto compila, mas o
 * streamer falha com EClassNotFound ao abrir o formulÃ¡rio.
 */
export function repairPascalForDfm(
  pasContent: string,
  dfmContent: string,
  profileId: DelphiProfileId = 'delphi10_13',
  extraComponentUnits: Record<string, string> = {}
): DfmPasRepairResult {
  const objects = Array.from(dfmContent.matchAll(/^\s*(?:object|inherited|inline)\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*([A-Za-z][A-Za-z0-9_.]*)/gim))
    .map((match) => ({ name: match[1], className: match[2] }))
  if (objects.length === 0) {
    const propertyFix = fixInvalidComponentProperties(pasContent)
    const methodRepair = ensureAllMethodsImplemented(propertyFix.content)
    const varRepair = ensureForLoopVariablesDeclared(methodRepair.content)
    return {
      content: varRepair.content,
      addedUnits: [],
      addedFields: [],
      addedEvents: [],
      addedMethods: methodRepair.added,
      fixedProperties: propertyFix.fixed,
      addedVariables: varRepair.added
    }
  }

  const events = extractDfmEvents(dfmContent)
  const namespaced = DELPHI_PROFILES[profileId].namespacedUnits
  const neededUnits = new Set<string>()
  if (events.some((event) => /^On(?:Key|Mouse)/i.test(event.eventName))) {
    neededUnits.add(namespaced ? 'Vcl.Controls' : 'Controls')
  }
  for (const picture of dfmContent.matchAll(/Picture\.Data\s*=\s*\{([\s\S]*?)\}/gi)) {
    const hex = picture[1].replace(/[^0-9A-F]/gi, '').toUpperCase()
    if (hex.startsWith('0A544A504547496D616765')) neededUnits.add(namespaced ? 'Vcl.Imaging.jpeg' : 'JPEG')
    if (hex.startsWith('0954506E67496D616765') && namespaced) neededUnits.add('Vcl.Imaging.pngimage')
  }
  for (const object of objects.slice(1)) {
    const modernUnit = COMPONENT_UNIT_MAP[object.className] ?? extraComponentUnits[object.className]
    if (modernUnit) neededUnits.add(namespaced ? modernUnit : (LEGACY_UNIT_NAMES[modernUnit] ?? modernUnit))
  }

  let content = normalizeUnitNamespaces(pasContent, profileId)
  const beforeUses = content
  content = ensureInterfaceUses(content, Array.from(neededUnits))
  const addedUnits = Array.from(neededUnits).filter((unitName) => !new RegExp('\\b' + unitName.replace('.', '\\.') + '\\b', 'i').test(beforeUses))

  const rootClass = objects[0].className
  const classPattern = new RegExp('\\b' + rootClass.replace('.', '\\.') + '\\s*=\\s*class\\s*\\([^)]*\\)', 'i')
  const classMatch = classPattern.exec(content)
  const componentFields = classMatch
    ? objects.slice(1).filter((object) => Boolean(COMPONENT_UNIT_MAP[object.className] ?? extraComponentUnits[object.className]))
    : []
  const addedFields = componentFields.filter((object) => {
    const fieldPattern = new RegExp('\\b' + object.name + '\\s*:\\s*[A-Za-z][A-Za-z0-9_.]*\\s*;', 'i')
    return !fieldPattern.test(content)
  }).map((object) => object.name)

  // Primeiro cria os eventos e, em seguida, posiciona todos os campos DFM
  // antes deles. Delphi rejeita campos declarados após methods/properties.
  const eventRepair = ensureDfmEventHandlers(content, rootClass, events)
  content = normalizeDfmFieldOrder(eventRepair.content, rootClass, componentFields)

  // Corrige propriedades inventadas para componentes que não as têm de
  // verdade (ex.: TStringGrid.ReadOnly não existe na VCL).
  const propertyFix = fixInvalidComponentProperties(content)
  content = propertyFix.content

  // Por último, garante que qualquer método auxiliar (não ligado a evento do
  // DFM) declarado na classe também tenha implementação — mesma rede de
  // segurança de ensureDfmEventHandlers, mas para métodos privados/públicos
  // comuns que a IA esqueceu de implementar.
  const methodRepair = ensureAllMethodsImplemented(content)
  content = methodRepair.content

  // Declara qualquer contador de "for" usado sem ter sido declarado em
  // nenhum "var" da rotina — a causa mais comum de "Undeclared identifier"
  // no código gerado.
  const varRepair = ensureForLoopVariablesDeclared(content)
  content = varRepair.content

  return {
    content,
    addedUnits,
    addedFields,
    addedEvents: eventRepair.added,
    addedMethods: methodRepair.added,
    fixedProperties: propertyFix.fixed,
    addedVariables: varRepair.added
  }
}

export function repairUnitReferences(
  units: UnitSpec[],
  profileId: DelphiProfileId = 'delphi10_13'
): UnitSpec[] {
  const classToUnit = new Map<string, string>()
  for (const unit of units) {
    if (unit.formClassName) {
      classToUnit.set(unit.formClassName, unit.unitName)
    }
  }

  return units.map((unit) => {
    let content = normalizeUnitNamespaces(unit.pasContent, profileId)

    const neededComponentUnits = new Set<string>()
    for (const [typeName, unitName] of Object.entries(COMPONENT_UNIT_MAP)) {
      const re = new RegExp(`\\b${typeName}\\b`)
      if (re.test(content)) {
        neededComponentUnits.add(
          DELPHI_PROFILES[profileId].namespacedUnits ? unitName : (LEGACY_UNIT_NAMES[unitName] ?? unitName)
        )
      }
    }

    const neededFormUnits = new Set<string>()
    for (const [className, declaringUnit] of classToUnit.entries()) {
      if (declaringUnit === unit.unitName) continue
      const re = new RegExp(`\\b${className}\\b`)
      if (re.test(content)) neededFormUnits.add(declaringUnit)
    }

    content = ensureInterfaceUses(content, Array.from(neededComponentUnits))
    content = ensureImplementationUses(content, Array.from(neededFormUnits))

    return content === unit.pasContent ? unit : { ...unit, pasContent: content }
  })
}

const FIREDAC_PATTERN = /\bFireDAC\.[A-Za-z.]*|\bTFD[A-Z]\w*/

/**
 * O prompt do perfil já instrui a IA a não usar FireDAC fora do Delphi 10-13,
 * mas isso é só texto — nada garante que o modelo obedeça. Sem essa checagem,
 * um projeto Delphi 7/XE geraria "uses FireDAC.Comp.Client" ou "TFDConnection",
 * que simplesmente não existem nessas versões, e o usuário só descobriria isso
 * ao tentar compilar. Falha cedo e explica o motivo em vez de aceitar silenciosamente.
 */
export function assertFireDacProfileCompliance(units: UnitSpec[], profileId: DelphiProfileId): void {
  if (DELPHI_PROFILES[profileId].firedacAllowed) return
  const offendingUnits = units.filter((unit) => FIREDAC_PATTERN.test(unit.pasContent)).map((unit) => unit.unitName)
  if (!offendingUnits.length) return
  throw new AIProviderError(
    `A IA gerou código usando FireDAC (${offendingUnits.join(', ')}), mas o FireDAC não está disponível no perfil ${DELPHI_PROFILES[profileId].label}. ` +
    'Peça novamente informando explicitamente para usar ADO, dbExpress ou IBX para acesso a dados, ou selecione o perfil Delphi 10-13 se o projeto puder usar FireDAC.'
  )
}

/**
 * O perfil Delphi 10-13 permite FireDAC, mas isso não significa que o projeto
 * ABERTO use FireDAC — muitos projetos legados usam Zeos, UniDAC, ADO etc.
 * escolhidos antes de existir a KarnoX Builder. O prompt já instrui a IA a
 * reaproveitar o driver existente, mas isso também é só texto: aqui bloqueamos
 * de verdade a introdução de FireDAC quando o projeto já usa outro driver,
 * evitando duas formas de conexão paralelas e inconsistentes no mesmo projeto.
 */
export function assertNoConflictingConnectionDriver(
  units: UnitSpec[],
  existingConnections: Array<{ label: string; className: string }>
): void {
  const existingNonFireDac = existingConnections.filter((item) => item.className !== 'TFDConnection')
  if (!existingNonFireDac.length) return
  const offendingUnits = units.filter((unit) => FIREDAC_PATTERN.test(unit.pasContent)).map((unit) => unit.unitName)
  if (!offendingUnits.length) return
  const driverList = existingNonFireDac.map((item) => `${item.label} (${item.className})`).join(', ')
  throw new AIProviderError(
    `A IA gerou código usando FireDAC (${offendingUnits.join(', ')}), mas este projeto já usa ${driverList} para acesso a dados. ` +
    'Peça novamente informando explicitamente para reaproveitar o driver já existente no projeto, em vez de introduzir FireDAC.'
  )
}
