import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import i18n from '@renderer/i18n'
import {
  Boxes, Clipboard, Copy, Grid3X3, ListOrdered, ListTree, Package, Redo2,
  ImageIcon, RotateCcw, Save, Search, Trash2, TriangleAlert, Undo2, Upload
} from 'lucide-react'
import { parseDfm, type DfmNode } from './dfmParser'
import { updateDfmProperty, type DfmPropertyType } from './DfmEditor'
import { useAppStore } from '@renderer/state/store'
import {
  collectNodes, copyDfmBlocks, findNode, insertAdvancedDfmObject, isInheritedDfm,
  pasteDfmBlocks, readDfmBinaryProperty, readDfmStringListProperty, removeManyDfmObjects, removeManyDfmProperties, updateDfmBinaryProperty, updateDfmCollectionProperty, updateDfmStringListProperty, updateManyDfmProperties
} from './DfmAdvancedEditor'
import './DfmDesignView.css'
import './DfmDesignerEnhanced.css'
import './DfmDesignerAdvanced.css'
import { NoCodeActionsPanel } from './NoCodeActionsPanel'
import { NoCodeMainMenuPanel, type MainMenuItemModel } from './NoCodeMainMenuPanel'
import { DatabaseBindingPanel, type DatabaseBoundComponent, type DatabaseGridColumn } from './DatabaseBindingPanel'
import { DfmPaletteIcon } from './DfmPaletteIcon'
import { propertiesForComponent } from './DfmPropertySchemas'

type Category = 'Padrão' | 'Contêineres' | 'Dados' | 'Não visuais' | 'Frames' | 'Terceiros'
interface PaletteItem {
  className: string
  label: string
  category: Category
  width: number
  height: number
  caption?: boolean
  nonVisual?: boolean
  unitName?: string
  keyword?: 'object' | 'inline'
}

const PALETTE: PaletteItem[] = [
  ['TLabel', 'Label', 'Padrão', 65, 17, true], ['TEdit', 'Edit', 'Padrão', 121, 23],
  ['TBitBtn', 'BitBtn', 'Padrão', 88, 29, true], ['TMemo', 'Memo', 'Padrão', 185, 89],
  ['TCheckBox', 'CheckBox', 'Padrão', 97, 17, true], ['TRadioButton', 'RadioButton', 'Padrão', 105, 17, true],
  ['TComboBox', 'ComboBox', 'Padrão', 145, 24], ['TListBox', 'ListBox', 'Padrão', 121, 97],
  ['TImage', 'Image', 'Padrão', 105, 105], ['TMaskEdit', 'MaskEdit', 'Padrão', 121, 23],
  ['TColorBox', 'ColorBox', 'Padrão', 145, 24], ['TStringGrid', 'StringGrid', 'Padrão', 320, 150],
  ['TMonthCalendar', 'MonthCalendar', 'Padrão', 225, 160], ['TProgressBar', 'ProgressBar', 'Padrão', 150, 23],
  ['TPanel', 'Panel', 'Padrão', 185, 105, true], ['TRadioGroup', 'RadioGroup', 'Padrão', 185, 105, true],
  ['TMainMenu', 'MainMenu', 'Padrão', 48, 48, false, true],
  ['TChart', 'Chart', 'Padrão', 320, 200, false, false, 'VclTee.Chart'],
  ['TGroupBox', 'GroupBox', 'Contêineres', 185, 105, true], ['TPageControl', 'PageControl', 'Contêineres', 289, 193],
  ['TScrollBox', 'ScrollBox', 'Contêineres', 240, 160], ['TDBGrid', 'DBGrid', 'Dados', 321, 145, false, false, 'Vcl.DBGrids'],
  ['TDBEdit', 'DBEdit', 'Dados', 121, 23, false, false, 'Vcl.DBCtrls'], ['TDBMemo', 'DBMemo', 'Dados', 185, 89, false, false, 'Vcl.DBCtrls'],
  ['TDBImage', 'DBImage', 'Dados', 105, 105, false, false, 'Vcl.DBCtrls'], ['TDBRadioGroup', 'DBRadioGroup', 'Dados', 185, 105, true, false, 'Vcl.DBCtrls'],
  ['TDBNavigator', 'DBNavigator', 'Dados', 240, 25, false, false, 'Vcl.DBCtrls'], ['TDBComboBox', 'DBComboBox', 'Dados', 145, 24, false, false, 'Vcl.DBCtrls'],
  ['TDBText', 'DBText', 'Dados', 121, 17, false, false, 'Vcl.DBCtrls'], ['TDBListBox', 'DBListBox', 'Dados', 121, 97, false, false, 'Vcl.DBCtrls'],
  ['TDBCheckBox', 'DBCheckBox', 'Dados', 105, 17, true, false, 'Vcl.DBCtrls'], ['TDBLookupListBox', 'DBLookupListBox', 'Dados', 145, 97, false, false, 'Vcl.DBCtrls'],
  ['TDBCtrlGrid', 'DBCtrlGrid', 'Dados', 320, 180, false, false, 'Vcl.DBCGrids'],
  ['TDataSource', 'DataSource', 'Dados', 48, 48, false, true, 'Data.DB'],
  ['TFDConnection', 'FDConnection', 'Dados', 48, 48, false, true, 'FireDAC.Comp.Client'],
  ['TFDQuery', 'FDQuery', 'Dados', 48, 48, false, true, 'FireDAC.Comp.Client'],
  ['TTimer', 'Timer', 'Não visuais', 48, 48, false, true, 'Vcl.ExtCtrls'],
  ['TXPManifest', 'XPManifest', 'Não visuais', 48, 48, false, true, 'Vcl.XPMan'],
  ['TPopupMenu', 'PopupMenu', 'Não visuais', 48, 48, false, true, 'Vcl.Menus'],
  ['TTrayIcon', 'TrayIcon', 'Não visuais', 48, 48, false, true, 'Vcl.ExtCtrls'],
  ['TActionManager', 'ActionManager', 'Não visuais', 48, 48, false, true, 'Vcl.ActnMan'],
  ['TBalloonHint', 'BalloonHint', 'Não visuais', 48, 48, false, true, 'Vcl.Controls'],
  ['TOpenDialog', 'OpenDialog', 'Não visuais', 48, 48, false, true, 'Vcl.Dialogs'],
  ['TOpenPictureDialog', 'OpenPictureDialog', 'Não visuais', 48, 48, false, true, 'Vcl.ExtDlgs'],
  ['TSaveDialog', 'SaveDialog', 'Não visuais', 48, 48, false, true, 'Vcl.Dialogs'],
  ['TPrintDialog', 'PrintDialog', 'Não visuais', 48, 48, false, true, 'Vcl.Dialogs'],
  ['TActionList', 'ActionList', 'Não visuais', 48, 48, false, true, 'Vcl.ActnList']
].map(([className, label, category, width, height, caption, nonVisual, unitName]) => ({
  className, label, category, width, height, caption, nonVisual, unitName
} as PaletteItem))

const NON_VISUAL = new Set(PALETTE.filter((item) => item.nonVisual).map((item) => item.className))
const CONTAINERS = new Set(['TForm', 'TPanel', 'TGroupBox', 'TPageControl', 'TTabSheet', 'TScrollBox', 'TFrame', 'TDBCtrlGrid'])
const COLORS: Record<string, string> = {
  clBtnFace: '#f0f0f0', clWindow: '#ffffff', clWhite: '#ffffff', clBlack: '#000000',
  clRed: '#ff0000', clGreen: '#008000', clBlue: '#0000ff', clYellow: '#ffff00',
  clGray: '#808080', clSilver: '#c0c0c0', clNavy: '#000080', clWindowText: '#000000',
  clBtnText: '#000000', clSkyBlue: '#a6caf0', clMoneyGreen: '#c0dcc0', clNone: 'transparent'
}

