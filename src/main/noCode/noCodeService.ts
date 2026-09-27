import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, join, relative, resolve } from 'path'
import { DELPHI_PROFILES, type DelphiProfileId } from '../delphi/profiles'

export type NoCodeAction =
  | { type: 'message'; message: string }
  | { type: 'confirm'; message: string }
  | { type: 'openForm'; unitName: string; formClass: string; modal: boolean }
  | { type: 'closeForm' }
  | { type: 'closeApplication' }
  | { type: 'setProperty'; target: string; property: string; value: string }
  | { type: 'searchGrid'; grid: string; sourceEdit: string; fields: string }
  | { type: 'searchClear'; grid: string; sourceEdit: string }
  | { type: 'imageFit' }
  | { type: 'imageClear' }
  | { type: 'imageFullscreen' }
  | { type: 'imageShow' }
  | { type: 'imageHide' }
  | { type: 'imageToggleVisible' }
  | { type: 'imageTransfer'; target: string }
  | { type: 'editSetText'; value: string }
  | { type: 'editClear' }
  | { type: 'editFocus' }
  | { type: 'editSelectAll' }
  | { type: 'editCopy' }
  | { type: 'editCut' }
  | { type: 'editPaste' }
  | { type: 'editTransfer'; target: string }
  | { type: 'labelSetCaption'; value: string }
  | { type: 'labelClear' }
  | { type: 'labelShow' }
  | { type: 'labelHide' }
  | { type: 'labelToggleVisible' }
  | { type: 'labelSetFontColor'; value: string }
  | { type: 'labelSetFontSize'; value: number }
  | { type: 'labelSetFontStyle'; value: 'normal' | 'bold' | 'italic' | 'underline' }
  | { type: 'labelSetAlignment'; value: 'left' | 'center' | 'right' }
  | { type: 'memoSetText'; value: string }
  | { type: 'memoAddLine'; value: string }
  | { type: 'memoClear' }
  | { type: 'memoFocus' }
  | { type: 'memoSelectAll' }
  | { type: 'memoCopy' }
  | { type: 'memoCut' }
  | { type: 'memoPaste' }
  | { type: 'memoSetReadOnly'; value: boolean }
  | { type: 'memoToggleReadOnly' }
  | { type: 'memoSetWordWrap'; value: boolean }
  | { type: 'memoTransfer'; target: string }
  | { type: 'checkBoxSetCaption'; value: string }
  | { type: 'checkBoxSetChecked'; value: boolean }
  | { type: 'checkBoxToggle' }
  | { type: 'checkBoxSetState'; value: 'unchecked' | 'checked' | 'grayed' }
  | { type: 'checkBoxSetAllowGrayed'; value: boolean }
  | { type: 'checkBoxSetEnabled'; value: boolean }
  | { type: 'checkBoxSetVisible'; value: boolean }
  | { type: 'checkBoxFocus' }
  | { type: 'checkBoxTransfer'; target: string }
  | { type: 'radioButtonSetCaption'; value: string }
  | { type: 'radioButtonSetChecked'; value: boolean }
  | { type: 'radioButtonSelect' }
  | { type: 'radioButtonClear' }
  | { type: 'radioButtonSetEnabled'; value: boolean }
  | { type: 'radioButtonSetVisible'; value: boolean }
  | { type: 'radioButtonFocus' }
  | { type: 'radioButtonTransfer'; target: string }
  | { type: 'comboBoxSetText'; value: string }
  | { type: 'comboBoxSetItems'; value: string }
  | { type: 'comboBoxAddItem'; value: string }
  | { type: 'comboBoxClearItems' }
  | { type: 'comboBoxDeleteSelected' }
  | { type: 'comboBoxSelectText'; value: string }
  | { type: 'comboBoxSelectIndex'; value: number }
  | { type: 'comboBoxClearSelection' }
  | { type: 'comboBoxSetSorted'; value: boolean }
  | { type: 'comboBoxFocus' }
  | { type: 'comboBoxOpenDropDown' }
  | { type: 'comboBoxTransfer'; target: string }
  | { type: 'listBoxAddItem'; value: string }
  | { type: 'listBoxClearItems' }
  | { type: 'listBoxDeleteSelected' }
  | { type: 'listBoxSelectText'; value: string }
  | { type: 'listBoxSelectIndex'; value: number }
  | { type: 'listBoxClearSelection' }
  | { type: 'listBoxSelectAll' }
  | { type: 'listBoxSetMultiSelect'; value: boolean }
  | { type: 'listBoxSetSorted'; value: boolean }
  | { type: 'listBoxFocus' }
  | { type: 'listBoxTransfer'; target: string }
  | { type: 'colorBoxSetSelected'; value: string }
  | { type: 'colorBoxApplyColor'; target: string; property: 'Color' | 'Font.Color' }
  | { type: 'colorBoxFocus' }
  | { type: 'colorBoxSetEnabled'; value: boolean }
  | { type: 'colorBoxSetVisible'; value: boolean }
  | { type: 'stringGridSetCell'; col: number; row: number; value: string }
  | { type: 'stringGridSelectCell'; col: number; row: number }
  | { type: 'stringGridClear' }
  | { type: 'stringGridAddRow' }
  | { type: 'stringGridDeleteCurrentRow' }
  | { type: 'stringGridSetDimensions'; cols: number; rows: number }
  | { type: 'stringGridSetFixed'; cols: number; rows: number }
  | { type: 'stringGridFocus' }
  | { type: 'stringGridTransferCell'; target: string }
  | { type: 'stringGridLoadData'; data: string[][] }
  | { type: 'panelSetCaption'; value: string }
  | { type: 'panelSetColor'; value: string }
  | { type: 'panelShow' }
  | { type: 'panelHide' }
  | { type: 'panelSetEnabled'; value: boolean }
  | { type: 'panelBringToFront' }
  | { type: 'calendarToday' }
  | { type: 'calendarAddDays'; value: number }
  | { type: 'calendarSetEnabled'; value: boolean }
  | { type: 'calendarGoToDate'; day: number; month: number; year: number }
  | { type: 'calendarSetMinDate'; day: number; month: number; year: number }
  | { type: 'calendarSetMaxDate'; day: number; month: number; year: number }
  | { type: 'progressSetPosition'; value: number }
  | { type: 'progressAdvance'; value: number }
  | { type: 'progressReset' }
  | { type: 'progressSetState'; value: 'normal' | 'error' | 'paused' }
  | { type: 'progressSetRange'; min: number; max: number }
  | { type: 'radioGroupSelectIndex'; value: number }
  | { type: 'radioGroupClear' }
  | { type: 'radioGroupNext' }
  | { type: 'radioGroupSetEnabled'; value: boolean }
  | { type: 'chartRefresh' }
  | { type: 'chartClear' }
  | { type: 'chartSetLegend'; value: boolean }
  | { type: 'chartSet3D'; value: boolean }
  | { type: 'chartSetVisible'; value: boolean }
  | { type: 'chartAddPoint'; target: string; label: string; value: number }
  | { type: 'chartClearSeries'; target: string }

