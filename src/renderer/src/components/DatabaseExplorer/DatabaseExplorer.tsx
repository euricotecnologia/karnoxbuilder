import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MonacoEditor from '@monaco-editor/react'
import {
  Database, X, RefreshCw, Play, Table2, Eye, Workflow, Zap, ListTree,
  History, Code2, GitCompare, Milestone, Wand2, Network, Save, Trash2,
  Plus, ChevronDown, ChevronRight, PlugZap, Download
} from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import type {
  DatabaseKind, DatabaseObject, DatabaseObjectType, DatabaseProfile, DatabaseSchema,
  Migration, QueryHistory as QueryHistoryRow, QueryResult
} from './types'
import { DATABASE_LABELS } from './types'
import {
  deleteRowSql, generateDelphiCrud, generateDelphiDataModule, generateDelphiEntity,
  generateSqlScript, insertRowSql, selectRowsSql, updateRowSql
} from './databaseGenerators'
import './DatabaseExplorer.css'

type ViewId = 'data' | 'sql' | 'history' | 'scripts' | 'compare' | 'migrations' | 'generators' | 'diagram'

function getViews(t: (key: string) => string): Array<{ id: ViewId; label: string; icon: typeof Table2 }> {
  return [
    { id: 'data', label: t('databaseExplorer.views.data'), icon: Table2 }, { id: 'sql', label: t('databaseExplorer.views.sql'), icon: Code2 },
    { id: 'history', label: t('databaseExplorer.views.history'), icon: History }, { id: 'scripts', label: t('databaseExplorer.views.scripts'), icon: Download },
    { id: 'compare', label: t('databaseExplorer.views.compare'), icon: GitCompare }, { id: 'migrations', label: t('databaseExplorer.views.migrations'), icon: Milestone },
    { id: 'generators', label: t('databaseExplorer.views.generators'), icon: Wand2 }, { id: 'diagram', label: t('databaseExplorer.views.diagram'), icon: Network }
  ]
}

function getGroups(t: (key: string) => string): Array<{ type: DatabaseObjectType; label: string; icon: typeof Table2 }> {
  return [
    { type: 'table', label: t('databaseExplorer.groups.tables'), icon: Table2 }, { type: 'view', label: t('databaseExplorer.groups.views'), icon: Eye },
    { type: 'procedure', label: t('databaseExplorer.groups.procedures'), icon: Workflow }, { type: 'trigger', label: t('databaseExplorer.groups.triggers'), icon: Zap },
    { type: 'sequence', label: t('databaseExplorer.groups.sequences'), icon: ListTree }
  ]
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }

function isProfileConfigured(profile: DatabaseProfile): boolean {
  if (profile.kind === 'sqlite') return profile.databasePath.trim().length > 0
  if (profile.kind === 'firebird') return (profile.databasePath || profile.databaseName).trim().length > 0
  return profile.host.trim().length > 0 && profile.databaseName.trim().length > 0
}

function ObjectsTree({ schema, selected, onSelect }: { schema: DatabaseSchema; selected: DatabaseObject | null; onSelect: (object: DatabaseObject) => void }): JSX.Element {
  const { t } = useTranslation()
  const GROUPS = getGroups(t)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ table: true, view: true, procedure: false, trigger: false, sequence: false })
  return <div className="db-object-tree">
    {GROUPS.map((group) => {
      const items = schema.objects.filter((item) => item.type === group.type)
      const Icon = group.icon
      return <div key={group.type} className="db-object-group">
        <button className="db-tree-group" onClick={() => setExpanded((current) => ({ ...current, [group.type]: !current[group.type] }))}>
          {expanded[group.type] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<Icon size={14} />
          <span>{group.label}</span><small>{items.length}</small>
        </button>
        {expanded[group.type] && items.map((item) => <button
          key={`${item.schema}.${item.name}`} className={`db-tree-item ${selected === item ? 'active' : ''}`}
          title={`${item.schema}.${item.name}`} onClick={() => onSelect(item)}
        ><span>{item.name}</span>{item.schema && <small>{item.schema}</small>}</button>)}
      </div>
    })}
  </div>
}

