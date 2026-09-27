import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, Archive, BadgeCheck, Box, CheckCircle2, FileArchive, FileCode2,
  FileKey2, FolderOpen, PackageCheck, Play, RefreshCw, Rocket, Save, ShieldCheck,
  UploadCloud, X, XCircle
} from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import './PublishManager.css'

type Environment = 'debug' | 'staging' | 'production'
interface PublishProfile {
  projectPath: string; projectName: string; environment: Environment; platform: 'Win32' | 'Win64'; buildConfig: 'Debug' | 'Release'
  delphiProfile: string; dprojPath: string; exePath: string; outputDir: string; applicationName: string; version: string
  companyName: string; productName: string; description: string; copyright: string; iconPath: string; manifestPath: string
  externalFiles: string[]; copyDependencies: boolean; generateZip: boolean; generateInstaller: boolean
  installerCompilerPath: string; installerOutputName: string; signExecutable: boolean; signToolPath: string
  certificatePath: string; certificateThumbprint: string; timestampUrl: string; hasCertificatePassword: boolean
  generateUpdateManifest: boolean; updateBaseUrl: string; updateNotes: string; updateMandatory: boolean
}
interface Dependency { name: string; requestedBy: string; sourcePath: string | null; system: boolean; status: 'found' | 'missing' | 'system' }
interface Analysis {
  executableExists: boolean; outputDirectoryValid: boolean; dependencies: Dependency[]; missingDependencies: string[]
  missingExternalFiles: string[]; tools: { signTool: string | null; installerCompiler: string | null }; warnings: string[]; canPublish: boolean
}
interface PublishResult {
  success: boolean; deliveryDir: string; copiedFiles: string[]; zipPath: string | null; installerPath: string | null
  updateManifestPath: string | null; signed: boolean; warnings: string[]
}

function getEnvironments(t: (key: string) => string): Array<{ id: Environment; label: string; description: string }> {
  return [
    { id: 'debug', label: t('publishManager.env.debugLabel'), description: t('publishManager.env.debugDescription') },
    { id: 'staging', label: t('publishManager.env.stagingLabel'), description: t('publishManager.env.stagingDescription') },
    { id: 'production', label: t('publishManager.env.productionLabel'), description: t('publishManager.env.productionDescription') }
  ]
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string
}): JSX.Element {
  return <label className="publish-field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>
}

function Check({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (value: boolean) => void; description?: string }): JSX.Element {
  return <label className="publish-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}{description && <small>{description}</small>}</span></label>
}

function PathField({ label, value, onChange, directory = false, multi = false }: {
  label: string; value: string; onChange: (value: string) => void; directory?: boolean; multi?: boolean
}): JSX.Element {
  async function choose(): Promise<void> {
    if (directory) {
      const path = await window.api.fs.selectDirectory(label)
      if (path) onChange(path)
      return
    }
    const paths = await window.api.fs.selectFiles()
    if (paths.length) onChange(multi ? paths.join(';') : paths[0])
  }
  const { t } = useTranslation()
  return <label className="publish-field publish-path"><span>{label}</span><div><input value={value} onChange={(event) => onChange(event.target.value)} /><button onClick={() => void choose()} title={t('publishManager.locate')}><FolderOpen size={14} /></button></div></label>
}

