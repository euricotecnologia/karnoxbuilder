import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X,
  RefreshCw,
  Loader2,
  Trash2,
  Plus,
  CircleCheck,
  CircleX,
  Sun,
  Moon,
  Languages,
  FolderOpen,
  Database,
  FilePlus2,
  Save
} from 'lucide-react'
import { useAppStore, type AiProviderRow } from '@renderer/state/store'
import { applyTheme } from '@renderer/state/theme'
import { setLanguage, SUPPORTED_LANGUAGES, LANGUAGE_LABELS, type SupportedLanguage } from '@renderer/i18n'
import { ModelCombobox } from './ModelCombobox'
import { LibrariesSettings } from './LibrariesSettings'
import './Settings.css'

function ResultMessage({ result }: { result: { ok: boolean; message: string } }): JSX.Element {
  return (
    <div className={`settings-test-result ${result.ok ? 'ok' : 'fail'}`}>
      {result.ok ? <CircleCheck size={13} /> : <CircleX size={13} />} {result.message}
    </div>
  )
}

interface DelphiInstall {
  version: string
  studioPath: string
  rsvarsPath: string | null
  binPath: string
}

interface ProviderPreset {
  kind: string
  label: string
  providerType: 'anthropic' | 'openai-compatible'
  defaultBaseUrl: string | null
  requiresApiKey: boolean
  isLocal: boolean
  staticModels: string[]
}

type DraftProvider = {
  id: string | null
  name: string
  kind: string
  baseUrl: string | null
  defaultModel: string | null
  enabled: boolean
  hasApiKey: boolean
}

type SettingsTab = 'main' | 'ai' | 'database' | 'libraries'
type DatabaseKind = 'firebird' | 'sqlite' | 'mysql' | 'postgresql' | 'sqlserver' | 'oracle'

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
  firebird: 'Firebird',
  sqlite: 'SQLite',
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlserver: 'SQL Server',
  oracle: 'Oracle'
}