function ResultGrid({ result, object, kind, execute, onRefresh }: { result: QueryResult | null; object: DatabaseObject | null; kind: DatabaseKind; execute: (sql: string) => Promise<QueryResult>; onRefresh: () => Promise<void> }): JSX.Element {
  const { t } = useTranslation()
  const [edited, setEdited] = useState<Record<number, Record<string, unknown>>>({})
  const [newRow, setNewRow] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState<number | 'new' | null>(null)

  useEffect(() => { setEdited({}); setNewRow(null) }, [result, object])
  if (!result) return <div className="db-empty">{t('databaseExplorer.grid.runQueryOrSelectTable')}</div>
  if (!result.columns.length) return <div className="db-empty">{t('databaseExplorer.grid.commandExecuted', { count: result.affectedRows, ms: result.durationMs })}</div>

  async function saveRow(index: number): Promise<void> {
    if (!object) return
    const sql = updateRowSql(kind, object, result!.rows[index], edited[index] ?? result!.rows[index])
    if (!sql) return
    setSaving(index)
    try { await execute(sql); await onRefresh() }
    catch (error) { window.alert(t('databaseExplorer.grid.saveFailed', { message: errorMessage(error) })) }
    finally { setSaving(null) }
  }

  async function removeRow(index: number): Promise<void> {
    if (!object || !window.confirm(t('databaseExplorer.grid.deleteConfirm'))) return
    setSaving(index)
    try { await execute(deleteRowSql(kind, object, result!.rows[index])); await onRefresh() }
    catch (error) { window.alert(t('databaseExplorer.grid.deleteFailed', { message: errorMessage(error) })) }
    finally { setSaving(null) }
  }

  async function insertRow(): Promise<void> {
    if (!object || !newRow) return
    setSaving('new')
    try { await execute(insertRowSql(kind, object, newRow)); await onRefresh() }
    catch (error) { window.alert(t('databaseExplorer.grid.insertFailed', { message: errorMessage(error) })) }
    finally { setSaving(null) }
  }

  return <div className={`db-grid-wrap${object?.type === 'table' ? '' : ' no-actions'}`}>
    {object?.type === 'table' && <div className="db-grid-actions"><button onClick={() => setNewRow({})}><Plus size={13} /> {t('databaseExplorer.grid.newRecord')}</button><span>{t('databaseExplorer.grid.editHint')}</span></div>}
    <table className="db-grid"><thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}{object?.type === 'table' && <th className="db-grid-row-actions">{t('databaseExplorer.grid.actions')}</th>}</tr></thead>
      <tbody>
        {newRow && <tr className="new">{result.columns.map((column) => <td key={column}><input value={displayValue(newRow[column])} onChange={(event) => setNewRow({ ...newRow, [column]: event.target.value })} placeholder="NULL" /></td>)}<td><button title={t('databaseExplorer.grid.insert')} disabled={saving === 'new'} onClick={insertRow}><Save size={13} /></button><button title={t('common.cancel')} onClick={() => setNewRow(null)}><X size={13} /></button></td></tr>}
        {result.rows.map((row, index) => <tr key={index}>{result.columns.map((column) => <td key={column}>{object?.type === 'table' ? <input
          value={displayValue((edited[index] ?? row)[column])} title={displayValue(row[column])}
          onChange={(event) => setEdited((current) => ({ ...current, [index]: { ...row, ...current[index], [column]: event.target.value } }))}
        /> : displayValue(row[column])}</td>)}{object?.type === 'table' && <td><button title={t('databaseExplorer.grid.saveRow')} disabled={!edited[index] || saving === index} onClick={() => saveRow(index)}><Save size={13} /></button><button title={t('databaseExplorer.grid.deleteRow')} disabled={saving === index} onClick={() => removeRow(index)}><Trash2 size={13} /></button></td>}</tr>)}
      </tbody>
    </table>
    <div className="db-result-status">{t('databaseExplorer.grid.rowsStatus', { rows: result.rowCount, ms: result.durationMs })}</div>
  </div>
}

function HistoryView({ kind, onUse }: { kind: DatabaseKind; onUse: (sql: string) => void }): JSX.Element {
  const { t } = useTranslation()
  const [rows, setRows] = useState<QueryHistoryRow[]>([])
  const load = async (): Promise<void> => setRows(await window.api.databaseExplorer.history(kind, 300))
  useEffect(() => { void load() }, [kind])
  return <div className="db-list-view"><div className="db-section-toolbar"><span>{t('databaseExplorer.history.commandsIn', { database: DATABASE_LABELS[kind] })}</span><button onClick={async () => { await window.api.databaseExplorer.clearHistory(kind); await load() }}><Trash2 size={13} /> {t('databaseExplorer.history.clear')}</button></div>
    {rows.map((row) => <button className="db-history-row" key={row.id} onClick={() => onUse(row.sql)}><span className={row.status}>{row.status === 'success' ? t('databaseExplorer.history.ok') : t('databaseExplorer.history.error')}</span><code>{row.sql}</code><small>{row.durationMs} ms · {new Date(row.executedAt).toLocaleString()}</small>{row.error && <em>{row.error}</em>}</button>)}
    {!rows.length && <div className="db-empty">{t('databaseExplorer.history.empty')}</div>}
  </div>
}