export interface NoCodeBinding {
  id: string
  dfmPath: string
  formClass: string
  componentName: string
  eventName: string
  methodName: string
  actions: NoCodeAction[]
}

interface NoCodeDocument {
  version: 1
  bindings: NoCodeBinding[]
}

export interface DelphiFormInfo {
  unitName: string
  formClass: string
  filePath: string
}

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/

function documentPath(projectDir: string): string {
  return join(projectDir, '.karnox', 'actions.json')
}

function emptyDocument(): NoCodeDocument { return { version: 1, bindings: [] } }

function readDocument(projectDir: string): NoCodeDocument {
  const file = documentPath(projectDir)
  if (!existsSync(file)) return emptyDocument()
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<NoCodeDocument>
    return { version: 1, bindings: Array.isArray(parsed.bindings) ? parsed.bindings : [] }
  } catch {
    return emptyDocument()
  }
}

function writeDocument(projectDir: string, document: NoCodeDocument): void {
  const file = documentPath(projectDir)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
}

function normalizedRelative(projectDir: string, filePath: string): string {
  return relative(resolve(projectDir), resolve(filePath)).replace(/\\/g, '/')
}

function bindingId(dfmPath: string, componentName: string, eventName: string): string {
  return `${basename(dfmPath, '.dfm')}.${componentName}.${eventName}`.replace(/[^A-Za-z0-9_.-]/g, '_')
}

function validateBinding(binding: NoCodeBinding): void {
  for (const value of [binding.formClass, binding.componentName, binding.eventName, binding.methodName]) {
    if (!IDENTIFIER.test(value)) throw new Error(`Identificador No-Code inválido: ${value}`)
  }
  if (!/^On[A-Za-z0-9_]+$/.test(binding.eventName)) throw new Error('O evento No-Code deve começar com On.')
  if (binding.actions.length > 100) throw new Error('Uma ação visual pode ter no máximo 100 etapas.')
  for (const action of binding.actions) {
    if (action.type === 'openForm' && (!IDENTIFIER.test(action.unitName) || !IDENTIFIER.test(action.formClass))) throw new Error('O formulário de destino é inválido.')
    if (action.type === 'setProperty' && (!IDENTIFIER.test(action.target) || !IDENTIFIER.test(action.property))) throw new Error('O componente ou a propriedade de destino é inválido.')
    if ((action.type === 'searchGrid' || action.type === 'searchClear') && (!IDENTIFIER.test(action.grid) || !IDENTIFIER.test(action.sourceEdit))) throw new Error('O grid ou o campo de busca da pesquisa é inválido.')
    if (action.type === 'editTransfer' && !IDENTIFIER.test(action.target)) throw new Error('O campo de destino do TEdit é inválido.')
    if (action.type === 'labelSetFontColor' && !/^cl[A-Za-z][A-Za-z0-9_]*$/.test(action.value)) throw new Error('A cor do TLabel é inválida.')
    if (action.type === 'labelSetFontSize' && (!Number.isInteger(action.value) || action.value < 6 || action.value > 96)) throw new Error('O tamanho da fonte do TLabel deve estar entre 6 e 96.')
    if (action.type === 'labelSetFontStyle' && !['normal', 'bold', 'italic', 'underline'].includes(action.value)) throw new Error('O estilo da fonte do TLabel é inválido.')
    if (action.type === 'labelSetAlignment' && !['left', 'center', 'right'].includes(action.value)) throw new Error('O alinhamento do TLabel é inválido.')
    if (action.type === 'memoTransfer' && !IDENTIFIER.test(action.target)) throw new Error('O campo de destino do TMemo é inválido.')
    if (action.type === 'memoSetReadOnly' && typeof action.value !== 'boolean') throw new Error('O modo somente leitura do TMemo é inválido.')
    if (action.type === 'memoSetWordWrap' && typeof action.value !== 'boolean') throw new Error('A quebra automática do TMemo é inválida.')
    if (action.type === 'checkBoxTransfer' && !IDENTIFIER.test(action.target)) throw new Error('O TCheckBox de destino é inválido.')
    if (action.type === 'checkBoxSetState' && !['unchecked', 'checked', 'grayed'].includes(action.value)) throw new Error('O estado do TCheckBox é inválido.')
    if ((action.type === 'checkBoxSetChecked' || action.type === 'checkBoxSetAllowGrayed' || action.type === 'checkBoxSetEnabled' || action.type === 'checkBoxSetVisible') && typeof action.value !== 'boolean') throw new Error('O valor lógico do TCheckBox é inválido.')
    if (action.type === 'radioButtonTransfer' && !IDENTIFIER.test(action.target)) throw new Error('O TRadioButton de destino é inválido.')
    if ((action.type === 'radioButtonSetChecked' || action.type === 'radioButtonSetEnabled' || action.type === 'radioButtonSetVisible') && typeof action.value !== 'boolean') throw new Error('O valor lógico do TRadioButton é inválido.')
    if (action.type === 'comboBoxTransfer' && !IDENTIFIER.test(action.target)) throw new Error('O campo de destino do TComboBox é inválido.')
    if (action.type === 'comboBoxSelectIndex' && (!Number.isInteger(action.value) || action.value < -1 || action.value > 100000)) throw new Error('A posição do TComboBox é inválida.')
    if (action.type === 'comboBoxSetSorted' && typeof action.value !== 'boolean') throw new Error('A ordenação do TComboBox é inválida.')
    if (action.type === 'listBoxTransfer' && !IDENTIFIER.test(action.target)) throw new Error('O campo de destino do TListBox é inválido.')
    if (action.type === 'listBoxSelectIndex' && (!Number.isInteger(action.value) || action.value < -1 || action.value > 100000)) throw new Error('A posição do TListBox é inválida.')
    if ((action.type === 'listBoxSetMultiSelect' || action.type === 'listBoxSetSorted') && typeof action.value !== 'boolean') throw new Error('A configuração lógica do TListBox é inválida.')
    if (action.type === 'colorBoxSetSelected' && !/^cl[A-Za-z][A-Za-z0-9_]*$/.test(action.value)) throw new Error('A cor selecionada no TColorBox é inválida.')
    if (action.type === 'colorBoxApplyColor' && (!IDENTIFIER.test(action.target) || !['Color', 'Font.Color'].includes(action.property))) throw new Error('O destino da cor do TColorBox é inválido.')
    if ((action.type === 'colorBoxSetEnabled' || action.type === 'colorBoxSetVisible') && typeof action.value !== 'boolean') throw new Error('A configuração lógica do TColorBox é inválida.')
    if ((action.type === 'stringGridSetCell' || action.type === 'stringGridSelectCell') && (![action.col, action.row].every((value) => Number.isInteger(value) && value >= 0 && value <= 100000))) throw new Error('A célula do TStringGrid é inválida.')
    if ((action.type === 'stringGridSetDimensions' || action.type === 'stringGridSetFixed') && (![action.cols, action.rows].every((value) => Number.isInteger(value) && value >= 0 && value <= 100000))) throw new Error('As dimensões do TStringGrid são inválidas.')
    if (action.type === 'stringGridTransferCell' && !IDENTIFIER.test(action.target)) throw new Error('O campo de destino do TStringGrid é inválido.')
    if (action.type === 'panelSetColor' && !/^cl[A-Za-z][A-Za-z0-9_]*$/.test(action.value)) throw new Error('A cor do TPanel é inválida.')
    if (action.type === 'calendarAddDays' && (!Number.isInteger(action.value) || Math.abs(action.value) > 365000)) throw new Error('A quantidade de dias do calendário é inválida.')
    if ((action.type === 'progressSetPosition' || action.type === 'progressAdvance') && (!Number.isInteger(action.value) || Math.abs(action.value) > 100000000)) throw new Error('O valor do TProgressBar é inválido.')
    if (action.type === 'progressSetState' && !['normal', 'error', 'paused'].includes(action.value)) throw new Error('O estado do TProgressBar é inválido.')
    if (action.type === 'radioGroupSelectIndex' && (!Number.isInteger(action.value) || action.value < -1 || action.value > 100000)) throw new Error('A opção do TRadioGroup é inválida.')
    if (action.type === 'stringGridLoadData') {
      if (!Array.isArray(action.data) || action.data.length > 1000 || action.data.some((row) => !Array.isArray(row) || row.length > 100 || row.some((cell) => typeof cell !== 'string' || cell.length > 32768))) throw new Error('Os dados importados para o TStringGrid excedem o limite seguro.')
      if (action.data.reduce((total, row) => total + row.length, 0) > 50000) throw new Error('A planilha possui mais de 50.000 células e precisa ser reduzida antes da importação.')
    }
  }
}

