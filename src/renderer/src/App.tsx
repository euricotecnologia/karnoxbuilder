import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react'
import { Toolbar } from '@renderer/components/Toolbar/Toolbar'
import { ProjectGroupBar } from '@renderer/components/ProjectGroup/ProjectGroupBar'
import { Sidebar } from '@renderer/components/Sidebar/Sidebar'
import { Editor } from '@renderer/components/Editor/Editor'
import { ConsolePanel } from '@renderer/components/ConsolePanel/ConsolePanel'
import { PromptPanel } from '@renderer/components/PromptPanel/PromptPanel'
import { Settings } from '@renderer/components/Settings/Settings'
import { Resizer } from '@renderer/components/Resizer/Resizer'
import { DatabaseExplorer } from '@renderer/components/DatabaseExplorer/DatabaseExplorer'
import { PublishManager } from '@renderer/components/PublishManager/PublishManager'
import { NoCodeFormWizard } from '@renderer/components/NoCodeFormWizard/NoCodeFormWizard'
import { ManageNoCodeFormWizard } from '@renderer/components/NoCodeFormWizard/ManageNoCodeFormWizard'
import { ProjectAnalysisModal, type ProjectAnalysisView } from '@renderer/components/ProjectAnalysis/ProjectAnalysisModal'
import { useAppStore } from '@renderer/state/store'
import { useProjectGroupStore } from '@renderer/state/projectGroupStore'
import { loadInitialTheme } from '@renderer/state/theme'
import { loadInitialLanguage } from '@renderer/i18n'

function App(): JSX.Element {
  const { t } = useTranslation()
  const [databaseMode, setDatabaseMode] = useState(false)
  const [publishMode, setPublishMode] = useState(false)
  const [showNoCodeFormWizard, setShowNoCodeFormWizard] = useState(false)
  const [showNoCodeFormManager, setShowNoCodeFormManager] = useState(false)
  const [projectAnalysis, setProjectAnalysis] = useState<ProjectAnalysisView | null>(null)
  const {
    appendConsoleLine,
    setLastExePath,
    setLastBuildResult,
    setCompiling,
    setAiProviders,
    setSuggestions,
    setActiveProviderId,
    resizeSidebar,
    resizePromptPanel,
    resizeConsolePanel,
    sidebarCollapsed,
    promptPanelCollapsed,
    toggleSidebar,
    togglePromptPanel
  } = useAppStore()

  useEffect(() => {
    const closeWorkspaceTools = (): void => { setDatabaseMode(false); setPublishMode(false); setShowNoCodeFormWizard(false); setShowNoCodeFormManager(false) }
    const openNoCodeFormWizard = (): void => setShowNoCodeFormWizard(true)
    const openNoCodeFormManager = (): void => setShowNoCodeFormManager(true)
    const showProjectAnalysis = (event: Event): void => setProjectAnalysis((event as CustomEvent<ProjectAnalysisView>).detail)
    window.addEventListener('karnox:close-workspace-tools', closeWorkspaceTools)
    window.addEventListener('karnox:open-nocode-form', openNoCodeFormWizard)
    window.addEventListener('karnox:manage-nocode-form', openNoCodeFormManager)
    window.addEventListener('karnox:project-analysis', showProjectAnalysis)
    const offOutput = window.api.compiler.onOutput((chunk) => appendConsoleLine(chunk))
    const offDone = window.api.compiler.onDone((result) => {
      if (useProjectGroupStore.getState().isBuildingGroup) return
      const compiled = result as import('@renderer/state/store').CompileResult
      setCompiling(false)
      setLastExePath(compiled.exePath)
      setLastBuildResult(compiled)
      appendConsoleLine(compiled.success ? `\n${t('app.buildSuccess')}\n` : `\n${t('app.buildFailed')}\n`)
    })

    void window.api.aiProviders.list().then((providers) => {
      setAiProviders(providers)
      const firstEnabled = providers.find((provider: { enabled: boolean; hasApiKey: boolean }) => provider.enabled && provider.hasApiKey)
      if (firstEnabled) setActiveProviderId(firstEnabled.id)
    })
    void window.api.suggestions.list().then(setSuggestions)
    void loadInitialTheme()
    void loadInitialLanguage()

    return () => { offOutput(); offDone(); window.removeEventListener('karnox:close-workspace-tools', closeWorkspaceTools); window.removeEventListener('karnox:open-nocode-form', openNoCodeFormWizard); window.removeEventListener('karnox:manage-nocode-form', openNoCodeFormManager); window.removeEventListener('karnox:project-analysis', showProjectAnalysis) }
  }, [])

  return (
    <div className={`app-shell${databaseMode ? ' database-mode' : ''}${publishMode ? ' publish-mode' : ''}`}>
      <Toolbar />
      <ProjectGroupBar />
      <div className="app-body">
        {sidebarCollapsed ? (
          <button className="panel-restore panel-restore-left" onClick={toggleSidebar} title={t('app.openExplorer')}>
            <PanelLeftOpen size={17} />
          </button>
        ) : <>
          <Sidebar />
          <Resizer direction="vertical" onResize={resizeSidebar} />
        </>}
        <div className="app-main">
          <Editor />
          <Resizer direction="horizontal" onResize={resizeConsolePanel} />
          <ConsolePanel />
        </div>
        {promptPanelCollapsed ? (
          <button className="panel-restore panel-restore-right" onClick={togglePromptPanel} title={t('app.openAssistant')}>
            <PanelRightOpen size={17} />
          </button>
        ) : <>
          <Resizer direction="vertical" onResize={resizePromptPanel} />
          <PromptPanel />
        </>}
      </div>
      {showNoCodeFormWizard && <NoCodeFormWizard onClose={() => setShowNoCodeFormWizard(false)} />}
      {showNoCodeFormManager && <ManageNoCodeFormWizard onClose={() => setShowNoCodeFormManager(false)} />}
      {projectAnalysis && <ProjectAnalysisModal analysis={projectAnalysis} onClose={() => setProjectAnalysis(null)} />}
      <Settings />
      <DatabaseExplorer open={databaseMode} onOpenChange={(value) => { setDatabaseMode(value); if (value) setPublishMode(false) }} />
      <PublishManager open={publishMode} onOpenChange={(value) => { setPublishMode(value); if (value) setDatabaseMode(false) }} />
    </div>
  )
}

export default App