function ScriptsView({ kind, object }: { kind: DatabaseKind; object: DatabaseObject | null }): JSX.Element {
  const { t } = useTranslation()
  const script = object ? generateSqlScript(kind, object) : t('databaseExplorer.scripts.selectObjectHint')
  async function save(): Promise<void> {
    if (!object) return
    const path = await window.api.fs.saveFileDialog(`${object.name}.sql`)
    if (path) await window.api.fs.writeFile(path, script)
  }
  return <div className="db-script-view"><div className="db-section-toolbar"><span>{t('databaseExplorer.scripts.creationScriptOf', { name: object?.name ?? t('databaseExplorer.scripts.object') })}</span><button onClick={save} disabled={!object}><Save size={13} /> {t('databaseExplorer.scripts.saveSql')}</button></div><MonacoEditor height="100%" language="sql" theme="vs-dark" value={script} options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} /></div>
}

function CompareView({ profiles, current }: { profiles: DatabaseProfile[]; current: DatabaseKind }): JSX.Element {
  const { t } = useTranslation()
  const available = profiles.filter(isProfileConfigured)
  const [left, setLeft] = useState<DatabaseKind>(current)
  const [right, setRight] = useState<DatabaseKind>(available.find((profile) => profile.kind !== current)?.kind ?? current)
  const [result, setResult] = useState<{ onlyLeft: string[]; onlyRight: string[]; changed: Array<{ object: string; details: string[] }> } | null>(null)
  const [busy, setBusy] = useState(false)
  return <div className="db-compare-view"><div className="db-compare-controls"><select value={left} onChange={(e) => setLeft(e.target.value as DatabaseKind)}>{available.map((p) => <option key={p.kind} value={p.kind}>{DATABASE_LABELS[p.kind]}</option>)}</select><span>{t('databaseExplorer.compare.compareWith')}</span><select value={right} onChange={(e) => setRight(e.target.value as DatabaseKind)}>{available.map((p) => <option key={p.kind} value={p.kind}>{DATABASE_LABELS[p.kind]}</option>)}</select><button disabled={busy || left === right} onClick={async () => { setBusy(true); try { setResult(await window.api.databaseExplorer.compare({ left, right })) } catch (e) { window.alert(errorMessage(e)) } finally { setBusy(false) } }}><GitCompare size={13} /> {busy ? t('databaseExplorer.compare.comparing') : t('databaseExplorer.compare.compareStructures')}</button></div>
    {result && <div className="db-diff-columns"><section><h3>{t('databaseExplorer.compare.onlyInSource')}</h3>{result.onlyLeft.map((item) => <code key={item}>− {item}</code>)}</section><section><h3>{t('databaseExplorer.compare.onlyInTarget')}</h3>{result.onlyRight.map((item) => <code key={item}>+ {item}</code>)}</section><section><h3>{t('databaseExplorer.compare.differentStructures')}</h3>{result.changed.map((item) => <div key={item.object}><strong>{item.object}</strong>{item.details.map((detail) => <small key={detail}>{detail}</small>)}</div>)}</section></div>}
    {!result && <div className="db-empty">{t('databaseExplorer.compare.selectConnectionsHint')}</div>}
  </div>
}