export function getNoCodeBinding(projectDir: string, dfmPath: string, componentName: string, eventName: string): NoCodeBinding | null {
  const relativePath = normalizedRelative(projectDir, dfmPath).toLowerCase()
  return readDocument(projectDir).bindings.find((binding) =>
    binding.dfmPath.toLowerCase() === relativePath &&
    binding.componentName.toLowerCase() === componentName.toLowerCase() &&
    binding.eventName.toLowerCase() === eventName.toLowerCase()
  ) ?? null
}

export function saveNoCodeBinding(projectDir: string, input: Omit<NoCodeBinding, 'id' | 'dfmPath'> & { dfmPath: string }): NoCodeBinding | null {
  const document = readDocument(projectDir)
  const relativePath = normalizedRelative(projectDir, input.dfmPath)
  if (relativePath.startsWith('../')) throw new Error('O DFM precisa pertencer ao projeto aberto.')
  const id = bindingId(input.dfmPath, input.componentName, input.eventName)
  const binding: NoCodeBinding = { ...input, id, dfmPath: relativePath }
  validateBinding(binding)
  document.bindings = document.bindings.filter((item) => item.id.toLowerCase() !== id.toLowerCase())
  // Mantém também bindings vazios como tombstones para remover o bloco Pascal anterior no próximo salvamento.
  document.bindings.push(binding)
  writeDocument(projectDir, document)
  return binding
}

function visitPascalFiles(directory: string, output: string[], depth = 0): void {
  if (depth > 6) return
  let names: string[] = []
  try { names = readdirSync(directory) } catch { return }
  for (const name of names) {
    if (/^(?:\.git|node_modules|Win32|Win64|publish)$/i.test(name)) continue
    const file = join(directory, name)
    try {
      if (statSync(file).isDirectory()) visitPascalFiles(file, output, depth + 1)
      else if (/\.pas$/i.test(name)) output.push(file)
    } catch { /* arquivo inacessível */ }
  }
}

export function listDelphiForms(projectDir: string): DelphiFormInfo[] {
  const files: string[] = []
  visitPascalFiles(projectDir, files)
  const result: DelphiFormInfo[] = []
  for (const filePath of files) {
    try {
      const source = readFileSync(filePath, 'utf8')
      const unitName = source.match(/^\s*unit\s+([A-Za-z][A-Za-z0-9_]*)\s*;/im)?.[1]
      if (!unitName) continue
      for (const match of source.matchAll(/^\s*(T[A-Za-z][A-Za-z0-9_]*)\s*=\s*class\s*\(\s*TForm\s*\)/gim)) {
        result.push({ unitName, formClass: match[1], filePath })
      }
    } catch { /* unit inválida */ }
  }
  return result.sort((a, b) => a.formClass.localeCompare(b.formClass))
}

function pascalString(value: string): string {
  if (!value.length) return "''"
  const parts: string[] = []
  let chunk = ''
  const flush = (): void => { if (chunk.length) { parts.push(`'${chunk.replace(/'/g, "''")}'`); chunk = '' } }
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === '\r' || char === '\n' || char === '\t') {
      flush()
      if (char === '\r' && value[index + 1] === '\n') { parts.push('#13#10'); index += 1 }
      else parts.push(char === '\r' ? '#13' : char === '\n' ? '#10' : '#9')
    } else chunk += char
  }
  flush()
  return parts.length ? parts.join(' + ') : "''"
}

function propertyValue(property: string, value: string): string {
  if (/^(?:Caption|Text|Hint)$/i.test(property)) return pascalString(value)
  if (/^(?:Enabled|Visible|Checked)$/i.test(property)) return /^(?:true|1|yes|sim)$/i.test(value) ? 'True' : 'False'
  if (/^-?\d+(?:\.\d+)?$/.test(value) || /^[A-Za-z_$][A-Za-z0-9_.$]*$/.test(value)) return value
  return pascalString(value)
}

