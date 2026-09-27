import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MonacoEditor, { type Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { X, Code, LayoutPanelTop, Sparkles } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import { registerPascalLanguage, languageForFile } from './pascalLanguage'
import { DfmDesignView } from './DfmDesignViewAdvanced'
import {
  applyCompileMarkers,
  registerPascalIntelligence,
  setExternalPascalIntelligenceActive,
  setGhostTextEnabled,
  setGhostTextProviderId,
  updatePascalProjectIndex,
  type PascalProjectFile
} from './pascalIntelligence'
import { isDelphiLspFile, registerDelphiLsp, type DelphiLspStatus } from './delphiLsp'
import './Editor.css'

function sourceNodes(nodes: import('@renderer/state/store').FileNode[]): import('@renderer/state/store').FileNode[] {
  return nodes.flatMap((node) => {
    if (node.isDirectory) return sourceNodes(node.children ?? [])
    return /\.(?:pas|dpr|dfm|inc)$/i.test(node.name) ? [node] : []
  })
}

export function Editor(): JSX.Element {
  const { t } = useTranslation()
  const {
    openTabs,
    activeTabPath,
    setActiveTab,
    closeTab,
    updateTabContent,
    theme,
    setActiveEditorInstance,
    saveActiveTab,
    saveTab,
    fileTree,
    lastBuildResult,
    activeEditorInstance,
    editorNavigation,
    clearEditorNavigation,
    refreshOpenTabs,
    projectDir,
    dprojPath,
    delphiProfile,
    ghostTextEnabled,
    toggleGhostText,
    activeProviderId
  } = useAppStore()

  const [viewMode, setViewMode] = useState<'code' | 'design'>('design')
  const [projectFiles, setProjectFiles] = useState<PascalProjectFile[]>([])
  const [pendingCloseTab, setPendingCloseTab] = useState<string | null>(null)
  const [closingTab, setClosingTab] = useState(false)
  const [lspStatus, setLspStatus] = useState<DelphiLspStatus>({
    state: 'stopped',
    message: t('editor.lspNotStarted')
  })
  const monacoRef = useRef<Monaco | null>(null)
  const lspOpenFiles = useRef(new Set<string>())
  const lspVersions = useRef(new Map<string, number>())
  const lspChangeTimer = useRef<number | null>(null)

  const activeTab = openTabs.find((t) => t.path === activeTabPath) ?? null
  const isDfm = activeTab?.name.toLowerCase().endsWith('.dfm') ?? false

  useEffect(() => {
    const offStatus = window.api.lsp.onStatus((next) => {
      const typed = next as DelphiLspStatus
      setLspStatus(typed)
      setExternalPascalIntelligenceActive(typed.state === 'ready')
      if (typed.state !== 'ready') {
        lspOpenFiles.current.clear()
        lspVersions.current.clear()
      }
    })
    void window.api.lsp.status().then((next) => {
      const typed = next as DelphiLspStatus
      setLspStatus(typed)
      setExternalPascalIntelligenceActive(typed.state === 'ready')
    })
    return offStatus
  }, [])

  useEffect(() => {
    if (!projectDir) {
      void window.api.lsp.stop()
      return
    }
    void window.api.lsp.start({ projectDir, projectFile: dprojPath, profile: delphiProfile })
  }, [projectDir, dprojPath, delphiProfile])

  useEffect(() => {
    if (lspStatus.state !== 'ready') return
    for (const tab of openTabs) {
      if (!isDelphiLspFile(tab.path) || lspOpenFiles.current.has(tab.path)) continue
      lspOpenFiles.current.add(tab.path)
      lspVersions.current.set(tab.path, 1)
      void window.api.lsp.didOpen({ path: tab.path, text: tab.content, version: 1 })
    }
    const currentPaths = new Set(openTabs.map((tab) => tab.path))
    for (const path of [...lspOpenFiles.current]) {
      if (currentPaths.has(path)) continue
      void window.api.lsp.didClose(path)
      lspOpenFiles.current.delete(path)
      lspVersions.current.delete(path)
    }
  }, [lspStatus.state, openTabs])

  useEffect(() => {
    if (!activeTab) {
      setActiveEditorInstance(null)
    }
  }, [activeTab, setActiveEditorInstance])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nodes = sourceNodes(fileTree)
      void Promise.all(
        nodes.map(async (node) => {
          const open = openTabs.find((tab) => tab.path.toLowerCase() === node.path.toLowerCase())
          return {
            path: node.path,
            name: node.name,
            content: open?.content ?? (await window.api.fs.readFile(node.path))
          }
        })
      ).then((files) => setProjectFiles(files))
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [fileTree, openTabs])

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    updatePascalProjectIndex(monaco, projectFiles)
    applyCompileMarkers(monaco, lastBuildResult?.diagnostics ?? [], projectFiles)
  }, [projectFiles, lastBuildResult])

  useEffect(() => {
    setGhostTextEnabled(ghostTextEnabled)
  }, [ghostTextEnabled])

  useEffect(() => {
    setGhostTextProviderId(activeProviderId)
  }, [activeProviderId])

  useEffect(() => {
    if (!editorNavigation || !activeEditorInstance || activeTabPath !== editorNavigation.path) return
    activeEditorInstance.setPosition({ lineNumber: editorNavigation.line, column: editorNavigation.column })
    activeEditorInstance.revealPositionInCenter({ lineNumber: editorNavigation.line, column: editorNavigation.column })
    activeEditorInstance.focus()
    clearEditorNavigation()
  }, [editorNavigation, activeEditorInstance, activeTabPath, clearEditorNavigation])

  function handleBeforeMount(monaco: Monaco): void {
    monacoRef.current = monaco
    registerPascalLanguage(monaco)
    registerPascalIntelligence(monaco)
    registerDelphiLsp(monaco)
  }

  function handleMount(editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco): void {
    setActiveEditorInstance(editorInstance)
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void saveActiveTab().then(() => {
        const tab = useAppStore.getState().openTabs.find((item) => item.path === activeTabPath)
        if (tab && lspStatus.state === 'ready' && isDelphiLspFile(tab.path)) {
          void window.api.lsp.didSave({ path: tab.path, text: tab.content })
        }
      })
    })

  }

  function closeEditorTab(path: string): void {
    if (lspOpenFiles.current.has(path)) {
      void window.api.lsp.didClose(path)
      lspOpenFiles.current.delete(path)
      lspVersions.current.delete(path)
    }
    closeTab(path)
    setPendingCloseTab(null)
  }

  function requestCloseTab(path: string): void {
    const tab = openTabs.find((item) => item.path === path)
    if (tab?.dirty) setPendingCloseTab(path)
    else closeEditorTab(path)
  }

  async function saveAndCloseTab(): Promise<void> {
    if (!pendingCloseTab) return
    setClosingTab(true)
    try {
      await saveTab(pendingCloseTab)
      closeEditorTab(pendingCloseTab)
    } finally {
      setClosingTab(false)
    }
  }

  function handleCodeChange(path: string, value: string): void {
    updateTabContent(path, value)
    if (lspStatus.state !== 'ready' || !isDelphiLspFile(path)) return
    if (lspChangeTimer.current !== null) window.clearTimeout(lspChangeTimer.current)
    lspChangeTimer.current = window.setTimeout(() => {
      const version = (lspVersions.current.get(path) ?? 1) + 1
      lspVersions.current.set(path, version)
      void window.api.lsp.didChange({ path, text: value, version })
    }, 180)
  }

  if (!activeTab) {
    return (
      <div className="editor-area">
        {openTabs.length > 0 && (
          <div className="editor-header">
            <div className="editor-tabs">
              {openTabs.map((t) => (
                <TabButton key={t.path} path={t.path} name={t.name} dirty={t.dirty} active={false} />
              ))}
            </div>
          </div>
        )}
        <div className="editor-empty">{t('editor.selectFileOrGenerate')}</div>
      </div>
    )
  }

  return (
    <div className="editor-area">
      <div className="editor-header">
        <div className="editor-tabs">
          {openTabs.map((t) => (
            <TabButton key={t.path} path={t.path} name={t.name} dirty={t.dirty} active={t.path === activeTabPath} />
          ))}
        </div>
        <div className={`editor-lsp-status ${lspStatus.state}`} title={lspStatus.message}>
          <span className="editor-lsp-dot" />
          {lspStatus.state === 'ready' ? 'DelphiLSP' : t('editor.localPascal')}
        </div>
        <button
          className={`editor-ghost-toggle${ghostTextEnabled ? ' active' : ''}`}
          onClick={toggleGhostText}
          title={ghostTextEnabled ? t('editor.ghostTextOnHint') : t('editor.ghostTextOffHint')}
        >
          <Sparkles size={12} /> Ghost Text
        </button>
        {isDfm && (
          <div className="editor-view-switch">
            <button
              className={`editor-view-btn${viewMode === 'code' ? ' active' : ''}`}
              onClick={() => setViewMode('code')}
            >
              <Code size={12} /> {t('editor.code')}
            </button>
            <button
              className={`editor-view-btn${viewMode === 'design' ? ' active' : ''}`}
              onClick={() => setViewMode('design')}
            >
              <LayoutPanelTop size={12} /> {t('editor.design')}
            </button>
          </div>
        )}
      </div>

      {pendingCloseTab && (
        <div className="editor-unsaved-overlay">
          <div className="editor-unsaved-modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-tab-title">
            <h3 id="unsaved-tab-title">{t('editor.saveChangesQuestion')}</h3>
            <p>{t('editor.fileModifiedPrefix')} <strong>{openTabs.find((item) => item.path === pendingCloseTab)?.name}</strong> {t('editor.fileModifiedSuffix')}</p>
            <div className="editor-unsaved-actions">
              <button onClick={() => setPendingCloseTab(null)} disabled={closingTab}>{t('common.cancel')}</button>
              <button className="discard" onClick={() => closeEditorTab(pendingCloseTab)} disabled={closingTab}>{t('editor.dontSave')}</button>
              <button className="save" onClick={() => void saveAndCloseTab()} disabled={closingTab}>{closingTab ? t('editor.saving') : t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {isDfm && viewMode === 'design' ? (
        <DfmDesignView
          filePath={activeTab.path}
          content={activeTab.content}
          dirty={activeTab.dirty}
          onChange={(content) => updateTabContent(activeTab.path, content)}
          onSave={() => saveTab(activeTab.path)}
          onRestore={async () => {
            const response = await window.api.fs.restoreLastDfmBackup(activeTab.path)
            if (!response.success) {
              window.alert(response.error)
              return
            }
            await refreshOpenTabs([activeTab.path])
          }}
        />
      ) : (
        <div className="editor-monaco-wrap">
          <MonacoEditor
            key={activeTab.path}
            path={activeTab.path}
            language={languageForFile(activeTab.name)}
            value={activeTab.content}
            theme={theme === 'light' ? 'vs' : 'vs-dark'}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            onChange={(value) => handleCodeChange(activeTab.path, value ?? '')}
            options={{
              fontSize: 13,
              fontFamily: 'Cascadia Code, Consolas, monospace',
              minimap: { enabled: true },
              glyphMargin: true,
              automaticLayout: true,
              tabSize: 2
            }}
          />
        </div>
      )}
    </div>
  )

  function TabButton({
    path,
    name,
    dirty,
    active
  }: {
    path: string
    name: string
    dirty: boolean
    active: boolean
  }): JSX.Element {
    return (
      <div className={`editor-tab${active ? ' active' : ''}`} onClick={() => setActiveTab(path)}>
        <span className={dirty ? 'editor-tab-dirty' : ''}>{dirty ? '●' : ''}</span>
        <span>{name}</span>
        <span
          className="editor-tab-close"
          onClick={(e) => {
            e.stopPropagation()
            requestCloseTab(path)
          }}
        >
          <X size={12} />
        </span>
      </div>
    )
  }
}