function MigrationsView({ kind }: { kind: DatabaseKind }): JSX.Element {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Migration[]>([])
  const [draft, setDraft] = useState({ version: new Date().toISOString().replace(/\D/g, '').slice(0, 14), name: '', upSql: '', downSql: '' })
  const load = async (): Promise<void> => setRows(await window.api.databaseExplorer.migrations(kind))
  useEffect(() => { void load() }, [kind])
  async function save(): Promise<void> {
    if (!draft.version || !draft.name || !draft.upSql) return window.alert(t('databaseExplorer.migrations.missingFields'))
    await window.api.databaseExplorer.saveMigration({ profileKind: kind, ...draft }); setDraft({ ...draft, name: '', upSql: '', downSql: '' }); await load()
  }
  async function apply(id: string, direction: 'up' | 'down'): Promise<void> {
    if (!window.confirm(direction === 'up' ? t('databaseExplorer.migrations.applyConfirm') : t('databaseExplorer.migrations.revertConfirm'))) return
    try { await window.api.databaseExplorer.applyMigration({ id, direction }); await load() } catch (e) { window.alert(errorMessage(e)); await load() }
  }
  return <div className="db-migrations"><div className="db-migration-form"><input placeholder={t('databaseExplorer.migrations.version')} value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} /><input placeholder={t('databaseExplorer.migrations.name')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /><textarea placeholder={t('databaseExplorer.migrations.upSql')} value={draft.upSql} onChange={(e) => setDraft({ ...draft, upSql: e.target.value })} /><textarea placeholder={t('databaseExplorer.migrations.downSql')} value={draft.downSql} onChange={(e) => setDraft({ ...draft, downSql: e.target.value })} /><button onClick={save}><Save size={13} /> {t('databaseExplorer.migrations.saveVersioned')}</button></div>
    <div className="db-migration-list">{rows.map((row) => <div key={row.id}><span className={`status ${row.status}`}>{row.status}</span><strong>{row.version} — {row.name}</strong><small>SHA-256: {row.checksum.slice(0, 12)}… {row.appliedAt ? `· ${new Date(row.appliedAt).toLocaleString()}` : ''}</small><button disabled={row.status === 'applied'} onClick={() => apply(row.id, 'up')}>{t('databaseExplorer.migrations.apply')}</button><button disabled={row.status !== 'applied' || !row.downSql} onClick={() => apply(row.id, 'down')}>{t('databaseExplorer.migrations.revert')}</button></div>)}</div>
  </div>
}

function GeneratorsView({ object }: { object: DatabaseObject | null }): JSX.Element {
  const { t } = useTranslation()
  const { projectDir, setFileTree } = useAppStore()
  async function generate(type: 'entity' | 'datamodule' | 'crud'): Promise<void> {
    if (!object || !projectDir) return
    const files = type === 'entity' ? [generateDelphiEntity(object)] : type === 'datamodule' ? generateDelphiDataModule(object) : generateDelphiCrud(object)
    for (const file of files) await window.api.fs.writeFile(`${projectDir}\\${file.name}`, file.content)
    setFileTree(await window.api.fs.readProjectTree(projectDir))
    window.alert(t('databaseExplorer.generators.filesGenerated', { count: files.length }))
  }
  return <div className="db-generators"><h3>{t('databaseExplorer.generators.generateFrom', { name: object?.name ?? t('databaseExplorer.generators.aTable') })}</h3><p>{t('databaseExplorer.generators.description')}</p><div><button disabled={!object || object.type !== 'table' || !projectDir} onClick={() => generate('entity')}><Code2 size={18} /><span>{t('databaseExplorer.generators.entity')}<small>{t('databaseExplorer.generators.entityDescription')}</small></span></button><button disabled={!object || object.type !== 'table' || !projectDir} onClick={() => generate('datamodule')}><Database size={18} /><span>{t('databaseExplorer.generators.datamodule')}<small>{t('databaseExplorer.generators.datamoduleDescription')}</small></span></button><button disabled={!object || object.type !== 'table' || !projectDir} onClick={() => generate('crud')}><Table2 size={18} /><span>{t('databaseExplorer.generators.crud')}<small>{t('databaseExplorer.generators.crudDescription')}</small></span></button></div>{!projectDir && <em>{t('databaseExplorer.generators.openProjectHint')}</em>}</div>
}