function actionLines(action: NoCodeAction, binding: NoCodeBinding): string[] {
  if (action.type === 'message') return [`  ShowMessage(${pascalString(action.message || 'Mensagem')});`]
  if (action.type === 'confirm') return [
    `  if MessageDlg(${pascalString(action.message || 'Deseja continuar?')}, mtConfirmation, [mbYes, mbNo], 0) <> mrYes then`,
    '    Exit;'
  ]
  if (action.type === 'closeForm') return ['  Close;']
  if (action.type === 'closeApplication') return [
    '  if KarnoXConfirmCloseApplication then',
    '    Application.Terminate;'
  ]
  if (action.type === 'setProperty') return [`  ${action.target}.${action.property} := ${propertyValue(action.property, action.value)};`]
  if (action.type === 'searchGrid') return [`  KarnoXApplyGridSearch(${action.grid}, ${action.sourceEdit}.Text, ${pascalString(action.fields)});`]
  if (action.type === 'searchClear') return [`  KarnoXClearGridSearch(${action.grid});`, `  ${action.sourceEdit}.Clear;`]
  // Compatibilidade com bindings antigos: ajuste proporcional agora é uma
  // propriedade persistente do DFM, nunca uma ação executada ao clicar.
  if (action.type === 'imageFit') return []
  if (action.type === 'imageClear') return [`  ${binding.componentName}.Picture.Assign(nil);`]
  if (action.type === 'imageFullscreen') return [`  KarnoXShowImageFullScreen(Self, ${binding.componentName}.Picture);`]
  if (action.type === 'imageShow') return [`  ${binding.componentName}.Show;`]
  if (action.type === 'imageHide') return [`  ${binding.componentName}.Hide;`]
  if (action.type === 'imageToggleVisible') return [`  ${binding.componentName}.Visible := not ${binding.componentName}.Visible;`]
  if (action.type === 'imageTransfer') return [`  ${action.target}.Picture.Assign(${binding.componentName}.Picture);`]
  if (action.type === 'editSetText') return [`  ${binding.componentName}.Text := ${pascalString(action.value)};`]
  if (action.type === 'editClear') return [`  ${binding.componentName}.Clear;`]
  if (action.type === 'editFocus') return [`  if ${binding.componentName}.CanFocus then`, `    ${binding.componentName}.SetFocus;`]
  if (action.type === 'editSelectAll') return [`  ${binding.componentName}.SelectAll;`]
  if (action.type === 'editCopy') return [`  ${binding.componentName}.CopyToClipboard;`]
  if (action.type === 'editCut') return [`  ${binding.componentName}.CutToClipboard;`]
  if (action.type === 'editPaste') return [`  ${binding.componentName}.PasteFromClipboard;`]
  if (action.type === 'editTransfer') return [`  ${action.target}.Text := ${binding.componentName}.Text;`]
  if (action.type === 'labelSetCaption') return [`  ${binding.componentName}.Caption := ${pascalString(action.value)};`]
  if (action.type === 'labelClear') return [`  ${binding.componentName}.Caption := '';`]
  if (action.type === 'labelShow') return [`  ${binding.componentName}.Show;`]
  if (action.type === 'labelHide') return [`  ${binding.componentName}.Hide;`]
  if (action.type === 'labelToggleVisible') return [`  ${binding.componentName}.Visible := not ${binding.componentName}.Visible;`]
  if (action.type === 'labelSetFontColor') return [`  ${binding.componentName}.Font.Color := ${action.value};`]
  if (action.type === 'labelSetFontSize') return [`  ${binding.componentName}.Font.Size := ${action.value};`]
  if (action.type === 'labelSetFontStyle') {
    const styles = { normal: '[]', bold: '[fsBold]', italic: '[fsItalic]', underline: '[fsUnderline]' } as const
    return [`  ${binding.componentName}.Font.Style := ${styles[action.value]};`]
  }
  if (action.type === 'labelSetAlignment') {
    const alignments = { left: 'taLeftJustify', center: 'taCenter', right: 'taRightJustify' } as const
    return [`  ${binding.componentName}.Alignment := ${alignments[action.value]};`]
  }
  if (action.type === 'memoSetText') return [`  ${binding.componentName}.Lines.Text := ${pascalString(action.value)};`]
  if (action.type === 'memoAddLine') return [`  ${binding.componentName}.Lines.Add(${pascalString(action.value)});`]
  if (action.type === 'memoClear') return [`  ${binding.componentName}.Clear;`]
  if (action.type === 'memoFocus') return [`  if ${binding.componentName}.CanFocus then`, `    ${binding.componentName}.SetFocus;`]
  if (action.type === 'memoSelectAll') return [`  ${binding.componentName}.SelectAll;`]
  if (action.type === 'memoCopy') return [`  ${binding.componentName}.CopyToClipboard;`]
  if (action.type === 'memoCut') return [`  ${binding.componentName}.CutToClipboard;`]
  if (action.type === 'memoPaste') return [`  ${binding.componentName}.PasteFromClipboard;`]
  if (action.type === 'memoSetReadOnly') return [`  ${binding.componentName}.ReadOnly := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'memoToggleReadOnly') return [`  ${binding.componentName}.ReadOnly := not ${binding.componentName}.ReadOnly;`]
  if (action.type === 'memoSetWordWrap') return [`  ${binding.componentName}.WordWrap := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'memoTransfer') return [`  ${action.target}.Text := ${binding.componentName}.Text;`]
  if (action.type === 'checkBoxSetCaption') return [`  ${binding.componentName}.Caption := ${pascalString(action.value)};`]
  if (action.type === 'checkBoxSetChecked') return [`  ${binding.componentName}.Checked := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'checkBoxToggle') return [`  ${binding.componentName}.Checked := not ${binding.componentName}.Checked;`]
  if (action.type === 'checkBoxSetState') {
    const states = { unchecked: 'cbUnchecked', checked: 'cbChecked', grayed: 'cbGrayed' } as const
    return [`  ${binding.componentName}.State := ${states[action.value]};`]
  }
  if (action.type === 'checkBoxSetAllowGrayed') return [`  ${binding.componentName}.AllowGrayed := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'checkBoxSetEnabled') return [`  ${binding.componentName}.Enabled := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'checkBoxSetVisible') return [`  ${binding.componentName}.Visible := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'checkBoxFocus') return [`  if ${binding.componentName}.CanFocus then`, `    ${binding.componentName}.SetFocus;`]
  if (action.type === 'checkBoxTransfer') return [`  ${action.target}.AllowGrayed := ${binding.componentName}.AllowGrayed;`, `  ${action.target}.State := ${binding.componentName}.State;`]
  if (action.type === 'radioButtonSetCaption') return [`  ${binding.componentName}.Caption := ${pascalString(action.value)};`]
  if (action.type === 'radioButtonSetChecked') return [`  ${binding.componentName}.Checked := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'radioButtonSelect') return [`  ${binding.componentName}.Checked := True;`]
  if (action.type === 'radioButtonClear') return [`  ${binding.componentName}.Checked := False;`]
  if (action.type === 'radioButtonSetEnabled') return [`  ${binding.componentName}.Enabled := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'radioButtonSetVisible') return [`  ${binding.componentName}.Visible := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'radioButtonFocus') return [`  if ${binding.componentName}.CanFocus then`, `    ${binding.componentName}.SetFocus;`]
  if (action.type === 'radioButtonTransfer') return [`  ${action.target}.Checked := ${binding.componentName}.Checked;`]
  if (action.type === 'comboBoxSetText') return [`  ${binding.componentName}.Text := ${pascalString(action.value)};`]
  if (action.type === 'comboBoxSetItems') {
    const values = action.value.length ? action.value.split(/\r?\n/) : []
    return [
      `  ${binding.componentName}.Items.BeginUpdate;`,
      '  try',
      `    ${binding.componentName}.Items.Clear;`,
      ...values.map((value) => `    ${binding.componentName}.Items.Add(${pascalString(value)});`),
      '  finally',
      `    ${binding.componentName}.Items.EndUpdate;`,
      '  end;'
    ]
  }
  if (action.type === 'comboBoxAddItem') return [`  ${binding.componentName}.Items.Add(${pascalString(action.value)});`]
  if (action.type === 'comboBoxClearItems') return [`  ${binding.componentName}.Items.Clear;`]
  if (action.type === 'comboBoxDeleteSelected') return [`  if ${binding.componentName}.ItemIndex >= 0 then`, `    ${binding.componentName}.Items.Delete(${binding.componentName}.ItemIndex);`]
  if (action.type === 'comboBoxSelectText') return [`  ${binding.componentName}.ItemIndex := ${binding.componentName}.Items.IndexOf(${pascalString(action.value)});`]
  if (action.type === 'comboBoxSelectIndex') return action.value < 0
    ? [`  ${binding.componentName}.ItemIndex := -1;`]
    : [`  if ${action.value} < ${binding.componentName}.Items.Count then`, `    ${binding.componentName}.ItemIndex := ${action.value}`, '  else', `    ${binding.componentName}.ItemIndex := -1;`]
  if (action.type === 'comboBoxClearSelection') return [`  ${binding.componentName}.ItemIndex := -1;`, `  ${binding.componentName}.Text := '';`]
  if (action.type === 'comboBoxSetSorted') return [`  ${binding.componentName}.Sorted := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'comboBoxFocus') return [`  if ${binding.componentName}.CanFocus then`, `    ${binding.componentName}.SetFocus;`]
  if (action.type === 'comboBoxOpenDropDown') return [`  if ${binding.componentName}.CanFocus then`, '  begin', `    ${binding.componentName}.SetFocus;`, `    ${binding.componentName}.DroppedDown := True;`, '  end;']
  if (action.type === 'comboBoxTransfer') return [`  ${action.target}.Text := ${binding.componentName}.Text;`]
  if (action.type === 'listBoxAddItem') return [`  ${binding.componentName}.Items.Add(${pascalString(action.value)});`]
  if (action.type === 'listBoxClearItems') return [`  ${binding.componentName}.Items.Clear;`]
  if (action.type === 'listBoxDeleteSelected') return [`  KarnoXListBoxDeleteSelected(${binding.componentName});`]
  if (action.type === 'listBoxSelectText') return [`  ${binding.componentName}.ItemIndex := ${binding.componentName}.Items.IndexOf(${pascalString(action.value)});`]
  if (action.type === 'listBoxSelectIndex') return action.value < 0
    ? [`  KarnoXListBoxClearSelection(${binding.componentName});`]
    : [`  if ${action.value} < ${binding.componentName}.Items.Count then`, `    ${binding.componentName}.ItemIndex := ${action.value}`, '  else', `    KarnoXListBoxClearSelection(${binding.componentName});`]
  if (action.type === 'listBoxClearSelection') return [`  KarnoXListBoxClearSelection(${binding.componentName});`]
  if (action.type === 'listBoxSelectAll') return [`  KarnoXListBoxSelectAll(${binding.componentName});`]
  if (action.type === 'listBoxSetMultiSelect') return [`  ${binding.componentName}.MultiSelect := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'listBoxSetSorted') return [`  ${binding.componentName}.Sorted := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'listBoxFocus') return [`  if ${binding.componentName}.CanFocus then`, `    ${binding.componentName}.SetFocus;`]
  if (action.type === 'listBoxTransfer') return [`  if ${binding.componentName}.ItemIndex >= 0 then`, `    ${action.target}.Text := ${binding.componentName}.Items[${binding.componentName}.ItemIndex]`, '  else', `    ${action.target}.Text := '';`]
  if (action.type === 'colorBoxSetSelected') return [`  ${binding.componentName}.Selected := ${action.value};`]
  if (action.type === 'colorBoxApplyColor') return [`  ${action.target}.${action.property} := ${binding.componentName}.Selected;`]
  if (action.type === 'colorBoxFocus') return [`  if ${binding.componentName}.CanFocus then`, `    ${binding.componentName}.SetFocus;`]
  if (action.type === 'colorBoxSetEnabled') return [`  ${binding.componentName}.Enabled := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'colorBoxSetVisible') return [`  ${binding.componentName}.Visible := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'stringGridSetCell') return [`  if (${action.col} < ${binding.componentName}.ColCount) and (${action.row} < ${binding.componentName}.RowCount) then`, `    ${binding.componentName}.Cells[${action.col}, ${action.row}] := ${pascalString(action.value)};`]
  if (action.type === 'stringGridSelectCell') return [`  if (${action.col} < ${binding.componentName}.ColCount) and (${action.row} < ${binding.componentName}.RowCount) then`, '  begin', `    ${binding.componentName}.Col := ${action.col};`, `    ${binding.componentName}.Row := ${action.row};`, '  end;']
  if (action.type === 'stringGridClear') return [`  KarnoXStringGridClear(${binding.componentName});`]
  if (action.type === 'stringGridAddRow') return [`  ${binding.componentName}.RowCount := ${binding.componentName}.RowCount + 1;`]
  if (action.type === 'stringGridDeleteCurrentRow') return [`  KarnoXStringGridDeleteCurrentRow(${binding.componentName});`]
  if (action.type === 'stringGridSetDimensions') return [`  ${binding.componentName}.ColCount := ${Math.max(1, action.cols)};`, `  ${binding.componentName}.RowCount := ${Math.max(1, action.rows)};`]
  if (action.type === 'stringGridSetFixed') return [`  ${binding.componentName}.FixedCols := ${action.cols};`, `  ${binding.componentName}.FixedRows := ${action.rows};`]
  if (action.type === 'stringGridFocus') return [`  if ${binding.componentName}.CanFocus then`, `    ${binding.componentName}.SetFocus;`]
  if (action.type === 'stringGridTransferCell') return [`  ${action.target}.Text := ${binding.componentName}.Cells[${binding.componentName}.Col, ${binding.componentName}.Row];`]
  if (action.type === 'panelSetCaption') return [`  ${binding.componentName}.Caption := ${pascalString(action.value)};`]
  if (action.type === 'panelSetColor') return [`  ${binding.componentName}.ParentBackground := False;`, `  ${binding.componentName}.Color := ${action.value};`]
  if (action.type === 'panelShow') return [`  ${binding.componentName}.Show;`]
  if (action.type === 'panelHide') return [`  ${binding.componentName}.Hide;`]
  if (action.type === 'panelSetEnabled') return [`  ${binding.componentName}.Enabled := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'panelBringToFront') return [`  ${binding.componentName}.BringToFront;`]
  if (action.type === 'calendarToday') return [`  ${binding.componentName}.Date := Date;`]
  if (action.type === 'calendarAddDays') return [`  ${binding.componentName}.Date := ${binding.componentName}.Date + ${action.value};`]
  if (action.type === 'calendarSetEnabled') return [`  ${binding.componentName}.Enabled := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'calendarGoToDate') return [`  ${binding.componentName}.Date := EncodeDate(${action.year}, ${action.month}, ${action.day});`]
  if (action.type === 'calendarSetMinDate') return action.year <= 0
    ? [`  ${binding.componentName}.MinDate := 0;`]
    : [`  ${binding.componentName}.MinDate := EncodeDate(${action.year}, ${action.month}, ${action.day});`]
  if (action.type === 'calendarSetMaxDate') return action.year <= 0
    ? [`  ${binding.componentName}.MaxDate := 0;`]
    : [`  ${binding.componentName}.MaxDate := EncodeDate(${action.year}, ${action.month}, ${action.day});`]
  if (action.type === 'progressSetPosition') return [`  ${binding.componentName}.Position := ${action.value};`]
  if (action.type === 'progressAdvance') return [`  ${binding.componentName}.StepBy(${action.value});`]
  if (action.type === 'progressReset') return [`  ${binding.componentName}.Position := ${binding.componentName}.Min;`]
  if (action.type === 'progressSetState') return [`  ${binding.componentName}.State := ${({ normal: 'pbsNormal', error: 'pbsError', paused: 'pbsPaused' })[action.value]};`]
  if (action.type === 'progressSetRange') return [`  ${binding.componentName}.Min := ${action.min};`, `  ${binding.componentName}.Max := ${action.max};`]
  if (action.type === 'radioGroupSelectIndex') return [`  if (${action.value} >= -1) and (${action.value} < ${binding.componentName}.Items.Count) then`, `    ${binding.componentName}.ItemIndex := ${action.value};`]
  if (action.type === 'radioGroupClear') return [`  ${binding.componentName}.ItemIndex := -1;`]
  if (action.type === 'radioGroupNext') return [`  if ${binding.componentName}.Items.Count > 0 then`, `    ${binding.componentName}.ItemIndex := (${binding.componentName}.ItemIndex + 1) mod ${binding.componentName}.Items.Count;`]
  if (action.type === 'radioGroupSetEnabled') return [`  ${binding.componentName}.Enabled := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'chartRefresh') return [`  ${binding.componentName}.Repaint;`]
  if (action.type === 'chartClear') return [`  ${binding.componentName}.RemoveAllSeries;`]
  if (action.type === 'chartSetLegend') return [`  ${binding.componentName}.Legend.Visible := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'chartSet3D') return [`  ${binding.componentName}.View3D := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'chartSetVisible') return [`  ${binding.componentName}.Visible := ${action.value ? 'True' : 'False'};`]
  if (action.type === 'chartAddPoint') return [`  ${action.target}.AddY(${action.value}, ${pascalString(action.label)});`]
  if (action.type === 'chartClearSeries') return [`  ${action.target}.Clear;`]
  if (action.type === 'stringGridLoadData') {
    const rows = Math.max(1, action.data.length)
    const cols = Math.max(1, ...action.data.map((row) => row.length))
    return [
      `  ${binding.componentName}.ColCount := ${cols};`,
      `  ${binding.componentName}.RowCount := ${rows};`,
      ...action.data.flatMap((row, rowIndex) => row.map((cell, colIndex) => `  ${binding.componentName}.Cells[${colIndex}, ${rowIndex}] := ${pascalString(cell)};`))
    ]
  }
  return action.modal
    ? [
        `  with ${action.formClass}.Create(Application) do`,
        '  try',
        '    ShowModal;',
        '  finally',
        '    Free;',
        '  end;'
      ]
    : [`  ${action.formClass}.Create(Application).Show;`]
}

function ensureImplementationUses(content: string, units: string[]): string {
  const unique = units.filter((unit, index, all) => unit && all.findIndex((item) => item.toLowerCase() === unit.toLowerCase()) === index)
    .filter((unit) => !new RegExp(`\\b${unit.replace('.', '\\.')}\\b`, 'i').test(content))
  if (!unique.length) return content
  const implementation = /\bimplementation\b/i.exec(content)
  if (!implementation) return content
  const after = implementation.index + implementation[0].length
  const rest = content.slice(after)
  const uses = /^\s*uses\b([\s\S]*?);/i.exec(rest)
  if (uses) {
    const replacement = uses[0].replace(/;\s*$/, `,\n  ${unique.join(',\n  ')};`)
    return content.slice(0, after) + rest.replace(uses[0], replacement)
  }
  return `${content.slice(0, after)}\n\nuses\n  ${unique.join(',\n  ')};${content.slice(after)}`
}

function ensureCloseApplicationHelper(content: string, enabled: boolean): string {
  const marker = /\s*\/\/ <KARNOX-NOCODE:CLOSE-APPLICATION>[\s\S]*?\/\/ <\/KARNOX-NOCODE:CLOSE-APPLICATION>\s*/i
  if (!enabled) return content.replace(marker, '\n')
  const block = `// <KARNOX-NOCODE:CLOSE-APPLICATION>
function KarnoXConfirmCloseApplication: Boolean;
var
  LDialog: TForm;
  LButton: TButton;
  I: Integer;
begin
  LDialog := CreateMessageDialog(
    'Deseja realmente fechar a aplica' + #231 + #227 + 'o?',
    mtConfirmation,
    [mbYes, mbNo]
  );
  try
    LDialog.Caption := 'Confirma' + #231 + #227 + 'o';
    for I := 0 to LDialog.ComponentCount - 1 do
      if LDialog.Components[I] is TButton then
      begin
        LButton := TButton(LDialog.Components[I]);
        case LButton.ModalResult of
          mrYes: LButton.Caption := 'Sim';
          mrNo: LButton.Caption := 'N' + #227 + 'o';
        end;
      end;
    Result := LDialog.ShowModal = mrYes;
  finally
    LDialog.Free;
  end;
end;
// </KARNOX-NOCODE:CLOSE-APPLICATION>`
  if (marker.test(content)) return content.replace(marker, '\n' + block + '\n')
  const resource = /\{\$R\s+[^}]*\}/i.exec(content)
  if (resource) {
    const at = resource.index + resource[0].length
    return content.slice(0, at) + '\n\n' + block + content.slice(at)
  }
  const implementation = /\bimplementation\b/i.exec(content)
  if (!implementation) return content
  const firstRoutine = /\b(?:procedure|function)\b/i.exec(content.slice(implementation.index + implementation[0].length))
  const at = firstRoutine ? implementation.index + implementation[0].length + firstRoutine.index : content.lastIndexOf('end.')
  return content.slice(0, at) + block + '\n\n' + content.slice(at)
}
function ensureListBoxHelpers(content: string, enabled: boolean): string {
  const marker = /\s*\/\/ <KARNOX-NOCODE:LISTBOX-HELPERS>[\s\S]*?\/\/ <\/KARNOX-NOCODE:LISTBOX-HELPERS>\s*/i
  if (!enabled) return content.replace(marker, '\n')
  const block = `// <KARNOX-NOCODE:LISTBOX-HELPERS>
procedure KarnoXListBoxClearSelection(AListBox: TListBox);
var
  I: Integer;
begin
  if AListBox.MultiSelect then
    for I := 0 to AListBox.Items.Count - 1 do
      AListBox.Selected[I] := False;
  AListBox.ItemIndex := -1;
end;

procedure KarnoXListBoxSelectAll(AListBox: TListBox);
var
  I: Integer;
begin
  if not AListBox.MultiSelect then
  begin
    if AListBox.Items.Count > 0 then
      AListBox.ItemIndex := 0;
    Exit;
  end;
  for I := 0 to AListBox.Items.Count - 1 do
    AListBox.Selected[I] := True;
end;

procedure KarnoXListBoxDeleteSelected(AListBox: TListBox);
var
  I: Integer;
begin
  if AListBox.MultiSelect then
  begin
    for I := AListBox.Items.Count - 1 downto 0 do
      if AListBox.Selected[I] then
        AListBox.Items.Delete(I);
  end
  else if AListBox.ItemIndex >= 0 then
    AListBox.Items.Delete(AListBox.ItemIndex);
end;
// </KARNOX-NOCODE:LISTBOX-HELPERS>`
  if (marker.test(content)) return content.replace(marker, '\n' + block + '\n')
  const resource = /\{\$R\s+[^}]*\}/i.exec(content)
  if (resource) {
    const at = resource.index + resource[0].length
    return content.slice(0, at) + '\n\n' + block + content.slice(at)
  }
  const implementation = /\bimplementation\b/i.exec(content)
  if (!implementation) return content
  const firstRoutine = /\b(?:procedure|function)\b/i.exec(content.slice(implementation.index + implementation[0].length))
  const at = firstRoutine ? implementation.index + implementation[0].length + firstRoutine.index : content.lastIndexOf('end.')
  return content.slice(0, at) + block + '\n\n' + content.slice(at)
}

