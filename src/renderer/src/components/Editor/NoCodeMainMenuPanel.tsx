import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, CornerDownRight, ImageIcon, Menu, Plus, Save, Trash2, Upload } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import './NoCodeActionsPanel.css'

export type MainMenuRuntimeAction =
  | { type: 'none' }
  | { type: 'message'; message: string }
  | { type: 'openForm'; unitName: string; formClass: string; modal: boolean }
  | { type: 'closeForm' }
  | { type: 'closeApplication' }
  | { type: 'setProperty'; target: string; property: string; value: string }

export interface MainMenuItemModel {
  name: string
  caption: string
  enabled: boolean
  checked: boolean
  autoCheck: boolean
  radioItem: boolean
  groupIndex: number
  shortcut: string
  iconData?: string
  iconPreviewDataUrl?: string
  action?: MainMenuRuntimeAction
  children: MainMenuItemModel[]
}

interface FormInfo { unitName: string; formClass: string; filePath: string }
interface ComponentInfo { name: string; className: string }

const flatten = (items: MainMenuItemModel[]): MainMenuItemModel[] => items.flatMap((item) => [item, ...flatten(item.children)])
const mapTree = (items: MainMenuItemModel[], name: string, update: (item: MainMenuItemModel) => MainMenuItemModel): MainMenuItemModel[] =>
  items.map((item) => item.name === name ? update(item) : { ...item, children: mapTree(item.children, name, update) })
const removeTree = (items: MainMenuItemModel[], name: string): MainMenuItemModel[] =>
  items.filter((item) => item.name !== name).map((item) => ({ ...item, children: removeTree(item.children, name) }))
const moveTree = (items: MainMenuItemModel[], name: string, direction: -1 | 1): MainMenuItemModel[] => {
  const index = items.findIndex((item) => item.name === name)
  if (index >= 0) {
    const target = index + direction
    if (target < 0 || target >= items.length) return items
    const next = [...items]; [next[index], next[target]] = [next[target], next[index]]
    return next
  }
  return items.map((item) => ({ ...item, children: moveTree(item.children, name, direction) }))
}
const defaultAction = (type: MainMenuRuntimeAction['type'], forms: FormInfo[], components: ComponentInfo[]): MainMenuRuntimeAction => {
  if (type === 'message') return { type, message: 'Operação realizada com sucesso.' }
  if (type === 'openForm') return { type, unitName: forms[0]?.unitName ?? '', formClass: forms[0]?.formClass ?? '', modal: true }
  if (type === 'setProperty') return { type, target: components[0]?.name ?? '', property: 'Enabled', value: 'True' }
  return { type } as MainMenuRuntimeAction
}

