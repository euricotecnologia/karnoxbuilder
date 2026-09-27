import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Database, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import type { DatabaseKind, DatabaseSchema } from '../DatabaseExplorer/types'
import './NoCodeActionsPanel.css'

type FilterOperator = '=' | '<>' | '>' | '<' | '>=' | '<=' | 'contains' | 'startsWith' | 'isNull' | 'isNotNull'
interface FilterCondition { field: string; operator: FilterOperator; value: string }
interface SortRule { field: string; direction: 'ASC' | 'DESC' }

function getFilterOperators(t: (key: string) => string): Array<{ value: FilterOperator; label: string; needsValue: boolean }> {
  return [
    { value: '=', label: t('dbBinding.operators.equals'), needsValue: true },
    { value: '<>', label: t('dbBinding.operators.notEquals'), needsValue: true },
    { value: '>', label: t('dbBinding.operators.greaterThan'), needsValue: true },
    { value: '<', label: t('dbBinding.operators.lessThan'), needsValue: true },
    { value: '>=', label: t('dbBinding.operators.greaterOrEqual'), needsValue: true },
    { value: '<=', label: t('dbBinding.operators.lessOrEqual'), needsValue: true },
    { value: 'contains', label: t('dbBinding.operators.contains'), needsValue: true },
    { value: 'startsWith', label: t('dbBinding.operators.startsWith'), needsValue: true },
    { value: 'isNull', label: t('dbBinding.operators.isEmpty'), needsValue: false },
    { value: 'isNotNull', label: t('dbBinding.operators.isNotEmpty'), needsValue: false }
  ]
}

const hasField = (className: string): boolean => !/^(?:TDBGrid|TDBNavigator|TDBCtrlGrid)$/i.test(className)
const isNavigator = (className: string): boolean => /^TDBNavigator$/i.test(className)
const isLookupList = (className: string): boolean => /^TDBLookupListBox$/i.test(className)

interface ProjectDatabaseInfo {
  kind: DatabaseKind
  label: string
  database: string
  iniPath: string
  enabled: boolean
  source: 'project'
}
export interface DatabaseBoundComponent {
  name: string
  className: string
  properties?: Record<string, string>
}

export interface DatabaseGridColumn {
  fieldName: string
  title: string
  width: number
  alignment: 'taLeftJustify' | 'taCenter' | 'taRightJustify'
  readOnly: boolean
}