function ensureGridSearchHelper(content: string, enabled: boolean): string {
  const marker = /\s*\/\/ <KARNOX-NOCODE:GRID-SEARCH-HELPERS>[\s\S]*?\/\/ <\/KARNOX-NOCODE:GRID-SEARCH-HELPERS>\s*/i
  if (!enabled) return content.replace(marker, '\n')
  const block = `// <KARNOX-NOCODE:GRID-SEARCH-HELPERS>
procedure KarnoXApplyGridSearch(AGrid: TDBGrid; const ASearchText, AFields: string);
var
  LTerm, LFilter, LField: string;
  LFields: TStringList;
  I: Integer;
begin
  if (AGrid = nil) or (AGrid.DataSource = nil) or (AGrid.DataSource.DataSet = nil) then
    Exit;
  LTerm := Trim(ASearchText);
  if LTerm = '' then
  begin
    AGrid.DataSource.DataSet.Filtered := False;
    Exit;
  end;
  LTerm := StringReplace(LTerm, '''', '''''', [rfReplaceAll]);
  LFields := TStringList.Create;
  try
    LFields.CommaText := AFields;
    LFilter := '';
    for I := 0 to LFields.Count - 1 do
    begin
      LField := Trim(LFields[I]);
      if LField = '' then
        Continue;
      if LFilter <> '' then
        LFilter := LFilter + ' OR ';
      LFilter := LFilter + '(' + LField + ' LIKE ''%' + LTerm + '%'')';
    end;
  finally
    LFields.Free;
  end;
  if LFilter = '' then
    Exit;
  AGrid.DataSource.DataSet.FilterOptions := [foCaseInsensitive];
  AGrid.DataSource.DataSet.Filter := LFilter;
  AGrid.DataSource.DataSet.Filtered := True;
end;

procedure KarnoXClearGridSearch(AGrid: TDBGrid);
begin
  if (AGrid <> nil) and (AGrid.DataSource <> nil) and (AGrid.DataSource.DataSet <> nil) then
    AGrid.DataSource.DataSet.Filtered := False;
end;
// </KARNOX-NOCODE:GRID-SEARCH-HELPERS>`
  if (marker.test(content)) return content.replace(marker, '\n' + block + '\n')
  const resource = /\{\$R\s+[^}]*\}/i.exec(content)
  if (resource) {
    const at = resource.index + resource[0].length
    return content.slice(0, at) + '\n\n' + block + content.slice(at)
  }
  const implementation2 = /\bimplementation\b/i.exec(content)
  if (!implementation2) return content
  const firstRoutine2 = /\b(?:procedure|function)\b/i.exec(content.slice(implementation2.index + implementation2[0].length))
  const at2 = firstRoutine2 ? implementation2.index + implementation2[0].length + firstRoutine2.index : content.lastIndexOf('end.')
  return content.slice(0, at2) + block + '\n\n' + content.slice(at2)
}