function numberProp(node: DfmNode, key: string, fallback: number): number {
  const value = Number(node.properties[key])
  return Number.isFinite(value) ? value : fallback
}
function labelOf(node: DfmNode): string { return node.properties.Caption ?? node.properties.Text ?? node.properties.Hint ?? '' }
function colorOf(value: string | undefined, fallback: string): string { return value ? COLORS[value] ?? fallback : fallback }
function nextName(root: DfmNode, className: string): string {
  const base = className.replace(/^T/, '') || 'Component'
  const used = new Set(collectNodes(root).map((node) => node.name.toLowerCase()))
  let index = 1
  while (used.has(`${base}${index}`.toLowerCase())) index += 1
  return `${base}${index}`
}
function snap(value: number, enabled: boolean): number { return Math.max(0, enabled ? Math.round(value / 8) * 8 : Math.round(value)) }

interface DfmLayoutBounds { left: number; top: number; width: number; height: number }

function alignedLayout(nodes: DfmNode[], parentWidth: number, parentHeight: number): Map<string, DfmLayoutBounds> {
  const result = new Map<string, DfmLayoutBounds>()
  const remaining = { left: 0, top: 0, right: Math.max(0, parentWidth), bottom: Math.max(0, parentHeight) }
  const raw = (node: DfmNode): DfmLayoutBounds => ({
    left: numberProp(node, 'Left', 0), top: numberProp(node, 'Top', 0),
    width: numberProp(node, 'Width', 75), height: numberProp(node, 'Height', 25)
  })
  nodes.forEach((node) => result.set(node.name, raw(node)))
  const docked = nodes.filter((node) => /^(?:alTop|alBottom|alLeft|alRight)$/i.test(node.properties.Align ?? ''))
  const clients = nodes.filter((node) => /^alClient$/i.test(node.properties.Align ?? ''))
  for (const node of [...docked, ...clients]) {
    const current = raw(node)
    const availableWidth = Math.max(0, remaining.right - remaining.left)
    const availableHeight = Math.max(0, remaining.bottom - remaining.top)
    switch ((node.properties.Align ?? '').toLowerCase()) {
      case 'altop':
        result.set(node.name, { left: remaining.left, top: remaining.top, width: availableWidth, height: current.height })
        remaining.top = Math.min(remaining.bottom, remaining.top + current.height)
        break
      case 'albottom':
        result.set(node.name, { left: remaining.left, top: Math.max(remaining.top, remaining.bottom - current.height), width: availableWidth, height: current.height })
        remaining.bottom = Math.max(remaining.top, remaining.bottom - current.height)
        break
      case 'alleft':
        result.set(node.name, { left: remaining.left, top: remaining.top, width: current.width, height: availableHeight })
        remaining.left = Math.min(remaining.right, remaining.left + current.width)
        break
      case 'alright':
        result.set(node.name, { left: Math.max(remaining.left, remaining.right - current.width), top: remaining.top, width: current.width, height: availableHeight })
        remaining.right = Math.max(remaining.left, remaining.right - current.width)
        break
      case 'alclient':
        result.set(node.name, { left: remaining.left, top: remaining.top, width: availableWidth, height: availableHeight })
        break
    }
  }
  return result
}

function isVisual(node: DfmNode): boolean { return !NON_VISUAL.has(node.className) && node.properties.Left !== undefined }
function supportsTabOrder(className: string): boolean {
  return !/^(?:TLabel|TImage|TShape|TBevel|TPaintBox|TSpeedButton|TDBText)$/i.test(className)
}
function mainMenuShortcut(value: string): number | null {
  const clean = value.trim()
  if (!clean) return null
  if (/^\d+$/.test(clean)) return Math.max(0, Math.min(65535, Number(clean)))
  const parts = clean.toUpperCase().split('+').map((part) => part.trim()).filter(Boolean)
  let result = 0
  const keyNames: Record<string, number> = { ENTER: 13, ESC: 27, ESCAPE: 27, SPACE: 32, PGUP: 33, PGDN: 34, END: 35, HOME: 36, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, INSERT: 45, DELETE: 46 }
  let key = 0
  for (const part of parts) {
    if (part === 'CTRL' || part === 'CONTROL') result |= 0x4000
    else if (part === 'SHIFT') result |= 0x2000
    else if (part === 'ALT') result |= 0x8000
    else if (/^F(?:[1-9]|1\d|2[0-4])$/.test(part)) key = 111 + Number(part.slice(1))
    else if (part.length === 1) key = part.charCodeAt(0)
    else if (keyNames[part]) key = keyNames[part]
    else return null
  }
  return key ? result | key : null
}

function supportsColor(className: string): boolean { return /^(?:TForm|TPanel|TEdit|TMemo|TMaskEdit|TComboBox|TListBox|TStringGrid|TColorBox|TGroupBox|TRadioGroup|TCheckBox|TRadioButton|TChart)$/i.test(className) }
function propType(name: string, value: string): DfmPropertyType | null {
  if (/^-?\d+$/.test(value)) return 'number'
  if (/^(True|False)$/i.test(value)) return 'boolean'
  if (/^(Caption|Text|Hint)$/i.test(name)) return 'string'
  if (/^\[(?:[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)?\]$/.test(value)) return 'set'
  if (/^[A-Za-z_$][A-Za-z0-9_.$]*$/.test(value)) return 'identifier'
  return null
}

const picturePreviewCache = new Map<string, string | null>()

function pictureCacheKey(hex: string): string {
  return hex
}
function cachePicturePreview(hex: string, previewDataUrl: string): void {
  picturePreviewCache.set(pictureCacheKey(hex), previewDataUrl)
}

function glyphDataUrl(hex: string | null): string | null {
  if (!hex || hex.length < 12) return null
  const cacheKey = pictureCacheKey(hex)
  if (picturePreviewCache.has(cacheKey)) return picturePreviewCache.get(cacheKey) ?? null
  const raw = hex.slice(8)
  if (!raw.startsWith('424D')) return null
  const bytes = new Uint8Array(Math.floor(raw.length / 2))
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(raw.slice(index * 2, index * 2 + 2), 16)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
  const result = `data:image/bmp;base64,${btoa(binary)}`
  picturePreviewCache.set(cacheKey, result)
  return result
}

function pictureDataUrl(hex: string | null): string | null {
  if (!hex || hex.length < 4) return null
  const cacheKey = pictureCacheKey(hex)
  if (picturePreviewCache.has(cacheKey)) return picturePreviewCache.get(cacheKey) ?? null
  const classLength = Number.parseInt(hex.slice(0, 2), 16)
  const classHexEnd = 2 + classLength * 2
  if (!Number.isFinite(classLength) || hex.length <= classHexEnd) return null
  let className = ''
  for (let index = 2; index < classHexEnd; index += 2) className += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16))
  const raw = hex.slice(classHexEnd)
  const mime = /JPEG/i.test(className) ? 'image/jpeg' : /Png/i.test(className) ? 'image/png' : /Bitmap/i.test(className) ? 'image/bmp' : null
  if (!mime) return null
  const bytes = new Uint8Array(Math.floor(raw.length / 2))
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(raw.slice(index * 2, index * 2 + 2), 16)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
  }
  const result = `data:${mime};base64,${btoa(binary)}`
  picturePreviewCache.set(cacheKey, result)
  if (picturePreviewCache.size > 24) picturePreviewCache.delete(picturePreviewCache.keys().next().value as string)
  return result
}