export function PublishManager({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element | null {
  const { t } = useTranslation()
  const ENVIRONMENTS = useMemo(() => getEnvironments(t), [t])
  const { projectDir, projectName, dprojPath, delphiProfile, buildPlatform, buildConfig, lastExePath, saveAllTabs } = useAppStore()
  const [profiles, setProfiles] = useState<PublishProfile[]>([])
  const [environment, setEnvironment] = useState<Environment>('production')
  const [draft, setDraft] = useState<PublishProfile | null>(null)
  const [certificatePassword, setCertificatePassword] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [result, setResult] = useState<PublishResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [section, setSection] = useState<'delivery' | 'metadata' | 'files' | 'signing' | 'installer' | 'dependencies'>('delivery')

  useEffect(() => {
    const listener = (): void => onOpenChange(true)
    window.addEventListener('karnox:open-publish', listener)
    return () => window.removeEventListener('karnox:open-publish', listener)
  }, [onOpenChange])
  useEffect(() => window.api.publish.onProgress(setProgress), [])
  useEffect(() => {
    if (!open || !projectDir || !projectName) return
    void window.api.publish.profiles({ projectPath: projectDir, projectName }).then((items) => {
      const normalized = (items as PublishProfile[]).map((item) => ({
        ...item, projectPath: projectDir, projectName, dprojPath: dprojPath ?? item.dprojPath,
        delphiProfile, platform: item.platform || buildPlatform, buildConfig: item.buildConfig || buildConfig,
        exePath: lastExePath ?? item.exePath
      }))
      setProfiles(normalized)
      setDraft(normalized.find((item) => item.environment === environment) ?? normalized[0] ?? null)
    })
  }, [open, projectDir, projectName])
  useEffect(() => {
    const selected = profiles.find((item) => item.environment === environment)
    if (selected) { setDraft(selected); setAnalysis(null); setResult(null); setCertificatePassword('') }
  }, [environment])

  const set = <K extends keyof PublishProfile>(key: K, value: PublishProfile[K]): void => {
    setDraft((current) => current ? { ...current, [key]: value } : current)
    setAnalysis(null)
  }
  const counts = useMemo(() => analysis ? {
    found: analysis.dependencies.filter((item) => item.status === 'found').length,
    missing: analysis.dependencies.filter((item) => item.status === 'missing').length,
    system: analysis.dependencies.filter((item) => item.status === 'system').length
  } : { found: 0, missing: 0, system: 0 }, [analysis])

  async function save(profile = draft): Promise<PublishProfile | null> {
    if (!profile) return null
    const saved = await window.api.publish.saveProfile({ profile, certificatePassword: certificatePassword || undefined }) as PublishProfile[]
    setProfiles(saved)
    const selected = saved.find((item) => item.environment === profile.environment) ?? profile
    setDraft(selected); setCertificatePassword('')
    return selected
  }
  async function analyze(profile = draft): Promise<Analysis | null> {
    if (!profile) return null
    setBusy(true); setProgress(t('publishManager.progressAnalyzing')); setResult(null)
    try { const report = await window.api.publish.analyze(profile) as Analysis; setAnalysis(report); setSection('dependencies'); return report }
    catch (error) { window.alert((error as Error).message); return null }
    finally { setBusy(false) }
  }
  async function buildAndPublish(): Promise<void> {
    if (!draft || !projectDir || !projectName || !draft.dprojPath) return
    setBusy(true); setResult(null)
    try {
      await saveAllTabs()
      const saved = await save(draft) ?? draft
      setProgress(t('publishManager.progressMetadata'))
      const prepared = await window.api.publish.prepareMetadata(saved) as { warnings: string[] }
      if (prepared.warnings.length) window.alert(prepared.warnings.join('\n'))
      setProgress(t('publishManager.progressBuilding'))
      const build = await window.api.compiler.build({
        dprojPath: saved.dprojPath, projectDir, projectName, platform: saved.platform,
        config: saved.buildConfig, profile: saved.delphiProfile
      }) as { success: boolean; exePath: string | null; output: string }
      if (!build.success || !build.exePath) throw new Error(t('publishManager.errorBuildFailed'))
      const ready = { ...saved, exePath: build.exePath }
      setDraft(ready); await save(ready)
      const report = await window.api.publish.analyze(ready) as Analysis
      setAnalysis(report)
      if (!report.canPublish) { setSection('dependencies'); throw new Error(t('publishManager.errorAnalysisPending')) }
      const published = await window.api.publish.run(ready) as PublishResult
      setResult(published)
    } catch (error) { window.alert((error as Error).message) }
    finally { setBusy(false) }
  }
  async function addExternalFiles(): Promise<void> {
    const paths = await window.api.fs.selectFiles()
    if (paths.length) set('externalFiles', Array.from(new Set([...(draft?.externalFiles ?? []), ...paths])))
  }

  if (!open) return null
  if (!projectDir || !projectName || !draft) return <div className="publish-manager"><div className="publish-empty"><Rocket size={48} /><h2>{t('publishManager.title')}</h2><p>{t('publishManager.openProjectFirst')}</p><button onClick={() => onOpenChange(false)}>{t('common.back')}</button></div></div>

  return <div className="publish-manager">
    <header><div><Rocket size={19} /><span>{t('publishManager.title')}</span><small>{projectName}</small></div><button onClick={() => onOpenChange(false)} title={t('common.close')}><X size={18} /></button></header>
    <div className="publish-environments">{ENVIRONMENTS.map((item) => <button key={item.id} className={environment === item.id ? 'active' : ''} onClick={() => setEnvironment(item.id)}><span>{item.label}</span><small>{item.description}</small></button>)}</div>
    <div className="publish-workspace">
      <aside>
        {([
          ['delivery', Box, t('publishManager.section.delivery')], ['metadata', BadgeCheck, t('publishManager.section.metadata')], ['files', FileCode2, t('publishManager.section.files')],
          ['signing', ShieldCheck, t('publishManager.section.signing')], ['installer', FileArchive, t('publishManager.section.installer')],
          ['dependencies', PackageCheck, t('publishManager.section.dependencies')]
        ] as const).map(([id, Icon, label]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}><Icon size={15} />{label}{id === 'dependencies' && analysis && <em className={counts.missing ? 'bad' : 'ok'}>{counts.missing || 'OK'}</em>}</button>)}
        <div className="publish-side-summary"><span>{t('publishManager.version')}</span><strong>{draft.version}</strong><span>{t('publishManager.platform')}</span><strong>{draft.platform}</strong><span>{t('publishManager.buildConfig')}</span><strong>{draft.buildConfig}</strong></div>
      </aside>
      <main>
        {section === 'delivery' && <section className="publish-section"><h2>{t('publishManager.delivery.title')}</h2><p>{t('publishManager.delivery.description')}</p><div className="publish-grid two"><Field label={t('publishManager.delivery.applicationName')} value={draft.applicationName} onChange={(v) => set('applicationName', v)} /><Field label={t('publishManager.version')} value={draft.version} onChange={(v) => set('version', v)} placeholder="1.0.0.0" /><label className="publish-field"><span>{t('publishManager.platform')}</span><select value={draft.platform} onChange={(e) => set('platform', e.target.value as 'Win32' | 'Win64')}><option>Win32</option><option>Win64</option></select></label><label className="publish-field"><span>{t('publishManager.delivery.delphiConfig')}</span><select value={draft.buildConfig} onChange={(e) => set('buildConfig', e.target.value as 'Debug' | 'Release')}><option>Debug</option><option>Release</option></select></label></div><PathField label={t('publishManager.delivery.delphiProject')} value={draft.dprojPath} onChange={(v) => set('dprojPath', v)} /><PathField label={t('publishManager.delivery.executable')} value={draft.exePath} onChange={(v) => set('exePath', v)} /><PathField label={t('publishManager.delivery.outputDir')} value={draft.outputDir} onChange={(v) => set('outputDir', v)} directory /><div className="publish-options"><Check label={t('publishManager.delivery.copyDependencies')} checked={draft.copyDependencies} onChange={(v) => set('copyDependencies', v)} /><Check label={t('publishManager.delivery.generateZip')} checked={draft.generateZip} onChange={(v) => set('generateZip', v)} /></div></section>}
        {section === 'metadata' && <section className="publish-section"><h2>{t('publishManager.metadata.title')}</h2><p>{t('publishManager.metadata.description')}</p><div className="publish-grid two"><Field label={t('publishManager.metadata.company')} value={draft.companyName} onChange={(v) => set('companyName', v)} /><Field label={t('publishManager.metadata.product')} value={draft.productName} onChange={(v) => set('productName', v)} /><Field label={t('publishManager.metadata.fileDescription')} value={draft.description} onChange={(v) => set('description', v)} /><Field label={t('publishManager.metadata.copyright')} value={draft.copyright} onChange={(v) => set('copyright', v)} /></div><PathField label={t('publishManager.metadata.iconPath')} value={draft.iconPath} onChange={(v) => set('iconPath', v)} /><PathField label={t('publishManager.metadata.manifestPath')} value={draft.manifestPath} onChange={(v) => set('manifestPath', v)} /><div className="publish-info"><BadgeCheck size={18} /><span>{t('publishManager.metadata.backupNotice')}</span></div></section>}
        {section === 'files' && <section className="publish-section"><h2>{t('publishManager.files.title')}</h2><p>{t('publishManager.files.description')}</p><button className="publish-add" onClick={() => void addExternalFiles()}><FolderOpen size={14} />{t('publishManager.files.addFiles')}</button><div className="publish-file-list">{draft.externalFiles.map((path) => <div key={path}><FileCode2 size={14} /><span title={path}>{path}</span><button onClick={() => set('externalFiles', draft.externalFiles.filter((item) => item !== path))}><X size={13} /></button></div>)}{!draft.externalFiles.length && <div className="empty">{t('publishManager.files.empty')}</div>}</div></section>}
        {section === 'signing' && <section className="publish-section"><h2>{t('publishManager.signing.title')}</h2><p>{t('publishManager.signing.description')}</p><Check label={t('publishManager.signing.signFiles')} checked={draft.signExecutable} onChange={(v) => set('signExecutable', v)} />{draft.signExecutable && <><PathField label={t('publishManager.signing.signToolPath')} value={draft.signToolPath} onChange={(v) => set('signToolPath', v)} /><PathField label={t('publishManager.signing.certificatePath')} value={draft.certificatePath} onChange={(v) => set('certificatePath', v)} /><Field label={t('publishManager.signing.certificateThumbprint')} value={draft.certificateThumbprint} onChange={(v) => set('certificateThumbprint', v)} /><Field label={t('publishManager.signing.certificatePassword')} type="password" value={certificatePassword} onChange={setCertificatePassword} placeholder={draft.hasCertificatePassword ? t('publishManager.signing.passwordProtected') : ''} /><Field label={t('publishManager.signing.timestampUrl')} value={draft.timestampUrl} onChange={(v) => set('timestampUrl', v)} /><div className="publish-info"><FileKey2 size={18} /><span>{t('publishManager.signing.passwordNotice')}</span></div></>}</section>}
        {section === 'installer' && <section className="publish-section"><h2>{t('publishManager.installer.title')}</h2><Check label={t('publishManager.installer.generateInstaller')} checked={draft.generateInstaller} onChange={(v) => set('generateInstaller', v)} />{draft.generateInstaller && <><PathField label={t('publishManager.installer.compilerPath')} value={draft.installerCompilerPath} onChange={(v) => set('installerCompilerPath', v)} /><Field label={t('publishManager.installer.installerName')} value={draft.installerOutputName} onChange={(v) => set('installerOutputName', v)} /></>}<Check label={t('publishManager.installer.generateUpdateManifest')} checked={draft.generateUpdateManifest} onChange={(v) => set('generateUpdateManifest', v)} />{draft.generateUpdateManifest && <><Field label={t('publishManager.installer.updateBaseUrl')} value={draft.updateBaseUrl} onChange={(v) => set('updateBaseUrl', v)} placeholder="https://servidor.com/atualizacoes" /><label className="publish-field"><span>{t('publishManager.installer.updateNotes')}</span><textarea value={draft.updateNotes} onChange={(e) => set('updateNotes', e.target.value)} /></label><Check label={t('publishManager.installer.updateMandatory')} checked={draft.updateMandatory} onChange={(v) => set('updateMandatory', v)} /><button className="publish-add" onClick={async () => { const path = await window.api.publish.generateUpdater(draft); window.alert(t('publishManager.installer.updaterUnitCreated', { path })) }}><UploadCloud size={14} />{t('publishManager.installer.generateUpdaterUnit')}</button></>}</section>}
        {section === 'dependencies' && <section className="publish-section dependencies"><h2>{t('publishManager.dependencies.title')}</h2>{!analysis ? <div className="publish-analysis-empty"><RefreshCw size={34} /><p>{t('publishManager.dependencies.runAnalysis')}</p></div> : <><div className="publish-counters"><span className="found"><CheckCircle2 />{t('publishManager.dependencies.toCopy', { count: counts.found })}</span><span><ShieldCheck />{t('publishManager.dependencies.fromWindows', { count: counts.system })}</span><span className={counts.missing ? 'missing' : 'found'}>{counts.missing ? <XCircle /> : <CheckCircle2 />}{t('publishManager.dependencies.missing', { count: counts.missing })}</span></div>{analysis.warnings.map((warning) => <div className="publish-warning" key={warning}><AlertTriangle size={14} />{warning}</div>)}<div className="publish-dependency-list">{analysis.dependencies.map((item) => <div key={`${item.name}-${item.requestedBy}`} className={item.status}><span>{item.status === 'found' ? <CheckCircle2 /> : item.status === 'missing' ? <XCircle /> : <ShieldCheck />}</span><strong>{item.name}</strong><small>{t('publishManager.dependencies.requestedBy', { name: item.requestedBy })}</small><code title={item.sourcePath ?? ''}>{item.sourcePath ?? (item.system ? t('publishManager.dependencies.windowsComponent') : t('publishManager.dependencies.notFound'))}</code></div>)}</div><div className={`publish-ready ${analysis.canPublish ? 'ok' : 'bad'}`}>{analysis.canPublish ? <><CheckCircle2 />{t('publishManager.dependencies.readyToPublish')}</> : <><XCircle />{t('publishManager.dependencies.hasPendingIssues')}</>}</div></>}</section>}
        {result && <div className="publish-result"><Archive size={28} /><div><strong>{t('publishManager.result.completed')}</strong><span>{result.deliveryDir}</span>{result.zipPath && <span>ZIP: {result.zipPath}</span>}{result.installerPath && <span>{t('publishManager.result.installer')}: {result.installerPath}</span>}{result.updateManifestPath && <span>{t('publishManager.result.update')}: {result.updateManifestPath}</span>}</div></div>}
      </main>
    </div>
    <footer><span>{progress || t('publishManager.footerHint')}</span><button onClick={() => void save()} disabled={busy}><Save size={14} />{t('publishManager.saveProfile')}</button><button onClick={() => void analyze()} disabled={busy}><RefreshCw size={14} />{t('publishManager.analyze')}</button><button className="primary" onClick={() => void buildAndPublish()} disabled={busy}><Play size={14} />{busy ? t('publishManager.processing') : t('publishManager.buildAndPublish')}</button></footer>
  </div>
}
