import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight, Bot, Boxes, Check, ChevronLeft, ChevronRight, Code2, Database, FilePlus2,
  FolderOpen, LayoutTemplate, Loader2, Plus, Search, Sparkles, Trash2, X
} from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import { DELPHI_PROFILE_OPTIONS, type DelphiProfileId } from '@renderer/state/delphiProfiles'
import './NewProjectWizard.css'

type ProjectMode = 'blank' | 'nocode' | 'ai'
type DatabaseKind = 'firebird' | 'sqlite' | 'mysql' | 'postgresql' | 'sqlserver' | 'oracle'
type FieldType = 'text' | 'longText' | 'integer' | 'decimal' | 'date' | 'dateTime' | 'boolean' | 'email' | 'phone'

interface FieldModel { id: string; label: string; name: string; type: FieldType; required: boolean; length: number }
interface ModuleModel { id: string; label: string; entity: string; tableName: string; unitName: string; formClass: string; selected: boolean; fields: FieldModel[] }
interface DatabaseOption { kind: DatabaseKind; label: string; detail: string; enabled: boolean }
interface DatabaseProfile {
  kind: DatabaseKind
  enabled: boolean
  installPath: string
  databasePath: string
  host: string
  port: string
  databaseName: string
  username: string
  hasPassword: boolean
  options: Record<string, string | boolean>
}

const DATABASE_LABELS: Record<DatabaseKind, string> = {
  firebird: 'Firebird', sqlite: 'SQLite', mysql: 'MySQL', postgresql: 'PostgreSQL', sqlserver: 'SQL Server', oracle: 'Oracle'
}
interface ScaffoldResult { projectDir: string; projectName: string; dprPath: string; dprojPath: string | null; profile: DelphiProfileId }

function getFieldTypes(t: (key: string) => string): Array<{ value: FieldType; label: string }> {
  return [
    { value: 'text', label: t('newProjectWizard.fieldTypes.text') }, { value: 'longText', label: t('newProjectWizard.fieldTypes.longText') },
    { value: 'integer', label: t('newProjectWizard.fieldTypes.integer') }, { value: 'decimal', label: t('newProjectWizard.fieldTypes.decimal') },
    { value: 'date', label: t('newProjectWizard.fieldTypes.date') }, { value: 'dateTime', label: t('newProjectWizard.fieldTypes.dateTime') },
    { value: 'boolean', label: t('newProjectWizard.fieldTypes.boolean') }, { value: 'email', label: t('newProjectWizard.fieldTypes.email') }, { value: 'phone', label: t('newProjectWizard.fieldTypes.phone') }
  ]
}

function detailLabel(t: (key: string) => string, detail: string): string {
  if (detail === 'detail:linked-to-other-db') return t('newProjectWizard.detailLinkedToOtherDb')
  if (detail === 'detail:sqlite-own-file') return t('newProjectWizard.detailSqliteOwnFile')
  if (detail === 'detail:provide-connection-on-create') return t('newProjectWizard.detailProvideConnectionOnCreate')
  return detail
}

function slug(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
}
function pascal(value: string): string {
  return slug(value).split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}
function field(label: string, type: FieldType = 'text', required = false, length = 120): FieldModel {
  return { id: `${Date.now()}-${Math.random()}`, label, name: slug(label), type, required, length }
}
function module(id: string, label: string, entity: string, fields: FieldModel[], selected = false): ModuleModel {
  const entityName = pascal(entity.replace(/s$/i, ''))
  return { id, label, entity, tableName: slug(entity), unitName: `UnitCadastro${entityName}`, formClass: `TFormCadastro${entityName}`, selected, fields }
}

const INITIAL_MODULES: ModuleModel[] = [
  module('clientes', 'Clientes', 'clientes', [field('Nome', 'text', true, 160), field('CPF ou CNPJ'), field('E-mail', 'email'), field('Telefone', 'phone'), field('Data de nascimento', 'date'), field('Ativo', 'boolean')], true),
  module('fornecedores', 'Fornecedores', 'fornecedores', [field('Razão social', 'text', true, 180), field('Nome fantasia'), field('CNPJ'), field('Inscrição estadual'), field('E-mail', 'email'), field('Telefone', 'phone'), field('Ativo', 'boolean')]),
  module('produtos', 'Produtos', 'produtos', [field('Descrição', 'text', true, 180), field('SKU'), field('Código de barras'), field('Preço de custo', 'decimal'), field('Preço de venda', 'decimal', true), field('Estoque', 'decimal'), field('Ativo', 'boolean')]),
  module('categorias', 'Categorias', 'categorias', [field('Descrição', 'text', true, 140), field('Ativo', 'boolean')]),
  module('usuarios', 'Usuários e acesso', 'usuarios', [field('Nome', 'text', true, 140), field('E-mail', 'email', true), field('Login', 'text', true), field('Perfil'), field('Ativo', 'boolean')]),
  module('pedidos', 'Pedidos / vendas', 'pedidos', [field('Número', 'integer', true), field('Data e hora', 'dateTime', true), field('Cliente'), field('Valor total', 'decimal'), field('Status')]),
  module('financeiro', 'Contas a receber', 'contas_receber', [field('Descrição', 'text', true), field('Vencimento', 'date', true), field('Valor', 'decimal', true), field('Pago', 'boolean')]),
  module('agenda', 'Agenda / atendimentos', 'atendimentos', [field('Cliente', 'text', true), field('Data e hora', 'dateTime', true), field('Assunto', 'text', true), field('Observação', 'longText')])
]

