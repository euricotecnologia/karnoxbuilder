import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Database, FilePlus2, Plus, Trash2, X, ChevronLeft, ChevronRight, Loader2, CheckCircle2, CircleX } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import './NoCodeFormWizard.css'

type FieldType = 'text' | 'longText' | 'integer' | 'decimal' | 'date' | 'dateTime' | 'boolean' | 'email' | 'phone'

interface FieldRow {
  id: number
  label: string
  name: string
  type: FieldType
  required: boolean
  length: number
  typeWasChosen: boolean
}

interface DatabaseOption {
  kind: 'firebird' | 'sqlite' | 'mysql' | 'postgresql' | 'sqlserver' | 'oracle'
  label: string
  detail: string
  enabled: boolean
  needsConnection: boolean
}

interface ConnectionDraft {
  databasePath: string
  installPath: string
  host: string
  port: string
  databaseName: string
  username: string
}

const EMPTY_CONNECTION_DRAFT: ConnectionDraft = { databasePath: '', installPath: '', host: '', port: '', databaseName: '', username: '' }
const DEFAULT_PORTS: Partial<Record<DatabaseOption['kind'], string>> = { firebird: '3050', mysql: '3306', postgresql: '5432', sqlserver: '1433', oracle: '1521' }
const DATABASE_LABELS: Record<DatabaseOption['kind'], string> = { firebird: 'Firebird', sqlite: 'SQLite', mysql: 'MySQL', postgresql: 'PostgreSQL', sqlserver: 'SQL Server', oracle: 'Oracle' }

function getTypes(t: (key: string) => string): Array<{ value: FieldType; label: string }> {
  return [
    { value: 'text', label: t('noCodeFormWizard.types.text') },
    { value: 'longText', label: t('noCodeFormWizard.types.longText') },
    { value: 'integer', label: t('noCodeFormWizard.types.integer') },
    { value: 'decimal', label: t('noCodeFormWizard.types.decimal') },
    { value: 'date', label: t('noCodeFormWizard.types.date') },
    { value: 'dateTime', label: t('noCodeFormWizard.types.dateTime') },
    { value: 'boolean', label: t('noCodeFormWizard.types.boolean') },
    { value: 'email', label: t('noCodeFormWizard.types.email') },
    { value: 'phone', label: t('noCodeFormWizard.types.phone') }
  ]
}

function identifier(value: string): string {
  const clean = value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!clean) return ''
  return /^[A-Za-z]/.test(clean) ? clean : `f_${clean}`
}

function detailLabel(t: (key: string) => string, detail: string): string {
  if (detail === 'detail:linked-to-other-db') return t('newProjectWizard.detailLinkedToOtherDb')
  if (detail === 'detail:sqlite-own-file') return t('newProjectWizard.detailSqliteOwnFile')
  if (detail === 'detail:provide-connection-on-create') return t('newProjectWizard.detailProvideConnectionOnCreate')
  return detail
}

