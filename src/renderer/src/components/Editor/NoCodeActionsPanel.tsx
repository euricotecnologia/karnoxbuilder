import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, FileSpreadsheet, Image as ImageIcon, Plus, Save, Trash2, Upload, Workflow } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import './NoCodeActionsPanel.css'

type Action =
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

interface FormInfo { unitName: string; formClass: string; filePath: string }
interface ComponentInfo { name: string; className: string }
interface ActionOption { type: Action['type']; label: string }

function getActionGroups(t: (key: string) => string): Record<string, ActionOption[]> {
  const a = (type: Action['type'], key: string): ActionOption => ({ type, label: t(`actionsPanel.actions.${key}`) })
  return {
    GENERAL_ACTIONS: [
      a('message', 'message'), a('confirm', 'confirm'),
      a('openForm', 'openForm'), a('closeForm', 'closeForm'),
      a('closeApplication', 'closeApplication'),
      a('setProperty', 'setProperty'),
      a('searchGrid', 'searchGrid'), a('searchClear', 'searchClear')
    ],
    IMAGE_ACTIONS: [
      a('imageFullscreen', 'imageFullscreen'),
      a('imageClear', 'imageClear'),
      a('imageShow', 'imageShow'),
      a('imageHide', 'imageHide'),
      a('imageToggleVisible', 'toggleVisibility'),
      a('imageTransfer', 'imageTransfer')
    ],
    LABEL_ACTIONS: [
      a('labelSetCaption', 'setText'),
      a('labelClear', 'clearText'),
      a('labelShow', 'labelShow'),
      a('labelHide', 'labelHide'),
      a('labelToggleVisible', 'toggleVisibility'),
      a('labelSetFontColor', 'setFontColor'),
      a('labelSetFontSize', 'setFontSize'),
      a('labelSetFontStyle', 'setFontStyle'),
      a('labelSetAlignment', 'setAlignment')
    ],
    MEMO_ACTIONS: [
      a('memoSetText', 'setContent'),
      a('memoAddLine', 'addLine'),
      a('memoClear', 'clearContent'),
      a('memoFocus', 'focus'),
      a('memoSelectAll', 'selectAllText'),
      a('memoCopy', 'copyText'),
      a('memoCut', 'cutText'),
      a('memoPaste', 'pasteText'),
      a('memoSetReadOnly', 'setReadOnly'),
      a('memoToggleReadOnly', 'toggleReadOnly'),
      a('memoSetWordWrap', 'setWordWrap'),
      a('memoTransfer', 'transferContent')
    ],
    CHECKBOX_ACTIONS: [
      a('checkBoxSetCaption', 'setText'),
      a('checkBoxSetChecked', 'setCheckedUnchecked'),
      a('checkBoxToggle', 'toggleCheckedUnchecked'),
      a('checkBoxSetState', 'setState'),
      a('checkBoxSetAllowGrayed', 'allowIndeterminate'),
      a('checkBoxSetEnabled', 'enableDisable'),
      a('checkBoxSetVisible', 'showHide'),
      a('checkBoxFocus', 'focus'),
      a('checkBoxTransfer', 'transferState')
    ],
    RADIO_BUTTON_ACTIONS: [
      a('radioButtonSetCaption', 'setText'),
      a('radioButtonSetChecked', 'setSelectedUnselected'),
      a('radioButtonSelect', 'selectOption'),
      a('radioButtonClear', 'clearOption'),
      a('radioButtonSetEnabled', 'enableDisable'),
      a('radioButtonSetVisible', 'showHide'),
      a('radioButtonFocus', 'focus'),
      a('radioButtonTransfer', 'transferSelection')
    ],
    COMBO_BOX_ACTIONS: [
      a('comboBoxSetText', 'setTextAtRuntime'),
      a('comboBoxClearItems', 'clearAllItems'),
      a('comboBoxDeleteSelected', 'deleteSelectedItem'),
      a('comboBoxSelectText', 'selectItemByText'),
      a('comboBoxSelectIndex', 'selectItemByIndex'),
      a('comboBoxClearSelection', 'clearSelection'),
      a('comboBoxSetSorted', 'setAutoSort'),
      a('comboBoxFocus', 'focus'),
      a('comboBoxOpenDropDown', 'openDropDown'),
      a('comboBoxTransfer', 'transferSelectedValue')
    ],
    LIST_BOX_ACTIONS: [
      a('listBoxAddItem', 'addItemAtRuntime'),
      a('listBoxClearItems', 'clearAllItems'),
      a('listBoxDeleteSelected', 'deleteSelectedItems'),
      a('listBoxSelectText', 'selectItemByText'),
      a('listBoxSelectIndex', 'selectItemByIndex'),
      a('listBoxClearSelection', 'clearSelection'),
      a('listBoxSelectAll', 'selectAll'),
      a('listBoxSetMultiSelect', 'setMultiSelect'),
      a('listBoxSetSorted', 'setAutoSort'),
      a('listBoxFocus', 'focus'),
      a('listBoxTransfer', 'transferSelectedItem')
    ],
    COLOR_BOX_ACTIONS: [
      a('colorBoxSetSelected', 'selectAColor'),
      a('colorBoxApplyColor', 'applyColorToOther'),
      a('colorBoxFocus', 'focus'),
      a('colorBoxSetEnabled', 'enableDisable'),
      a('colorBoxSetVisible', 'showHide')
    ],
    STRING_GRID_ACTIONS: [
      a('stringGridSetCell', 'fillCell'),
      a('stringGridSelectCell', 'selectCell'),
      a('stringGridClear', 'clearGridData'),
      a('stringGridAddRow', 'addRow'),
      a('stringGridDeleteCurrentRow', 'deleteCurrentRow'),
      a('stringGridSetDimensions', 'setRowsAndColumns'),
      a('stringGridSetFixed', 'setFixedHeaders'),
      a('stringGridFocus', 'focus'),
      a('stringGridTransferCell', 'transferSelectedCell')
    ],
    PANEL_ACTIONS: [
      a('panelSetCaption', 'setTitle'), a('panelSetColor', 'setBackgroundColor'),
      a('panelShow', 'showPanel'), a('panelHide', 'hidePanel'),
      a('panelSetEnabled', 'enableDisable'), a('panelBringToFront', 'bringToFront')
    ],
    CALENDAR_ACTIONS: [
      a('calendarToday', 'selectToday'), a('calendarAddDays', 'advanceOrGoBackDays'),
      a('calendarGoToDate', 'goToSpecificDate'),
      a('calendarSetMinDate', 'setMinDate'), a('calendarSetMaxDate', 'setMaxDate'),
      a('calendarSetEnabled', 'enableDisable')
    ],
    PROGRESS_ACTIONS: [
      a('progressSetPosition', 'setProgress'), a('progressAdvance', 'advanceProgress'),
      a('progressReset', 'resetProgress'), a('progressSetState', 'setVisualState'),
      a('progressSetRange', 'setMinMax')
    ],
    RADIO_GROUP_ACTIONS: [
      a('radioGroupSelectIndex', 'selectOption'), a('radioGroupClear', 'clearSelection'),
      a('radioGroupNext', 'selectNextOption'), a('radioGroupSetEnabled', 'enableDisable')
    ],
    CHART_ACTIONS: [
      a('chartRefresh', 'refreshChart'), a('chartClear', 'clearAllSeries'),
      a('chartAddPoint', 'addValueToSeries'), a('chartClearSeries', 'clearSpecificSeries'),
      a('chartSetLegend', 'showHideLegend'), a('chartSet3D', 'toggle3D'),
      a('chartSetVisible', 'showHideChart')
    ],
    EDIT_ACTIONS: [
      a('editSetText', 'fillText'),
      a('editClear', 'clearField'),
      a('editFocus', 'focus'),
      a('editSelectAll', 'selectAllText'),
      a('editCopy', 'copyText'),
      a('editCut', 'cutText'),
      a('editPaste', 'pasteText'),
      a('editTransfer', 'transferToAnotherField')
    ]
  }
}