function ensureStringGridHelpers(content: string, enabled: boolean): string {
  const marker = /\s*\/\/ <KARNOX-NOCODE:STRINGGRID-HELPERS>[\s\S]*?\/\/ <\/KARNOX-NOCODE:STRINGGRID-HELPERS>\s*/i
  if (!enabled) return content.replace(marker, '\n')
  const block = `// <KARNOX-NOCODE:STRINGGRID-HELPERS>
procedure KarnoXStringGridClear(AGrid: TStringGrid);
var
  C, R: Integer;
begin
  for R := AGrid.FixedRows to AGrid.RowCount - 1 do
    for C := AGrid.FixedCols to AGrid.ColCount - 1 do
      AGrid.Cells[C, R] := '';
end;

procedure KarnoXStringGridDeleteCurrentRow(AGrid: TStringGrid);
var
  C, R: Integer;
begin
  if (AGrid.Row < AGrid.FixedRows) or (AGrid.Row >= AGrid.RowCount) then
    Exit;
  for R := AGrid.Row to AGrid.RowCount - 2 do
    for C := 0 to AGrid.ColCount - 1 do
      AGrid.Cells[C, R] := AGrid.Cells[C, R + 1];
  if AGrid.RowCount > AGrid.FixedRows + 1 then
    AGrid.RowCount := AGrid.RowCount - 1
  else
    KarnoXStringGridClear(AGrid);
end;
// </KARNOX-NOCODE:STRINGGRID-HELPERS>`
  if (marker.test(content)) return content.replace(marker, '\n' + block + '\n')
  const resource = /\{\$R\s+[^}]*\}/i.exec(content)
  if (resource) { const at = resource.index + resource[0].length; return content.slice(0, at) + '\n\n' + block + content.slice(at) }
  const implementation = /\bimplementation\b/i.exec(content)
  if (!implementation) return content
  const at = content.lastIndexOf('end.')
  return content.slice(0, at) + block + '\n\n' + content.slice(at)
}