function pascalName(value: string): string {
  return identifier(value).split('_').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

function inferType(label: string): FieldType {
  const value = label.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  if (/e-?mail/.test(value)) return 'email'
  if (/telefone|celular|whatsapp|fone/.test(value)) return 'phone'
  if (/data.*hora|criado em|atualizado em/.test(value)) return 'dateTime'
  if (/^data|nascimento|vencimento|emissao/.test(value)) return 'date'
  if (/valor|preco|saldo|total|desconto|percentual|aliquota/.test(value)) return 'decimal'
  if (/quantidade|idade|numero|codigo/.test(value)) return 'integer'
  if (/ativo|inativo|bloqueado|habilitado|sim.*nao/.test(value)) return 'boolean'
  if (/observacao|descricao|comentario|anotacao/.test(value)) return 'longText'
  return 'text'
}

function newField(id: number, label = ''): FieldRow {
  return { id, label, name: identifier(label).toLowerCase(), type: inferType(label), required: false, length: 120, typeWasChosen: false }
}

export function NoCodeFormWizard({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation()
  const TYPES = getTypes(t)
  const { projectDir, dprojPath, delphiProfile, setFileTree, openTab, saveAllTabs, appendAiLine } = useAppStore()
  const [step, setStep] = useState(1)
  const [caption, setCaption] = useState('Cadastro de Clientes')
  const [tableName, setTableName] = useState('clientes')
  const [unitName, setUnitName] = useState('UnitCadastroCliente')
  const [formClass, setFormClass] = useState('TFormCadastroCliente')
  const [databaseKind, setDatabaseKind] = useState<DatabaseOption['kind']>('sqlite')
  const [databases, setDatabases] = useState<DatabaseOption[]>([])
  const [connectionDrafts, setConnectionDrafts] = useState<Partial<Record<DatabaseOption['kind'], ConnectionDraft>>>({})
  const [connectionPasswords, setConnectionPasswords] = useState<Partial<Record<DatabaseOption['kind'], string>>>({})
  const [firebirdStatus, setFirebirdStatus] = useState('')
  const [creatingFirebird, setCreatingFirebird] = useState(false)
  const [fields, setFields] = useState<FieldRow[]>([
    { ...newField(1, 'Nome'), required: true },
    newField(2, 'E-mail'),
    newField(3, 'Telefone'),
    newField(4, 'Data de nascimento'),
    newField(5, 'Ativo')
  ])
  const [nextId, setNextId] = useState(6)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ tableName: string; databasePath: string } | null>(null)

  useEffect(() => {
    void Promise.all([
      window.api.nocode.formOptions(projectDir || undefined) as Promise<DatabaseOption[]>,
      window.api.databaseProfiles.list() as Promise<Array<{ kind: DatabaseOption['kind']; installPath: string; databasePath: string; host: string; port: string; databaseName: string; username: string }>>
    ]).then(([items, globalProfiles]) => {
      setDatabases(items)
      setConnectionDrafts(Object.fromEntries(globalProfiles.map((profile) => [profile.kind, {
        databasePath: profile.databasePath, installPath: profile.installPath, host: profile.host,
        port: profile.port, databaseName: profile.databaseName, username: profile.username
      }])) as Partial<Record<DatabaseOption['kind'], ConnectionDraft>>)
      const active = items.find((item) => item.enabled && item.kind === 'sqlite') ?? items.find((item) => item.enabled)
      if (active) setDatabaseKind(active.kind)
    })
  }, [projectDir])

  const selectedDatabase = databases.find((item) => item.kind === databaseKind)
  const connectionDraft = connectionDrafts[databaseKind] ?? EMPTY_CONNECTION_DRAFT
  const validFields = useMemo(() => fields.filter((field) => field.label.trim() && field.name.trim()), [fields])

  function updateConnection<K extends keyof ConnectionDraft>(key: K, value: ConnectionDraft[K]): void {
    setConnectionDrafts((current) => ({ ...current, [databaseKind]: { ...(current[databaseKind] ?? EMPTY_CONNECTION_DRAFT), [key]: value } }))
  }

  async function browseConnectionFile(): Promise<void> {
    const extensions = databaseKind === 'firebird' ? ['fdb', 'gdb'] : ['sqlite', 'sqlite3', 'db']
    const path = await window.api.fs.selectDatabaseFile(t('noCodeFormWizard.selectDatabaseFile', { database: DATABASE_LABELS[databaseKind] }), extensions)
    if (path) updateConnection('databasePath', path)
  }

  async function browseConnectionInstall(): Promise<void> {
    const path = await window.api.fs.selectDirectory(t('noCodeFormWizard.selectInstall', { database: DATABASE_LABELS[databaseKind] }))
    if (path) updateConnection('installPath', path)
  }

  async function createFirebirdDatabase(): Promise<void> {
    setFirebirdStatus('')
    const chosenPath = await window.api.fs.selectNewFirebirdDatabase()
    if (!chosenPath) return
    updateConnection('databasePath', chosenPath)
    setCreatingFirebird(true)
    try {
      await window.api.databaseExplorer.createFirebirdDatabase({
        databasePath: chosenPath,
        host: connectionDraft.host,
        port: connectionDraft.port,
        username: connectionDraft.username,
        password: connectionPasswords.firebird
      })
      setFirebirdStatus(t('noCodeFormWizard.firebirdCreated'))
    } catch (reason) {
      setFirebirdStatus(t('noCodeFormWizard.errorPrefix', { message: (reason as Error).message }))
    } finally {
      setCreatingFirebird(false)
    }
  }

  function connectionError(): string {
    if (!selectedDatabase?.needsConnection) return ''
    if (databaseKind === 'firebird' && !connectionDraft.databasePath.trim()) return t('noCodeFormWizard.errorProvideDatabaseFile', { database: DATABASE_LABELS[databaseKind] })
    if (databaseKind !== 'firebird' && !connectionDraft.host.trim()) return t('noCodeFormWizard.errorProvideHost')
    if (databaseKind !== 'firebird' && !connectionDraft.databaseName.trim()) return t('noCodeFormWizard.errorProvideDatabaseName', { database: DATABASE_LABELS[databaseKind] })
    if (!connectionDraft.username.trim()) return t('noCodeFormWizard.errorProvideUsername')
    return ''
  }

  function updateField(id: number, patch: Partial<FieldRow>): void {
    setFields((current) => current.map((field) => field.id === id ? { ...field, ...patch } : field))
  }

  function changeLabel(field: FieldRow, label: string): void {
    updateField(field.id, {
      label,
      name: identifier(label).toLowerCase(),
      ...(!field.typeWasChosen ? { type: inferType(label) } : {})
    })
  }

  function addField(): void {
    setFields((current) => [...current, newField(nextId)])
    setNextId((value) => value + 1)
  }

  function deriveNames(value: string): void {
    setCaption(value)
    const entity = value.replace(/^cadastro\s+(?:de|do|da)?\s*/i, '') || value
    const singular = entity.replace(/s$/i, '')
    const pascal = pascalName(singular)
    setTableName(identifier(entity).toLowerCase())
    setUnitName(`UnitCadastro${pascal}`)
    setFormClass(`TFormCadastro${pascal}`)
  }

  function validateStep(): boolean {
    setError('')
    if (step === 1) {
      if (!caption.trim() || !tableName.trim() || !unitName.trim() || !formClass.trim()) {
        setError(t('noCodeFormWizard.errorFillTitleTableUnitClass'))
        return false
      }
      if (!selectedDatabase?.enabled) {
        setError(t('noCodeFormWizard.errorSelectDatabase'))
        return false
      }
      const connectionIssue = connectionError()
      if (connectionIssue) {
        setError(connectionIssue)
        return false
      }
    }
    if (step === 2) {
      if (!validFields.length) {
        setError(t('noCodeFormWizard.errorAddOneField'))
        return false
      }
      const names = validFields.map((field) => field.name.toLowerCase())
      if (new Set(names).size !== names.length) {
        setError(t('noCodeFormWizard.errorDuplicateFieldNames'))
        return false
      }
    }
    return true
  }

  function next(): void {
    if (validateStep()) setStep((value) => Math.min(3, value + 1))
  }

  async function create(): Promise<void> {
    if (!projectDir || !dprojPath) {
      setError(t('noCodeFormWizard.errorOpenProjectFirst'))
      return
    }
    const connectionIssue = connectionError()
    if (connectionIssue) {
      setError(connectionIssue)
      return
    }
    setBusy(true)
    setError('')
    try {
      await saveAllTabs()
      const created = await window.api.nocode.createForm({
        projectDir,
        dprojPath,
        profile: delphiProfile,
        caption,
        tableName,
        unitName,
        formClass,
        databaseKind,
        fields: validFields.map(({ name, label, type, required, length }) => ({ name, label, type, required, length })),
        ...(selectedDatabase?.needsConnection ? {
          databaseConnection: { ...connectionDraft, password: connectionPasswords[databaseKind] || undefined }
        } : {})
      }) as { pasPath: string; dfmPath: string; tableName: string; databasePath: string }
      setFileTree(await window.api.fs.readProjectTree(projectDir))
      openTab(created.dfmPath, created.dfmPath.split(/[\\/]/).pop() ?? `${unitName}.dfm`, await window.api.fs.readFile(created.dfmPath))
      appendAiLine(t('noCodeFormWizard.creationLogLine', { caption, table: created.tableName }))
      setResult(created)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="nocode-wizard-backdrop" role="presentation">
      <section className="nocode-wizard" role="dialog" aria-modal="true" aria-label={t('noCodeFormWizard.dialogLabel')}>
        <header>
          <div><FilePlus2 size={20} /><div><h2>{t('noCodeFormWizard.title')}</h2><p>{t('noCodeFormWizard.description')}</p></div></div>
          <button onClick={onClose} disabled={busy} title={t('common.close')}><X size={18} /></button>
        </header>

        {!result && <div className="nocode-steps">
          {[t('noCodeFormWizard.step1'), t('noCodeFormWizard.step2'), t('noCodeFormWizard.step3')].map((label, index) => <div key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}><span>{index + 1}</span>{label}</div>)}
        </div>}

        <main>
          {result ? (
            <div className="nocode-success">
              <CheckCircle2 size={48} />
              <h3>{t('noCodeFormWizard.successTitle')}</h3>
              <p>{t('noCodeFormWizard.successTableCreatedIn')} <code>{result.tableName}</code>:</p>
              <div>{result.databasePath}</div>
              <p>{t('noCodeFormWizard.successDfmOpened')}</p>
            </div>
          ) : step === 1 ? (
            <div className="nocode-form-grid">
              <label className="full">{t('noCodeFormWizard.displayedTitle')}<input value={caption} onChange={(event) => deriveNames(event.target.value)} /></label>
              <label>{t('noCodeFormWizard.tableName')}<input value={tableName} onChange={(event) => setTableName(identifier(event.target.value).toLowerCase())} /></label>
              <label>{t('noCodeFormWizard.activeDatabase')}<select value={databaseKind} onChange={(event) => setDatabaseKind(event.target.value as DatabaseOption['kind'])}>{databases.map((database) => <option key={database.kind} value={database.kind} disabled={!database.enabled}>{database.label}{database.enabled ? '' : ` (${t('noCodeFormWizard.disabled')})`}</option>)}</select></label>
              <label>{t('noCodeFormWizard.unitName')}<input value={unitName} onChange={(event) => setUnitName(identifier(event.target.value))} /></label>
              <label>{t('noCodeFormWizard.formClass')}<input value={formClass} onChange={(event) => setFormClass(identifier(event.target.value))} /></label>
              <div className="nocode-database-summary full"><Database size={17} /><div><strong>{selectedDatabase?.label ?? t('noCodeFormWizard.noActiveDatabase')}</strong><span>{selectedDatabase?.detail ? detailLabel(t, selectedDatabase.detail) : t('noCodeFormWizard.configureDatabaseHint')}</span></div></div>
              {selectedDatabase?.needsConnection && <>
                {databaseKind === 'firebird' ? (
                  <>
                    <label className="full">{t('noCodeFormWizard.firebirdFile')}<div className="nocode-connection-row"><input value={connectionDraft.databasePath} onChange={(event) => updateConnection('databasePath', event.target.value)} placeholder={String.raw`C:\Dados\sistema.fdb`} /><button type="button" onClick={() => void browseConnectionFile()}>{t('noCodeFormWizard.locate')}</button><button type="button" onClick={() => void createFirebirdDatabase()} disabled={creatingFirebird}>{creatingFirebird ? <Loader2 className="spin" size={14} /> : t('noCodeFormWizard.createNew')}</button></div></label>
                    <label>{t('noCodeFormWizard.server')}<input value={connectionDraft.host} onChange={(event) => updateConnection('host', event.target.value)} placeholder="localhost" /></label>
                    <label>{t('noCodeFormWizard.port')}<input value={connectionDraft.port} onChange={(event) => updateConnection('port', event.target.value)} placeholder={DEFAULT_PORTS.firebird} /></label>
                    <label className="full">{t('noCodeFormWizard.firebirdInstall')}<div className="nocode-connection-row"><input value={connectionDraft.installPath} onChange={(event) => updateConnection('installPath', event.target.value)} placeholder={String.raw`C:\Program Files\Firebird\Firebird_5_0`} /><button type="button" onClick={() => void browseConnectionInstall()}>{t('noCodeFormWizard.locate')}</button></div></label>
                    {firebirdStatus && <div className={`nocode-connection-status${firebirdStatus.startsWith(t('noCodeFormWizard.errorWord')) ? ' error' : ''} full`}>{firebirdStatus}</div>}
                  </>
                ) : (
                  <><label>{t('noCodeFormWizard.server')}<input value={connectionDraft.host} onChange={(event) => updateConnection('host', event.target.value)} placeholder="localhost" /></label>
                  <label>{t('noCodeFormWizard.port')}<input value={connectionDraft.port} onChange={(event) => updateConnection('port', event.target.value)} placeholder={DEFAULT_PORTS[databaseKind] ?? ''} /></label>
                  <label>{databaseKind === 'oracle' ? t('noCodeFormWizard.oracleService') : t('noCodeFormWizard.databaseName')}<input value={connectionDraft.databaseName} onChange={(event) => updateConnection('databaseName', event.target.value)} /></label></>
                )}
                <label>{t('noCodeFormWizard.username')}<input value={connectionDraft.username} onChange={(event) => updateConnection('username', event.target.value)} placeholder={databaseKind === 'firebird' ? 'SYSDBA' : ''} /></label>
                <label>{t('noCodeFormWizard.password')}<input type="password" value={connectionPasswords[databaseKind] ?? ''} onChange={(event) => setConnectionPasswords((current) => ({ ...current, [databaseKind]: event.target.value }))} placeholder={databaseKind === 'firebird' ? 'masterkey' : t('noCodeFormWizard.enterPassword')} /></label>
              </>}
            </div>
          ) : step === 2 ? (
            <div className="nocode-fields">
              <div className="nocode-field-head"><span>{t('noCodeFormWizard.fieldInForm')}</span><span>{t('noCodeFormWizard.nameInDatabase')}</span><span>{t('noCodeFormWizard.type')}</span><span>{t('noCodeFormWizard.required')}</span><span /></div>
              {fields.map((field) => <div className="nocode-field-row" key={field.id}>
                <input value={field.label} placeholder={t('noCodeFormWizard.fieldPlaceholder')} onChange={(event) => changeLabel(field, event.target.value)} />
                <input value={field.name} placeholder="nome" onChange={(event) => updateField(field.id, { name: identifier(event.target.value).toLowerCase() })} />
                <select value={field.type} onChange={(event) => updateField(field.id, { type: event.target.value as FieldType, typeWasChosen: true })}>{TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
                <label className="nocode-required"><input type="checkbox" checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} /> {t('noCodeFormWizard.yes')}</label>
                <button onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))} title={t('noCodeFormWizard.deleteField')}><Trash2 size={15} /></button>
              </div>)}
              <button className="nocode-add-field" onClick={addField}><Plus size={15} /> {t('noCodeFormWizard.addField')}</button>
              <div className="nocode-tip">{t('noCodeFormWizard.typeHint')}</div>
            </div>
          ) : (
            <div className="nocode-review">
              <div><span>{t('noCodeFormWizard.form')}</span><strong>{caption}</strong><small>{unitName}.pas / {unitName}.dfm</small></div>
              <div><span>{t('noCodeFormWizard.databaseAndTable')}</span><strong>{selectedDatabase?.label} · {tableName}</strong><small>{selectedDatabase?.needsConnection ? (databaseKind === 'firebird' ? connectionDraft.databasePath : [connectionDraft.host, connectionDraft.databaseName].filter(Boolean).join(' / ')) : (selectedDatabase?.detail ? detailLabel(t, selectedDatabase.detail) : '')}</small></div>
              <div><span>{t('noCodeFormWizard.structure')}</span><strong>{t('noCodeFormWizard.autoIdAndFields', { count: validFields.length })}</strong><small>{validFields.map((field) => `${field.label}: ${TYPES.find((type) => type.value === field.type)?.label}`).join(' · ')}</small></div>
              <aside>{t('noCodeFormWizard.transactionalHint')}</aside>
            </div>
          )}
          {error && <div className="nocode-error">{error}</div>}
        </main>

        <footer>
          {result ? <button className="primary" onClick={onClose}>{t('noCodeFormWizard.finish')}</button> : <>
            <button onClick={step === 1 ? onClose : () => { setError(''); setStep((value) => value - 1) }} disabled={busy}>{step === 1 ? <><CircleX size={15} /> {t('common.cancel')}</> : <><ChevronLeft size={15} /> {t('common.back')}</>}</button>
            {step < 3 ? <button className="primary" onClick={next}>{t('noCodeFormWizard.continue')} <ChevronRight size={15} /></button> : <button className="primary" onClick={() => void create()} disabled={busy}>{busy ? <><Loader2 className="spin" size={15} /> {t('noCodeFormWizard.creating')}</> : <><FilePlus2 size={15} /> {t('noCodeFormWizard.createFormAndTable')}</>}</button>}
          </>}
        </footer>
      </section>
    </div>
  )
}