function componentActions(className: string, groups: Record<string, ActionOption[]>): ActionOption[] {
  if (/^TPanel$/i.test(className)) return [...groups.PANEL_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TMonthCalendar$/i.test(className)) return [...groups.CALENDAR_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TProgressBar$/i.test(className)) return [...groups.PROGRESS_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TRadioGroup$/i.test(className)) return [...groups.RADIO_GROUP_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TChart$/i.test(className)) return [...groups.CHART_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TLabel$/i.test(className)) return [...groups.LABEL_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TMemo$/i.test(className)) return [...groups.MEMO_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TCheckBox$/i.test(className)) return [...groups.CHECKBOX_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TRadioButton$/i.test(className)) return [...groups.RADIO_BUTTON_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TComboBox$/i.test(className)) return [...groups.COMBO_BOX_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TListBox$/i.test(className)) return [...groups.LIST_BOX_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TColorBox$/i.test(className)) return [...groups.COLOR_BOX_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^TStringGrid$/i.test(className)) return [...groups.STRING_GRID_ACTIONS, ...groups.GENERAL_ACTIONS]
  if (/^T(?:Edit|MaskEdit)$/i.test(className)) return [...groups.EDIT_ACTIONS, ...groups.GENERAL_ACTIONS]
  return /TImage$/i.test(className) ? [...groups.IMAGE_ACTIONS, ...groups.GENERAL_ACTIONS] : groups.GENERAL_ACTIONS
}
function componentEvents(className: string): string[] {
  if (/TTimer$/i.test(className)) return ['OnTimer']
  if (/TMainMenu$/i.test(className)) return ['OnChange']
  if (/TMenuItem$/i.test(className)) return ['OnClick']
  if (/TColorBox$/i.test(className)) return ['OnChange', 'OnClick', 'OnEnter', 'OnExit']
  if (/TMonthCalendar$/i.test(className)) return ['OnChange', 'OnClick', 'OnDblClick', 'OnEnter', 'OnExit']
  if (/TProgressBar$/i.test(className)) return ['OnEnter', 'OnExit']
  if (/TStringGrid$/i.test(className)) return ['OnClick', 'OnDblClick', 'OnEnter', 'OnExit', 'OnKeyDown', 'OnKeyPress']
  if (/TChart$/i.test(className)) return ['OnClick', 'OnDblClick', 'OnMouseDown', 'OnMouseUp', 'OnMouseMove']
  if (/TImage$/i.test(className)) return ['OnClick', 'OnDblClick', 'OnMouseDown', 'OnMouseUp', 'OnMouseMove']
  if (/TLabel$/i.test(className)) return ['OnClick', 'OnDblClick', 'OnMouseDown', 'OnMouseUp', 'OnMouseMove']
  if (/T(?:Button|BitBtn)|TCheckBox|TRadioButton|TRadioGroup/i.test(className)) return ['OnClick', 'OnEnter', 'OnExit', 'OnKeyDown', 'OnKeyPress']
  if (/TEdit|TMaskEdit|TMemo|TComboBox|TListBox/i.test(className)) return ['OnChange', 'OnEnter', 'OnExit', 'OnKeyDown', 'OnKeyPress']
  return ['OnClick', 'OnDblClick', 'OnEnter', 'OnExit']
}
function initialAction(type: Action['type'], forms: FormInfo[], components: ComponentInfo[]): Action {
  if (type === 'message') return { type, message: 'Operação realizada com sucesso.' }
  if (type === 'confirm') return { type, message: 'Deseja continuar?' }
  if (type === 'openForm') return { type, unitName: forms[0]?.unitName ?? '', formClass: forms[0]?.formClass ?? '', modal: true }
  if (type === 'setProperty') return { type, target: components[0]?.name ?? '', property: 'Caption', value: 'Novo texto' }
  if (type === 'searchGrid') return { type, grid: components.find((item) => /^TDBGrid$/i.test(item.className))?.name ?? '', sourceEdit: components.find((item) => /^T(?:Edit|MaskEdit)$/i.test(item.className))?.name ?? '', fields: '' }
  if (type === 'searchClear') return { type, grid: components.find((item) => /^TDBGrid$/i.test(item.className))?.name ?? '', sourceEdit: components.find((item) => /^T(?:Edit|MaskEdit)$/i.test(item.className))?.name ?? '' }
  if (type === 'panelSetCaption') return { type, value: 'Painel' }
  if (type === 'panelSetColor') return { type, value: 'clBtnFace' }
  if (type === 'panelSetEnabled' || type === 'calendarSetEnabled' || type === 'radioGroupSetEnabled' || type === 'chartSetLegend' || type === 'chartSet3D' || type === 'chartSetVisible') return { type, value: true }
  if (type === 'calendarAddDays') return { type, value: 1 }
  if (type === 'calendarGoToDate' || type === 'calendarSetMinDate' || type === 'calendarSetMaxDate') { const today = new Date(); return { type, day: today.getDate(), month: today.getMonth() + 1, year: type === 'calendarGoToDate' ? today.getFullYear() : 0 } }
  if (type === 'progressSetPosition') return { type, value: 50 }
  if (type === 'progressAdvance') return { type, value: 10 }
  if (type === 'progressSetState') return { type, value: 'normal' }
  if (type === 'progressSetRange') return { type, min: 0, max: 100 }
  if (type === 'radioGroupSelectIndex') return { type, value: 0 }
  if (type === 'imageTransfer') return { type, target: '' }
  if (type === 'chartAddPoint') return { type, target: '', label: '', value: 0 }
  if (type === 'chartClearSeries') return { type, target: '' }
  if (type === 'editSetText') return { type, value: '' }
  if (type === 'editTransfer') return { type, target: '' }
  if (type === 'labelSetCaption') return { type, value: 'Novo texto' }
  if (type === 'labelSetFontColor') return { type, value: 'clWindowText' }
  if (type === 'labelSetFontSize') return { type, value: 10 }
  if (type === 'labelSetFontStyle') return { type, value: 'bold' }
  if (type === 'labelSetAlignment') return { type, value: 'left' }
  if (type === 'memoSetText') return { type, value: '' }
  if (type === 'memoAddLine') return { type, value: '' }
  if (type === 'memoSetReadOnly') return { type, value: true }
  if (type === 'memoSetWordWrap') return { type, value: true }
  if (type === 'memoTransfer') return { type, target: '' }
  if (type === 'checkBoxSetCaption') return { type, value: 'Nova opção' }
  if (type === 'checkBoxSetChecked') return { type, value: true }
  if (type === 'checkBoxSetState') return { type, value: 'checked' }
  if (type === 'checkBoxSetAllowGrayed') return { type, value: true }
  if (type === 'checkBoxSetEnabled') return { type, value: true }
  if (type === 'checkBoxSetVisible') return { type, value: true }
  if (type === 'checkBoxTransfer') return { type, target: '' }
  if (type === 'radioButtonSetCaption') return { type, value: 'Nova opção' }
  if (type === 'radioButtonSetChecked') return { type, value: true }
  if (type === 'radioButtonSetEnabled') return { type, value: true }
  if (type === 'radioButtonSetVisible') return { type, value: true }
  if (type === 'radioButtonTransfer') return { type, target: '' }
  if (type === 'comboBoxSetText') return { type, value: '' }
  if (type === 'comboBoxSetItems') return { type, value: 'Opção 1\nOpção 2' }
  if (type === 'comboBoxAddItem') return { type, value: 'Nova opção' }
  if (type === 'comboBoxSelectText') return { type, value: '' }
  if (type === 'comboBoxSelectIndex') return { type, value: 0 }
  if (type === 'comboBoxSetSorted') return { type, value: true }
  if (type === 'comboBoxTransfer') return { type, target: '' }
  if (type === 'listBoxAddItem') return { type, value: 'Novo item' }
  if (type === 'listBoxSelectText') return { type, value: '' }
  if (type === 'listBoxSelectIndex') return { type, value: 0 }
  if (type === 'listBoxSetMultiSelect') return { type, value: true }
  if (type === 'listBoxSetSorted') return { type, value: true }
  if (type === 'listBoxTransfer') return { type, target: '' }
  if (type === 'colorBoxSetSelected') return { type, value: 'clBlue' }
  if (type === 'colorBoxApplyColor') return { type, target: '', property: 'Color' }
  if (type === 'colorBoxSetEnabled' || type === 'colorBoxSetVisible') return { type, value: true }
  if (type === 'stringGridSetCell') return { type, col: 0, row: 0, value: '' }
  if (type === 'stringGridSelectCell') return { type, col: 0, row: 0 }
  if (type === 'stringGridSetDimensions') return { type, cols: 5, rows: 5 }
  if (type === 'stringGridSetFixed') return { type, cols: 1, rows: 1 }
  if (type === 'stringGridTransferCell') return { type, target: '' }
  return { type } as Action
}
function actionLabel(type: Action['type'], options: ActionOption[]): string { return options.find((item) => item.type === type)?.label ?? type }

