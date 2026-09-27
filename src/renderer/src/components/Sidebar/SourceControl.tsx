import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, GitCommitHorizontal, Loader2, RefreshCw } from 'lucide-react'
import { useAppStore, type FileNode } from '@renderer/state/store'
import i18n from '@renderer/i18n'

interface GitStatus {
  available: boolean
  isRepository: boolean
  branch: string | null
  ahead: number
  behind: number
  files: Array<{ path: string; indexStatus: string; workTreeStatus: string }>
  commits: Array<{ hash: string; author: string; date: string; subject: string }>
  error?: string
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => (node.isDirectory ? flattenFiles(node.children ?? []) : [node]))
}

function statusLabel(index: string, workTree: string): { code: string; title: string } {
  const value = workTree !== ' ' ? workTree : index
  if (value === '?') return { code: 'U', title: i18n.t('sourceControl.statusNew') }
  if (value === 'A') return { code: 'A', title: i18n.t('sourceControl.statusAdded') }
  if (value === 'D') return { code: 'D', title: i18n.t('sourceControl.statusDeleted') }
  if (value === 'R') return { code: 'R', title: i18n.t('sourceControl.statusRenamed') }
  if (value === 'C') return { code: 'C', title: i18n.t('sourceControl.statusCopied') }
  return { code: 'M', title: i18n.t('sourceControl.statusModified') }
}

export function SourceControl(): JSX.Element {
  const { t } = useTranslation()
  const { projectDir, fileTree, openTab, setFileTree } = useAppStore()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!projectDir) {
      setStatus(null)
      return
    }
    setLoading(true)
    try {
      setStatus(await window.api.git.status(projectDir))
    } finally {
      setLoading(false)
    }
  }, [projectDir])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), 8000)
    return () => window.clearInterval(interval)
  }, [refresh])

  async function initialize(): Promise<void> {
    if (!projectDir) return
    setActionError(null)
    const result = await window.api.git.init(projectDir)
    if (!result.success) {
      setActionError(result.error)
      return
    }
    setFileTree(await window.api.fs.readProjectTree(projectDir))
    await refresh()
  }

  async function commit(): Promise<void> {
    if (!projectDir || !message.trim()) return
    setLoading(true)
    setActionError(null)
    try {
      const result = await window.api.git.commit({ projectDir, message })
      if (!result.success) {
        setActionError(result.error)
        return
      }
      setMessage('')
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  async function openChangedFile(path: string): Promise<void> {
    const normalized = path.replace(/\\/g, '/').toLowerCase()
    const file = flattenFiles(fileTree).find((node) => node.path.replace(/\\/g, '/').toLowerCase().endsWith(`/${normalized}`))
    if (!file) return
    openTab(file.path, file.name, await window.api.fs.readFile(file.path))
  }

  if (!projectDir) return <div className="sidebar-empty">{t('sourceControl.openProjectFirst')}</div>
  if (!status && loading) return <div className="source-loading"><Loader2 size={14} className="spin" /> {t('sourceControl.checkingGit')}</div>
  if (status && !status.available) return <div className="sidebar-empty">{t('sourceControl.gitNotFound')}</div>
  if (status && !status.isRepository) {
    return (
      <div className="source-init">
        <GitBranch size={24} />
        <p>{t('sourceControl.noVersionControl')}</p>
        <button onClick={initialize}>{t('sourceControl.initRepo')}</button>
        {actionError && <div className="source-error">{actionError}</div>}
      </div>
    )
  }

  return (
    <div className="source-control">
      <div className="source-branch-row">
        <span><GitBranch size={13} /> {status?.branch ?? 'HEAD'}</span>
        <button onClick={() => void refresh()} disabled={loading} title={t('sourceControl.refresh')}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
        </button>
      </div>
      {(status?.ahead || status?.behind) ? (
        <div className="source-sync">↑ {status.ahead} &nbsp; ↓ {status.behind}</div>
      ) : null}

      <div className="source-commit-box">
        <textarea
          value={message}
          maxLength={200}
          placeholder={t('sourceControl.commitMessage')}
          onChange={(event) => setMessage(event.target.value.replace(/[\r\n]/g, ' '))}
        />
        <button onClick={commit} disabled={loading || !message.trim() || (status?.files.length ?? 0) === 0}>
          <GitCommitHorizontal size={13} /> {t('sourceControl.createCommit')}
        </button>
        {actionError && <div className="source-error">{actionError}</div>}
        {status?.error && <div className="source-error">{status.error}</div>}
      </div>

      <div className="source-section-title">{t('sourceControl.changes')} ({status?.files.length ?? 0})</div>
      <div className="source-files">
        {status?.files.map((file) => {
          const label = statusLabel(file.indexStatus, file.workTreeStatus)
          return (
            <button key={`${file.indexStatus}${file.workTreeStatus}-${file.path}`} onClick={() => void openChangedFile(file.path)}>
              <span className={`source-status status-${label.code.toLowerCase()}`} title={label.title}>{label.code}</span>
              <span title={file.path}>{file.path}</span>
            </button>
          )
        })}
        {status?.files.length === 0 && <div className="source-clean">{t('sourceControl.noPendingChanges')}</div>}
      </div>

      <div className="source-section-title">{t('sourceControl.recentCommits')}</div>
      <div className="source-history">
        {status?.commits.map((commitInfo) => (
          <div key={commitInfo.hash} title={`${commitInfo.author} — ${new Date(commitInfo.date).toLocaleString()}`}>
            <span>{commitInfo.subject}</span>
            <small>{commitInfo.hash}</small>
          </div>
        ))}
        {status?.commits.length === 0 && <div className="source-clean">{t('sourceControl.noCommitsYet')}</div>}
      </div>
    </div>
  )
}