function DiagramView({ schema }: { schema: DatabaseSchema }): JSX.Element {
  const { t } = useTranslation()
  const tables = schema.objects.filter((item) => item.type === 'table')
  const width = Math.max(900, Math.min(1800, 300 * Math.max(3, Math.ceil(Math.sqrt(tables.length)))))
  const columns = Math.max(3, Math.floor(width / 300))
  const positions = new Map(tables.map((table, index) => [table.name.toLowerCase(), { x: 30 + (index % columns) * 290, y: 30 + Math.floor(index / columns) * 250 }]))
  const height = Math.max(500, 260 * Math.ceil(tables.length / columns))
  return <div className="db-diagram"><svg width={width} height={height}>
    <defs><marker id="db-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker></defs>
    {tables.flatMap((table) => table.foreignKeys.map((fk) => { const from = positions.get(table.name.toLowerCase()); const to = positions.get(fk.referencedTable.toLowerCase()); if (!from || !to) return null; return <line key={`${table.name}-${fk.name}`} x1={from.x + 230} y1={from.y + 24} x2={to.x} y2={to.y + 24} markerEnd="url(#db-arrow)" /> }))}
    {tables.map((table) => { const pos = positions.get(table.name.toLowerCase())!; return <g key={table.name} transform={`translate(${pos.x},${pos.y})`}><rect width="230" height={Math.min(210, 42 + table.columns.length * 18)} rx="6" /><text className="title" x="10" y="24">{table.name}</text>{table.columns.slice(0, 9).map((column, index) => <text key={column.name} x="10" y={48 + index * 18}>{column.primaryKey ? '◆ ' : ''}{column.name}<tspan x="145">{column.dataType.slice(0, 12)}</tspan></text>)}</g> })}
  </svg>{!tables.length && <div className="db-empty">{t('databaseExplorer.diagram.noTables')}</div>}</div>
}