function ensureImageFullscreenHelper(content: string, enabled: boolean): string {
  const marker = /\s*\/\/ <KARNOX-NOCODE:IMAGE-FULLSCREEN>[\s\S]*?\/\/ <\/KARNOX-NOCODE:IMAGE-FULLSCREEN>\s*/i
  if (!enabled) return content.replace(marker, '\n')
  const block = `// <KARNOX-NOCODE:IMAGE-FULLSCREEN>
procedure KarnoXShowImageFullScreen(AOwner: TComponent; APicture: TPicture);
var
  LForm: TForm;
  LImage: TImage;
  LClose: TBitBtn;
begin
  LForm := TForm.Create(AOwner);
  try
    LForm.BorderStyle := bsNone;
    LForm.WindowState := wsMaximized;
    LForm.Color := clBlack;
    LImage := TImage.Create(LForm);
    LImage.Parent := LForm;
    LImage.Align := alClient;
    LImage.Stretch := True;
    LImage.Proportional := True;
    LImage.Center := True;
    LImage.Picture.Assign(APicture);
    LClose := TBitBtn.Create(LForm);
    LClose.Parent := LForm;
    LClose.Align := alBottom;
    LClose.Height := 40;
    LClose.Caption := 'Fechar';
    LClose.ModalResult := mrClose;
    LClose.Cancel := True;
    LForm.ShowModal;
  finally
    LForm.Free;
  end;
end;
// </KARNOX-NOCODE:IMAGE-FULLSCREEN>`
  if (marker.test(content)) return content.replace(marker, '\n' + block + '\n')
  const resource = /\{\$R\s+[^}]*\}/i.exec(content)
  if (resource) {
    const at = resource.index + resource[0].length
    return content.slice(0, at) + '\n\n' + block + content.slice(at)
  }
  const implementation = /\bimplementation\b/i.exec(content)
  if (!implementation) return content
  const firstRoutine = /\b(?:procedure|function)\b/i.exec(content.slice(implementation.index + implementation[0].length))
  const at = firstRoutine ? implementation.index + implementation[0].length + firstRoutine.index : content.lastIndexOf('end.')
  return content.slice(0, at) + block + '\n\n' + content.slice(at)
}

