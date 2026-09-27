import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal, Bot, WandSparkles, CircleAlert } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import type { CompileDiagnostic, FileNode } from '@renderer/state/store'
import './ConsolePanel.css'

function classifyLine(line: string): string {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('erro')) return 'console-line-error'
  if (lower.includes('0 error(s)') || lower.includes('build succeeded') || lower.includes('sucesso')) {
    return 'console-line-success'
  }
  return ''
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => (node.isDirectory ? flattenFiles(node.children ?? []) : [node]))
}

export function ConsolePanel(): JSX.Element {
  const { t } = useTranslation()
  const {
    consoleLines,
    aiLines,
    consolePanelHeight,
    consoleActiveTab,
    setConsoleActiveTab,
    lastBuildResult,
    isGenerating,
    activeProviderId,
    requestAiFix,
    fileTree,
    openTab,
    navigateEditor
  } = useAppStore()
  const tab = consoleActiveTab
  const setTab = setConsoleActiveTab
  const bodyRef = useRef<HTMLDivElement>(null)
  const autoOpenedBuildRef = useRef<string | null>(null)

  const lines = tab === 'build' ? consoleLines : aiLines

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [lines.length])

  useEffect(() => {
    if (!lastBuildResult || lastBuildResult.success) return
    const diagnostic = lastBuildResult.diagnostics.find((item) =>
      !!item.file && !!item.line && (item.severity === 'error' || item.severity === 'fatal')
    )
    if (!diagnostic) return
    const key = `${diagnostic.file}:${diagnostic.line}:${diagnostic.column ?? 1}:${lastBuildResult.output.length}`
    if (autoOpenedBuildRef.current === key) return
    autoOpenedBuildRef.current = key
    void openDiagnostic(diagnostic)
  }, [lastBuildResult])

  async function openDiagnostic(diagnostic: CompileDiagnostic): Promise<void> {
    if (!diagnostic.file || !diagnostic.line) return
    const normalized = diagnostic.file.replace(/\\/g, '/').toLowerCase()
    const name = normalized.split('/').pop()
    const file = flattenFiles(fileTree).find((node) => {
      const candidate = node.path.replace(/\\/g, '/').toLowerCase()
      return candidate === normalized || candidate.endsWith(`/${normalized}`) || candidate.split('/').pop() === name
    })
    if (!file) return
    const content = await window.api.fs.readFile(file.path)
    openTab(file.path, file.name, content)
    navigateEditor(file.path, diagnostic.line, diagnostic.column ?? 1)
  }

  return (
    <div className="console-panel" style={{ height: consolePanelHeight }}>
      <div className="console-tabs">
        <div className={`console-tab${tab === 'build' ? ' active' : ''}`} onClick={() => setTab('build')}>
          <Terminal size={13} color="#4a9eff" /> {t('console.buildOutput')}
        </div>
        <div className={`console-tab${tab === 'ai' ? ' active' : ''}`} onClick={() => setTab('ai')}>
          <Bot size={13} color="#a78bfa" /> {t('console.aiActivity')}
        </div>
        <div className="console-tabs-spacer" />
        {tab === 'build' && lastBuildResult && !lastBuildResult.success && (
          <button
            className="console-fix-btn"
            onClick={() => requestAiFix(lastBuildResult)}
            disabled={isGenerating || !activeProviderId}
            title={!activeProviderId ? t('console.configureProviderFirst') : t('console.sendErrorsToAi')}
          >
            <WandSparkles size={13} /> {t('console.fixWithAi')}
            {lastBuildResult.diagnostics.length > 0 && ` (${lastBuildResult.diagnostics.length})`}
          </button>
        )}
      </div>
      {tab === 'build' && lastBuildResult && !lastBuildResult.success && lastBuildResult.diagnostics.length > 0 && (
        <div className="console-diagnostics">
          {lastBuildResult.diagnostics.slice(0, 8).map((diagnostic, index) => (
            <button
              key={`${diagnostic.file}-${diagnostic.line}-${diagnostic.code}-${index}`}
              className={`console-diagnostic ${diagnostic.severity}`}
              onClick={() => void openDiagnostic(diagnostic)}
              disabled={!diagnostic.file || !diagnostic.line}
              title={diagnostic.file ? `${diagnostic.file}${diagnostic.line ? ` (${t('console.line')} ${diagnostic.line}${diagnostic.column ? `, ${t('console.column')} ${diagnostic.column}` : ``})` : ``}` : diagnostic.message}
            >
              <CircleAlert size={12} />
              <span className="console-diagnostic-location">
                {diagnostic.file?.split(/[\\/]/).pop() ?? t('console.project')}
              </span>
              <span className="console-diagnostic-line">{diagnostic.line ? `${t('console.line')} ${diagnostic.line}` : ''}</span>
              <span className="console-diagnostic-code">{diagnostic.code ?? diagnostic.severity}</span>
              <span className="console-diagnostic-message">{diagnostic.message}</span>
            </button>
          ))}
        </div>
      )}
      <div className="console-body" ref={bodyRef}>
        {lines.length === 0 ? (
          <div className="console-empty">
            {tab === 'build' ? t('console.noBuildYet') : t('console.noAiActivityYet')}
          </div>
        ) : (
          lines.map((line, idx) => (
            <div key={idx} className={classifyLine(line)}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
