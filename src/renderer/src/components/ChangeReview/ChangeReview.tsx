import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, FilePlus2, FilePenLine, X } from 'lucide-react'
import './ChangeReview.css'

export interface FileChangePreview {
  relativePath: string
  kind: 'added' | 'modified'
  additions: number
  deletions: number
  oldContent: string | null
  newContent: string
}

export interface ChangeSetPreview {
  id: string
  projectName: string
  projectDir: string
  explanation: string
  isNewProject: boolean
  contextSummary: {
    includedFiles: string[]
    omittedFiles: string[]
    secretsRedacted: number
    preservedUnitCount: number
  }
  files: FileChangePreview[]
}

interface Props {
  changeSet: ChangeSetPreview
  applying: boolean
  onApply: (selectedPaths: string[]) => Promise<void>
  onDiscard: () => Promise<void>
}

export function ChangeReview({ changeSet, applying, onApply, onDiscard }: Props): JSX.Element {
  const { t } = useTranslation()
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(changeSet.files.map((file) => file.relativePath))
  )
  const [activePath, setActivePath] = useState(changeSet.files[0]?.relativePath ?? null)
  const activeFile = useMemo(
    () => changeSet.files.find((file) => file.relativePath === activePath) ?? null,
    [activePath, changeSet.files]
  )

  useEffect(() => {
    const preventEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') event.preventDefault()
    }
    window.addEventListener('keydown', preventEscape)
    return () => window.removeEventListener('keydown', preventEscape)
  }, [])

  function toggle(relativePath: string): void {
    setSelectedPaths((current) => {
      const next = new Set(current)
      if (next.has(relativePath)) next.delete(relativePath)
      else next.add(relativePath)
      return next
    })
  }

  return (
    <div className="change-review-backdrop" role="presentation">
      <section className="change-review" role="dialog" aria-modal="true" aria-label={t('changeReview.title')}>
        <header className="change-review-header">
          <div>
            <h2>{t('changeReview.title')}</h2>
            <p title={changeSet.contextSummary.includedFiles.join(', ')}>
              {t('changeReview.nothingSaved', { count: changeSet.contextSummary.includedFiles.length })}
            </p>
          </div>
          <button className="change-review-close" onClick={onDiscard} disabled={applying} title={t('changeReview.cancelChanges')}>
            <X size={18} />
          </button>
        </header>

        <div className="change-review-body">
          <aside className="change-review-files">
            {changeSet.files.map((file) => (
              <div
                key={file.relativePath}
                className={`change-file-row ${activePath === file.relativePath ? 'active' : ''}`}
                onClick={() => setActivePath(file.relativePath)}
              >
                <input
                  type="checkbox"
                  checked={selectedPaths.has(file.relativePath)}
                  onChange={() => toggle(file.relativePath)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={t('changeReview.applyFile', { name: file.relativePath })}
                />
                {file.kind === 'added' ? <FilePlus2 size={15} /> : <FilePenLine size={15} />}
                <div className="change-file-name">
                  <span>{file.relativePath}</span>
                  <small>{file.kind === 'added' ? t('changeReview.new') : t('changeReview.modified')}</small>
                </div>
                <span className="change-count added">+{file.additions}</span>
                <span className="change-count deleted">-{file.deletions}</span>
              </div>
            ))}
            {changeSet.files.length === 0 && (
              <div className="change-review-empty">{t('changeReview.noChangesProduced')}</div>
            )}
          </aside>

          <main className="change-review-diff">
            {activeFile ? (
              <>
                <div className="change-diff-title">{activeFile.relativePath}</div>
                <div className="change-diff-columns">
                  <div className="change-diff-column old">
                    <div className="change-diff-label">{t('changeReview.before')}</div>
                    <pre>{activeFile.oldContent ?? t('changeReview.newFile')}</pre>
                  </div>
                  <div className="change-diff-column new">
                    <div className="change-diff-label">{t('changeReview.after')}</div>
                    <pre>{activeFile.newContent}</pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="change-review-placeholder">{t('changeReview.selectFileToView')}</div>
            )}
          </main>
        </div>

        <footer className="change-review-footer">
          <span>{t('changeReview.filesSelected', { selected: selectedPaths.size, total: changeSet.files.length })}</span>
          <div className="change-review-footer-actions">
            <button className="change-review-cancel" onClick={onDiscard} disabled={applying}>{t('common.cancel')}</button>
            <button
              className="change-review-apply"
              onClick={() => onApply([...selectedPaths])}
              disabled={applying || selectedPaths.size === 0}
            >
              <Check size={16} /> {applying ? t('changeReview.applying') : t('changeReview.applySelected')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