const humanizeFieldName = (name: string): string => name
  .replace(/[_\-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/(^|\s)(\p{L})/gu, (_match, space: string, letter: string) => `${space}${letter.toUpperCase()}`)

const gridColumnFromSchema = (column: { name: string; dataType: string }, readOnly: boolean): DatabaseGridColumn => {
  const dataType = column.dataType.toLowerCase()
  const numeric = /(?:int|number|numeric|decimal|float|double|real|money|currency)/.test(dataType)
  const logical = /(?:bool|boolean|bit)/.test(dataType)
  const temporal = /(?:date|time|timestamp)/.test(dataType)
  const title = humanizeFieldName(column.name) || column.name
  return {
    fieldName: column.name,
    title,
    width: logical ? 80 : temporal ? 130 : numeric ? 105 : Math.min(260, Math.max(120, title.length * 9)),
    alignment: numeric ? 'taRightJustify' : logical || temporal ? 'taCenter' : 'taLeftJustify',
    readOnly
  }
}

function getNavButtons(t: (key: string) => string): Array<{ token: string; label: string }> {
  return [
    { token: 'nbFirst', label: t('dbBinding.nav.first') }, { token: 'nbPrior', label: t('dbBinding.nav.prior') },
    { token: 'nbNext', label: t('dbBinding.nav.next') }, { token: 'nbLast', label: t('dbBinding.nav.last') },
    { token: 'nbInsert', label: t('dbBinding.nav.insert') }, { token: 'nbDelete', label: t('dbBinding.nav.delete') },
    { token: 'nbEdit', label: t('dbBinding.nav.edit') }, { token: 'nbPost', label: t('dbBinding.nav.save') },
    { token: 'nbCancel', label: t('common.cancel') }, { token: 'nbRefresh', label: t('dbBinding.nav.refresh') }
  ]
}
function parseVisibleButtons(raw: string | undefined, navButtons: Array<{ token: string; label: string }>): Set<string> {
  if (!raw) return new Set(navButtons.map((item) => item.token))
  const found = [...raw.matchAll(/nb[A-Za-z]+/g)].map((match) => match[0])
  return new Set(found.length ? found : navButtons.map((item) => item.token))
}

export function DatabaseBindingPanel({ component, components, properties, onApply, dbRadioItems, dbRadioValues, onDbRadioItems }: {
  component: { name: string; className: string }
  components: DatabaseBoundComponent[]
  properties: Record<string, string>
  onApply: (changes: Array<{ property: string; value: string | boolean }>, columns?: DatabaseGridColumn[]) => void
  dbRadioItems: string[]
  dbRadioValues: string[]
  onDbRadioItems: (items: string[], values: string[]) => void
}): JSX.Element {
  const { t } = useTranslation()
  const FILTER_OPERATORS = useMemo(() => getFilterOperators(t), [t])
  const NAV_BUTTONS = useMemo(() => getNavButtons(t), [t])
  const projectDir = useAppStore((state) => state.projectDir)
  const [projectDatabase, setProjectDatabase] = useState<ProjectDatabaseInfo | null>(null)
  const [kind, setKind] = useState<DatabaseKind>('sqlite')
  const [schema, setSchema] = useState<DatabaseSchema | null>(null)
  const [tableKey, setTableKey] = useState('')
  const [fields, setFields] = useState<string[]>([])
  const [dataField, setDataField] = useState(properties.DataField ?? '')
  const [readOnly, setReadOnly] = useState(properties.ReadOnly === 'True')
  const [allowEdit, setAllowEdit] = useState(true)
  const [allowInsert, setAllowInsert] = useState(true)
  const [allowDelete, setAllowDelete] = useState(true)
  const [visibleButtons, setVisibleButtons] = useState<Set<string>>(() => parseVisibleButtons(properties.VisibleButtons, getNavButtons(t)))
  const toggleNavButton = (token: string): void => setVisibleButtons((current) => {
    const next = new Set(current)
    if (next.has(token)) next.delete(token); else next.add(token)
    return next
  })
  const isDbRadioGroup = /^TDBRadioGroup$/i.test(component.className)
  const isDbCheckBox = /^TDBCheckBox$/i.test(component.className)
  const [radioOptions, setRadioOptions] = useState<Array<{ label: string; value: string }>>(() => dbRadioItems.map((label, index) => ({ label, value: dbRadioValues[index] ?? '' })))
  const [valueChecked, setValueChecked] = useState(properties.ValueChecked ?? 'S')
  const [valueUnchecked, setValueUnchecked] = useState(properties.ValueUnchecked ?? 'N')
  const addRadioOption = (): void => setRadioOptions((current) => [...current, { label: '', value: '' }])
  const updateRadioOption = (index: number, patch: Partial<{ label: string; value: string }>): void => setRadioOptions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const removeRadioOption = (index: number): void => setRadioOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))
  const [filters, setFilters] = useState<FilterCondition[]>([])
  const [sort, setSort] = useState<SortRule[]>([])
  const [lookupTableKey, setLookupTableKey] = useState('')
  const [lookupKeyField, setLookupKeyField] = useState(properties.KeyField ?? '')
  const [lookupListField, setLookupListField] = useState(properties.ListField ?? '')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const grids = useMemo(
    () => components.filter((item) => /^TDBGrid$/i.test(item.className) && item.name !== component.name),
    [component.name, components]
  )
  const [linkedGridName, setLinkedGridName] = useState('')

  useEffect(() => {
    if (!isNavigator(component.className)) return
    setLinkedGridName((current) => {
      if (current && grids.some((grid) => grid.name === current)) return current
      const sameDataSource = grids.find((grid) => grid.properties?.DataSource && grid.properties.DataSource === properties.DataSource)
      return sameDataSource?.name ?? grids[0]?.name ?? ''
    })
  }, [component.className, grids, properties.DataSource])