function getModeCards(t: (key: string) => string): Array<{ id: ProjectMode; icon: typeof Code2; title: string; description: string; features: string[] }> {
  return [
    { id: 'blank', icon: Code2, title: t('newProjectWizard.modeBlankTitle'), description: t('newProjectWizard.modeBlankDescription'), features: [t('newProjectWizard.modeBlankFeature1'), t('newProjectWizard.modeBlankFeature2'), t('newProjectWizard.modeBlankFeature3')] },
    { id: 'nocode', icon: LayoutTemplate, title: t('newProjectWizard.modeNoCodeTitle'), description: t('newProjectWizard.modeNoCodeDescription'), features: [t('newProjectWizard.modeNoCodeFeature1'), t('newProjectWizard.modeNoCodeFeature2'), t('newProjectWizard.modeNoCodeFeature3')] },
    { id: 'ai', icon: Bot, title: t('newProjectWizard.modeAiTitle'), description: t('newProjectWizard.modeAiDescription'), features: [t('newProjectWizard.modeAiFeature1'), t('newProjectWizard.modeAiFeature2'), t('newProjectWizard.modeAiFeature3')] }
  ]
}

export function NewProjectWizard({ onClose, onWorkspaceReady, onAiReady }: {
  onClose: () => void
  onWorkspaceReady: (result: ScaffoldResult) => Promise<void>
  onAiReady: (prompt: string) => void
}): JSX.Element {
  const { t } = useTranslation()
  const FIELD_TYPES = useMemo(() => getFieldTypes(t), [t])
  const MODE_CARDS = useMemo(() => getModeCards(t), [t])
  const { suggestions, aiProviders, activeProviderId, setActiveProviderId } = useAppStore()
  const [mode, setMode] = useState<ProjectMode | null>(null)
  const [projectDir, setProjectDir] = useState('')
  const [projectName, setProjectName] = useState('MeuProjetoDelphi')
  const [selectedProfile, setSelectedProfile] = useState<DelphiProfileId>('delphi10_13')
  const [step, setStep] = useState(1)
  const [databases, setDatabases] = useState<DatabaseOption[]>([])
  const [databaseProfiles, setDatabaseProfiles] = useState<DatabaseProfile[]>([])
  const [databasePasswords, setDatabasePasswords] = useState<Partial<Record<DatabaseKind, string>>>({})
  const [databaseStatus, setDatabaseStatus] = useState('')
  const [testingDatabase, setTestingDatabase] = useState(false)
  const [databaseKind, setDatabaseKind] = useState<DatabaseKind>('sqlite')
  const [modules, setModules] = useState<ModuleModel[]>(INITIAL_MODULES)
  const [activeModuleId, setActiveModuleId] = useState('clientes')
  const [aiPrompt, setAiPrompt] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void Promise.all([
      window.api.nocode.formOptions() as Promise<DatabaseOption[]>,
      window.api.databaseProfiles.list() as Promise<DatabaseProfile[]>
    ]).then(([items, profiles]) => {
      setDatabases(items)
      setDatabaseProfiles(profiles)
      const active = profiles.find((item) => item.enabled)
      if (active) setDatabaseKind(active.kind)
    })
  }, [])

  const databaseDraft = databaseProfiles.find((item) => item.kind === databaseKind)

  function updateDatabase<K extends keyof DatabaseProfile>(key: K, value: DatabaseProfile[K]): void {
    setDatabaseStatus('')
    setDatabaseProfiles((current) => current.map((item) => item.kind === databaseKind ? { ...item, [key]: value } : item))
  }

  async function browseDatabaseFile(): Promise<void> {
    const extensions = databaseKind === 'firebird' ? ['fdb', 'gdb'] : ['sqlite', 'sqlite3', 'db']
    const path = await window.api.fs.selectDatabaseFile(t('newProjectWizard.selectDatabaseFile', { database: DATABASE_LABELS[databaseKind] }), extensions)
    if (path) updateDatabase('databasePath', path)
  }

  async function createSqliteDatabase(): Promise<void> {
    const path = await window.api.fs.createSqliteDatabase()
    if (path) updateDatabase('databasePath', path)
  }

  async function browseDatabaseInstall(): Promise<void> {
    const path = await window.api.fs.selectDirectory(t('newProjectWizard.selectDatabaseInstall', { database: DATABASE_LABELS[databaseKind] }))
    if (path) updateDatabase('installPath', path)
  }

  function databaseConfigurationError(): string {
    if (!databaseDraft) return t('newProjectWizard.errorDatabaseNotLoaded')
    if ((databaseKind === 'sqlite' || databaseKind === 'firebird') && !databaseDraft.databasePath.trim()) return t('newProjectWizard.errorProvideOrCreateFile', { database: DATABASE_LABELS[databaseKind] })
    if (databaseKind !== 'sqlite' && !databaseDraft.host.trim()) return t('newProjectWizard.errorProvideHost')
    if (!['sqlite', 'firebird'].includes(databaseKind) && !databaseDraft.databaseName.trim()) return t('newProjectWizard.errorProvideDatabaseName', { database: DATABASE_LABELS[databaseKind] })
    if (databaseKind !== 'sqlite' && !databaseDraft.username.trim()) return t('newProjectWizard.errorProvideUsername')
    if (databaseKind !== 'sqlite' && !databaseDraft.hasPassword && !databasePasswords[databaseKind]) return t('newProjectWizard.errorProvidePassword')
    return ''
  }

  async function persistDatabaseConfiguration(testConnection: boolean): Promise<void> {
    const validation = databaseConfigurationError()
    if (validation) throw new Error(validation)
    if (!databaseDraft) throw new Error(t('newProjectWizard.errorDatabaseUnavailable'))
    await window.api.databaseProfiles.upsert({
      ...databaseDraft,
      enabled: true,
      password: databasePasswords[databaseKind] || undefined
    })
    if (testConnection) await window.api.databaseExplorer.test(databaseKind)
    setDatabaseProfiles((current) => current.map((item) => item.kind === databaseKind ? { ...item, enabled: true, hasPassword: item.hasPassword || !!databasePasswords[databaseKind] } : item))
    setDatabasePasswords((current) => ({ ...current, [databaseKind]: '' }))
    window.dispatchEvent(new CustomEvent('karnox:database-profiles-changed'))
  }

  async function testSelectedDatabase(): Promise<void> {
    setTestingDatabase(true)
    setDatabaseStatus('')
    try {
      await persistDatabaseConfiguration(true)
      setDatabaseStatus(t('newProjectWizard.connectionValidated'))
    } catch (reason) {
      setDatabaseStatus(t('newProjectWizard.errorPrefix', { message: (reason as Error).message }))
    } finally { setTestingDatabase(false) }
  }

  const selectedModules = modules.filter((item) => item.selected)
  const activeModule = selectedModules.find((item) => item.id === activeModuleId) ?? selectedModules[0]
  const visibleSuggestions = useMemo(() => {
    const query = search.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    return suggestions.filter((item) => !query || `${item.label} ${item.promptText} ${item.category}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(query)).slice(0, 18)
  }, [search, suggestions])
  const enabledProviders = aiProviders.filter((item) => item.enabled && item.hasApiKey)

  async function chooseDirectory(): Promise<string | null> {
    const selected = await window.api.fs.selectDirectory(mode === 'blank' ? t('newProjectWizard.selectProjectFolder') : t('newProjectWizard.selectEmptyFolder'))
    if (selected) setProjectDir(selected)
    return selected
  }

  async function createScaffold(directory = projectDir, activate = true, explicitName?: string, allowedExistingFiles: string[] = []): Promise<ScaffoldResult> {
    const result = await window.api.projects.scaffold({ projectDir: directory, projectName: explicitName, profile: selectedProfile, includeDataModule: true, allowedExistingFiles }) as ScaffoldResult
    if (activate) await onWorkspaceReady(result)
    return result
  }

  async function chooseMode(nextMode: ProjectMode): Promise<void> {
    setError('')
    setMode(nextMode)
    if (nextMode === 'nocode') setSelectedProfile('delphi10_13')
    setStep(1)
    if (nextMode !== 'blank' && !projectDir) await chooseDirectory()
  }

  function renderProfileSelector(lockToModern = false): JSX.Element {
    return <section className="wizard-section"><h3><Code2 size={17} /> {t('newProjectWizard.delphiCompatibility')}</h3>
      <div className="wizard-profile-grid">{DELPHI_PROFILE_OPTIONS.map((profile) => {
        const disabled = lockToModern && profile.id !== 'delphi10_13'
        return <button type="button" key={profile.id} className={selectedProfile === profile.id ? 'active' : ''} disabled={disabled} onClick={() => setSelectedProfile(profile.id)}><span><strong>{profile.label}</strong><small>{profile.description}</small></span>{selectedProfile === profile.id && <Check size={15} />}</button>
      })}</div>
      {lockToModern && <small>{t('newProjectWizard.noCodeProfileHint')}</small>}
    </section>
  }

  function patchModule(id: string, patch: Partial<ModuleModel>): void {
    setModules((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }
  function patchField(moduleId: string, fieldId: string, patch: Partial<FieldModel>): void {
    setModules((current) => current.map((item) => item.id === moduleId ? { ...item, fields: item.fields.map((entry) => entry.id === fieldId ? { ...entry, ...patch } : entry) } : item))
  }
  function addCustomModule(): void {
    const id = `custom-${Date.now()}`
    const item = module(id, t('newProjectWizard.newModuleLabel'), 'novo_cadastro', [field(t('newProjectWizard.newModuleFieldName'), 'text', true)], true)
    setModules((current) => [...current, item])
    setActiveModuleId(id)
  }

  function validateNoCode(): boolean {
    if (!projectDir) return setError(t('newProjectWizard.errorSelectProjectFolder')), false
    const databaseError = databaseConfigurationError()
    if (databaseError) return setError(databaseError), false
    if (!selectedModules.length) return setError(t('newProjectWizard.errorSelectOneScreen')), false
    const tableNames = selectedModules.map((item) => item.tableName.trim().toLowerCase())
    if (new Set(tableNames).size !== tableNames.length) return setError(t('newProjectWizard.errorDuplicateTable')), false
    const unitNames = selectedModules.map((item) => item.unitName.trim().toLowerCase())
    if (new Set(unitNames).size !== unitNames.length) return setError(t('newProjectWizard.errorDuplicateUnit')), false
    const formClasses = selectedModules.map((item) => item.formClass.trim().toLowerCase())
    if (new Set(formClasses).size !== formClasses.length) return setError(t('newProjectWizard.errorDuplicateFormClass')), false
    for (const item of selectedModules) {
      if (!item.label.trim() || !item.tableName.trim() || !item.unitName.trim() || !item.formClass.trim()) return setError(t('newProjectWizard.errorCompleteScreenData', { label: item.label || t('newProjectWizard.unnamed') })), false
      if (!item.fields.length || item.fields.some((entry) => !entry.label.trim() || !entry.name.trim())) return setError(t('newProjectWizard.errorReviewFields', { label: item.label })), false
      const names = item.fields.map((entry) => entry.name.toLowerCase())
      if (new Set(names).size !== names.length) return setError(t('newProjectWizard.errorDuplicateFields', { label: item.label })), false
    }
    setError('')
    return true
  }

  async function createBlankProject(): Promise<void> {
    const name = projectName.trim()
    if (!projectDir) return setError(t('newProjectWizard.errorSelectDestinationFolder'))
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return setError(t('newProjectWizard.errorInvalidProjectName'))
    setBusy(true)
    setProgress(t('newProjectWizard.progressCreatingProject'))
    try {
      await createScaffold(projectDir, true, name)
      onClose()
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false); setProgress('') }
  }

  async function createNoCodeProject(): Promise<void> {
    if (!validateNoCode()) return
    let scaffold: ScaffoldResult | null = null
    setBusy(true)
    try {
      setProgress(t('newProjectWizard.progressValidatingDatabase'))
      await persistDatabaseConfiguration(true)
      setProgress(t('newProjectWizard.progressCreatingBase'))
      const allowedExistingFiles = databaseDraft?.databasePath ? [databaseDraft.databasePath] : []
      const result = await createScaffold(projectDir, false, undefined, allowedExistingFiles)
      scaffold = result
      if (!result.dprojPath) throw new Error(t('newProjectWizard.errorNoCodeRequiresDproj'))
      for (let index = 0; index < selectedModules.length; index++) {
        const item = selectedModules[index]
        setProgress(t('newProjectWizard.progressCreatingModule', { label: item.label, current: index + 1, total: selectedModules.length }))
        await window.api.nocode.createForm({
          projectDir: result.projectDir, dprojPath: result.dprojPath, profile: result.profile,
          databaseKind, caption: `Cadastro de ${item.label}`, tableName: item.tableName,
          unitName: item.unitName, formClass: item.formClass,
          fields: item.fields.map(({ label, name, type, required, length }) => ({ label, name, type, required, length }))
        })
      }
      await onWorkspaceReady(result)
      onClose()
    } catch (reason) {
      if (scaffold) {
        await onWorkspaceReady(scaffold)
        setError(t('newProjectWizard.errorKeptForDiagnostics', { message: (reason as Error).message }))
      } else {
        setError((reason as Error).message)
      }
    } finally { setBusy(false); setProgress('') }
  }

  async function createAiProject(): Promise<void> {
    if (!projectDir) return setError(t('newProjectWizard.errorSelectProjectFolder'))
    if (!activeProviderId) return setError(t('newProjectWizard.errorSelectAiProvider'))
    if (aiPrompt.trim().length < 20) return setError(t('newProjectWizard.errorDescribeMoreDetail'))
    setBusy(true)
    setProgress(t('newProjectWizard.progressPreparingAi'))
    try {
      await createScaffold()
      onAiReady(aiPrompt.trim())
      onClose()
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false); setProgress('') }
  }

  return <div className="new-project-wizard-overlay" role="presentation">
    <section className="new-project-wizard" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
      <header>
        <div><span className="wizard-icon"><FilePlus2 size={20} /></span><div><h2 id="new-project-title">{t('newProjectWizard.title')}</h2><p>{t('newProjectWizard.subtitle')}</p></div></div>
        <button className="wizard-close" onClick={onClose} disabled={busy}><X size={20} /></button>
      </header>

      {!mode ? <main className="wizard-mode-page">
        <div className="wizard-mode-grid">{MODE_CARDS.map(({ id, icon: Icon, title, description, features }) => <button key={id} className={`wizard-mode-card ${id}`} onClick={() => void chooseMode(id)} disabled={busy}>
          <span className="mode-icon"><Icon size={25} /></span><strong>{title}</strong><p>{description}</p>
          <ul>{features.map((feature) => <li key={feature}><Check size={13} /> {feature}</li>)}</ul><span className="mode-action">{t('newProjectWizard.start')} <ChevronRight size={15} /></span>
        </button>)}</div>
        <aside className="wizard-rich-note"><Sparkles size={17} /><span><strong>{t('newProjectWizard.safeCreationTitle')}</strong> {t('newProjectWizard.safeCreationDescription')}</span></aside>
        {busy && <div className="wizard-progress"><Loader2 className="spin" size={16} /> {progress}</div>}
        {error && <div className="wizard-error">{error}</div>}
      </main> : mode === 'blank' ? <>
        <nav className="wizard-steps wizard-steps-two">
          {[t('newProjectWizard.stepNameAndDestination'), t('newProjectWizard.stepInitialStructure')].map((label, index) => <span key={label} className={step >= index + 1 ? 'active' : ''}><b>{index + 1}</b>{label}</span>)}
        </nav>
        <main className="wizard-content">
          {step === 1 ? <div className="wizard-destination-page">
            <section className="wizard-section"><h3><FilePlus2 size={17} /> {t('newProjectWizard.projectName')}</h3><input className="wizard-project-name" autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value.replace(/[^A-Za-z0-9_]/g, ''))} placeholder="MeuProjetoDelphi" /><small>{t('newProjectWizard.projectNameHint')}</small></section>
            <section className="wizard-section"><h3><FolderOpen size={17} /> {t('newProjectWizard.projectFolder')}</h3><div className="wizard-path-row"><input value={projectDir} readOnly placeholder={t('newProjectWizard.selectEmptyFolderShort')} /><button onClick={() => void chooseDirectory()}><FolderOpen size={15} /> {t('mainMenuPanel.select')}</button></div>{projectDir && <small>{t('newProjectWizard.destination')}: {projectDir}</small>}</section>
            {renderProfileSelector(false)}
          </div> : <div className="wizard-review-page">
            <div className="review-hero"><span><Code2 size={24} /></span><div><h3>{t('newProjectWizard.baseReadyTitle')}</h3><p>{t('newProjectWizard.baseReadyDescription')}</p></div></div>
            <div className="review-grid"><div><small>{t('newProjectWizard.project')}</small><strong>{projectName}</strong></div><div><small>{t('newProjectWizard.delphiProfile')}</small><strong>{DELPHI_PROFILE_OPTIONS.find((item) => item.id === selectedProfile)?.label}</strong></div><div><small>{t('newProjectWizard.destination')}</small><strong>{projectDir}</strong></div></div>
            <ul className="review-architecture"><li><Check /> {t('newProjectWizard.archMainForm')}</li><li><Check /> {t('newProjectWizard.archDataModule')}</li><li><Check /> {selectedProfile === 'delphi10_13' ? t('newProjectWizard.archFdConnection') : t('newProjectWizard.archCompatibleDataModule')}</li><li><Check /> {t('newProjectWizard.archDatabaseIni')}</li><li><Check /> {t('newProjectWizard.archDprDproj')}</li><li><Check /> {t('newProjectWizard.archOutputs')}</li></ul>
          </div>}
          {error && <div className="wizard-error">{error}</div>}{busy && <div className="wizard-progress"><Loader2 className="spin" size={16} /> {progress}</div>}
        </main>
        <footer><button onClick={() => step === 1 ? setMode(null) : setStep(1)} disabled={busy}><ChevronLeft size={15} /> {t('common.back')}</button><div>{step === 1 ? <button className="primary" onClick={() => { setError(''); if (!projectName.trim()) setError(t('newProjectWizard.errorEnterProjectName')); else if (!projectDir) setError(t('newProjectWizard.errorSelectBaseFolder')); else setStep(2) }} disabled={busy}>{t('newProjectWizard.reviewStructure')} <ChevronRight size={15} /></button> : <button className="primary" onClick={() => void createBlankProject()} disabled={busy}>{busy ? <Loader2 className="spin" size={15} /> : <FilePlus2 size={15} />} {t('newProjectWizard.createProject')}</button>}</div></footer>
      </> : <>
        <nav className="wizard-steps">
          {mode === 'nocode' ? [t('newProjectWizard.stepDestinationAndModules'), t('newProjectWizard.stepScreenFields'), t('newProjectWizard.stepReviewAndCreate')].map((label, index) => <span key={label} className={step >= index + 1 ? 'active' : ''}><b>{index + 1}</b>{label}</span>) : [t('newProjectWizard.stepDestinationAndProvider'), t('newProjectWizard.stepDescribeSystem'), t('newProjectWizard.stepGenerateAndReview')].map((label, index) => <span key={label} className={step >= index + 1 ? 'active' : ''}><b>{index + 1}</b>{label}</span>)}
        </nav>
        <main className="wizard-content">
          {step === 1 && <div className="wizard-destination-page">
            <section className="wizard-section"><h3><FolderOpen size={17} /> {t('newProjectWizard.projectFolder')}</h3><div className="wizard-path-row"><input value={projectDir} readOnly placeholder={t('newProjectWizard.selectEmptyFolderShort')} /><button onClick={() => void chooseDirectory()}><FolderOpen size={15} /> {t('mainMenuPanel.select')}</button></div><small>{t('newProjectWizard.projectNameFromFolder')}</small></section>
            {renderProfileSelector(mode === 'nocode')}
            {mode === 'nocode' ? <><section className="wizard-section"><h3><Database size={17} /> {t('newProjectWizard.database')}</h3><div className="wizard-database-grid">{databases.map((item) => <button type="button" key={item.kind} className={databaseKind === item.kind ? 'active' : ''} onClick={() => { setDatabaseKind(item.kind); setDatabaseStatus('') }}><Database size={15} /><span><strong>{item.label}</strong><small>{item.enabled ? (item.detail ? detailLabel(t, item.detail) : t('newProjectWizard.configured')) : t('newProjectWizard.configureInThisProject')}</small></span>{databaseKind === item.kind && <Check size={15} />}</button>)}</div>
              {databaseDraft && <div className="wizard-database-config">
                <div className="wizard-database-config-title"><div><Database size={16} /><span><strong>{DATABASE_LABELS[databaseKind]}</strong><small>{databaseKind === 'sqlite' ? t('newProjectWizard.sqliteHint') : databaseKind === 'firebird' ? t('newProjectWizard.firebirdHint') : t('newProjectWizard.otherDatabaseHint')}</small></span></div><span className={databaseDraft.enabled ? 'configured' : ''}>{databaseDraft.enabled ? t('newProjectWizard.configured') : t('newProjectWizard.pending')}</span></div>
                {(databaseKind === 'sqlite' || databaseKind === 'firebird') && <label className="wizard-db-wide"><span>{t('newProjectWizard.databaseFile')}</span><div className="wizard-path-row"><input value={databaseDraft.databasePath} onChange={(event) => updateDatabase('databasePath', event.target.value)} placeholder={databaseKind === 'sqlite' ? String.raw`C:\Dados\sistema.sqlite` : String.raw`C:\Dados\sistema.fdb`} /><button type="button" onClick={() => void browseDatabaseFile()}><FolderOpen size={14} /> {t('noCodeFormWizard.locate')}</button>{databaseKind === 'sqlite' && <button type="button" onClick={() => void createSqliteDatabase()}><FilePlus2 size={14} /> {t('noCodeFormWizard.createNew')}</button>}</div></label>}
                {(databaseKind === 'firebird' || databaseKind === 'mysql' || databaseKind === 'oracle') && <label className="wizard-db-wide"><span>{t('newProjectWizard.installOptional')}</span><div className="wizard-path-row"><input value={databaseDraft.installPath} onChange={(event) => updateDatabase('installPath', event.target.value)} /><button type="button" onClick={() => void browseDatabaseInstall()}><FolderOpen size={14} /> {t('noCodeFormWizard.locate')}</button></div></label>}
                {databaseKind !== 'sqlite' && <div className="wizard-db-grid"><label><span>{t('noCodeFormWizard.server')}</span><input value={databaseDraft.host} onChange={(event) => updateDatabase('host', event.target.value)} placeholder="localhost" /></label><label><span>{t('noCodeFormWizard.port')}</span><input value={databaseDraft.port} onChange={(event) => updateDatabase('port', event.target.value)} /></label>{!['firebird'].includes(databaseKind) && <label className="wizard-db-wide"><span>{databaseKind === 'oracle' ? t('noCodeFormWizard.oracleService') : t('noCodeFormWizard.databaseName')}</span><input value={databaseDraft.databaseName} onChange={(event) => updateDatabase('databaseName', event.target.value)} /></label>}<label><span>{t('noCodeFormWizard.username')}</span><input value={databaseDraft.username} onChange={(event) => updateDatabase('username', event.target.value)} /></label><label><span>{t('noCodeFormWizard.password')}</span><input type="password" value={databasePasswords[databaseKind] ?? ''} onChange={(event) => setDatabasePasswords((current) => ({ ...current, [databaseKind]: event.target.value }))} placeholder={databaseDraft.hasPassword ? t('newProjectWizard.passwordProtectedKeep') : t('noCodeFormWizard.enterPassword')} /></label></div>}
                <div className="wizard-db-actions"><button type="button" onClick={() => void testSelectedDatabase()} disabled={testingDatabase}>{testingDatabase ? <Loader2 className="spin" size={14} /> : <Check size={14} />} {t('newProjectWizard.testAndSaveConnection')}</button></div>
                {databaseStatus && <div className={`wizard-db-status${databaseStatus.startsWith(t('noCodeFormWizard.errorWord')) ? ' error' : ''}`}>{databaseStatus}</div>}
              </div>}</section>
            <section className="wizard-section"><div className="section-title-row"><h3><Boxes size={17} /> {t('newProjectWizard.initialModules')}</h3><button onClick={addCustomModule}><Plus size={14} /> {t('newProjectWizard.customModule')}</button></div><div className="wizard-module-grid">{modules.map((item) => <label key={item.id} className={item.selected ? 'selected' : ''}><input type="checkbox" checked={item.selected} onChange={(event) => patchModule(item.id, { selected: event.target.checked })} /><span><strong>{item.label}</strong><small>{t('newProjectWizard.suggestedFields', { count: item.fields.length })}</small></span></label>)}</div></section></> : <section className="wizard-section"><h3><Bot size={17} /> {t('newProjectWizard.aiProvider')}</h3><select value={activeProviderId ?? ''} onChange={(event) => setActiveProviderId(event.target.value || null)}><option value="">{t('newProjectWizard.selectEllipsis')}</option>{enabledProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.defaultModel || t('newProjectWizard.defaultModel')}</option>)}</select><small>{t('newProjectWizard.aiChangesReviewHint')}</small></section>}
          </div>}

          {step === 2 && mode === 'nocode' && <div className="wizard-fields-page">
            <aside><div className="section-title-row"><h3>{t('newProjectWizard.selectedScreens')}</h3><button onClick={addCustomModule}><Plus size={14} /></button></div>{selectedModules.map((item) => <button key={item.id} className={activeModule?.id === item.id ? 'active' : ''} onClick={() => setActiveModuleId(item.id)}><span>{item.label}</span><small>{t('newProjectWizard.fieldsCount', { count: item.fields.length })}</small></button>)}</aside>
            {activeModule && <section><div className="wizard-module-meta"><label>{t('newProjectWizard.screenTitle')}<input value={activeModule.label} onChange={(event) => patchModule(activeModule.id, { label: event.target.value })} /></label><label>{t('dbBinding.table')}<input value={activeModule.tableName} onChange={(event) => patchModule(activeModule.id, { tableName: slug(event.target.value) })} /></label><label>Unit<input value={activeModule.unitName} onChange={(event) => patchModule(activeModule.id, { unitName: event.target.value })} /></label></div>
              <div className="wizard-field-head"><span>{t('newProjectWizard.labelHeader')}</span><span>{t('manageForm.databaseName')}</span><span>{t('manageForm.type')}</span><span>{t('manageForm.required')}</span><span /></div>
              <div className="wizard-field-list">{activeModule.fields.map((entry) => <div className="wizard-field-row" key={entry.id}><input value={entry.label} onChange={(event) => patchField(activeModule.id, entry.id, { label: event.target.value, name: slug(event.target.value) })} /><input value={entry.name} onChange={(event) => patchField(activeModule.id, entry.id, { name: slug(event.target.value) })} /><select value={entry.type} onChange={(event) => patchField(activeModule.id, entry.id, { type: event.target.value as FieldType })}>{FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><label className="required-check"><input type="checkbox" checked={entry.required} onChange={(event) => patchField(activeModule.id, entry.id, { required: event.target.checked })} /> {t('manageForm.yes')}</label><button className="danger" onClick={() => patchModule(activeModule.id, { fields: activeModule.fields.filter((item) => item.id !== entry.id) })}><Trash2 size={15} /></button></div>)}</div>
              <button className="wizard-add-field" onClick={() => patchModule(activeModule.id, { fields: [...activeModule.fields, field(t('newProjectWizard.newFieldDefaultLabel'))] })}><Plus size={15} /> {t('manageForm.addField')}</button>
            </section>}
          </div>}

          {step === 2 && mode === 'ai' && <div className="wizard-ai-page"><section><h3>{t('newProjectWizard.whatToBuild')}</h3><textarea autoFocus value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder={t('newProjectWizard.aiPromptPlaceholder')} /><div className="ai-quality-hints"><span><Check size={13} /> {t('newProjectWizard.aiHint1')}</span><span><Check size={13} /> {t('newProjectWizard.aiHint2')}</span><span><Check size={13} /> {t('newProjectWizard.aiHint3')}</span></div></section><aside><div className="wizard-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('newProjectWizard.searchSuggestions')} /></div><div className="wizard-ai-suggestions">{visibleSuggestions.map((item) => <button key={item.id} onClick={() => setAiPrompt((current) => current ? `${current}\n\n${item.promptText}` : item.promptText)}><span>{item.label}</span><small>{item.category}</small><Plus size={14} /></button>)}</div></aside></div>}

          {step === 3 && <div className="wizard-review-page"><div className="review-hero"><span><Sparkles size={24} /></span><div><h3>{t('newProjectWizard.readyToCreate')}</h3><p>{t('newProjectWizard.reviewArchitectureHint')}</p></div></div>{mode === 'nocode' ? <div className="review-grid"><div><small>{t('newProjectWizard.destination')}</small><strong>{projectDir}</strong></div><div><small>{t('newProjectWizard.delphiProfile')}</small><strong>{DELPHI_PROFILE_OPTIONS.find((item) => item.id === selectedProfile)?.label}</strong></div><div><small>{t('newProjectWizard.database')}</small><strong>{databases.find((item) => item.kind === databaseKind)?.label}</strong></div><div><small>{t('newProjectWizard.screens')}</small><strong>{t('newProjectWizard.registrationsCount', { count: selectedModules.length })}</strong></div><div><small>{t('newProjectWizard.fields')}</small><strong>{t('newProjectWizard.fieldsTotalCount', { count: selectedModules.reduce((total, item) => total + item.fields.length, 0) })}</strong></div></div> : <div className="review-ai-prompt"><small>{t('newProjectWizard.aiRequest')}</small><p>{aiPrompt}</p></div>}<ul className="review-architecture"><li><Check /> {t('newProjectWizard.archBaseValidated')}</li><li><Check /> {t('newProjectWizard.archCentralizedDataModule')}</li><li><Check /> {t('newProjectWizard.archExternalConfig')}</li><li><Check /> {t('newProjectWizard.archAiFilesReviewed')}</li></ul></div>}
          {error && <div className="wizard-error">{error}</div>}{busy && <div className="wizard-progress"><Loader2 className="spin" size={16} /> {progress}</div>}
        </main>
        <footer><button onClick={() => step === 1 ? setMode(null) : setStep((value) => value - 1)} disabled={busy}><ChevronLeft size={15} /> {t('common.back')}</button><div>{step < 3 ? <button className="primary" onClick={() => { setError(''); if (!projectDir) setError(t('newProjectWizard.errorSelectProjectFolder')); else if (mode === 'nocode' && step === 1 && !selectedModules.length) setError(t('newProjectWizard.errorSelectOneModule')); else setStep((value) => value + 1) }} disabled={busy}><ArrowRight size={15} /> {t('noCodeFormWizard.continue')}</button> : <button className="primary" onClick={() => void (mode === 'nocode' ? createNoCodeProject() : createAiProject())} disabled={busy}>{busy ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />} {t('newProjectWizard.createProject')}</button>}</div></footer>
      </>}
    </section>
  </div>
}