function applyBinding(content: string, binding: NoCodeBinding): string {
  const start = `  // <KARNOX-NOCODE:${binding.id}>`
  const end = `  // </KARNOX-NOCODE:${binding.id}>`
  const block = [start, ...binding.actions.flatMap((action) => actionLines(action, binding)), end].join('\n')
  const marker = new RegExp(`\\s*// <KARNOX-NOCODE:${binding.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>[\\s\\S]*?// <\\/KARNOX-NOCODE:${binding.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>`, 'i')
  if (marker.test(content)) return content.replace(marker, binding.actions.length ? `\n${block}` : '')
  if (!binding.actions.length) return content
  const method = new RegExp(`(procedure\\s+${binding.formClass}\\.${binding.methodName}\\s*\\([^)]*\\)\\s*;\\s*begin)`, 'i')
  if (!method.test(content)) return content
  return content.replace(method, `$1\n${block}`)
}

function dfmComponentNames(dfmPath: string): Set<string> | null {
  try {
    const content = readFileSync(dfmPath, 'utf8')
    const names = new Set<string>()
    for (const match of content.matchAll(/^\s*(?:object|inherited|inline)\s+([A-Za-z][A-Za-z0-9_]*)\s*:/gim)) names.add(match[1].toLowerCase())
    return names.size ? names : null
  } catch {
    return null
  }
}

export function applyNoCodeActions(pasContent: string, projectDir: string, dfmPath: string, profile: DelphiProfileId): string {
  const relativePath = normalizedRelative(projectDir, dfmPath).toLowerCase()
  const document = readDocument(projectDir)
  const allBindings = document.bindings.filter((binding) => binding.dfmPath.toLowerCase() === relativePath)
  if (!allBindings.length) return pasContent
  const componentNames = dfmComponentNames(dfmPath)
  const bindings = componentNames
    ? allBindings.filter((binding) => componentNames.has(binding.componentName.toLowerCase()))
    : allBindings
  const orphanBindings = componentNames
    ? allBindings.filter((binding) => !componentNames.has(binding.componentName.toLowerCase()))
    : []
  const dialogUnit = profile === 'delphi7_2007' ? 'Dialogs' : 'Vcl.Dialogs'
  const legacy = !DELPHI_PROFILES[profile].namespacedUnits
  const hasImageFullscreen = bindings.some((binding) => binding.actions.some((action) => action.type === 'imageFullscreen'))
  const hasCloseApplication = bindings.some((binding) => binding.actions.some((action) => action.type === 'closeApplication'))
  const hasListBoxHelpers = bindings.some((binding) => binding.actions.some((action) => action.type === 'listBoxDeleteSelected' || action.type === 'listBoxClearSelection' || action.type === 'listBoxSelectAll' || action.type === 'listBoxSelectIndex'))
  const hasStringGridHelpers = bindings.some((binding) => binding.actions.some((action) => action.type === 'stringGridClear' || action.type === 'stringGridDeleteCurrentRow'))
  const hasGridSearch = bindings.some((binding) => binding.actions.some((action) => action.type === 'searchGrid' || action.type === 'searchClear'))
  const imageUnits = legacy ? ['Classes', 'Graphics', 'Controls', 'Forms', 'ExtCtrls', 'StdCtrls', 'Buttons'] : ['System.Classes', 'Vcl.Graphics', 'Vcl.Controls', 'Vcl.Forms', 'Vcl.ExtCtrls', 'Vcl.StdCtrls', 'Vcl.Buttons']
  const gridSearchUnits = legacy ? ['SysUtils', 'Classes', 'DB', 'DBGrids'] : ['System.SysUtils', 'System.Classes', 'Data.DB', 'Vcl.DBGrids']
  const units = bindings.flatMap((binding) => binding.actions.flatMap((action) => {
    if (action.type === 'message' || action.type === 'confirm') return [dialogUnit]
    if (action.type === 'closeApplication') return [legacy ? 'Forms' : 'Vcl.Forms', dialogUnit, legacy ? 'StdCtrls' : 'Vcl.StdCtrls']
    if (action.type === 'imageFullscreen') return imageUnits
    if (action.type === 'labelSetFontColor' || action.type === 'labelSetFontStyle' || action.type === 'colorBoxSetSelected') return [legacy ? 'Graphics' : 'Vcl.Graphics']
    if (action.type === 'searchGrid' || action.type === 'searchClear') return gridSearchUnits
    return action.type === 'openForm' ? [action.unitName] : []
  }))
  let content = ensureImplementationUses(pasContent, units)
  content = ensureCloseApplicationHelper(content, hasCloseApplication)
  content = ensureImageFullscreenHelper(content, hasImageFullscreen)
  content = ensureListBoxHelpers(content, hasListBoxHelpers)
  content = ensureStringGridHelpers(content, hasStringGridHelpers)
  content = ensureGridSearchHelper(content, hasGridSearch)
  // Primeiro elimina blocos Pascal de componentes que já não existem no DFM.
  // Isso evita campos residuais não inicializados causarem Access Violation em runtime.
  for (const binding of orphanBindings) content = applyBinding(content, { ...binding, actions: [] })
  for (const binding of bindings) content = applyBinding(content, binding)
  if (orphanBindings.length) {
    const orphanIds = new Set(orphanBindings.map((binding) => binding.id.toLowerCase()))
    document.bindings = document.bindings.filter((binding) => !orphanIds.has(binding.id.toLowerCase()))
    writeDocument(projectDir, document)
  }
  return content
}

export function findNoCodeProjectRoot(dfmPath: string): string {
  let current = dirname(resolve(dfmPath))
  for (let level = 0; level < 8; level += 1) {
    try {
      if (readdirSync(current).some((name) => /\.(?:dproj|dpr|groupproj)$/i.test(name))) return current
    } catch { /* continua */ }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return dirname(resolve(dfmPath))
}