function ProviderCard({
  provider,
  presets,
  onSaved,
  onDeleted
}: {
  provider: DraftProvider
  presets: ProviderPreset[]
  onSaved: () => void
  onDeleted: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const preset = presets.find((p) => p.kind === provider.kind) ?? presets[0]

  const [name, setName] = useState(provider.name)
  const [kind, setKind] = useState(provider.kind)
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? preset?.defaultBaseUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  const [defaultModel, setDefaultModel] = useState(provider.defaultModel ?? preset?.staticModels[0] ?? '')
  const [enabled, setEnabled] = useState(provider.enabled)
  const [dynamicModels, setDynamicModels] = useState<string[]>([])
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelFetchError, setModelFetchError] = useState<string | null>(null)
  const [modelFetchMessage, setModelFetchMessage] = useState<string | null>(null)

  const currentPreset = presets.find((p) => p.kind === kind) ?? preset
  const modelOptions = Array.from(new Set([...(currentPreset?.staticModels ?? []), ...dynamicModels]))
  const showBaseUrl = kind !== 'anthropic' && kind !== 'openai'

  async function refreshModels(effectiveBaseUrl: string, freshApiKey: string): Promise<void> {
    if (!effectiveBaseUrl) return
    setFetchingModels(true)
    setModelFetchError(null)
    setModelFetchMessage(null)
    try {
      const result =
        provider.id && !freshApiKey
          ? await window.api.ai.listModelsForProvider(provider.id)
          : await window.api.ai.listModels({ baseUrl: effectiveBaseUrl, apiKey: freshApiKey || undefined })
      if (result.ok) {
        setDynamicModels(result.models)
        setModelFetchMessage(
          result.models.length > 0
            ? t('settings.providerCard.modelsLoaded', { count: result.models.length })
            : t('settings.providerCard.noModelsReturned')
        )
      } else {
        setModelFetchError(result.message)
      }
    } finally {
      setFetchingModels(false)
    }
  }

  useEffect(() => {
    if (provider.id && provider.hasApiKey && baseUrl) {
      void refreshModels(baseUrl, '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleKindChange(newKind: string): void {
    setKind(newKind)
    const newPreset = presets.find((p) => p.kind === newKind)
    const newBaseUrl = newPreset?.defaultBaseUrl ?? ''
    setBaseUrl(newBaseUrl)
    setDefaultModel(newPreset?.staticModels[0] ?? '')
    setDynamicModels([])
    setModelFetchError(null)
    setModelFetchMessage(null)
    if (newBaseUrl && (!newPreset?.requiresApiKey || apiKey || provider.hasApiKey)) {
      void refreshModels(newBaseUrl, apiKey)
    }
  }

  function handleApiKeyBlur(): void {
    if (apiKey && baseUrl) {
      void refreshModels(baseUrl, apiKey)
    }
  }

  async function handleSave(): Promise<void> {
    if (!name.trim()) {
      setSaveResult({ ok: false, message: t('settings.providerCard.errorProviderName') })
      return
    }

    setSaving(true)
    setSaveResult(null)
    try {
      await window.api.aiProviders.upsert({
        id: provider.id ?? undefined,
        name,
        kind,
        baseUrl: baseUrl || undefined,
        apiKey: apiKey || undefined,
        defaultModel,
        enabled
      })
      setApiKey('')
      setSaveResult({ ok: true, message: t('settings.providerCard.providerSaved') })
      onSaved()
    } catch (err) {
      setSaveResult({ ok: false, message: t('settings.providerCard.errorSaving', { message: (err as Error).message }) })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!provider.id) return
    if (!window.confirm(t('settings.providerCard.removeProviderConfirm', { name }))) return
    try {
      await window.api.aiProviders.delete(provider.id)
      onDeleted()
    } catch (err) {
      setSaveResult({ ok: false, message: t('settings.providerCard.errorRemoving', { message: (err as Error).message }) })
    }
  }

  async function handleTest(): Promise<void> {
    if (!provider.id) {
      window.alert(t('settings.providerCard.saveBeforeTest'))
      return
    }
    if (!name.trim()) {
      setTestResult({ ok: false, message: t('settings.providerCard.errorProviderName') })
      return
    }
    setTesting(true)
    setTestResult(null)
    setSaveResult(null)
    try {
      const providerId = await window.api.aiProviders.upsert({
        id: provider.id,
        name,
        kind,
        baseUrl: baseUrl || undefined,
        apiKey: apiKey || undefined,
        defaultModel,
        enabled
      })
      const result = await window.api.aiProviders.testConnection(providerId)
      setTestResult(result)
      setApiKey('')
      await onSaved()
    } catch (err) {
      setTestResult({ ok: false, message: t('settings.providerCard.errorTesting', { message: (err as Error).message }) })
    } finally {
      setTesting(false)
    }
  }
  return (
    <div className="settings-provider-card">
      <div className="settings-row">
        <label>{t('settings.providerCard.name')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Claude Sonnet" />
      </div>
      <div className="settings-row">
        <label>{t('settings.providerCard.brand')}</label>
        <select value={kind} onChange={(e) => handleKindChange(e.target.value)}>
          {presets.map((p) => (
            <option key={p.kind} value={p.kind}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {showBaseUrl && (
        <div className="settings-row">
          <label>Base URL</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={currentPreset?.defaultBaseUrl || 'https://...'}
          />
        </div>
      )}
      <div className="settings-row">
        <label>{t('settings.providerCard.apiKey')}</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onBlur={handleApiKeyBlur}
          placeholder={
            provider.hasApiKey
              ? t('settings.providerCard.apiKeyAlreadySaved')
              : currentPreset?.requiresApiKey
                ? 'sk-...'
                : t('settings.providerCard.apiKeyOptional')
          }
        />
      </div>
      <div className="settings-row">
        <label>{t('settings.providerCard.model')}</label>
        <ModelCombobox
          id={`model-${provider.id ?? 'new'}`}
          value={defaultModel ?? ''}
          onChange={setDefaultModel}
          options={modelOptions}
          placeholder={t('settings.providerCard.modelPlaceholder')}
        />
        <button
          className="settings-btn secondary settings-icon-btn"
          onClick={() => refreshModels(baseUrl, apiKey)}
          disabled={fetchingModels || !baseUrl}
          title={t('settings.providerCard.refreshModels')}
        >
          {fetchingModels ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} color="#4a9eff" />}
        </button>
      </div>
      {modelFetchError && <ResultMessage result={{ ok: false, message: modelFetchError }} />}
      {modelFetchMessage && <ResultMessage result={{ ok: true, message: modelFetchMessage }} />}
      <div className="settings-row">
        <label>{t('settings.providerCard.active')}</label>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ flex: 'none' }} />
      </div>
      {testResult && <ResultMessage result={testResult} />}
      {saveResult && <ResultMessage result={saveResult} />}
      <div className="settings-provider-actions">
        {provider.id && (
          <button className="settings-btn secondary" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {testing ? t('settings.providerCard.testing') : t('settings.providerCard.testConnection')}
          </button>
        )}
        {provider.id && (
          <button className="settings-btn danger" onClick={handleDelete}>
            <Trash2 size={13} /> {t('mainMenuPanel.remove')}
          </button>
        )}
        <button className="settings-btn" onClick={handleSave} disabled={saving || !name}>
          {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} {saving ? t('editor.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}

function DatabaseProfileCard({ profile, onSaved }: { profile: DatabaseProfile; onSaved: () => void }): JSX.Element {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(profile)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function update<K extends keyof DatabaseProfile>(key: K, value: DatabaseProfile[K]): void {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function updateOption(key: string, value: string | boolean): void {
    setDraft((current) => ({ ...current, options: { ...current.options, [key]: value } }))
  }

  async function browseInstall(): Promise<void> {
    const path = await window.api.fs.selectDirectory(t('settings.databaseCard.selectInstallFolder', { database: DATABASE_LABELS[draft.kind] }))
    if (path) update('installPath', path)
  }

  async function browseDatabaseFile(): Promise<void> {
    const extensions = draft.kind === 'firebird' ? ['fdb', 'gdb'] : ['sqlite', 'sqlite3', 'db']
    const path = await window.api.fs.selectDatabaseFile(t('settings.databaseCard.selectDatabase', { database: DATABASE_LABELS[draft.kind] }), extensions)
    if (path) update('databasePath', path)
  }

  async function createSqlite(): Promise<void> {
    const path = await window.api.fs.createSqliteDatabase()
    if (path) update('databasePath', path)
  }

  async function testConnection(): Promise<void> {
    setSaving(true)
    setResult(null)
    try {
      await window.api.databaseProfiles.upsert({
        ...draft,
        password: password || undefined
      })
      const test = await window.api.databaseExplorer.test(draft.kind)
      setPassword('')
      setResult({ ok: true, message: t('settings.databaseCard.connectionSuccess', { ms: test.durationMs }) })
      window.dispatchEvent(new CustomEvent('karnox:database-profiles-changed'))
      onSaved()
    } catch (err) {
      setResult({ ok: false, message: t('settings.databaseCard.connectionFailed', { message: (err as Error).message }) })
    } finally {
      setSaving(false)
    }
  }

  async function save(): Promise<void> {
    setSaving(true)
    setResult(null)
    try {
      await window.api.databaseProfiles.upsert({
        ...draft,
        password: password || undefined
      })
      setPassword('')
      setResult({ ok: true, message: draft.enabled ? t('settings.databaseCard.savedAndAvailable') : t('settings.databaseCard.savedButDisabled') })
      window.dispatchEvent(new CustomEvent('karnox:database-profiles-changed'))
      onSaved()
    } catch (err) {
      setResult({ ok: false, message: t('settings.databaseCard.errorSaving', { message: (err as Error).message }) })
    } finally {
      setSaving(false)
    }
  }

  const isSqlite = draft.kind === 'sqlite'
  const isFirebird = draft.kind === 'firebird'
  const isOracle = draft.kind === 'oracle'
  const isMySql = draft.kind === 'mysql'
  const isSqlServer = draft.kind === 'sqlserver'

  return (
    <div className="settings-database-card">
      <div className="settings-database-title">
        <div>
          <Database size={16} />
          <strong>{DATABASE_LABELS[draft.kind]}</strong>
        </div>
        <label className="settings-toggle-label">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => update('enabled', e.target.checked)} />
          {t('settings.databaseCard.availableForAi')}
        </label>
      </div>

      {(isFirebird || isOracle || isMySql) && (
        <div className="settings-row">
          <label>{isOracle ? t('settings.databaseCard.oracleClient') : t('settings.databaseCard.installation')}</label>
          <input value={draft.installPath} onChange={(e) => update('installPath', e.target.value)} placeholder={t('settings.databaseCard.installFolderPlaceholder')} />
          <button className="settings-btn secondary settings-icon-btn" onClick={browseInstall} title={t('librariesSettings.selectFolder')}>
            <FolderOpen size={14} />
          </button>
        </div>
      )}

      {isSqlite ? (
        <div className="settings-row settings-row-wrap">
          <label>{t('settings.databaseCard.file')}</label>
          <input value={draft.databasePath} onChange={(e) => update('databasePath', e.target.value)} placeholder="C:\\Dados\\database.sqlite" />
          <button className="settings-btn secondary" onClick={browseDatabaseFile}>
            <FolderOpen size={13} /> {t('noCodeFormWizard.locate')}
          </button>
          <button className="settings-btn secondary" onClick={createSqlite}>
            <FilePlus2 size={13} /> {t('settings.databaseCard.create')}
          </button>
        </div>
      ) : (
        <>
          <div className="settings-fields-grid">
            <div className="settings-field">
              <label>{t('settings.databaseCard.serverHost')}</label>
              <input value={draft.host} onChange={(e) => update('host', e.target.value)} placeholder="localhost" />
            </div>
            <div className="settings-field settings-field-port">
              <label>{t('noCodeFormWizard.port')}</label>
              <input value={draft.port} onChange={(e) => update('port', e.target.value)} />
            </div>
          </div>
          <div className="settings-row">
            <label>{isFirebird ? t('settings.databaseCard.databaseFile') : isOracle ? t('settings.databaseCard.serviceOrSid') : t('settings.databaseCard.database')}</label>
            <input
              value={isFirebird ? draft.databasePath : draft.databaseName}
              onChange={(e) => update(isFirebird ? 'databasePath' : 'databaseName', e.target.value)}
              placeholder={isFirebird ? 'C:\\Dados\\sistema.fdb' : isOracle ? 'ORCL' : t('settings.databaseCard.databaseNamePlaceholder')}
            />
            {isFirebird && (
              <button className="settings-btn secondary settings-icon-btn" onClick={browseDatabaseFile} title={t('settings.databaseCard.selectFile')}>
                <FolderOpen size={14} />
              </button>
            )}
          </div>
          <div className="settings-fields-grid settings-fields-auth">
            <div className="settings-field">
              <label>{t('noCodeFormWizard.username')}</label>
              <input value={draft.username} onChange={(e) => update('username', e.target.value)} placeholder={t('settings.databaseCard.accessUserPlaceholder')} />
            </div>
            <div className="settings-field">
              <label>{t('noCodeFormWizard.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={draft.hasPassword ? t('settings.databaseCard.passwordAlreadyProtected') : t('settings.databaseCard.accessPasswordPlaceholder')}
                disabled={isSqlServer && draft.options.windowsAuth === true}
              />
            </div>
          </div>
          {isSqlServer && (
            <label className="settings-inline-check">
              <input
                type="checkbox"
                checked={draft.options.windowsAuth === true}
                onChange={(e) => updateOption('windowsAuth', e.target.checked)}
              />
              {t('settings.databaseCard.useWindowsAuth')}
            </label>
          )}
        </>
      )}

      {result && <ResultMessage result={result} />}
      <div className="settings-provider-actions">
        <button className="settings-btn secondary" onClick={testConnection} disabled={saving}>
          <RefreshCw size={13} className={saving ? 'spin' : undefined} /> {t('settings.providerCard.testConnection')}
        </button>
        <button className="settings-btn" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} {saving ? t('editor.saving') : t('settings.databaseCard.saveConfiguration')}
        </button>
      </div>
    </div>
  )
}

export function Settings(): JSX.Element | null {
  const { t, i18n } = useTranslation()
  const {
    showSettings,
    setShowSettings,
    aiProviders,
    setAiProviders,
    activeProviderId,
    setActiveProviderId,
    theme,
    projectDir,
    buildPlatform,
    buildConfig
  } = useAppStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('main')
  const [showNewCard, setShowNewCard] = useState(false)
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [delphiInstalls, setDelphiInstalls] = useState<DelphiInstall[]>([])
  const [activeInstall, setActiveInstall] = useState<DelphiInstall | null>(null)
  const [delphiError, setDelphiError] = useState<string | null>(null)
  const [databaseProfiles, setDatabaseProfiles] = useState<DatabaseProfile[]>([])

  async function refreshProviders(): Promise<void> {
    const list = await window.api.aiProviders.list()
    setAiProviders(list)
    if (!activeProviderId && list.length > 0) {
      const firstEnabled = list.find((p: AiProviderRow) => p.enabled && p.hasApiKey)
      if (firstEnabled) setActiveProviderId(firstEnabled.id)
    }
    setShowNewCard(false)
  }

  async function refreshDelphi(): Promise<void> {
    const installs = await window.api.delphi.detectInstalls()
    setDelphiInstalls(installs)
    const active = await window.api.delphi.getActiveInstall()
    setActiveInstall(active)
  }

  async function refreshDatabaseProfiles(): Promise<void> {
    const profiles = (await window.api.databaseProfiles.list()) as DatabaseProfile[]
    setDatabaseProfiles(profiles)
  }

  async function handleSelectInstall(install: DelphiInstall): Promise<void> {
    await window.api.delphi.setActiveInstall(install.studioPath)
    setActiveInstall(install)
  }

  async function handleBrowseDelphi(): Promise<void> {
    setDelphiError(null)
    const dir = await window.api.fs.selectDirectory('Selecione a pasta de instalação do RAD Studio')
    if (!dir) return
    const validated = await window.api.delphi.validatePath(dir)
    if (!validated) {
      setDelphiError(`A pasta selecionada não contém "bin\\rsvars.bat": ${dir}`)
      return
    }
    await window.api.delphi.setActiveInstall(validated.studioPath)
    setActiveInstall(validated)
    if (!delphiInstalls.some((i) => i.studioPath === validated.studioPath)) {
      setDelphiInstalls([...delphiInstalls, validated])
    }
  }

  useEffect(() => {
    if (!showSettings) return
    void refreshProviders()
    void window.api.ai.listPresets().then(setPresets)
    void refreshDelphi()
    void refreshDatabaseProfiles()
  }, [showSettings])

  if (!showSettings) return null

  return (
    <div className="settings-overlay">
      <div className="settings-modal">
        <div className="settings-modal-header">
          <h2>{t('settings.title')}</h2>
          <button className="settings-close" onClick={() => setShowSettings(false)} title={t('settings.close')}>
            <X size={16} />
          </button>
        </div>

        <div className="settings-tabs" role="tablist" aria-label={t('settings.tabsLabel')}>
          <button className={activeTab === 'main' ? 'active' : ''} onClick={() => setActiveTab('main')}>
            {t('settings.tabMain')}
          </button>
          <button className={activeTab === 'ai' ? 'active' : ''} onClick={() => setActiveTab('ai')}>
            {t('settings.tabAi')}
          </button>
          <button className={activeTab === 'database' ? 'active' : ''} onClick={() => setActiveTab('database')}>
            {t('settings.tabDatabase')}
          </button>
          <button className={activeTab === 'libraries' ? 'active' : ''} onClick={() => setActiveTab('libraries')}>
            {t('settings.tabLibraries')}
          </button>
        </div>

        <div className="settings-tab-content">
          {activeTab === 'main' && (
            <>
              <div className="settings-section">
                <h3>{t('settings.appearance')}</h3>
                <div className="settings-theme-row">
                  <button
                    className={`settings-btn secondary${theme === 'dark' ? ' active' : ''}`}
                    onClick={() => applyTheme('dark')}
                  >
                    <Moon size={14} color="#818cf8" /> {t('settings.dark')}
                  </button>
                  <button
                    className={`settings-btn secondary${theme === 'light' ? ' active' : ''}`}
                    onClick={() => applyTheme('light')}
                  >
                    <Sun size={14} color="#f5b942" /> {t('settings.light')}
                  </button>
                </div>
              </div>

              <div className="settings-section">
                <h3>{t('settings.language')}</h3>
                <div className="settings-theme-row">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      className={`settings-btn secondary${i18n.language === lang ? ' active' : ''}`}
                      onClick={() => void setLanguage(lang as SupportedLanguage)}
                    >
                      <Languages size={14} color="#4a9eff" /> {LANGUAGE_LABELS[lang]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-section">
                <h3>Delphi / RAD Studio</h3>
                {delphiInstalls.length === 0 ? (
                  <div className="settings-delphi-info">{t('settings.noDelphiInstall')}</div>
                ) : (
                  <div className="settings-delphi-list">
                    {delphiInstalls.map((install) => (
                      <label key={install.studioPath} className="settings-delphi-item">
                        <input
                          type="radio"
                          name="delphi-install"
                          checked={activeInstall?.studioPath === install.studioPath}
                          onChange={() => handleSelectInstall(install)}
                        />
                        <div>
                          <strong>{t('settings.version')} {install.version}</strong>
                          <div className="settings-delphi-path">{install.studioPath}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {delphiError && <ResultMessage result={{ ok: false, message: delphiError }} />}
                <button className="settings-btn secondary" onClick={handleBrowseDelphi} style={{ marginTop: 8 }}>
                  <FolderOpen size={13} color="#f5b942" /> {t('settings.selectAnotherFolder')}
                </button>
              </div>
            </>
          )}

          {activeTab === 'ai' && (
            <div className="settings-section">
              <h3>{t('settings.tabAi')}</h3>
              {aiProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} presets={presets} onSaved={refreshProviders} onDeleted={refreshProviders} />
              ))}
              {showNewCard && presets.length > 0 && (
                <ProviderCard
                  provider={{
                    id: null,
                    name: '',
                    kind: presets[0].kind,
                    baseUrl: presets[0].defaultBaseUrl,
                    defaultModel: presets[0].staticModels[0] ?? '',
                    enabled: true,
                    hasApiKey: false
                  }}
                  presets={presets}
                  onSaved={refreshProviders}
                  onDeleted={() => setShowNewCard(false)}
                />
              )}
              {!showNewCard && (
                <button className="settings-btn secondary" onClick={() => setShowNewCard(true)}>
                  <Plus size={13} color="#4a9eff" /> {t('settings.addProvider')}
                </button>
              )}
            </div>
          )}

          {activeTab === 'database' && (
            <div className="settings-section">
              <div className="settings-database-intro">
                {t('settings.databaseIntroBeforeCode')} <code>database.ini</code>{t('settings.databaseIntroAfterCode')}
              </div>
              {databaseProfiles.map((profile) => (
                <DatabaseProfileCard key={profile.kind} profile={profile} onSaved={refreshDatabaseProfiles} />
              ))}
            </div>
          )}

          {activeTab === 'libraries' && (
            <div className="settings-section">
              <LibrariesSettings projectDir={projectDir} buildPlatform={buildPlatform} buildConfig={buildConfig} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