export function NoCodeMainMenuPanel({ dfmPath, formClass, componentName, menuItems, components, onMenuChange }: {
  dfmPath: string
  formClass: string
  componentName: string
  menuItems: MainMenuItemModel[]
  components: ComponentInfo[]
  onMenuChange: (items: MainMenuItemModel[]) => void
}): JSX.Element {
  const { t } = useTranslation()
  const projectDir = useAppStore((state) => state.projectDir)
  const projectFileTree = useAppStore((state) => state.fileTree)
  const [items, setItems] = useState<MainMenuItemModel[]>(menuItems)
  const [selectedName, setSelectedName] = useState(menuItems[0]?.name ?? '')
  const [forms, setForms] = useState<FormInfo[]>([])
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [iconBusy, setIconBusy] = useState(false)
  const originalNames = useRef<Set<string>>(new Set(flatten(menuItems).map((item) => item.name)))
  const selected = flatten(items).find((item) => item.name === selectedName) ?? null

  useEffect(() => {
    let active = true
    if (!projectDir) return
    void window.api.nocode.listForms(projectDir).then((value) => { if (active) setForms(value as FormInfo[]) }).catch(() => { if (active) setForms([]) })
    return () => { active = false }
  }, [projectDir, projectFileTree])

  useEffect(() => {
    let active = true
    const hydrate = async (source: MainMenuItemModel[]): Promise<MainMenuItemModel[]> => Promise.all(source.map(async (item) => {
      const binding = projectDir
        ? await window.api.nocode.getBinding({ projectDir, dfmPath, componentName: item.name, eventName: 'OnClick' }).catch(() => null) as { actions?: MainMenuRuntimeAction[] } | null
        : null
      return { ...item, action: binding?.actions?.[0] ?? { type: 'none' }, children: await hydrate(item.children) }
    }))
    void hydrate(menuItems).then((loaded) => {
      if (!active) return
      setItems(loaded)
      originalNames.current = new Set(flatten(loaded).map((item) => item.name))
      setSelectedName((current) => flatten(loaded).some((item) => item.name === current) ? current : (loaded[0]?.name ?? ''))
    })
    return () => { active = false }
  }, [componentName, dfmPath, projectDir, menuItems])

  const usedNames = useMemo(() => new Set([...components.map((item) => item.name.toLowerCase()), ...flatten(items).map((item) => item.name.toLowerCase())]), [components, items])
  const newName = (): string => { let index = 1; while (usedNames.has(`MenuItem${index}`.toLowerCase())) index += 1; return `MenuItem${index}` }
  const freshItem = (): MainMenuItemModel => ({ name: newName(), caption: t('mainMenuPanel.newItem'), enabled: true, checked: false, autoCheck: false, radioItem: false, groupIndex: 0, shortcut: '', iconData: undefined, iconPreviewDataUrl: undefined, action: { type: 'none' }, children: [] })
  const updateSelected = (update: Partial<MainMenuItemModel>): void => { if (selected) setItems((current) => mapTree(current, selected.name, (item) => ({ ...item, ...update }))) }
  const addRoot = (): void => { const item = freshItem(); setItems((current) => [...current, item]); setSelectedName(item.name) }
  const addChild = (): void => {
    if (!selected) { addRoot(); return }
    const item = freshItem()
    setItems((current) => mapTree(current, selected.name, (parent) => ({ ...parent, children: [...parent.children, item] })))
    setSelectedName(item.name)
  }
  const remove = (): void => {
    if (!selected || !window.confirm(t('mainMenuPanel.removeConfirm', { caption: selected.caption }))) return
    setItems((current) => removeTree(current, selected.name)); setSelectedName('')
  }
  const chooseIcon = async (): Promise<void> => {
    if (!selected || iconBusy) return
    setIconBusy(true); setStatus(t('mainMenuPanel.convertingIcon'))
    try {
      const value = await window.api.nocode.selectGlyph('menu') as { glyphData: string; previewDataUrl: string; fileName: string; width: number; height: number } | null
      if (!value) { setStatus(''); return }
      updateSelected({ iconData: value.glyphData, iconPreviewDataUrl: value.previewDataUrl })
      setStatus(t('mainMenuPanel.iconReady', { fileName: value.fileName, caption: selected.caption }))
    } catch (error) { setStatus(t('mainMenuPanel.errorPrefix', { message: error instanceof Error ? error.message : String(error) })) }
    finally { setIconBusy(false) }
  }
  const removeIcon = (): void => {
    if (!selected) return
    updateSelected({ iconData: undefined, iconPreviewDataUrl: undefined })
    setStatus(t('mainMenuPanel.iconRemoved'))
  }
  const apply = async (): Promise<void> => {
    if (!projectDir) { setStatus(t('mainMenuPanel.errorOpenProject')); return }
    if (flatten(items).some((item) => !item.caption.trim())) { setStatus(t('mainMenuPanel.errorMissingCaption')); return }
    setSaving(true); setStatus('')
    try {
      const current = flatten(items)
      for (const item of current) {
        const action = item.action ?? { type: 'none' }
        await window.api.nocode.saveBinding({ projectDir, binding: { dfmPath, formClass, componentName: item.name, eventName: 'OnClick', methodName: `${item.name}Click`, actions: action.type === 'none' ? [] : [action] } })
      }
      const currentNames = new Set(current.map((item) => item.name))
      for (const removedName of originalNames.current) if (!currentNames.has(removedName)) {
        await window.api.nocode.saveBinding({ projectDir, binding: { dfmPath, formClass, componentName: removedName, eventName: 'OnClick', methodName: `${removedName}Click`, actions: [] } })
      }
      onMenuChange(items)
      originalNames.current = currentNames
      setStatus(t('mainMenuPanel.menuApplied'))
    } catch (error) { setStatus(t('mainMenuPanel.errorPrefix', { message: (error as Error).message })) }
    finally { setSaving(false) }
  }
  const renderTree = (source: MainMenuItemModel[], depth = 0): JSX.Element[] => source.flatMap((item) => [
    <button key={item.name} className={`nocode-menu-row${item.name === selectedName ? ' active' : ''}`} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => setSelectedName(item.name)}>{item.iconPreviewDataUrl ? <img className="nocode-menu-row-icon" src={item.iconPreviewDataUrl} alt="" /> : <Menu size={12} />}<span>{item.caption || t('mainMenuPanel.untitled')}</span><small>{item.name}</small></button>,
    ...renderTree(item.children, depth + 1)
  ])
  const action = selected?.action ?? { type: 'none' }

  return <div className="nocode-panel nocode-menu-panel">
    <div className="nocode-intro"><Menu size={15} /><span>{t('mainMenuPanel.intro')}</span></div>
    <div className="nocode-menu-toolbar"><button onClick={addRoot}><Plus size={12} />{t('mainMenuPanel.menu')}</button><button onClick={addChild} disabled={!selected}><CornerDownRight size={12} />{t('mainMenuPanel.submenu')}</button><button onClick={() => selected && setItems((current) => moveTree(current, selected.name, -1))} disabled={!selected}><ArrowUp size={12} /></button><button onClick={() => selected && setItems((current) => moveTree(current, selected.name, 1))} disabled={!selected}><ArrowDown size={12} /></button><button onClick={remove} disabled={!selected}><Trash2 size={12} /></button></div>
    <div className="nocode-menu-tree">{items.length ? renderTree(items) : <div className="nocode-empty">{t('mainMenuPanel.createFirstMenu')}</div>}</div>
    {selected && <div className="nocode-menu-editor">
      <label className="nocode-action-field"><span>{t('mainMenuPanel.title')}</span><input value={selected.caption} onChange={(event) => updateSelected({ caption: event.target.value })} placeholder={t('mainMenuPanel.titlePlaceholder')} /></label>
      <section className="nocode-menu-icon-editor">
        <div className="nocode-menu-icon-preview">{selected.iconPreviewDataUrl ? <img src={selected.iconPreviewDataUrl} alt={t('mainMenuPanel.iconAlt', { caption: selected.caption })} /> : <span><ImageIcon size={16} />{t('mainMenuPanel.noIcon')}</span>}</div>
        <div><button onClick={() => void chooseIcon()} disabled={iconBusy}><Upload size={12} />{iconBusy ? t('common.loading') : t('mainMenuPanel.upload')}</button><button onClick={removeIcon} disabled={iconBusy || !selected.iconData}><Trash2 size={12} />{t('mainMenuPanel.remove')}</button></div>
        <small>{t('mainMenuPanel.iconHint')}</small>
      </section>
      <div className="nocode-property"><label className="nocode-check"><input type="checkbox" checked={selected.enabled} onChange={(event) => updateSelected({ enabled: event.target.checked })} />{t('mainMenuPanel.enabled')}</label><label className="nocode-check"><input type="checkbox" checked={selected.checked} onChange={(event) => updateSelected({ checked: event.target.checked })} />{t('mainMenuPanel.checked')}</label></div>
      <div className="nocode-property"><label className="nocode-check"><input type="checkbox" checked={selected.autoCheck} onChange={(event) => updateSelected({ autoCheck: event.target.checked })} />{t('mainMenuPanel.autoCheck')}</label><label className="nocode-check"><input type="checkbox" checked={selected.radioItem} onChange={(event) => updateSelected({ radioItem: event.target.checked })} />{t('mainMenuPanel.radioStyle')}</label></div>
      <div className="nocode-property"><label className="nocode-action-field"><span>{t('mainMenuPanel.group')}</span><input type="number" min={0} max={255} value={selected.groupIndex} onChange={(event) => updateSelected({ groupIndex: Math.max(0, Math.min(255, Number(event.target.value) || 0)) })} /></label><label className="nocode-action-field"><span>{t('mainMenuPanel.delphiShortcut')}</span><input value={selected.shortcut} onChange={(event) => updateSelected({ shortcut: event.target.value })} placeholder={t('mainMenuPanel.shortcutPlaceholder')} /></label></div>
      <label className="nocode-action-field"><span>{t('mainMenuPanel.actionOnClick')}</span><select value={action.type} onChange={(event) => updateSelected({ action: defaultAction(event.target.value as MainMenuRuntimeAction['type'], forms, components) })}><option value="none">{t('mainMenuPanel.actionNone')}</option><option value="openForm">{t('mainMenuPanel.actionOpenForm')}</option><option value="message">{t('mainMenuPanel.actionShowMessage')}</option><option value="closeForm">{t('mainMenuPanel.actionCloseForm')}</option><option value="closeApplication">{t('mainMenuPanel.actionCloseApp')}</option><option value="setProperty">{t('mainMenuPanel.actionSetProperty')}</option></select></label>
      {action.type === 'message' && <label className="nocode-action-field"><span>{t('mainMenuPanel.message')}</span><textarea value={action.message} onChange={(event) => updateSelected({ action: { ...action, message: event.target.value } })} /></label>}
      {action.type === 'openForm' && <><label className="nocode-action-field"><span>{t('mainMenuPanel.form')}</span><select value={action.formClass} onChange={(event) => { const form = forms.find((item) => item.formClass === event.target.value); updateSelected({ action: { ...action, unitName: form?.unitName ?? '', formClass: form?.formClass ?? '' } }) }}><option value="">{t('mainMenuPanel.selectForm')}</option>{forms.filter((item) => item.formClass !== formClass).map((item) => <option key={item.formClass} value={item.formClass}>{item.formClass} ({item.unitName})</option>)}</select></label><label className="nocode-check"><input type="checkbox" checked={action.modal} onChange={(event) => updateSelected({ action: { ...action, modal: event.target.checked } })} />{t('mainMenuPanel.openAsModal')}</label></>}
      {action.type === 'setProperty' && <><label className="nocode-action-field"><span>{t('mainMenuPanel.component')}</span><select value={action.target} onChange={(event) => updateSelected({ action: { ...action, target: event.target.value } })}><option value="">{t('mainMenuPanel.select')}</option>{components.filter((item) => item.name !== componentName).map((item) => <option key={item.name} value={item.name}>{item.name} ({item.className})</option>)}</select></label><div className="nocode-property"><label className="nocode-action-field"><span>{t('mainMenuPanel.property')}</span><select value={action.property} onChange={(event) => updateSelected({ action: { ...action, property: event.target.value } })}><option>Enabled</option><option>Visible</option><option>Caption</option><option>Text</option><option>Checked</option></select></label><label className="nocode-action-field"><span>{t('mainMenuPanel.value')}</span><input value={action.value} onChange={(event) => updateSelected({ action: { ...action, value: event.target.value } })} /></label></div></>}
      {selected.caption === '-' && <small>{t('mainMenuPanel.separatorHint')}</small>}
    </div>}
    <button className="nocode-save" onClick={() => void apply()} disabled={saving}><Save size={12} />{saving ? t('mainMenuPanel.applyingMenu') : t('mainMenuPanel.applyMenuAndActions')}</button>
    {status && <div className={`nocode-status${status.startsWith(t('mainMenuPanel.errorWord')) ? ' error' : ''}`}>{status}</div>}
  </div>
}