const chooseTable = (item: DatabaseSchema['objects'][number] | undefined): void => {
    if (!item) {
      setTableKey('')
      setFields([])
      setDataField('')
      return
    }
    const available = item.columns.map((column) => column.name)
    const preferred = [properties.DataField, dataField].find((field) => field && available.includes(field)) ?? available[0] ?? ''
    setTableKey(`${item.schema}.${item.name}`)
    setFields(available)
    setDataField(preferred)
  }

  const load = async (): Promise<void> => {
    if (isNavigator(component.className)) return
    setBusy(true)
    setStatus(t('dbBinding.readingSchema'))
    try {
      if (!projectDir) throw new Error(t('dbBinding.noProjectOpen'))
      const info = await window.api.databaseExplorer.projectInfo(projectDir) as ProjectDatabaseInfo
      setProjectDatabase(info)
      setKind(info.kind)
      await window.api.databaseExplorer.projectTest(projectDir)
      const value = await window.api.databaseExplorer.projectSchema(projectDir) as DatabaseSchema
      setSchema(value)
      const availableTables = value.objects.filter((item) => item.type === 'table')
      const selected = availableTables.find((item) => `${item.schema}.${item.name}` === tableKey) ?? availableTables[0]
      chooseTable(selected)
      setStatus('')
    } catch (error) {
      setSchema(null)
      setStatus(t('dbBinding.errorPrefix', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (!isNavigator(component.className) && projectDir) void load()
  }, [component.className, projectDir])

const tables = useMemo(() => schema?.objects.filter((item) => item.type === 'table') ?? [], [schema])
  const table = tables.find((item) => `${item.schema}.${item.name}` === tableKey) ?? null
  const selectTable = (value: string): void => chooseTable(tables.find((entry) => `${entry.schema}.${entry.name}` === value))
  const toggleField = (name: string): void => setFields((current) => {
    if (!current.includes(name)) return [...current, name]
    const remaining = current.filter((field) => field !== name)
    if (name === dataField) setDataField(remaining[0] ?? '')
    return remaining
  })
  const selectDataField = (name: string): void => {
    setDataField(name)
    setFields((current) => current.includes(name) ? current : [...current, name])
  }
  const lookupTable = tables.find((item) => `${item.schema}.${item.name}` === lookupTableKey) ?? null
  const selectLookupTable = (value: string): void => {
    setLookupTableKey(value)
    const entry = tables.find((item) => `${item.schema}.${item.name}` === value)
    const columns = entry?.columns ?? []
    setLookupKeyField(columns.find((column) => column.primaryKey)?.name ?? columns[0]?.name ?? '')
    setLookupListField(columns.find((column) => !column.primaryKey)?.name ?? columns[0]?.name ?? '')
  }
  useEffect(() => { setFilters([]); setSort([]) }, [tableKey])
  const addFilter = (): void => setFilters((current) => [...current, { field: table?.columns[0]?.name ?? '', operator: '=', value: '' }])
  const updateFilter = (index: number, patch: Partial<FilterCondition>): void => setFilters((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const removeFilter = (index: number): void => setFilters((current) => current.filter((_, itemIndex) => itemIndex !== index))
  const addSort = (): void => setSort((current) => [...current, { field: table?.columns[0]?.name ?? '', direction: 'ASC' }])
  const updateSort = (index: number, patch: Partial<SortRule>): void => setSort((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const removeSort = (index: number): void => setSort((current) => current.filter((_, itemIndex) => itemIndex !== index))

  const applyNavigator = (): void => {
    const grid = grids.find((item) => item.name === linkedGridName)
    const dataSource = grid?.properties?.DataSource
    if (!grid || !dataSource) {
      setStatus(grids.length ? t('dbBinding.errorApplyGridFirst') : t('dbBinding.errorAddGridFirst'))
      return
    }
    onApply([
      { property: 'DataSource', value: dataSource },
      { property: 'VisibleButtons', value: `[${NAV_BUTTONS.filter((item) => visibleButtons.has(item.token)).map((item) => item.token).join(', ')}]` },
      { property: 'ConfirmDelete', value: visibleButtons.has('nbDelete') }
    ])
    setStatus(t('dbBinding.navigatorLinked', { grid: grid.name, dataSource }))
  }

  const apply = async (): Promise<void> => {
    if (isNavigator(component.className)) {
      applyNavigator()
      return
    }
    if (!projectDir || !table || (hasField(component.className) && !dataField)) return
    if (isLookupList(component.className) && (!lookupTable || !lookupKeyField || !lookupListField)) return
    setBusy(true)
    setStatus(t('dbBinding.creatingQuery'))
    try {
      const selectedFields = dataField && !fields.includes(dataField) ? [...fields, dataField] : fields
      const validFilters = filters.filter((item) => item.field && (FILTER_OPERATORS.find((op) => op.value === item.operator)?.needsValue === false || item.value.trim()))
      const validSort = sort.filter((item) => item.field)
      const result = await window.api.nocode.bindDatabase({ projectDir, databaseKind: kind, schema: table.schema, table: table.name, fields: selectedFields, readOnly, allowEdit, allowInsert, allowDelete, filters: validFilters, sort: validSort }) as { dataSource: string; fields: string[]; dataModuleUnit: string }
      const changes: Array<{ property: string; value: string | boolean }> = [{ property: 'DataSource', value: result.dataSource }]
      if (hasField(component.className)) changes.push({ property: 'DataField', value: dataField })
      if (isLookupList(component.className) && lookupTable) {
        const lookupResult = await window.api.nocode.bindDatabase({
          projectDir, databaseKind: kind, schema: lookupTable.schema, table: lookupTable.name,
          fields: lookupTable.columns.map((column) => column.name), readOnly: true, allowEdit: false, allowInsert: false, allowDelete: false,
          sort: [{ field: lookupListField, direction: 'ASC' }]
        }) as { dataSource: string }
        changes.push({ property: 'ListSource', value: lookupResult.dataSource }, { property: 'KeyField', value: lookupKeyField }, { property: 'ListField', value: lookupListField })
      }
      if (/^(?:TDBGrid|TDBEdit|TDBMemo|TDBImage|TDBComboBox|TDBListBox)$/i.test(component.className)) changes.push({ property: 'ReadOnly', value: readOnly })
      if (isDbCheckBox) changes.push({ property: 'ValueChecked', value: valueChecked }, { property: 'ValueUnchecked', value: valueUnchecked })
      if (/^TDBGrid$/i.test(component.className)) {
        const options = ['dgTitles', 'dgIndicator', 'dgColumnResize', 'dgColLines', 'dgRowLines', 'dgTabs', 'dgConfirmDelete', 'dgCancelOnExit', 'dgTitleClick', 'dgTitleHotTrack']
        if (readOnly) options.push('dgRowSelect')
        changes.push({ property: 'Options', value: `[${options.join(', ')}]` })
      }
      const gridColumns = /^TDBGrid$/i.test(component.className)
        ? table.columns.filter((column) => selectedFields.includes(column.name)).map((column) => gridColumnFromSchema(column, readOnly))
        : undefined
      onApply(changes, gridColumns)
      setStatus(t('dbBinding.boundTo', { table: table.name, dataModule: result.dataModuleUnit }))
    } catch (error) {
      setStatus(t('dbBinding.errorPrefix', { message: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
    }
  }

  if (isNavigator(component.className)) {
    const linkedGrid = grids.find((grid) => grid.name === linkedGridName)
    return <div className="nocode-panel nocode-db-binding">
      <div className="nocode-intro"><Database size={15} /><span>{t('dbBinding.visualRecordNavigator')}</span></div>
      <label className="nocode-action-field"><span>{t('dbBinding.controlledGrid')}</span><select value={linkedGridName} onChange={(event) => setLinkedGridName(event.target.value)}><option value="">{t('dbBinding.selectDbGrid')}</option>{grids.map((grid) => <option key={grid.name} value={grid.name}>{grid.name}{grid.properties?.DataSource ? ` - ${grid.properties.DataSource}` : ` - ${t('dbBinding.notLinkedYet')}`}</option>)}</select></label>
      {linkedGrid && <div className="nocode-db-summary"><span>{t('dbBinding.sharedDataSource')}</span><small>{linkedGrid.properties?.DataSource || t('dbBinding.gridNeedsBindingFirst')}</small></div>}
      <div className="nocode-db-section">{t('dbBinding.displayedButtons')}</div>
      <div className="nocode-db-fields">{NAV_BUTTONS.map((item) => <label key={item.token}><input type="checkbox" checked={visibleButtons.has(item.token)} onChange={() => toggleNavButton(item.token)} /><span>{item.label}</span></label>)}</div>
      <button className="nocode-save" onClick={() => applyNavigator()} disabled={!linkedGridName}><Save size={12} />{t('dbBinding.applyNavigator')}</button>
      {status && <div className={`nocode-status${status.startsWith(t('dbBinding.errorWord')) ? ' error' : ''}`}>{status}</div>}
    </div>
  }

  const fieldLabel = /^TDBEdit$/i.test(component.className) ? t('dbBinding.tableFieldForDbEdit') : t('dbBinding.fieldLinkedToComponent')
  return <div className="nocode-panel nocode-db-binding">
    <div className="nocode-intro"><Database size={15} /><span>{t('dbBinding.visualDatabaseBinding')}</span></div>
    <label className="nocode-action-field"><span>{t('dbBinding.projectDatabase')}</span><div className="nocode-db-inline"><select value={kind} disabled><option value={kind}>{projectDatabase?.label ?? t('dbBinding.loadingIni')}</option></select><button onClick={() => void load()} disabled={busy || !projectDir}><RefreshCw size={12} /></button></div></label>{projectDatabase && <div className="nocode-db-summary"><span>{t('dbBinding.isolatedPerProject')}</span><small>{projectDatabase.database}<br />{projectDatabase.iniPath}</small></div>}
    <label className="nocode-action-field"><span>{t('dbBinding.table')}</span><select value={tableKey} onChange={(event) => selectTable(event.target.value)}><option value="">{t('mainMenuPanel.select')}</option>{tables.map((item) => <option key={`${item.schema}.${item.name}`} value={`${item.schema}.${item.name}`}>{item.schema && item.schema !== 'main' ? `${item.schema}.` : ''}{item.name}</option>)}</select></label>
    {table && hasField(component.className) && <label className="nocode-action-field"><span>{fieldLabel}</span><select value={dataField} onChange={(event) => selectDataField(event.target.value)}><option value="">{t('dbBinding.selectField')}</option>{table.columns.map((column) => <option key={column.name} value={column.name}>{column.name} - {column.dataType}</option>)}</select></label>}
    {isDbCheckBox && <section className="nocode-image-config"><div className="nocode-section-title">{t('dbBinding.savedValues')}</div><div className="nocode-property"><label className="nocode-action-field"><span>{t('dbBinding.whenChecked')}</span><input value={valueChecked} onChange={(event) => setValueChecked(event.target.value)} /></label><label className="nocode-action-field"><span>{t('dbBinding.whenUnchecked')}</span><input value={valueUnchecked} onChange={(event) => setValueUnchecked(event.target.value)} /></label></div><small>{t('dbBinding.checkboxValuesHint')}</small></section>}
    {isDbRadioGroup && <section className="nocode-image-config"><div className="nocode-section-title">{t('dbBinding.radioPermanentOptions')}</div>
      {radioOptions.map((item, index) => <div className="nocode-db-sort-row" key={index}>
        <input value={item.label} placeholder={t('dbBinding.displayedText')} onChange={(event) => updateRadioOption(index, { label: event.target.value })} />
        <input value={item.value} placeholder={t('dbBinding.savedValue')} onChange={(event) => updateRadioOption(index, { value: event.target.value })} />
        <button onClick={() => removeRadioOption(index)} title={t('dbBinding.removeOption')}><Trash2 size={12} /></button>
      </div>)}
      <button onClick={addRadioOption}><Plus size={12} />{t('dbBinding.addOption')}</button>
      <button onClick={() => { onDbRadioItems(radioOptions.map((item) => item.label), radioOptions.map((item) => item.value)); setStatus(t('dbBinding.optionsSaved')) }}><Save size={12} />{t('dbBinding.applyOptionsToDfm')}</button>
      <small>{t('dbBinding.radioOptionHint')}</small>
    </section>}
    {table && isLookupList(component.className) && <>
      <div className="nocode-db-section">{t('dbBinding.lookupTable')}</div>
      <label className="nocode-action-field"><span>{t('dbBinding.supportTable')}</span><select value={lookupTableKey} onChange={(event) => selectLookupTable(event.target.value)}><option value="">{t('mainMenuPanel.select')}</option>{tables.map((item) => <option key={`${item.schema}.${item.name}`} value={`${item.schema}.${item.name}`}>{item.schema && item.schema !== 'main' ? `${item.schema}.` : ''}{item.name}</option>)}</select></label>
      {lookupTable && <div className="nocode-property">
        <label className="nocode-action-field"><span>{t('dbBinding.keyField')}</span><select value={lookupKeyField} onChange={(event) => setLookupKeyField(event.target.value)}>{lookupTable.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select></label>
        <label className="nocode-action-field"><span>{t('dbBinding.listField')}</span><select value={lookupListField} onChange={(event) => setLookupListField(event.target.value)}>{lookupTable.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select></label>
      </div>}
      {lookupTable && <small>{t('dbBinding.lookupFieldHint', { field: fieldLabel.toLowerCase(), key: lookupKeyField || 'KeyField', list: lookupListField || 'ListField', table: lookupTable.name })}</small>}
    </>}
    {table && <><div className="nocode-db-section">{t('dbBinding.availableFields')}</div><div className="nocode-db-fields">{table.columns.map((column) => <label key={column.name}><input type="checkbox" checked={fields.includes(column.name)} onChange={() => toggleField(column.name)} /><span>{column.name}<small>{column.dataType}{column.primaryKey ? ` · ${t('dbBinding.key')}` : ''}</small></span></label>)}</div></>}
    {table && <><div className="nocode-db-section">{t('dbBinding.filterSection')}</div>
      {filters.map((filterItem, index) => <div className="nocode-db-filter-row" key={index}>
        <select value={filterItem.field} onChange={(event) => updateFilter(index, { field: event.target.value })}>{table.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select>
        <select value={filterItem.operator} onChange={(event) => updateFilter(index, { operator: event.target.value as FilterOperator })}>{FILTER_OPERATORS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}</select>
        <input value={filterItem.value} placeholder={t('dbBinding.value')} disabled={FILTER_OPERATORS.find((op) => op.value === filterItem.operator)?.needsValue === false} onChange={(event) => updateFilter(index, { value: event.target.value })} />
        <button onClick={() => removeFilter(index)} title={t('dbBinding.removeCondition')}><Trash2 size={12} /></button>
      </div>)}
      <button onClick={addFilter}><Plus size={12} />{t('dbBinding.addCondition')}</button>
      {filters.length > 1 && <small>{t('dbBinding.conditionsCombinedHint')}</small>}
    </>}
    {table && <><div className="nocode-db-section">{t('dbBinding.sorting')}</div>
      {sort.map((sortItem, index) => <div className="nocode-db-sort-row" key={index}>
        <select value={sortItem.field} onChange={(event) => updateSort(index, { field: event.target.value })}>{table.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select>
        <select value={sortItem.direction} onChange={(event) => updateSort(index, { direction: event.target.value as 'ASC' | 'DESC' })}><option value="ASC">{t('dbBinding.ascending')}</option><option value="DESC">{t('dbBinding.descending')}</option></select>
        <button onClick={() => removeSort(index)} title={t('dbBinding.removeSort')}><Trash2 size={12} /></button>
      </div>)}
      <button onClick={addSort}><Plus size={12} />{t('dbBinding.addSort')}</button>
    </>}
    <div className="nocode-db-section">{t('dbBinding.permissions')}</div>
    <label className="nocode-check"><input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} />{t('dbBinding.readOnly')}</label>
    <label className="nocode-check"><input type="checkbox" checked={allowEdit} disabled={readOnly} onChange={(event) => setAllowEdit(event.target.checked)} />{t('dbBinding.allowEdit')}</label>
    {/^(?:TDBGrid)$/i.test(component.className) && <><label className="nocode-check"><input type="checkbox" checked={allowInsert} disabled={readOnly} onChange={(event) => setAllowInsert(event.target.checked)} />{t('dbBinding.allowInsert')}</label><label className="nocode-check"><input type="checkbox" checked={allowDelete} disabled={readOnly} onChange={(event) => setAllowDelete(event.target.checked)} />{t('dbBinding.allowDelete')}</label></>}
    <div className="nocode-db-summary"><span>{t('dbBinding.architecture')}</span><small>{t('dbBinding.architectureFlow')}</small></div>
    <button className="nocode-save" onClick={() => void apply()} disabled={busy || !table || !fields.length || (hasField(component.className) && !dataField) || (!readOnly && !allowEdit && !allowInsert && !allowDelete) || (isLookupList(component.className) && (!lookupTable || !lookupKeyField || !lookupListField))}><Save size={12} />{busy ? t('dbBinding.applying') : t('dbBinding.applyDataBinding')}</button>
    {status && <div className={`nocode-status${status.startsWith(t('dbBinding.errorWord')) ? ' error' : ''}`}>{status}</div>}
  </div>
}