export function NoCodeActionsPanel({ dfmPath, formClass, component, components, imageDataUrl, onImageData, imageDisplayMode, onImageDisplayMode, comboBoxItems, onComboBoxItems, listBoxItems, onListBoxItems, radioGroupItems, onRadioGroupItems, maskEditMask, onMaskEditMask, formCreateMethod, onStringGridImport, onBindEvent }: {
  dfmPath: string; formClass: string; component: ComponentInfo; components: ComponentInfo[]; imageDataUrl?: string | null
  onImageData: (hexData: string | null, previewDataUrl?: string | null) => void
  imageDisplayMode: 'natural' | 'proportional' | 'fill'
  onImageDisplayMode: (mode: 'natural' | 'proportional' | 'fill') => void
  comboBoxItems: string[]
  onComboBoxItems: (items: string[], binding?: { eventName: string; methodName: string }) => void
  listBoxItems: string[]
  onListBoxItems: (items: string[]) => void
  radioGroupItems: string[]
  onRadioGroupItems: (items: string[]) => void
  maskEditMask: string
  onMaskEditMask: (mask: string) => void
  formCreateMethod: string
  onStringGridImport: (cols: number, rows: number, methodName: string) => void
  onBindEvent: (eventName: string, methodName: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const actionGroups = useMemo(() => getActionGroups(t), [t])
  const projectDir = useAppStore((state) => state.projectDir)
  const projectFileTree = useAppStore((state) => state.fileTree)
  const delphiProfile = useAppStore((state) => state.delphiProfile)
  const options = useMemo(() => componentActions(component.className, actionGroups), [component.className, actionGroups])
  const events = useMemo(() => componentEvents(component.className), [component.className])
  const [eventName, setEventName] = useState(events[0])
  const [newType, setNewType] = useState<Action['type']>(options[0].type)
  const [actions, setActions] = useState<Action[]>([])
  const [forms, setForms] = useState<FormInfo[]>([])
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [comboItemsDraft, setComboItemsDraft] = useState('')
  const [listItemsDraft, setListItemsDraft] = useState('')
  const [radioItemsDraft, setRadioItemsDraft] = useState('')
  const [maskDraft, setMaskDraft] = useState(maskEditMask)
  const [importingGrid, setImportingGrid] = useState(false)
  const [importingImage, setImportingImage] = useState(false)
  const [savingActions, setSavingActions] = useState(false)
  const [status, setStatus] = useState('')
  const isImage = /TImage$/i.test(component.className)
  const isComboBox = /^TComboBox$/i.test(component.className)
  const isListBox = /^TListBox$/i.test(component.className)
  const isRadioGroup = /^TRadioGroup$/i.test(component.className)
  const isMaskEdit = /^TMaskEdit$/i.test(component.className)
  const isStringGrid = /^TStringGrid$/i.test(component.className)
  const comboItemsValue = comboBoxItems.join('\n')
  const listItemsValue = listBoxItems.join('\n')
  const radioItemsValue = radioGroupItems.join('\n')

  useEffect(() => { setEventName(events[0]); setNewType(options[0].type); setLocalPreview(null) }, [component.name, events, options])
  useEffect(() => { setComboItemsDraft(comboItemsValue) }, [component.name, comboItemsValue])
  useEffect(() => { setListItemsDraft(listItemsValue) }, [component.name, listItemsValue])
  useEffect(() => { setRadioItemsDraft(radioItemsValue) }, [component.name, radioItemsValue])
  useEffect(() => { setMaskDraft(maskEditMask) }, [component.name, maskEditMask])
  useEffect(() => {
    let cancelled = false
    if (!projectDir) {
      setForms([])
      return () => { cancelled = true }
    }
    void window.api.nocode.listForms(projectDir)
      .then((items) => { if (!cancelled) setForms(items as FormInfo[]) })
      .catch(() => { if (!cancelled) setForms([]) })
    return () => { cancelled = true }
  }, [projectDir, projectFileTree])
  useEffect(() => {
    setStatus('')
    if (!projectDir) { setActions([]); return }
    void window.api.nocode.getBinding({ projectDir, dfmPath, componentName: component.name, eventName }).then((binding) => {
      const loaded = (binding as { actions?: Action[] } | null)?.actions ?? []
      if (loaded.some((action) => action.type === 'imageFit')) onImageDisplayMode('proportional')
      setActions(loaded.filter((action) => action.type !== 'imageFit'))
    })
  }, [projectDir, dfmPath, component.name, eventName])

  const update = (index: number, action: Action): void => setActions((current) => current.map((item, itemIndex) => itemIndex === index ? action : item))
  const move = (index: number, direction: -1 | 1): void => setActions((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next })

  async function chooseImage(): Promise<void> {
    if (importingImage) return
    setImportingImage(true); setStatus(t('actionsPanel.optimizingImage'))
    try {
      const selected = await window.api.nocode.selectImage(delphiProfile) as {
        pictureData: string; previewDataUrl: string; fileName: string
        width: number; height: number; embeddedBytes: number; optimized: boolean
      } | null
      if (!selected) { setStatus(''); return }
      onImageData(selected.pictureData, selected.previewDataUrl)
      setLocalPreview(selected.previewDataUrl)
      const size = selected.embeddedBytes < 1024 * 1024
        ? `${Math.max(1, Math.round(selected.embeddedBytes / 1024))} KB`
        : `${(selected.embeddedBytes / 1024 / 1024).toFixed(1)} MB`
      setStatus(t('actionsPanel.imageEmbedded', { fileName: selected.fileName, width: selected.width, height: selected.height, size, optimizedSuffix: selected.optimized ? t('actionsPanel.andOptimized') : '' }))
    } catch (error) { setStatus(t('actionsPanel.errorPrefix', { message: error instanceof Error ? error.message : String(error) })) }
    finally { setImportingImage(false) }
  }
  async function importStringGrid(): Promise<void> {
    if (!projectDir || importingGrid) return
    setImportingGrid(true); setStatus(t('actionsPanel.readingAndValidating'))
    try {
      const selected = await window.api.nocode.importGridFile() as { fileName: string; sheetName: string; data: string[][]; rows: number; cols: number; originalRows: number; originalCols: number; truncated: boolean } | null
      if (!selected) { setStatus(''); return }
      await window.api.nocode.saveBinding({ projectDir, binding: { dfmPath, formClass, componentName: component.name, eventName: 'OnCreate', methodName: formCreateMethod, actions: [{ type: 'stringGridLoadData', data: selected.data }] } })
      onStringGridImport(selected.cols, selected.rows, formCreateMethod)
      setStatus(t('actionsPanel.gridImported', { fileName: selected.fileName, sheetName: selected.sheetName, rows: selected.rows, cols: selected.cols, truncatedSuffix: selected.truncated ? t('actionsPanel.truncatedNote', { originalRows: selected.originalRows, originalCols: selected.originalCols }) : '' }))
    } catch (error) { setStatus(t('actionsPanel.errorPrefix', { message: error instanceof Error ? error.message : String(error) })) }
    finally { setImportingGrid(false) }
  }
  async function save(): Promise<void> {
    if (!projectDir) return
    const methodName = `${component.name}${eventName.replace(/^On/, '')}`
    setSavingActions(true); setStatus('')
    try {
      let actionsToSave = actions
      let migratedItems = comboBoxItems
      if (isComboBox) {
        const legacy = actions.filter((action) => action.type === 'comboBoxSetItems' || action.type === 'comboBoxAddItem')
        if (legacy.length) {
          migratedItems = [...comboBoxItems]
          for (const action of legacy) {
            if (action.type === 'comboBoxSetItems') migratedItems = action.value.length ? action.value.split(/\r?\n/) : []
            if (action.type === 'comboBoxAddItem' && action.value.length) migratedItems.push(action.value)
          }
          actionsToSave = actions.filter((action) => action.type !== 'comboBoxSetItems' && action.type !== 'comboBoxAddItem')
        }
      }
      await window.api.nocode.saveBinding({ projectDir, binding: { dfmPath, formClass, componentName: component.name, eventName, methodName, actions: actionsToSave } })
      if (actionsToSave.length !== actions.length) {
        setActions(actionsToSave)
        setComboItemsDraft(migratedItems.join('\n'))
        onComboBoxItems(migratedItems, { eventName, methodName: actionsToSave.length ? methodName : '' })
        setStatus(t('actionsPanel.itemsMigrated'))
      } else {
        onBindEvent(eventName, actionsToSave.length ? methodName : '')
        setStatus(actionsToSave.length ? t('actionsPanel.actionsBound') : t('actionsPanel.actionsRemoved'))
      }
    } catch (error) { setStatus(t('actionsPanel.errorPrefix', { message: error instanceof Error ? error.message : String(error) })) }
    finally { setSavingActions(false) }
  }

  return <div className="nocode-panel">
    <div className="nocode-intro"><Workflow size={15} /><span>{t('actionsPanel.intro', { className: component.className })}</span></div>
    {isImage && <section className="nocode-image-config"><div className="nocode-section-title"><ImageIcon size={13} />{t('actionsPanel.componentImage')}</div>{(localPreview || imageDataUrl) ? <img src={localPreview || imageDataUrl || ''} alt={t('actionsPanel.preview')} /> : <div className="nocode-image-empty">{t('actionsPanel.noImageLoaded')}</div>}<div><button onClick={() => void chooseImage()} disabled={importingImage}><Upload size={12} />{importingImage ? t('actionsPanel.optimizing') : t('actionsPanel.uploadFromComputer')}</button><button onClick={() => { onImageData(null, null); setLocalPreview(null); setStatus(t('actionsPanel.imageRemoved')) }} disabled={importingImage || (!localPreview && !imageDataUrl)}><Trash2 size={12} />{t('mainMenuPanel.remove')}</button></div><small>{t('actionsPanel.imageEmbeddedHint')}</small><label className="nocode-event"><span>{t('actionsPanel.displayMode')}</span><select value={imageDisplayMode} onChange={(event) => onImageDisplayMode(event.target.value as 'natural' | 'proportional' | 'fill')}><option value="proportional">{t('actionsPanel.proportionalCentered')}</option><option value="fill">{t('actionsPanel.fillComponent')}</option><option value="natural">{t('actionsPanel.naturalSize')}</option></select></label><small>{t('actionsPanel.permanentConfigHint')}</small></section>}
    {isComboBox && <section className="nocode-image-config"><div className="nocode-section-title">{t('actionsPanel.comboPermanentItems')}</div><label className="nocode-action-field"><span>{t('actionsPanel.oneItemPerLine')}</span><textarea value={comboItemsDraft} placeholder={'Opção 1\nOpção 2\nOpção 3'} onChange={(event) => setComboItemsDraft(event.target.value)} /></label><button onClick={() => { const items = comboItemsDraft.length ? comboItemsDraft.split(/\r?\n/) : []; onComboBoxItems(items); setStatus(t('actionsPanel.itemsSaved')) }}><Save size={12} />{t('actionsPanel.applyItemsToDfm')}</button><small>{t('actionsPanel.comboItemsHint')}</small></section>}
    {isListBox && <section className="nocode-image-config"><div className="nocode-section-title">{t('actionsPanel.listPermanentItems')}</div><label className="nocode-action-field"><span>{t('actionsPanel.oneItemPerLine')}</span><textarea value={listItemsDraft} placeholder={'Item 1\nItem 2\nItem 3'} onChange={(event) => setListItemsDraft(event.target.value)} /></label><button onClick={() => { const items = listItemsDraft.length ? listItemsDraft.split(/\r?\n/) : []; onListBoxItems(items); setStatus(t('actionsPanel.itemsSaved')) }}><Save size={12} />{t('actionsPanel.applyItemsToDfm')}</button><small>{t('actionsPanel.listItemsHint')}</small></section>}
    {isRadioGroup && <section className="nocode-image-config"><div className="nocode-section-title">{t('actionsPanel.radioPermanentOptions')}</div><label className="nocode-action-field"><span>{t('actionsPanel.oneOptionPerLine')}</span><textarea value={radioItemsDraft} placeholder={'Opção 1\nOpção 2\nOpção 3'} onChange={(event) => setRadioItemsDraft(event.target.value)} /></label><button onClick={() => { const items = radioItemsDraft.length ? radioItemsDraft.split(/\r?\n/) : []; onRadioGroupItems(items); setStatus(t('actionsPanel.optionsSaved')) }}><Save size={12} />{t('actionsPanel.applyOptionsToDfm')}</button><small>{t('actionsPanel.radioOptionsHint')}</small></section>}
    {isMaskEdit && <section className="nocode-image-config"><div className="nocode-section-title">{t('actionsPanel.maskEditPermanentMask')}</div><label className="nocode-action-field"><span>{t('actionsPanel.format')}</span><select value={maskDraft} onChange={(event) => setMaskDraft(event.target.value)}><option value="">{t('actionsPanel.noMask')}</option><option value="000.000.000-00;1;_">CPF</option><option value="00.000.000/0000-00;1;_">CNPJ</option><option value="(00) 00000-0000;1;_">{t('actionsPanel.maskPhone')}</option><option value="00000-000;1;_">CEP</option><option value="00/00/0000;1;_">{t('actionsPanel.maskDate')}</option><option value="00:00;1;_">{t('actionsPanel.maskTime')}</option></select></label><label className="nocode-action-field"><span>{t('actionsPanel.customMask')}</span><input value={maskDraft} placeholder="Ex.: 000.000.000-00;1;_" onChange={(event) => setMaskDraft(event.target.value)} /></label><button onClick={() => { onMaskEditMask(maskDraft); setStatus(t('actionsPanel.maskSaved')) }}><Save size={12} />{t('actionsPanel.applyMaskToDfm')}</button><small>{t('actionsPanel.maskHint')}</small></section>}
    {isStringGrid && <section className="nocode-image-config"><div className="nocode-section-title"><FileSpreadsheet size={13} />{t('actionsPanel.stringGridInitialData')}</div><button onClick={() => void importStringGrid()} disabled={importingGrid}><Upload size={12} />{importingGrid ? t('actionsPanel.importing') : t('actionsPanel.importFileTypes')}</button><small>{t('actionsPanel.stringGridImportHint')}</small></section>}
    <label className="nocode-event"><span>{t('actionsPanel.whenItOccurs')}</span><select value={eventName} onChange={(event) => setEventName(event.target.value)}>{events.map((item) => <option key={item}>{item}</option>)}</select></label>
    <div className="nocode-list">{actions.map((action, index) => <div className="nocode-action" key={`${index}-${action.type}`}><div className="nocode-action-head"><span>{index + 1}. {actionLabel(action.type, options)}</span><div><button disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={11} /></button><button disabled={index === actions.length - 1} onClick={() => move(index, 1)}><ArrowDown size={11} /></button><button onClick={() => setActions((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={11} /></button></div></div>
      {action.type === 'message' && <textarea value={action.message} onChange={(event) => update(index, { ...action, message: event.target.value })} />}
      {action.type === 'confirm' && <textarea value={action.message} onChange={(event) => update(index, { ...action, message: event.target.value })} />}
      {action.type === 'openForm' && <><select value={`${action.unitName}|${action.formClass}`} onChange={(event) => { const [unitName, targetClass] = event.target.value.split('|'); update(index, { ...action, unitName, formClass: targetClass }) }}><option value="|">{t('mainMenuPanel.selectForm')}</option>{forms.filter((form) => form.formClass !== formClass).map((form) => <option key={`${form.unitName}.${form.formClass}`} value={`${form.unitName}|${form.formClass}`}>{form.formClass} ({form.unitName})</option>)}</select><label className="nocode-check"><input type="checkbox" checked={action.modal} onChange={(event) => update(index, { ...action, modal: event.target.checked })} />{t('mainMenuPanel.openAsModal')}</label></>}
      {action.type === 'setProperty' && <div className="nocode-property"><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}>{components.map((item) => <option key={item.name}>{item.name}</option>)}</select><select value={action.property} onChange={(event) => update(index, { ...action, property: event.target.value })}><option>Caption</option><option>Text</option><option>Enabled</option><option>Visible</option><option>Color</option></select><input value={action.value} onChange={(event) => update(index, { ...action, value: event.target.value })} /></div>}
      {(action.type === 'searchGrid' || action.type === 'searchClear') && <><label className="nocode-action-field"><span>{t('actionsPanel.gridToFilter')}</span><select value={action.grid} onChange={(event) => update(index, { ...action, grid: event.target.value })}><option value="">{t('dbBinding.selectDbGrid')}</option>{components.filter((item) => /^TDBGrid$/i.test(item.className)).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><label className="nocode-action-field"><span>{t('actionsPanel.searchField')}</span><select value={action.sourceEdit} onChange={(event) => update(index, { ...action, sourceEdit: event.target.value })}><option value="">{t('actionsPanel.selectTextField')}</option>{components.filter((item) => /^T(?:Edit|MaskEdit)$/i.test(item.className)).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label></>}
      {action.type === 'searchGrid' && <label className="nocode-action-field"><span>{t('actionsPanel.searchColumns')}</span><input value={action.fields} placeholder="nome, email, telefone" onChange={(event) => update(index, { ...action, fields: event.target.value })} /></label>}
      {action.type === 'searchGrid' && <small>{t('actionsPanel.searchGridHint')}</small>}
      {action.type === 'searchClear' && <small>{t('actionsPanel.searchClearHint')}</small>}
      {action.type === 'editSetText' && <label className="nocode-action-field"><span>{t('dbBinding.value')}</span><input value={action.value} placeholder={t('actionsPanel.fieldContentPlaceholder')} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'labelSetCaption' && <label className="nocode-action-field"><span>{t('actionsPanel.labelText')}</span><input value={action.value} placeholder={t('actionsPanel.textDisplayedPlaceholder')} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'labelSetFontColor' && <label className="nocode-action-field"><span>{t('actionsPanel.fontColor')}</span><select value={action.value} onChange={(event) => update(index, { ...action, value: event.target.value })}><option value="clWindowText">{t('actionsPanel.colorDefault')}</option><option value="clBlack">{t('actionsPanel.colorBlack')}</option><option value="clWhite">{t('actionsPanel.colorWhite')}</option><option value="clRed">{t('actionsPanel.colorRed')}</option><option value="clGreen">{t('actionsPanel.colorGreen')}</option><option value="clBlue">{t('actionsPanel.colorBlue')}</option><option value="clNavy">{t('actionsPanel.colorNavy')}</option><option value="clTeal">{t('actionsPanel.colorTeal')}</option><option value="clMaroon">{t('actionsPanel.colorMaroon')}</option><option value="clPurple">{t('actionsPanel.colorPurple')}</option><option value="clGray">{t('actionsPanel.colorGray')}</option><option value="clSilver">{t('actionsPanel.colorSilver')}</option></select></label>}
      {action.type === 'labelSetFontSize' && <label className="nocode-action-field"><span>{t('actionsPanel.fontSizeRange')}</span><input type="number" min={6} max={96} value={action.value} onChange={(event) => update(index, { ...action, value: Math.max(6, Math.min(96, Number(event.target.value) || 6)) })} /></label>}
      {action.type === 'labelSetFontStyle' && <label className="nocode-action-field"><span>{t('actionsPanel.style')}</span><select value={action.value} onChange={(event) => update(index, { ...action, value: event.target.value as 'normal' | 'bold' | 'italic' | 'underline' })}><option value="normal">{t('actionsPanel.styleNormal')}</option><option value="bold">{t('actionsPanel.styleBold')}</option><option value="italic">{t('actionsPanel.styleItalic')}</option><option value="underline">{t('actionsPanel.styleUnderline')}</option></select></label>}
      {action.type === 'labelSetAlignment' && <label className="nocode-action-field"><span>{t('actionsPanel.alignment')}</span><select value={action.value} onChange={(event) => update(index, { ...action, value: event.target.value as 'left' | 'center' | 'right' })}><option value="left">{t('actionsPanel.alignLeft')}</option><option value="center">{t('actionsPanel.alignCenter')}</option><option value="right">{t('actionsPanel.alignRight')}</option></select></label>}
      {action.type === 'labelClear' && <small>{t('actionsPanel.labelClearHint')}</small>}
      {action.type === 'labelShow' && <small>{t('actionsPanel.labelShowHint')}</small>}
      {action.type === 'labelHide' && <small>{t('actionsPanel.labelHideHint')}</small>}
      {action.type === 'labelToggleVisible' && <small>{t('actionsPanel.toggleVisibleHint')}</small>}
      {action.type === 'memoSetText' && <label className="nocode-action-field"><span>{t('actionsPanel.content')}</span><textarea value={action.value} placeholder={t('actionsPanel.memoFullTextPlaceholder')} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'memoAddLine' && <label className="nocode-action-field"><span>{t('actionsPanel.newLine')}</span><input value={action.value} placeholder={t('actionsPanel.textToAppendPlaceholder')} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'memoSetReadOnly' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('dbBinding.readOnly')}</label>}
      {action.type === 'memoSetWordWrap' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.autoWrapLines')}</label>}
      {action.type === 'memoTransfer' && <label className="nocode-action-field"><span>{t('actionsPanel.targetField')}</span><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}><option value="">{t('actionsPanel.selectEditOrMemo')}</option>{components.filter((item) => /^(?:TEdit|TMemo)$/i.test(item.className) && item.name !== component.name).map((item) => <option key={item.name} value={item.name}>{item.name} ({item.className})</option>)}</select></label>}
      {action.type === 'memoClear' && <small>{t('actionsPanel.memoClearHint')}</small>}
      {action.type === 'memoFocus' && <small>{t('actionsPanel.memoFocusHint')}</small>}
      {action.type === 'memoSelectAll' && <small>{t('actionsPanel.memoSelectAllHint')}</small>}
      {action.type === 'memoCopy' && <small>{t('actionsPanel.copyHint')}</small>}
      {action.type === 'memoCut' && <small>{t('actionsPanel.cutHint')}</small>}
      {action.type === 'memoPaste' && <small>{t('actionsPanel.pasteHint')}</small>}
      {action.type === 'memoToggleReadOnly' && <small>{t('actionsPanel.memoToggleReadOnlyHint')}</small>}
      {action.type === 'checkBoxSetCaption' && <label className="nocode-action-field"><span>{t('actionsPanel.checkBoxText')}</span><input value={action.value} placeholder={t('actionsPanel.textNextToBoxPlaceholder')} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'checkBoxSetChecked' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.leaveChecked')}</label>}
      {action.type === 'checkBoxSetState' && <label className="nocode-action-field"><span>{t('actionsPanel.state')}</span><select value={action.value} onChange={(event) => update(index, { ...action, value: event.target.value as 'unchecked' | 'checked' | 'grayed' })}><option value="unchecked">{t('actionsPanel.stateUnchecked')}</option><option value="checked">{t('actionsPanel.stateChecked')}</option><option value="grayed">{t('actionsPanel.stateIndeterminate')}</option></select></label>}
      {action.type === 'checkBoxSetAllowGrayed' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.allowIndeterminateState')}</label>}
      {action.type === 'checkBoxSetEnabled' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.leaveEnabled')}</label>}
      {action.type === 'checkBoxSetVisible' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.leaveVisible')}</label>}
      {action.type === 'checkBoxTransfer' && <label className="nocode-action-field"><span>{t('actionsPanel.targetCheckBox')}</span><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}><option value="">{t('actionsPanel.selectAnotherCheckBox')}</option>{components.filter((item) => /^TCheckBox$/i.test(item.className) && item.name !== component.name).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>}
      {action.type === 'checkBoxToggle' && <small>{t('actionsPanel.checkBoxToggleHint')}</small>}
      {action.type === 'checkBoxFocus' && <small>{t('actionsPanel.checkBoxFocusHint')}</small>}
      {action.type === 'radioButtonSetCaption' && <label className="nocode-action-field"><span>{t('actionsPanel.radioButtonText')}</span><input value={action.value} placeholder={t('actionsPanel.textNextToOptionPlaceholder')} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'radioButtonSetChecked' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.leaveSelected')}</label>}
      {action.type === 'radioButtonSetEnabled' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.leaveEnabled')}</label>}
      {action.type === 'radioButtonSetVisible' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.leaveVisible')}</label>}
      {action.type === 'radioButtonTransfer' && <label className="nocode-action-field"><span>{t('actionsPanel.targetRadioButton')}</span><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}><option value="">{t('actionsPanel.selectAnotherRadioButton')}</option>{components.filter((item) => /^TRadioButton$/i.test(item.className) && item.name !== component.name).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>}
      {action.type === 'radioButtonSelect' && <small>{t('actionsPanel.radioButtonSelectHint')}</small>}
      {action.type === 'radioButtonClear' && <small>{t('actionsPanel.radioButtonClearHint')}</small>}
      {action.type === 'radioButtonFocus' && <small>{t('actionsPanel.radioButtonFocusHint')}</small>}
      {action.type === 'comboBoxSetText' && <label className="nocode-action-field"><span>{t('dbBinding.value')}</span><input value={action.value} placeholder={t('actionsPanel.comboTextPlaceholder')} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'comboBoxSetItems' && <label className="nocode-action-field"><span>{t('actionsPanel.itemsOnePerLine')}</span><textarea value={action.value} placeholder={'Opção 1\nOpção 2'} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'comboBoxAddItem' && <label className="nocode-action-field"><span>{t('actionsPanel.newItem')}</span><input value={action.value} placeholder={t('actionsPanel.newItemTextPlaceholder')} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'comboBoxSelectText' && <label className="nocode-action-field"><span>{t('actionsPanel.exactItemText')}</span><input value={action.value} placeholder={t('actionsPanel.itemToSelectPlaceholder')} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'comboBoxSelectIndex' && <label className="nocode-action-field"><span>{t('actionsPanel.positionZeroBased')}</span><input type="number" min={-1} max={100000} value={action.value} onChange={(event) => update(index, { ...action, value: Math.max(-1, Math.min(100000, Number(event.target.value) || 0)) })} /></label>}
      {action.type === 'comboBoxSetSorted' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.sortItemsAutomatically')}</label>}
      {action.type === 'comboBoxTransfer' && <label className="nocode-action-field"><span>{t('actionsPanel.targetField')}</span><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}><option value="">{t('actionsPanel.selectEditMemoOrCombo')}</option>{components.filter((item) => /^(?:TEdit|TMaskEdit|TMemo|TComboBox)$/i.test(item.className) && item.name !== component.name).map((item) => <option key={item.name} value={item.name}>{item.name} ({item.className})</option>)}</select></label>}
      {action.type === 'comboBoxClearItems' && <small>{t('actionsPanel.comboClearItemsHint')}</small>}
      {action.type === 'comboBoxDeleteSelected' && <small>{t('actionsPanel.comboDeleteSelectedHint')}</small>}
      {action.type === 'comboBoxClearSelection' && <small>{t('actionsPanel.comboClearSelectionHint')}</small>}
      {action.type === 'comboBoxFocus' && <small>{t('actionsPanel.comboFocusHint')}</small>}
      {action.type === 'comboBoxOpenDropDown' && <small>{t('actionsPanel.comboOpenDropDownHint')}</small>}
      {action.type === 'listBoxAddItem' && <label className="nocode-action-field"><span>{t('actionsPanel.newItem')}</span><input value={action.value} placeholder={t('actionsPanel.newItemTextPlaceholder')} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'listBoxSelectText' && <label className="nocode-action-field"><span>{t('actionsPanel.exactItemText')}</span><input value={action.value} placeholder={t('actionsPanel.itemToSelectPlaceholder')} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'listBoxSelectIndex' && <label className="nocode-action-field"><span>{t('actionsPanel.positionZeroBased')}</span><input type="number" min={-1} max={100000} value={action.value} onChange={(event) => update(index, { ...action, value: Math.max(-1, Math.min(100000, Number(event.target.value) || 0)) })} /></label>}
      {action.type === 'listBoxSetMultiSelect' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.allowMultiSelect')}</label>}
      {action.type === 'listBoxSetSorted' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.sortItemsAutomatically')}</label>}
      {action.type === 'listBoxTransfer' && <label className="nocode-action-field"><span>{t('actionsPanel.targetField')}</span><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}><option value="">{t('actionsPanel.selectEditMemoOrCombo')}</option>{components.filter((item) => /^(?:TEdit|TMaskEdit|TMemo|TComboBox)$/i.test(item.className)).map((item) => <option key={item.name} value={item.name}>{item.name} ({item.className})</option>)}</select></label>}
      {action.type === 'listBoxClearItems' && <small>{t('actionsPanel.listClearItemsHint')}</small>}
      {action.type === 'listBoxDeleteSelected' && <small>{t('actionsPanel.listDeleteSelectedHint')}</small>}
      {action.type === 'listBoxClearSelection' && <small>{t('actionsPanel.listClearSelectionHint')}</small>}
      {action.type === 'listBoxSelectAll' && <small>{t('actionsPanel.listSelectAllHint')}</small>}
      {action.type === 'listBoxFocus' && <small>{t('actionsPanel.listFocusHint')}</small>}
      {action.type === 'colorBoxSetSelected' && <label className="nocode-action-field"><span>{t('actionsPanel.color')}</span><select value={action.value} onChange={(event) => update(index, { ...action, value: event.target.value })}><option value="clBlack">{t('actionsPanel.colorBlack')}</option><option value="clWhite">{t('actionsPanel.colorWhite')}</option><option value="clRed">{t('actionsPanel.colorRed')}</option><option value="clGreen">{t('actionsPanel.colorGreen')}</option><option value="clBlue">{t('actionsPanel.colorBlue')}</option><option value="clYellow">{t('actionsPanel.colorYellow')}</option><option value="clNavy">{t('actionsPanel.colorNavy')}</option><option value="clTeal">{t('actionsPanel.colorTeal')}</option><option value="clMaroon">{t('actionsPanel.colorMaroon')}</option><option value="clPurple">{t('actionsPanel.colorPurple')}</option><option value="clGray">{t('actionsPanel.colorGray')}</option><option value="clSilver">{t('actionsPanel.colorSilver')}</option></select></label>}
      {action.type === 'colorBoxApplyColor' && <><label className="nocode-action-field"><span>{t('actionsPanel.targetComponent')}</span><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}><option value="">{t('mainMenuPanel.select')}</option>{components.filter((item) => item.name !== component.name && /^(?:TForm|TPanel|TGroupBox|TLabel|TEdit|TMaskEdit|TMemo|TComboBox|TListBox|TStringGrid|TCheckBox|TRadioButton|TBitBtn)$/i.test(item.className)).map((item) => <option key={item.name} value={item.name}>{item.name} ({item.className})</option>)}</select></label><label className="nocode-action-field"><span>{t('actionsPanel.applyTo')}</span><select value={action.property} onChange={(event) => update(index, { ...action, property: event.target.value as 'Color' | 'Font.Color' })}><option value="Color">{t('actionsPanel.componentBackground')}</option><option value="Font.Color">{t('actionsPanel.componentText')}</option></select></label></>}
      {action.type === 'colorBoxSetEnabled' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.leaveEnabled')}</label>}
      {action.type === 'colorBoxSetVisible' && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.leaveVisible')}</label>}
      {action.type === 'colorBoxFocus' && <small>{t('actionsPanel.colorBoxFocusHint')}</small>}
      {action.type === 'stringGridSetCell' && <><div className="nocode-property"><input type="number" min={0} value={action.col} onChange={(event) => update(index, { ...action, col: Math.max(0, Number(event.target.value) || 0) })} placeholder={t('actionsPanel.column')} /><input type="number" min={0} value={action.row} onChange={(event) => update(index, { ...action, row: Math.max(0, Number(event.target.value) || 0) })} placeholder={t('actionsPanel.row')} /></div><label className="nocode-action-field"><span>{t('actionsPanel.content')}</span><input value={action.value} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label></>}
      {action.type === 'stringGridSelectCell' && <div className="nocode-property"><input type="number" min={0} value={action.col} onChange={(event) => update(index, { ...action, col: Math.max(0, Number(event.target.value) || 0) })} placeholder={t('actionsPanel.column')} /><input type="number" min={0} value={action.row} onChange={(event) => update(index, { ...action, row: Math.max(0, Number(event.target.value) || 0) })} placeholder={t('actionsPanel.row')} /></div>}
      {(action.type === 'stringGridSetDimensions' || action.type === 'stringGridSetFixed') && <div className="nocode-property"><label className="nocode-action-field"><span>{t('actionsPanel.columns')}</span><input type="number" min={action.type === 'stringGridSetDimensions' ? 1 : 0} value={action.cols} onChange={(event) => update(index, { ...action, cols: Math.max(action.type === 'stringGridSetDimensions' ? 1 : 0, Number(event.target.value) || 0) })} /></label><label className="nocode-action-field"><span>{t('actionsPanel.rows')}</span><input type="number" min={action.type === 'stringGridSetDimensions' ? 1 : 0} value={action.rows} onChange={(event) => update(index, { ...action, rows: Math.max(action.type === 'stringGridSetDimensions' ? 1 : 0, Number(event.target.value) || 0) })} /></label></div>}
      {action.type === 'stringGridTransferCell' && <label className="nocode-action-field"><span>{t('actionsPanel.targetField')}</span><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}><option value="">{t('actionsPanel.selectAField')}</option>{components.filter((item) => /^(?:TEdit|TMaskEdit|TMemo|TComboBox)$/i.test(item.className)).map((item) => <option key={item.name} value={item.name}>{item.name} ({item.className})</option>)}</select></label>}
      {action.type === 'stringGridClear' && <small>{t('actionsPanel.stringGridClearHint')}</small>}
      {action.type === 'stringGridAddRow' && <small>{t('actionsPanel.stringGridAddRowHint')}</small>}
      {action.type === 'stringGridDeleteCurrentRow' && <small>{t('actionsPanel.stringGridDeleteRowHint')}</small>}
      {action.type === 'stringGridFocus' && <small>{t('actionsPanel.stringGridFocusHint')}</small>}
      {action.type === 'editTransfer' && <label className="nocode-action-field"><span>{t('actionsPanel.targetField')}</span><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}><option value="">{t('actionsPanel.selectEdit')}</option>{components.filter((item) => /^T(?:Edit|MaskEdit)$/i.test(item.className) && item.name !== component.name).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>}
      {action.type === 'editClear' && <small>{t('actionsPanel.editClearHint')}</small>}
      {action.type === 'editFocus' && <small>{t('actionsPanel.editFocusHint')}</small>}
      {action.type === 'editSelectAll' && <small>{t('actionsPanel.editSelectAllHint')}</small>}
      {action.type === 'editCopy' && <small>{t('actionsPanel.copyHint')}</small>}
      {action.type === 'editCut' && <small>{t('actionsPanel.cutHint')}</small>}
      {action.type === 'editPaste' && <small>{t('actionsPanel.editPasteHint')}</small>}

      {action.type === 'panelSetCaption' && <label className="nocode-action-field"><span>{t('actionsPanel.panelTitle')}</span><input value={action.value} onChange={(event) => update(index, { ...action, value: event.target.value })} /></label>}
      {action.type === 'panelSetColor' && <label className="nocode-action-field"><span>{t('actionsPanel.color')}</span><select value={action.value} onChange={(event) => update(index, { ...action, value: event.target.value })}><option>clBtnFace</option><option>clWindow</option><option>clWhite</option><option>clBlack</option><option>clRed</option><option>clGreen</option><option>clBlue</option><option>clYellow</option><option>clSkyBlue</option><option>clMoneyGreen</option><option>clCream</option></select></label>}
      {(action.type === 'panelSetEnabled' || action.type === 'calendarSetEnabled' || action.type === 'radioGroupSetEnabled' || action.type === 'chartSetLegend' || action.type === 'chartSet3D' || action.type === 'chartSetVisible') && <label className="nocode-check"><input type="checkbox" checked={action.value} onChange={(event) => update(index, { ...action, value: event.target.checked })} />{t('actionsPanel.activateThisSetting')}</label>}
      {action.type === 'calendarAddDays' && <label className="nocode-action-field"><span>{t('actionsPanel.daysNegativeToGoBack')}</span><input type="number" value={action.value} onChange={(event) => update(index, { ...action, value: Number(event.target.value) || 0 })} /></label>}
      {(action.type === 'progressSetPosition' || action.type === 'progressAdvance') && <label className="nocode-action-field"><span>{t('dbBinding.value')}</span><input type="number" value={action.value} onChange={(event) => update(index, { ...action, value: Number(event.target.value) || 0 })} /></label>}
      {action.type === 'progressSetState' && <label className="nocode-action-field"><span>{t('actionsPanel.state')}</span><select value={action.value} onChange={(event) => update(index, { ...action, value: event.target.value as 'normal' | 'error' | 'paused' })}><option value="normal">{t('actionsPanel.styleNormal')}</option><option value="error">{t('actionsPanel.errorState')}</option><option value="paused">{t('actionsPanel.pausedState')}</option></select></label>}
      {action.type === 'radioGroupSelectIndex' && <label className="nocode-action-field"><span>{t('actionsPanel.optionPositionZeroBased')}</span><input type="number" min={-1} value={action.value} onChange={(event) => update(index, { ...action, value: Math.max(-1, Number(event.target.value) || 0) })} /></label>}
      {(['panelShow','panelHide','panelBringToFront','calendarToday','progressReset','radioGroupClear','radioGroupNext','chartRefresh','chartClear'] as string[]).includes(action.type) && <small>{t('actionsPanel.directExecutionHint')}</small>}
      {action.type === 'imageFullscreen' && <small>{t('actionsPanel.imageFullscreenHint')}</small>}{action.type === 'imageClear' && <small>{t('actionsPanel.imageClearHint')}</small>}{action.type === 'closeForm' && <small>{t('actionsPanel.closeFormHint')}</small>}{action.type === 'closeApplication' && <small>{t('actionsPanel.closeApplicationHint')}</small>}
      {action.type === 'imageShow' && <small>{t('actionsPanel.imageShowHint')}</small>}{action.type === 'imageHide' && <small>{t('actionsPanel.imageHideHint')}</small>}{action.type === 'imageToggleVisible' && <small>{t('actionsPanel.toggleVisibleHint')}</small>}
      {action.type === 'imageTransfer' && <label className="nocode-action-field"><span>{t('actionsPanel.targetImage')}</span><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}><option value="">{t('actionsPanel.selectAnotherImage')}</option>{components.filter((item) => /^TImage$/i.test(item.className) && item.name !== component.name).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>}
      {(action.type === 'calendarGoToDate' || action.type === 'calendarSetMinDate' || action.type === 'calendarSetMaxDate') && <div className="nocode-property">
        <label className="nocode-action-field"><span>{t('actionsPanel.day')}</span><input type="number" min={0} max={31} value={action.day} onChange={(event) => update(index, { ...action, day: Math.max(0, Math.min(31, Number(event.target.value) || 0)) })} /></label>
        <label className="nocode-action-field"><span>{t('actionsPanel.month')}</span><input type="number" min={0} max={12} value={action.month} onChange={(event) => update(index, { ...action, month: Math.max(0, Math.min(12, Number(event.target.value) || 0)) })} /></label>
        <label className="nocode-action-field"><span>{t('actionsPanel.year')}{action.type !== 'calendarGoToDate' ? t('actionsPanel.yearNoLimitSuffix') : ''}</span><input type="number" min={0} max={9999} value={action.year} onChange={(event) => update(index, { ...action, year: Math.max(0, Math.min(9999, Number(event.target.value) || 0)) })} /></label>
      </div>}
      {action.type === 'progressSetRange' && <div className="nocode-property"><label className="nocode-action-field"><span>{t('actionsPanel.minimum')}</span><input type="number" value={action.min} onChange={(event) => update(index, { ...action, min: Number(event.target.value) || 0 })} /></label><label className="nocode-action-field"><span>{t('actionsPanel.maximum')}</span><input type="number" value={action.max} onChange={(event) => update(index, { ...action, max: Number(event.target.value) || 0 })} /></label></div>}
      {action.type === 'chartAddPoint' && <><label className="nocode-action-field"><span>{t('actionsPanel.targetSeries')}</span><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}><option value="">{t('actionsPanel.selectChartSeries')}</option>{components.filter((item) => /Series$/i.test(item.className)).map((item) => <option key={item.name} value={item.name}>{item.name} ({item.className})</option>)}</select></label><div className="nocode-property"><label className="nocode-action-field"><span>{t('actionsPanel.label')}</span><input value={action.label} onChange={(event) => update(index, { ...action, label: event.target.value })} /></label><label className="nocode-action-field"><span>{t('dbBinding.value')}</span><input type="number" value={action.value} onChange={(event) => update(index, { ...action, value: Number(event.target.value) || 0 })} /></label></div></>}
      {action.type === 'chartClearSeries' && <label className="nocode-action-field"><span>{t('actionsPanel.seriesToClear')}</span><select value={action.target} onChange={(event) => update(index, { ...action, target: event.target.value })}><option value="">{t('actionsPanel.selectChartSeries')}</option>{components.filter((item) => /Series$/i.test(item.className)).map((item) => <option key={item.name} value={item.name}>{item.name} ({item.className})</option>)}</select></label>}
    </div>)}</div>
    {!actions.length && <div className="nocode-empty">{t('actionsPanel.noActionsConfigured', { eventName })}</div>}
    <div className="nocode-add"><select value={newType} onChange={(event) => setNewType(event.target.value as Action['type'])}>{options.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select><button onClick={() => setActions((items) => [...items, initialAction(newType, forms, components)])}><Plus size={12} />{t('common.add')}</button></div>
    <button className="nocode-save" onClick={() => void save()} disabled={savingActions || importingImage || importingGrid}><Save size={12} />{savingActions ? t('actionsPanel.applying') : t('actionsPanel.applyActions')}</button>
    {status && <div className={`nocode-status${status.startsWith(t('dbBinding.errorWord')) ? ' error' : ''}`}>{status}</div>}
  </div>
}
