import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, CircleX, FolderOpen, Import, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'

type LibraryPlatform = 'Win32' | 'Win64' | 'All'
type LibraryPathType = 'unit' | 'include' | 'resource' | 'object' | 'runtime'

interface LibraryPathRow {
  id: string
  projectPath: string
  platform: LibraryPlatform
  pathType: LibraryPathType
  path: string
  source: 'manual' | 'delphi'
  enabled: boolean
}

interface LibraryValidation extends LibraryPathRow {
  resolvedPath: string
  exists: boolean
  fileCount: number
  detectedTypes: string[]
}

export function LibrariesSettings({
  projectDir,
  buildPlatform,
  buildConfig
}: {
  projectDir: string | null
  buildPlatform: 'Win32' | 'Win64'
  buildConfig: 'Debug' | 'Release'
}): JSX.Element {
  const { t } = useTranslation()
  const TYPE_LABELS: Record<LibraryPathType, string> = {
    unit: t('librariesSettings.types.unit'),
    include: t('librariesSettings.types.include'),
    resource: t('librariesSettings.types.resource'),
    object: t('librariesSettings.types.object'),
    runtime: t('librariesSettings.types.runtime')
  }
  const [rows, setRows] = useState<LibraryPathRow[]>([])
  const [validation, setValidation] = useState<Map<string, LibraryValidation>>(new Map())
  const [platform, setPlatform] = useState<LibraryPlatform>(buildPlatform)
  const [pathType, setPathType] = useState<LibraryPathType>('unit')
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function refresh(): Promise<void> {
    if (!projectDir) {
      setRows([])
      return
    }
    setRows(await window.api.libraries.list(projectDir))
  }

  useEffect(() => {
    setPlatform(buildPlatform)
  }, [buildPlatform])

  useEffect(() => {
    void refresh()
    setValidation(new Map())
    setMessage(null)
  }, [projectDir])

  async function browse(): Promise<void> {
    const selected = await window.api.fs.selectDirectory(t('librariesSettings.selectFolder'))
    if (selected) setPath(selected)
  }

  async function add(): Promise<void> {
    if (!projectDir || !path.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      await window.api.libraries.add({ projectPath: projectDir, platform, pathType, path: path.trim() })
      setPath('')
      await refresh()
      setMessage({ ok: true, text: t('librariesSettings.pathAdded') })
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function importDelphi(): Promise<void> {
    if (!projectDir) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.api.libraries.importDelphi(projectDir)
      await refresh()
      setMessage({
        ok: result.imported > 0,
        text: result.imported > 0
          ? t('librariesSettings.importedCount', { count: result.imported })
          : t('librariesSettings.noLibraryPathFound')
      })
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function validate(): Promise<void> {
    if (!projectDir) return
    setBusy(true)
    try {
      const result = await window.api.libraries.validate({ projectPath: projectDir, platform: buildPlatform, config: buildConfig })
      setValidation(new Map(result.map((item: LibraryValidation) => [item.id, item])))
      const missing = result.filter((item: LibraryValidation) => item.enabled && !item.exists).length
      setMessage({ ok: missing === 0, text: missing === 0 ? t('librariesSettings.allPathsFound') : t('librariesSettings.missingCount', { count: missing }) })
    } finally {
      setBusy(false)
    }
  }

  if (!projectDir) {
    return <div className="settings-library-empty">{t('librariesSettings.openProjectHint')}</div>
  }

  return (
    <div className="settings-libraries">
      <div className="settings-library-intro">
        {t('librariesSettings.intro')}
      </div>

      <div className="settings-library-toolbar">
        <button className="settings-btn secondary" onClick={importDelphi} disabled={busy}>
          <Import size={13} /> {t('librariesSettings.importFromDelphi')}
        </button>
        <button className="settings-btn secondary" onClick={validate} disabled={busy || rows.length === 0}>
          {busy ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {t('librariesSettings.validatePaths')}
        </button>
      </div>

      <div className="settings-library-add">
        <select value={platform} onChange={(event) => setPlatform(event.target.value as LibraryPlatform)}>
          <option value="Win32">Win32</option>
          <option value="Win64">Win64</option>
          <option value="All">{t('librariesSettings.allPlatforms')}</option>
        </select>
        <select value={pathType} onChange={(event) => setPathType(event.target.value as LibraryPathType)}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="settings-library-path-input">
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder={t('librariesSettings.pathPlaceholder')}
          />
          <button className="settings-btn secondary settings-icon-btn" onClick={browse} title={t('librariesSettings.selectFolder')}>
            <FolderOpen size={13} />
          </button>
        </div>
        <button className="settings-btn" onClick={add} disabled={busy || !path.trim()}>
          <Plus size={13} /> {t('common.add')}
        </button>
      </div>

      {message && (
        <div className={`settings-test-result ${message.ok ? 'ok' : 'fail'}`}>
          {message.ok ? <CircleCheck size={13} /> : <CircleX size={13} />} {message.text}
        </div>
      )}

      <div className="settings-library-list">
        {rows.map((row) => {
          const checked = validation.get(row.id)
          return (
            <div className={`settings-library-row ${!row.enabled ? 'disabled' : ''}`} key={row.id}>
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={async (event) => {
                  await window.api.libraries.setEnabled(row.id, event.target.checked)
                  await refresh()
                }}
                title={t('librariesSettings.toggleEnabled')}
              />
              <div className="settings-library-details">
                <div className="settings-library-badges">
                  <span>{row.platform}</span>
                  <span>{TYPE_LABELS[row.pathType]}</span>
                  <span>{row.source === 'delphi' ? t('librariesSettings.imported') : t('librariesSettings.manual')}</span>
                  {checked && <span className={checked.exists ? 'valid' : 'invalid'}>{checked.exists ? t('librariesSettings.fileCount', { count: checked.fileCount }) : t('librariesSettings.folderMissing')}</span>}
                </div>
                <div className="settings-library-path" title={checked?.resolvedPath ?? row.path}>{row.path}</div>
              </div>
              <button
                className="settings-library-remove"
                title={t('librariesSettings.removePath')}
                onClick={async () => {
                  await window.api.libraries.remove(row.id)
                  await refresh()
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
        {rows.length === 0 && <div className="settings-library-empty">{t('librariesSettings.noPathsConfigured')}</div>}
      </div>
    </div>
  )
}