export function DatabaseExplorer({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element | null {
  const { t } = useTranslation()
  const VIEWS = getViews(t)
  const { projectDir } = useAppStore()
  const [profiles, setProfiles] = useState<DatabaseProfile[]>([])
  const [projectConnection, setProjectConnection] = useState<{ kind: DatabaseKind; database: string; label: string } | null>(null)
  const [kind, setKind] = useState<DatabaseKind>('sqlite')
  const [schema, setSchema] = useState<DatabaseSchema | null>(null)
  const [selected, setSelected] = useState<DatabaseObject | null>(null)
  const [activeView, setActiveView] = useState<ViewId>('data')
  const [sql, setSql] = useState('SELECT 1;')
  const [lastTableSql, setLastTableSql] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const listener = (): void => onOpenChange(true)
    window.addEventListener('karnox:open-database', listener)
    return () => window.removeEventListener('karnox:open-database', listener)
  }, [onOpenChange])
  useEffect(() => {
    if (!open) return
    void Promise.all([
      window.api.databaseExplorer.profiles() as Promise<DatabaseProfile[]>,
      projectDir
        ? (window.api.databaseExplorer.projectInfo(projectDir) as Promise<{ kind: DatabaseKind; database: string; label: string }>).catch(() => null)
        : Promise.resolve(null)
    ]).then(([items, project]) => {
      setProfiles(items)
      setProjectConnection(project)
      const current = project ? project.kind : items.find((profile) => isProfileConfigured(profile) && profile.kind === kind)?.kind ?? items.find(isProfileConfigured)?.kind
      if (current) setKind(current)
    })
  }, [open, projectDir])

  useEffect(() => {
    const refresh = (): void => {
      void window.api.databaseExplorer.profiles().then((items: DatabaseProfile[]) => setProfiles(items))
    }
    window.addEventListener('karnox:database-profiles-changed', refresh)
    return () => window.removeEventListener('karnox:database-profiles-changed', refresh)
  }, [])

  const usesProjectConnection = kind === projectConnection?.kind
  const isConfigured = (profile: DatabaseProfile): boolean => isProfileConfigured(profile) || profile.kind === projectConnection?.kind
  const configuredProfiles = profiles.filter(isConfigured)
  const selectedProfile = profiles.find((profile) => profile.kind === kind)

  async function connect(): Promise<void> {
    setBusy(true); setError(null); setSchema(null); setSelected(null); setResult(null)
    try {
      if (usesProjectConnection && projectDir) {
        await window.api.databaseExplorer.projectTest(projectDir)
        setSchema(await window.api.databaseExplorer.projectSchema(projectDir))
      } else {
        await window.api.databaseExplorer.test(kind)
        setSchema(await window.api.databaseExplorer.schema(kind))
      }
    }
    catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }

  async function execute(sqlText: string): Promise<QueryResult> {
    return usesProjectConnection && projectDir
      ? window.api.databaseExplorer.projectQuery({ projectDir, sql: sqlText })
      : window.api.databaseExplorer.query({ kind, sql: sqlText })
  }

  async function runQuery(query = sql): Promise<void> {
    setBusy(true); setError(null)
    try { setResult(await execute(query)) }
    catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }

  async function selectObject(object: DatabaseObject): Promise<void> {
    setSelected(object)
    if (object.type === 'table' || object.type === 'view') {
      const query = selectRowsSql(kind, object)
      setSql(query); setLastTableSql(query); setActiveView('data'); await runQuery(query)
    } else {
      setActiveView('scripts')
    }
  }

  const title = usesProjectConnection && projectConnection
    ? t('databaseExplorer.titleProject', { database: DATABASE_LABELS[kind], project: projectConnection.database })
    : selectedProfile ? `${DATABASE_LABELS[kind]} · ${selectedProfile.databaseName || selectedProfile.databasePath || selectedProfile.host}` : DATABASE_LABELS[kind]

  if (!open) return null
  return <div className="database-explorer">
    <header><div><Database size={18} /><span>{t('databaseExplorer.title')}</span><small>{schema ? title : t('databaseExplorer.connectConfiguredDb')}</small></div><button onClick={() => onOpenChange(false)} title={t('common.close')}><X size={18} /></button></header>
    <div className="db-connection-bar"><select value={kind} onChange={(e) => { setKind(e.target.value as DatabaseKind); setSchema(null); setSelected(null) }}>{profiles.map((profile) => <option key={profile.kind} value={profile.kind} disabled={!isConfigured(profile)}>{DATABASE_LABELS[profile.kind]}{profile.kind === projectConnection?.kind ? ` (${t('databaseExplorer.projectOpen')})` : isConfigured(profile) ? '' : ` (${t('databaseExplorer.notConfigured')})`}</option>)}</select><button onClick={connect} disabled={busy || !selectedProfile || !isConfigured(selectedProfile)}><PlugZap size={14} /> {busy ? t('databaseExplorer.waiting') : schema ? t('databaseExplorer.reconnect') : t('databaseExplorer.connect')}</button>{schema && <button onClick={connect} disabled={busy}><RefreshCw size={14} /> {t('databaseExplorer.refreshStructure')}</button>}<span>{schema ? t('databaseExplorer.objectCount', { count: schema.objects.length }) : usesProjectConnection ? t('databaseExplorer.projectDatabaseOpen', { database: projectConnection?.database }) : configuredProfiles.length ? t('databaseExplorer.credentialsProtected') : t('databaseExplorer.configureConnectionHint')}</span></div>
    {error && <div className="db-error"><span>{error}</span><button onClick={() => setError(null)}><X size={13} /></button></div>}
    {!schema ? <div className="db-connect-empty"><Database size={54} /><h2>{t('databaseExplorer.title')}</h2><p>{t('databaseExplorer.chooseConnectionHint')}</p>{!configuredProfiles.length && <button onClick={() => useAppStore.getState().setShowSettings(true)}>{t('databaseExplorer.openSettings')}</button>}</div> : <div className="db-workspace">
      <aside><ObjectsTree schema={schema} selected={selected} onSelect={(object) => void selectObject(object)} /></aside>
      <main><nav>{VIEWS.map((view) => { const Icon = view.icon; return <button key={view.id} className={activeView === view.id ? 'active' : ''} onClick={() => setActiveView(view.id)}><Icon size={13} />{view.label}</button> })}</nav>
        <section className="db-content">
          {activeView === 'data' && <ResultGrid result={result} object={selected} kind={kind} execute={execute} onRefresh={() => runQuery(lastTableSql || sql)} />}
          {activeView === 'sql' && <div className="db-sql-view"><div className="db-section-toolbar"><button onClick={() => runQuery()} disabled={busy}><Play size={13} /> {busy ? t('databaseExplorer.sql.executing') : t('databaseExplorer.sql.execute')}</button><span>{t('databaseExplorer.sql.shortcutHint')}</span></div><div className="db-sql-editor-pane"><MonacoEditor height="100%" language="sql" theme="vs-dark" value={sql} onChange={(value) => setSql(value ?? '')} onMount={(_editor, monaco) => _editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void runQuery(_editor.getValue()))} options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' }} /></div><div className="db-sql-result"><ResultGrid result={result} object={null} kind={kind} execute={execute} onRefresh={() => runQuery()} /></div></div>}
          {activeView === 'history' && <HistoryView kind={kind} onUse={(value) => { setSql(value); setActiveView('sql') }} />}
          {activeView === 'scripts' && <ScriptsView kind={kind} object={selected} />}
          {activeView === 'compare' && <CompareView profiles={profiles} current={kind} />}
          {activeView === 'migrations' && <MigrationsView kind={kind} />}
          {activeView === 'generators' && <GeneratorsView object={selected} />}
          {activeView === 'diagram' && <DiagramView schema={schema} />}
        </section>
      </main>
    </div>}
  </div>
}