function ControlContent({ node, imageSrc }: { node: DfmNode; imageSrc?: string | null }): JSX.Element | null {
  const text = labelOf(node)
  const className = node.className
  if (/Label|StaticText|DBText/.test(className)) return <span className="dfm-label-preview">{text || node.name}</span>
  if (/Button|BitBtn/.test(className) && !/RadioButton/.test(className)) return <span className="dfm-btn-content" style={{ gap: Math.max(0, numberProp(node, 'Spacing', 4)) }}>{imageSrc && <img src={imageSrc} alt="" />}<span className="dfm-btn-text">{text || node.name}</span></span>
  if (/CheckBox/.test(className)) {
    const checked = /^(?:True|cbChecked)$/i.test(node.properties.Checked ?? node.properties.State ?? '')
    const grayed = /^cbGrayed$/i.test(node.properties.State ?? '')
    return <span className="dfm-check-row"><span className={`dfm-check-indicator${checked ? ' checked' : ''}${grayed ? ' grayed' : ''}`}>{checked || grayed ? '✓' : ''}</span><span>{text || node.name}</span></span>
  }
  if (/RadioButton/.test(className)) {
    const checked = /^True$/i.test(node.properties.Checked ?? '')
    const disabled = node.properties.Enabled === 'False'
    return <span className={`dfm-check-row dfm-radio-row${disabled ? ' disabled' : ''}`}><span className={`dfm-radio-indicator${checked ? ' checked' : ''}`}>{checked && <i />}</span><span className="dfm-radio-caption">{text || node.name}</span></span>
  }
  if (/RadioGroup/.test(className)) {
    const selectedIndex = numberProp(node, 'ItemIndex', -1)
    const disabled = node.properties.Enabled === 'False'
    return <><span className="dfm-group-caption">{text || node.name}</span><div className={`dfm-radio-group-preview${disabled ? ' disabled' : ''}`}><span><i className={selectedIndex === 0 ? 'selected' : ''} />{i18n.t('dfmDesigner.option1')}</span><span><i className={selectedIndex === 1 ? 'selected' : ''} />{i18n.t('dfmDesigner.option2')}</span></div></>
  }
  if (/GroupBox/.test(className)) return <span className="dfm-group-caption">{text || node.name}</span>
  if (/Panel/.test(className)) {
    const alignment = (node.properties.Alignment ?? 'taCenter').toLowerCase()
    return text ? <span className={`dfm-group-caption dfm-panel-caption ${alignment}`}>{text}</span> : null
  }
  if (/MaskEdit/.test(className)) return <span className="dfm-edit-text">{text || node.properties.EditMask?.split(';')[0]?.replace(/[09LlaAcC#]/g, '_') || ''}</span>
  if (/^(?:TEdit|TDBEdit)$/i.test(className)) return <span className="dfm-edit-text">{text}</span>
  if (/Memo/.test(className)) return <span className="dfm-memo-text">{text || i18n.t('dfmDesigner.memoDefault')}</span>
  if (/ComboBox|DBLookupComboBox/.test(className)) {
    const disabled = node.properties.Enabled === 'False'
    const selectionOnly = node.properties.Style === 'csDropDownList'
    return <span className={`dfm-combo-row${disabled ? ' disabled' : ''}${selectionOnly ? ' selection-only' : ''}`}><span className={`dfm-combo-text${text ? '' : ' empty'}`}>{text}</span><span className="dfm-combo-button" aria-hidden="true" /></span>
  }
  if (/ColorBox/.test(className)) {
    const selected = node.properties.Selected ?? 'clBlack'
    const disabled = node.properties.Enabled === 'False'
    return <span className={`dfm-combo-row${disabled ? ' disabled' : ''}`}><span className="dfm-color-value"><i style={{ background: colorOf(selected, '#000') }} /><span>{selected}</span></span><span className="dfm-combo-button" aria-hidden="true" /></span>
  }
  if (/ListBox|DBLookupListBox/.test(className)) return <div className="dfm-list-preview"><span>{text || i18n.t('dfmDesigner.item1')}</span><span>{i18n.t('dfmDesigner.item2')}</span><span>{i18n.t('dfmDesigner.item3')}</span></div>
  if (/DBNavigator/.test(className)) return <div className="dfm-db-navigator-preview"><span>|◀</span><span>◀</span><span>▶</span><span>▶|</span><span>＋</span><span>−</span><span>✓</span><span>×</span><span>↻</span></div>
  if (/DBCtrlGrid/.test(className)) return <div className="dfm-dbctrlgrid-preview"><span><b>{i18n.t('dfmDesigner.record1')}</b><i /></span><span><b>{i18n.t('dfmDesigner.record2')}</b><i /></span><span><b>{i18n.t('dfmDesigner.record3')}</b><i /></span></div>
  if (/StringGrid|DrawGrid|DBGrid/.test(className)) {
    const cols = Math.max(2, Math.min(6, numberProp(node, 'ColCount', 5)))
    const rows = Math.max(2, Math.min(6, numberProp(node, 'RowCount', 5)))
    const fixedCols = Math.max(0, numberProp(node, 'FixedCols', 1))
    const fixedRows = Math.max(0, numberProp(node, 'FixedRows', 1))
    return <div className="dfm-grid-preview" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{Array.from({ length: cols * rows }, (_, index) => { const row = Math.floor(index / cols), col = index % cols, fixed = row < fixedRows || col < fixedCols; return <span key={index} className={fixed ? 'fixed' : ''}>{fixed ? (row === 0 && col > 0 ? `Col ${col}` : col === 0 && row > 0 ? String(row) : '') : ''}</span> })}</div>
  }
  if (/MonthCalendar/.test(className)) {
    const now = new Date(), month = now.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
    const days = i18n.t('dfmDesigner.weekdayLetters', { returnObjects: true }) as string[]
    return <div className="dfm-calendar-preview"><header><button>‹</button><span>{month}</span><button>›</button></header><div className="dfm-calendar-grid">{days.map((day, index) => <b key={`h${index}`}>{day}</b>)}{Array.from({ length: 35 }, (_, index) => <span key={index} className={index + 1 === now.getDate() ? 'today' : ''}>{index + 1 <= 31 ? index + 1 : ''}</span>)}</div></div>
  }
  if (/ProgressBar/.test(className)) {
    const minimum = numberProp(node, 'Min', 0), maximum = numberProp(node, 'Max', 100), position = numberProp(node, 'Position', 35)
    const progress = maximum > minimum ? Math.max(0, Math.min(100, ((position - minimum) / (maximum - minimum)) * 100)) : 0
    return <span className="dfm-progress-track"><i style={{ width: `${progress}%` }} /></span>
  }
  if (/Chart/.test(className)) return <div className="dfm-chart-preview"><div className="dfm-chart-title">{text || 'TChart'}</div><svg viewBox="0 0 240 120" preserveAspectRatio="none"><line x1="25" y1="8" x2="25" y2="100" /><line x1="25" y1="100" x2="232" y2="100" /><polyline points="25,90 65,62 105,78 145,35 185,52 228,18" /><circle cx="65" cy="62" r="2" /><circle cx="145" cy="35" r="2" /><circle cx="228" cy="18" r="2" /></svg></div>
  if (/PageControl/.test(className)) return <div className="dfm-page-preview"><span className="active">TabSheet1</span><span>TabSheet2</span><div /></div>
  if (/ScrollBox/.test(className)) return <div className="dfm-scrollbox-preview"><div /><span className="vertical">▲<i />▼</span><span className="horizontal">◀<i />▶</span><b /></div>
  if (/Image/.test(className)) return imageSrc ? <img className="dfm-image-preview" src={imageSrc} alt={node.name} /> : <span className="dfm-image-empty-preview">▧<small>{i18n.t('dfmDesigner.image')}</small></span>
  return text ? <span>{text}</span> : <span className="dfm-generic-component">{className}</span>
}

function ControlBox({ node, layout, selected, snapToGrid, imageSources, onSelect, onMove, onResize }: {
  node: DfmNode
  layout?: DfmLayoutBounds
  selected: Set<string>
  snapToGrid: boolean
  imageSources: Record<string, string | null>
  onSelect: (node: DfmNode, additive: boolean) => void
  onMove: (node: DfmNode, dx: number, dy: number) => void
  onResize: (node: DfmNode, width: number, height: number) => void
}): JSX.Element {
  const left = layout?.left ?? numberProp(node, 'Left', 0), top = layout?.top ?? numberProp(node, 'Top', 0)
  const width = layout?.width ?? numberProp(node, 'Width', 75), height = layout?.height ?? numberProp(node, 'Height', 25)
  const hasAlign = !/^alNone$/i.test(node.properties.Align ?? 'alNone')
  const [preview, setPreview] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const gesture = useRef<{ x: number; y: number; mode: 'move' | 'resize' } | null>(null)
  const selectedHere = selected.has(node.name)
  const style: CSSProperties = {
    position: 'absolute', left: left + preview.x, top: top + preview.y,
    width: Math.max(8, width + preview.w), height: Math.max(8, height + preview.h),
    opacity: node.properties.Visible === 'False' ? 0.45 : node.properties.Enabled === 'False' ? 0.65 : 1,
    backgroundColor: node.properties.Color ? colorOf(node.properties.Color, 'transparent') : undefined,
    fontFamily: node.properties['Font.Name'] || undefined,
    fontSize: node.properties['Font.Height'] ? Math.max(8, Math.min(32, Math.abs(Number(node.properties['Font.Height'])) || 12)) : undefined,
    color: node.properties['Font.Color'] ? colorOf(node.properties['Font.Color'], '#000') : undefined,
    fontWeight: (node.properties['Font.Style'] ?? '').includes('fsBold') ? 600 : undefined,
    fontStyle: (node.properties['Font.Style'] ?? '').includes('fsItalic') ? 'italic' : undefined,
    textDecoration: (node.properties['Font.Style'] ?? '').includes('fsUnderline') ? 'underline' : (node.properties['Font.Style'] ?? '').includes('fsStrikeOut') ? 'line-through' : undefined
  }
  const begin = (event: ReactPointerEvent<HTMLDivElement>, mode: 'move' | 'resize'): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelect(node, event.ctrlKey || event.metaKey || event.shiftKey)
    if (hasAlign) return
    gesture.current = { x: event.clientX, y: event.clientY, mode }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const visualChildren = node.children.filter(isVisual)
  const childLayouts = alignedLayout(visualChildren, width, height)
  return <div
    className={`dfm-control dfm-${node.className.replace(/^T/, '').toLowerCase()}${node.properties.BevelOuter ? ` dfm-bevel-${node.properties.BevelOuter.toLowerCase()}` : ''}${node.properties.BorderStyle ? ` dfm-border-${node.properties.BorderStyle.toLowerCase()}` : ''}${hasAlign ? ' dfm-aligned-control' : ''}${node.properties.Default === 'True' ? ' dfm-default-button' : ''}${node.properties.WordWrap === 'True' ? ' dfm-word-wrap' : ''}${node.properties.Layout ? ` dfm-glyph-${node.properties.Layout.toLowerCase()}` : ''}${selectedHere ? ' selected multi-selected' : ''}`}
    style={style} title={`${node.className} (${node.name})`}
    onPointerDown={(event) => begin(event, 'move')}
    onPointerMove={(event) => {
      if (!gesture.current) return
      const dx = event.clientX - gesture.current.x, dy = event.clientY - gesture.current.y
      setPreview(gesture.current.mode === 'move' ? { x: dx, y: dy, w: 0, h: 0 } : { x: 0, y: 0, w: dx, h: dy })
    }}
    onPointerUp={(event) => {
      if (!gesture.current) return
      const dx = event.clientX - gesture.current.x, dy = event.clientY - gesture.current.y
      if (gesture.current.mode === 'move') onMove(node, snap(left + dx, snapToGrid) - left, snap(top + dy, snapToGrid) - top)
      else onResize(node, Math.max(8, snap(width + dx, snapToGrid)), Math.max(8, snap(height + dy, snapToGrid)))
      gesture.current = null
      setPreview({ x: 0, y: 0, w: 0, h: 0 })
    }}>
    <ControlContent node={node} imageSrc={imageSources[node.name]} />
    {visualChildren.map((child) => <ControlBox key={child.name} node={child} layout={childLayouts.get(child.name)} selected={selected} snapToGrid={snapToGrid} imageSources={imageSources} onSelect={onSelect} onMove={onMove} onResize={onResize} />)}
    {selectedHere && <div className="dfm-resize-handle" onPointerDown={(event) => begin(event, 'resize')} />}
  </div>
}

function Field({ label, value, type, options, onCommit }: {
  label: string; value: string; type: DfmPropertyType; options?: string[]; onCommit: (value: string, type: DfmPropertyType) => void
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return <label className="dfm-property-row"><span>{label}</span>{options
    ? <select value={draft} onChange={(event) => { setDraft(event.target.value); onCommit(event.target.value, type) }}>{options.map((option) => <option key={option}>{option}</option>)}</select>
    : <input type={type === 'number' ? 'number' : 'text'} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => draft !== value && onCommit(draft, type)} onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()} />}</label>
}

function BitBtnGlyphEditor({ preview, onChange }: { preview: string | null; onChange: (hexData: string | null, previewDataUrl?: string | null) => void }): JSX.Element {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const choose = async (): Promise<void> => {
    if (busy) return
    setBusy(true); setStatus(t('dfmDesigner.convertingGlyph'))
    try {
      const selected = await window.api.nocode.selectGlyph() as { glyphData: string; previewDataUrl: string; fileName: string; width: number; height: number } | null
      if (!selected) { setStatus(''); return }
      onChange(selected.glyphData, selected.previewDataUrl)
      setStatus(t('dfmDesigner.glyphEmbedded', { fileName: selected.fileName, width: selected.width, height: selected.height }))
    } catch (error) { setStatus(t('dfmDesigner.errorPrefix', { message: error instanceof Error ? error.message : String(error) })) }
    finally { setBusy(false) }
  }
  return <section className="dfm-bitbtn-glyph-editor">
    <div className="dfm-property-section">{t('dfmDesigner.icon')}</div>
    <div className="dfm-glyph-preview">{preview ? <img src={preview} alt={t('dfmDesigner.buttonGlyphAlt')} /> : <span><ImageIcon size={18} />{t('dfmDesigner.noIcon')}</span>}</div>
    <div className="dfm-glyph-buttons"><button onClick={() => void choose()} disabled={busy}><Upload size={12} />{busy ? t('common.loading') : t('mainMenuPanel.upload')}</button><button onClick={() => { onChange(null, null); setStatus(t('dfmDesigner.iconRemoved')) }} disabled={busy || !preview}><Trash2 size={12} />{t('mainMenuPanel.remove')}</button></div>
    {status && <small>{status}</small>}
  </section>
}

function Inspector({ node, rootName, rootOnCreate, selectionCount, dfmPath, formClass, components, imageDataUrl, onImageData, onGlyphData, onImageDisplayMode, comboBoxItems, onComboBoxItems, listBoxItems, onListBoxItems, radioGroupItems, onRadioGroupItems, dbRadioItems, dbRadioValues, onDbRadioItems, onStringGridImport, mainMenuItems, onMainMenuItems, onDatabaseProperties, onProperty }: {
  node: DfmNode; rootName: string; rootOnCreate: string; selectionCount: number; dfmPath: string; formClass: string
  components: DatabaseBoundComponent[]; imageDataUrl?: string | null
  onImageData: (hexData: string | null, previewDataUrl?: string | null) => void
  onGlyphData: (hexData: string | null, previewDataUrl?: string | null) => void
  onImageDisplayMode: (mode: 'natural' | 'proportional' | 'fill') => void
  comboBoxItems: string[]
  onComboBoxItems: (items: string[], binding?: { eventName: string; methodName: string }) => void
  listBoxItems: string[]
  onListBoxItems: (items: string[]) => void
  radioGroupItems: string[]
  onRadioGroupItems: (items: string[]) => void
  dbRadioItems: string[]
  dbRadioValues: string[]
  onDbRadioItems: (items: string[], values: string[]) => void
  onStringGridImport: (cols: number, rows: number, methodName: string) => void; mainMenuItems: MainMenuItemModel[]; onMainMenuItems: (items: MainMenuItemModel[]) => void
  onDatabaseProperties: (changes: Array<{ property: string; value: string | boolean }>, columns?: DatabaseGridColumn[]) => void
  onProperty: (property: string, value: string, type: DfmPropertyType) => void
}): JSX.Element {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'properties' | 'actions'>('properties')
  const [filter, setFilter] = useState('')
  const root = node.name === rootName
  const nonVisualComponent = NON_VISUAL.has(node.className)
  const componentProperties = propertiesForComponent(node.className)
  const componentPropertyNames = new Set(componentProperties.map((property) => property.name))
  const normalizedFilter = filter.trim().toLowerCase()
  const visibleComponentProperties = componentProperties.filter((property) => `${property.label} ${property.name} ${property.section}`.toLowerCase().includes(normalizedFilter))
  const componentSections = [...new Set(visibleComponentProperties.map((property) => property.section))]
  const preferred = new Set(['Caption', 'Text', 'Left', 'Top', 'Width', 'Height', 'ClientWidth', 'ClientHeight', 'Visible', 'Enabled', 'Color', 'Align', 'TabOrder', ...componentPropertyNames])
  const extras = Object.entries(node.properties).filter(([name, value]) => !preferred.has(name) && !/^On/.test(name) && !/\.Data$/i.test(name) && name.toLowerCase().includes(filter.toLowerCase()) && propType(name, value)).sort(([a], [b]) => a.localeCompare(b))
  return <aside className="dfm-inspector dfm-advanced-inspector">
    <div className="dfm-inspector-title">Object Inspector</div>
    <div className="dfm-selected-component"><span>{selectionCount > 1 ? t('dfmDesigner.componentsCount', { count: selectionCount }) : node.name}</span><small>{selectionCount > 1 ? t('dfmDesigner.multipleSelection') : node.className}</small></div>
    <div className="dfm-inspector-tabs"><button className={mode === 'properties' ? 'active' : ''} onClick={() => setMode('properties')}>{t('dfmDesigner.properties')}</button><button className={mode === 'actions' ? 'active' : ''} onClick={() => setMode('actions')}>{t('dfmDesigner.actions')}</button></div>
    {mode !== 'actions' && <label className="dfm-inspector-search"><Search size={11} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('dfmDesigner.filterEllipsis')} /></label>}
    {mode === 'actions'
      ? selectionCount > 1
        ? <div className="dfm-inspector-note">{t('dfmDesigner.selectOnlyOneComponent')}</div>
        : /^TMainMenu$/i.test(node.className) ? <NoCodeMainMenuPanel dfmPath={dfmPath} formClass={formClass} componentName={node.name} menuItems={mainMenuItems} components={components} onMenuChange={onMainMenuItems} /> : /^TDB(?:Grid|Edit|Memo|Image|RadioGroup|Navigator|ComboBox|Text|ListBox|CheckBox|LookupListBox|CtrlGrid)$/i.test(node.className) ? <DatabaseBindingPanel component={{ name: node.name, className: node.className }} components={components} properties={node.properties} onApply={onDatabaseProperties} dbRadioItems={dbRadioItems} dbRadioValues={dbRadioValues} onDbRadioItems={onDbRadioItems} /> : <NoCodeActionsPanel dfmPath={dfmPath} formClass={formClass} component={{ name: node.name, className: node.className }} components={components} imageDataUrl={imageDataUrl} onImageData={onImageData} imageDisplayMode={node.properties.Stretch === 'True' ? (node.properties.Proportional === 'True' ? 'proportional' : 'fill') : 'natural'} onImageDisplayMode={onImageDisplayMode} comboBoxItems={comboBoxItems} onComboBoxItems={onComboBoxItems} listBoxItems={listBoxItems} onListBoxItems={onListBoxItems} radioGroupItems={radioGroupItems} onRadioGroupItems={onRadioGroupItems} maskEditMask={node.properties.EditMask ?? ''} onMaskEditMask={(mask) => onProperty('EditMask', mask, 'string')} formCreateMethod={rootOnCreate || `${rootName}Create`} onStringGridImport={onStringGridImport} onBindEvent={(eventName, methodName) => onProperty(eventName, methodName, 'identifier')} />
      : <>
        {(root || /Label|Button|BitBtn|CheckBox|RadioButton|RadioGroup|GroupBox|Panel|MenuItem/.test(node.className)) && <Field label="Caption" value={node.properties.Caption ?? ''} type="string" onCommit={(v, t) => onProperty('Caption', v, t)} />}
        {!root && !nonVisualComponent && <><Field label="Left" value={node.properties.Left ?? '0'} type="number" onCommit={(v, t) => onProperty('Left', v, t)} /><Field label="Top" value={node.properties.Top ?? '0'} type="number" onCommit={(v, t) => onProperty('Top', v, t)} /></>}
        {!nonVisualComponent && <><Field label="Width" value={node.properties[root ? 'ClientWidth' : 'Width'] ?? '75'} type="number" onCommit={(v, t) => onProperty(root ? 'ClientWidth' : 'Width', v, t)} /><Field label="Height" value={node.properties[root ? 'ClientHeight' : 'Height'] ?? '25'} type="number" onCommit={(v, t) => onProperty(root ? 'ClientHeight' : 'Height', v, t)} />{!root && supportsTabOrder(node.className) && <Field label="TabOrder" value={node.properties.TabOrder ?? '0'} type="number" onCommit={(v, t) => onProperty('TabOrder', v, t)} />}<Field label="Visible" value={node.properties.Visible ?? 'True'} type="boolean" options={['True', 'False']} onCommit={(v, t) => onProperty('Visible', v, t)} /><Field label="Enabled" value={node.properties.Enabled ?? 'True'} type="boolean" options={['True', 'False']} onCommit={(v, t) => onProperty('Enabled', v, t)} /></>}
        {supportsColor(node.className) && <Field label="Color" value={node.properties.Color ?? 'clBtnFace'} type="identifier" options={Object.keys(COLORS)} onCommit={(v, t) => onProperty('Color', v, t)} />}
        {componentSections.map((section) => <div className="dfm-specific-property-group" key={section}>
          <div className="dfm-property-section">{section}</div>
          {visibleComponentProperties.filter((property) => property.section === section).map((property) => <Field key={property.name} label={property.label} value={node.properties[property.name] ?? property.defaultValue} type={property.type} options={property.options} onCommit={(value, type) => onProperty(property.name, value, type)} />)}
        </div>)}
        {/^TBitBtn$/i.test(node.className) && selectionCount === 1 && <BitBtnGlyphEditor preview={imageDataUrl ?? null} onChange={onGlyphData} />}
        {extras.map(([name, value]) => <Field key={name} label={name} value={value} type={propType(name, value)!} onCommit={(v, t) => onProperty(name, v, t)} />)}
      </>}
  </aside>
}

export function DfmDesignView({ filePath, content, dirty, onChange, onSave, onRestore }: {
  filePath: string; content: string; dirty: boolean; onChange: (content: string) => void; onSave: () => Promise<void>; onRestore: () => Promise<void>
}): JSX.Element {
  const { t } = useTranslation()
  const categoryLabel = (category: Category): string => ({
    'Padrão': t('dfmDesigner.categoryStandard'), 'Contêineres': t('dfmDesigner.categoryContainers'),
    'Dados': t('dfmDesigner.categoryData'), 'Não visuais': t('dfmDesigner.categoryNonVisual'),
    'Frames': t('dfmDesigner.categoryFrames'), 'Terceiros': t('dfmDesigner.categoryThirdParty')
  }[category])
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [leftView, setLeftView] = useState<'palette' | 'tree' | 'tab'>('palette')
  const [filter, setFilter] = useState('')
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [saving, setSaving] = useState(false)
  const [clipboard, setClipboard] = useState<string[]>([])
  const [catalog, setCatalog] = useState<PaletteItem[]>([])
  const { projectDir, buildPlatform, buildConfig } = useAppStore()
  useEffect(() => {
    let active = true
    if (!projectDir) { setCatalog([]); return () => { active = false } }
    window.api.libraries.componentCatalog({ projectPath: projectDir, platform: buildPlatform, config: buildConfig })
      .then((items) => {
        if (!active) return
        setCatalog((items as PaletteItem[]).filter((item) => !PALETTE.some((core) => core.className.toLowerCase() === item.className.toLowerCase())).map((item) => ({ ...item, caption: false })))
      })
      .catch(() => active && setCatalog([]))
    return () => { active = false }
  }, [projectDir, buildPlatform, buildConfig])
  const undoStack = useRef<string[]>([]), redoStack = useRef<string[]>([])
  const [, refreshHistory] = useState(0)
  useEffect(() => {
    setSelectedNames([])
    undoStack.current = []
    redoStack.current = []
    refreshHistory((value) => value + 1)
  }, [filePath])
  const parsed = useMemo(() => { try { return { node: parseDfm(content), error: '' } } catch (error) { return { node: null, error: (error as Error).message } } }, [content])
  useEffect(() => {
    if (!parsed.node) return
    let next = content
    let normalized = false
    collectNodes(parsed.node).forEach((node) => {
      if (/^TPanel$/i.test(node.className) && node.properties.Color && node.properties.Color !== 'clBtnFace' && node.properties.ParentBackground === undefined) {
        next = updateDfmProperty(next, node.name, 'ParentBackground', 'False', 'boolean')
        normalized = true
      }
    })
    const menus = parsed.node.children.filter((node) => /^TMainMenu$/i.test(node.className))
    if (menus.length && !menus.some((menu) => menu.name === parsed.node?.properties.Menu)) {
      next = updateDfmProperty(next, parsed.node.name, 'Menu', menus[0].name, 'identifier')
      normalized = true
    }
    if (normalized) onChange(next)
  }, [content, onChange, parsed.node])
  if (!parsed.node) return <div className="dfm-fallback"><TriangleAlert size={22} /><div>{t('dfmDesigner.cannotRender')}</div><div>{parsed.error}</div></div>
  const root = parsed.node
  const names = selectedNames.length ? selectedNames : [root.name]
  const primary = findNode(root, names[names.length - 1]) ?? root
  const selected = new Set(names)
  const nodes = collectNodes(root)
  const imageSources = Object.fromEntries(nodes.filter((node) => /^(?:TImage|TBitBtn)$/i.test(node.className)).map((node) => [node.name, /^TBitBtn$/i.test(node.className) ? glyphDataUrl(readDfmBinaryProperty(content, node.name, 'Glyph.Data')) : pictureDataUrl(readDfmBinaryProperty(content, node.name, 'Picture.Data'))]))
  const visual = root.children.filter(isVisual)
  const nonVisual = nodes.filter((node) => !/^TMenuItem$/i.test(node.className) && (NON_VISUAL.has(node.className) || (!isVisual(node) && node.name !== root.name)))
  const attachedMainMenu = root.children.find((node) => /^TMainMenu$/i.test(node.className) && node.name === root.properties.Menu) ?? root.children.find((node) => /^TMainMenu$/i.test(node.className))
  const attachedMainMenuItems = attachedMainMenu?.children.filter((node) => /^TMenuItem$/i.test(node.className)) ?? []
  const width = numberProp(root, 'ClientWidth', numberProp(root, 'Width', 600)), height = numberProp(root, 'ClientHeight', numberProp(root, 'Height', 400))
  const rootLayouts = alignedLayout(visual, width, height)
  const tabNodes = nodes.filter((node) => node.name !== root.name && isVisual(node) && node.properties.TabStop !== 'False' && supportsTabOrder(node.className) && !/(?:Panel|GroupBox|StatusBar)$/i.test(node.className)).sort((a, b) => numberProp(a, 'TabOrder', 9999) - numberProp(b, 'TabOrder', 9999))

  const commit = (next: string): void => {
    if (next === content) return
    undoStack.current.push(content)
    if (undoStack.current.length > 100) undoStack.current.shift()
    redoStack.current = []
    onChange(next)
    refreshHistory((value) => value + 1)
  }
  const undo = (): void => { const previous = undoStack.current.pop(); if (!previous) return; redoStack.current.push(content); onChange(previous); refreshHistory((v) => v + 1) }
  const redo = (): void => { const next = redoStack.current.pop(); if (!next) return; undoStack.current.push(content); onChange(next); refreshHistory((v) => v + 1) }
  const selectNode = (node: DfmNode, additive = false): void => setSelectedNames((current) => additive ? (current.includes(node.name) ? current.filter((name) => name !== node.name) : [...current.filter((name) => name !== root.name), node.name]) : [node.name])
  const setMany = (changes: Array<{ name: string; property: string; value: string | number | boolean }>): void => commit(updateManyDfmProperties(content, changes))
  const moveSelection = (anchor: DfmNode, dx: number, dy: number): void => {
    const targets = selected.has(anchor.name) ? names : [anchor.name]
    setMany(targets.flatMap((name) => { const node = findNode(root, name); return node && node.name !== root.name ? [{ name, property: 'Left', value: snap(numberProp(node, 'Left', 0) + dx, snapToGrid) }, { name, property: 'Top', value: snap(numberProp(node, 'Top', 0) + dy, snapToGrid) }] : [] }))
  }
  const add = (item: PaletteItem): void => {
    const parent = !item.nonVisual && CONTAINERS.has(primary.className) ? primary : root
    const name = nextName(root, item.className), offset = 16 + (parent.children.length % 10) * 8
    const properties: Record<string, string | number | boolean> = item.nonVisual ? {} : { Left: offset, Top: offset, Width: item.width, Height: item.height }
    if (!item.nonVisual && supportsTabOrder(item.className)) properties.TabOrder = parent.children.length
    if (item.caption) properties.Caption = item.label
    let next = insertAdvancedDfmObject(content, item.nonVisual ? root.name : parent.name, { name, className: item.className, keyword: item.keyword, properties })
    if (/^TMainMenu$/i.test(item.className)) next = updateDfmProperty(next, root.name, 'Menu', name, 'identifier')
    commit(next)
    setSelectedNames([name])
  }
  const removeSelected = (): void => {
    const removable = names.filter((name) => name !== root.name)
    if (!removable.length || !window.confirm(t('dfmDesigner.removeComponentsConfirm', { count: removable.length }))) return
    let next = removeManyDfmObjects(content, removable)
    if (removable.some((name) => name === root.properties.Menu)) next = removeManyDfmProperties(next, [root.name], 'Menu')
    commit(next); setSelectedNames([root.name])
  }
  const copy = (): void => setClipboard(copyDfmBlocks(content, names.filter((name) => name !== root.name)))
  const paste = (): void => { const result = pasteDfmBlocks(content, CONTAINERS.has(primary.className) ? primary.name : root.name, clipboard); commit(result.content); if (result.names.length) setSelectedNames(result.names) }
  const align = (kind: 'left' | 'right' | 'top' | 'bottom' | 'hcenter' | 'vcenter' | 'sameWidth' | 'sameHeight'): void => {
    const targets = names.map((name) => findNode(root, name)).filter((node): node is DfmNode => Boolean(node && node.name !== root.name && isVisual(node)))
    if (targets.length < 2) return
    const anchor = targets[targets.length - 1], changes: Array<{ name: string; property: string; value: number }> = []
    targets.slice(0, -1).forEach((node) => {
      if (kind === 'left') changes.push({ name: node.name, property: 'Left', value: numberProp(anchor, 'Left', 0) })
      if (kind === 'right') changes.push({ name: node.name, property: 'Left', value: numberProp(anchor, 'Left', 0) + numberProp(anchor, 'Width', 0) - numberProp(node, 'Width', 0) })
      if (kind === 'top') changes.push({ name: node.name, property: 'Top', value: numberProp(anchor, 'Top', 0) })
      if (kind === 'bottom') changes.push({ name: node.name, property: 'Top', value: numberProp(anchor, 'Top', 0) + numberProp(anchor, 'Height', 0) - numberProp(node, 'Height', 0) })
      if (kind === 'hcenter') changes.push({ name: node.name, property: 'Left', value: numberProp(anchor, 'Left', 0) + Math.round((numberProp(anchor, 'Width', 0) - numberProp(node, 'Width', 0)) / 2) })
      if (kind === 'vcenter') changes.push({ name: node.name, property: 'Top', value: numberProp(anchor, 'Top', 0) + Math.round((numberProp(anchor, 'Height', 0) - numberProp(node, 'Height', 0)) / 2) })
      if (kind === 'sameWidth') changes.push({ name: node.name, property: 'Width', value: numberProp(anchor, 'Width', 75) })
      if (kind === 'sameHeight') changes.push({ name: node.name, property: 'Height', value: numberProp(anchor, 'Height', 25) })
    }); setMany(changes)
  }
  const distribute = (axis: 'horizontal' | 'vertical'): void => {
    const targets = names.map((name) => findNode(root, name)).filter((node): node is DfmNode => Boolean(node && isVisual(node))).sort((a, b) => numberProp(a, axis === 'horizontal' ? 'Left' : 'Top', 0) - numberProp(b, axis === 'horizontal' ? 'Left' : 'Top', 0))
    if (targets.length < 3) return
    const pos = axis === 'horizontal' ? 'Left' : 'Top', size = axis === 'horizontal' ? 'Width' : 'Height'
    const first = numberProp(targets[0], pos, 0), last = numberProp(targets[targets.length - 1], pos, 0) + numberProp(targets[targets.length - 1], size, 0)
    const total = targets.reduce((sum, node) => sum + numberProp(node, size, 0), 0), gap = (last - first - total) / (targets.length - 1)
    let cursor = first
    setMany(targets.slice(1, -1).map((node) => { cursor += numberProp(targets[targets.indexOf(node) - 1], size, 0) + gap; return { name: node.name, property: pos, value: Math.round(cursor) } }))
  }
  const reorderTab = (name: string, direction: -1 | 1): void => {
    const index = tabNodes.findIndex((node) => node.name === name), next = index + direction
    if (index < 0 || next < 0 || next >= tabNodes.length) return
    const reordered = [...tabNodes]; [reordered[index], reordered[next]] = [reordered[next], reordered[index]]
    setMany(reordered.map((node, order) => ({ name: node.name, property: 'TabOrder', value: order })))
  }
  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).matches('input, select, textarea')) return
    const ctrl = event.ctrlKey || event.metaKey
    if (ctrl && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return }
    if (ctrl && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
    if (ctrl && event.key.toLowerCase() === 'c') { event.preventDefault(); copy(); return }
    if (ctrl && event.key.toLowerCase() === 'v') { event.preventDefault(); paste(); return }
    if (event.key === 'Delete') { event.preventDefault(); removeSelected(); return }
    const delta = event.shiftKey ? 8 : 1, dirs: Record<string, [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] }
    if (dirs[event.key] && primary.name !== root.name) { event.preventDefault(); moveSelection(primary, ...dirs[event.key]) }
  }
  const visiblePalette = [...PALETTE, ...catalog].filter((item) => `${item.label} ${item.className}`.toLowerCase().includes(filter.toLowerCase()))

  return <div className="dfm-designer-layout dfm-enhanced dfm-advanced" tabIndex={0} onKeyDown={keyDown}>
    <aside className="dfm-left-panel"><div className="dfm-left-tabs advanced"><button className={leftView === 'palette' ? 'active' : ''} onClick={() => setLeftView('palette')}><Boxes size={12} />{t('dfmDesigner.palette')}</button><button className={leftView === 'tree' ? 'active' : ''} onClick={() => setLeftView('tree')}><ListTree size={12} />{t('dfmDesigner.structure')}</button><button className={leftView === 'tab' ? 'active' : ''} onClick={() => setLeftView('tab')}><ListOrdered size={12} />{t('dfmDesigner.tabulation')}</button></div>
      {leftView === 'palette' && <div className="dfm-palette"><label className="dfm-palette-search"><Search size={12} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('dfmDesigner.searchComponent')} /></label>{(['Padrão', 'Contêineres', 'Dados', 'Não visuais', 'Frames', 'Terceiros'] as Category[]).map((category) => { const items = visiblePalette.filter((item) => item.category === category); return items.length ? <section key={category}><div className="dfm-palette-category">{categoryLabel(category)}</div><div className="dfm-palette-items">{items.map((item) => <button key={`${item.category}-${item.className}`} onClick={() => add(item)} title={`${item.className}${item.unitName ? ` · ${item.unitName}` : ''}`}><DfmPaletteIcon className={item.className} /><span>{item.className}</span></button>)}</div></section> : null })}</div>}
      {leftView === 'tree' && <div className="dfm-tree">{nodes.map((node) => <button key={node.name} className={`dfm-tree-node${selected.has(node.name) ? ' active' : ''}`} onClick={(event) => selectNode(node, event.ctrlKey || event.shiftKey)}><span>{node.name}</span><small>{node.className}</small></button>)}</div>}
      {leftView === 'tab' && <div className="dfm-tab-order"><div className="dfm-side-help">{t('dfmDesigner.tabOrderHint')}</div>{tabNodes.map((node, index) => <div key={node.name} className={selected.has(node.name) ? 'active' : ''} onClick={() => selectNode(node)}><span>{index}</span><label>{node.name}<small>{node.className}</small></label><button disabled={index === 0} onClick={(event) => { event.stopPropagation(); reorderTab(node.name, -1) }}>↑</button><button disabled={index === tabNodes.length - 1} onClick={(event) => { event.stopPropagation(); reorderTab(node.name, 1) }}>↓</button></div>)}</div>}
    </aside>
    <div className="dfm-design-scroll"><div className="dfm-design-toolbar"><span>{isInheritedDfm(content) ? t('dfmDesigner.inheritedForm') : t('dfmDesigner.realDfm')} · {t('dfmDesigner.ctrlClickMultiSelect')}</span><div className="dfm-design-actions">
      <button disabled={!undoStack.current.length} onClick={undo} title={t('dfmDesigner.visualUndo')}><Undo2 size={13} /></button><button disabled={!redoStack.current.length} onClick={redo} title={t('dfmDesigner.visualRedo')}><Redo2 size={13} /></button>
      <button disabled={primary.name === root.name} onClick={copy} title={t('dfmDesigner.copy')}><Copy size={13} /></button><button disabled={!clipboard.length} onClick={paste} title={t('dfmDesigner.paste')}><Clipboard size={13} /></button>
      <button className={snapToGrid ? 'active' : ''} onClick={() => setSnapToGrid((value) => !value)} title={t('dfmDesigner.gridSnapHint')}><Grid3X3 size={13} />{t('dfmDesigner.grid')}</button>
      <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value={0.75}>75%</option><option value={1}>100%</option><option value={1.25}>125%</option><option value={1.5}>150%</option></select>
      <button disabled={names.length < 2 || primary.name === root.name} onClick={() => align('left')}>{t('dfmDesigner.alignLeft')}</button><button disabled={names.length < 2} onClick={() => align('right')}>{t('dfmDesigner.alignRight')}</button><button disabled={names.length < 2} onClick={() => align('hcenter')}>{t('dfmDesigner.alignHCenter')}</button><button disabled={names.length < 2} onClick={() => align('top')}>{t('dfmDesigner.alignTop')}</button><button disabled={names.length < 2} onClick={() => align('bottom')}>{t('dfmDesigner.alignBottom')}</button><button disabled={names.length < 2} onClick={() => align('vcenter')}>{t('dfmDesigner.alignVCenter')}</button><button disabled={names.length < 2} onClick={() => align('sameWidth')}>{t('dfmDesigner.sameWidth')}</button><button disabled={names.length < 2} onClick={() => align('sameHeight')}>{t('dfmDesigner.sameHeight')}</button>
      <button disabled={names.length < 3} onClick={() => distribute('horizontal')}>{t('dfmDesigner.distributeH')}</button><button disabled={names.length < 3} onClick={() => distribute('vertical')}>{t('dfmDesigner.distributeV')}</button>
      <button disabled={!names.some((name) => name !== root.name)} onClick={removeSelected}><Trash2 size={13} /></button><button onClick={onRestore}><RotateCcw size={13} /></button><button disabled={!dirty || saving} onClick={async () => { setSaving(true); try { await onSave() } finally { setSaving(false) } }}><Save size={13} />{saving ? t('editor.saving') : t('common.save')}</button>
    </div></div>
      <div className="dfm-zoom-stage" style={{ minWidth: width * zoom + 40, minHeight: height * zoom + 100 }}><div className="dfm-zoom-content" style={{ transform: `scale(${zoom})` }}><div className="dfm-form-titlebar" style={{ width }} onClick={() => setSelectedNames([root.name])}>{labelOf(root) || root.name}{isInheritedDfm(content) && <span className="dfm-inherited-badge">{t('dfmDesigner.inherited')}</span>}</div>{attachedMainMenu && <div className="dfm-main-menu-preview" style={{ width }}>{attachedMainMenuItems.map((item) => { const icon = glyphDataUrl(readDfmBinaryProperty(content, item.name, 'Bitmap.Data')); return <span key={item.name}>{icon && <img src={icon} alt="" />}{labelOf(item) || item.name}</span> })}</div>}<div className={`dfm-form-surface${selected.has(root.name) ? ' selected' : ''}`} style={{ width, height, background: colorOf(root.properties.Color, '#f0f0f0') }} onPointerDown={() => setSelectedNames([root.name])}>{visual.map((node) => <ControlBox key={node.name} node={node} layout={rootLayouts.get(node.name)} selected={selected} snapToGrid={snapToGrid} imageSources={imageSources} onSelect={selectNode} onMove={moveSelection} onResize={(item, w, h) => setMany([{ name: item.name, property: 'Width', value: w }, { name: item.name, property: 'Height', value: h }])} />)}</div></div>
        {!!nonVisual.length && <div className="dfm-tray"><div className="dfm-tray-label">{t('dfmDesigner.nonVisualComponents')}</div><div className="dfm-tray-items">{nonVisual.map((node) => <button key={node.name} className={`dfm-tray-item${selected.has(node.name) ? ' active' : ''}`} onClick={(event) => selectNode(node, event.ctrlKey)}><Package size={14} />{node.name}<small>{node.className}</small></button>)}</div></div>}
      </div>
    </div>
    <Inspector node={primary} rootName={root.name} rootOnCreate={root.properties.OnCreate ?? ''} selectionCount={names.length} dfmPath={filePath} formClass={root.className} components={nodes.filter((item) => !/^TMenuItem$/i.test(item.className)).map((item) => ({ name: item.name, className: item.className, properties: item.properties }))} imageDataUrl={imageSources[primary.name]} onImageData={(hexData, previewDataUrl) => { if (hexData && previewDataUrl) cachePicturePreview(hexData, previewDataUrl); commit(updateDfmBinaryProperty(content, primary.name, 'Picture.Data', hexData)) }} onGlyphData={(hexData, previewDataUrl) => { if (hexData && previewDataUrl) cachePicturePreview(hexData, previewDataUrl); let next = updateDfmBinaryProperty(content, primary.name, 'Glyph.Data', hexData); if (hexData) next = updateDfmProperty(next, primary.name, 'NumGlyphs', '1', 'number'); commit(next) }} onImageDisplayMode={(mode) => setMany([{ name: primary.name, property: 'Stretch', value: mode !== 'natural' }, { name: primary.name, property: 'Proportional', value: mode === 'proportional' }, { name: primary.name, property: 'Center', value: true }])} comboBoxItems={readDfmStringListProperty(content, primary.name, 'Items.Strings')} onComboBoxItems={(items, binding) => { let next = updateDfmStringListProperty(content, primary.name, 'Items.Strings', items); if (binding) { if (binding.methodName) next = updateDfmProperty(next, primary.name, binding.eventName, binding.methodName, 'identifier'); else next = removeManyDfmProperties(next, [primary.name], binding.eventName) } commit(next) }} listBoxItems={readDfmStringListProperty(content, primary.name, 'Items.Strings')} onListBoxItems={(items) => commit(updateDfmStringListProperty(content, primary.name, 'Items.Strings', items))} radioGroupItems={readDfmStringListProperty(content, primary.name, 'Items.Strings')} onRadioGroupItems={(items) => commit(updateDfmStringListProperty(content, primary.name, 'Items.Strings', items))} dbRadioItems={readDfmStringListProperty(content, primary.name, 'Items.Strings')} dbRadioValues={readDfmStringListProperty(content, primary.name, 'Values.Strings')} onDbRadioItems={(items, values) => { let next = updateDfmStringListProperty(content, primary.name, 'Items.Strings', items); next = updateDfmStringListProperty(next, primary.name, 'Values.Strings', values); commit(next) }} onStringGridImport={(cols, rows, methodName) => { let next = updateDfmProperty(content, primary.name, 'ColCount', String(Math.max(1, cols)), 'number'); next = updateDfmProperty(next, primary.name, 'RowCount', String(Math.max(1, rows)), 'number'); next = updateDfmProperty(next, root.name, 'OnCreate', methodName, 'identifier'); commit(next) }} mainMenuItems={primary.children.filter((item) => /^TMenuItem$/i.test(item.className)).map(function toMenu(item): MainMenuItemModel { return { name: item.name, caption: labelOf(item) || item.name, enabled: item.properties.Enabled !== 'False', checked: item.properties.Checked === 'True', autoCheck: item.properties.AutoCheck === 'True', radioItem: item.properties.RadioItem === 'True', groupIndex: numberProp(item, 'GroupIndex', 0), shortcut: item.properties.ShortCut ?? '', iconData: readDfmBinaryProperty(content, item.name, 'Bitmap.Data') ?? undefined, iconPreviewDataUrl: glyphDataUrl(readDfmBinaryProperty(content, item.name, 'Bitmap.Data')) ?? undefined, children: item.children.filter((child) => /^TMenuItem$/i.test(child.className)).map(toMenu) } })} onMainMenuItems={(items) => { let next = removeManyDfmObjects(content, primary.children.filter((item) => /^TMenuItem$/i.test(item.className)).map((item) => item.name)); next = updateDfmProperty(next, root.name, 'Menu', primary.name, 'identifier'); const insertMenu = (parentName: string, entries: MainMenuItemModel[]): void => { entries.forEach((entry) => { const hasAction = Boolean(entry.action && entry.action.type !== 'none'); next = insertAdvancedDfmObject(next, parentName, { name: entry.name, className: 'TMenuItem', properties: { Caption: entry.caption, Enabled: entry.enabled, Checked: entry.checked, AutoCheck: entry.autoCheck, RadioItem: entry.radioItem, GroupIndex: entry.groupIndex, ...(mainMenuShortcut(entry.shortcut) !== null ? { ShortCut: mainMenuShortcut(entry.shortcut)! } : {}), ...(hasAction ? { OnClick: `${entry.name}Click` } : {}) } }); if (entry.iconData) { next = updateDfmBinaryProperty(next, entry.name, 'Bitmap.Data', entry.iconData); if (entry.iconPreviewDataUrl) cachePicturePreview(entry.iconData, entry.iconPreviewDataUrl) }; insertMenu(entry.name, entry.children) }) }; insertMenu(primary.name, items); commit(next) }} onDatabaseProperties={(changes, columns) => { let next = content; changes.forEach(({ property, value }) => { const raw = String(value); const type: DfmPropertyType = /^(?:DataField|KeyField|ListField|ValueChecked|ValueUnchecked)$/i.test(property) ? 'string' : typeof value === 'boolean' ? 'boolean' : /^\[.*\]$/.test(raw) ? 'set' : 'identifier'; next = updateDfmProperty(next, primary.name, property, raw, type) }); if (columns && /^TDBGrid$/i.test(primary.className)) { next = updateDfmCollectionProperty(next, primary.name, 'Columns', columns.map((column) => ({ properties: [{ name: 'FieldName', value: column.fieldName, type: 'string' }, { name: 'Title.Caption', value: column.title, type: 'string' }, { name: 'Width', value: String(column.width), type: 'number' }, { name: 'Alignment', value: column.alignment, type: 'identifier' }, { name: 'ReadOnly', value: String(column.readOnly), type: 'boolean' }, { name: 'Visible', value: 'True', type: 'boolean' }] }))) } commit(next) }} onProperty={(property, value, type) => {
      const targets = names.filter((name) => property !== 'Caption' || name === primary.name)
      if (/^On[A-Z]/.test(property) && !value.trim()) {
        commit(removeManyDfmProperties(content, targets, property))
        return
      }
      let next = content
      targets.forEach((name) => {
        next = updateDfmProperty(next, name, property, value, type)
        const targetNode = findNode(root, name)
        if (property === 'Color' && /^TPanel$/i.test(targetNode?.className ?? '')) {
          next = updateDfmProperty(next, name, 'ParentBackground', 'False', 'boolean')
        }
        if (/^Font\./.test(property) && !/^TMainMenu$/i.test(targetNode?.className ?? '')) {
          next = updateDfmProperty(next, name, 'ParentFont', 'False', 'boolean')
        }
      })
      commit(next)
    }} />
  </div>
}
