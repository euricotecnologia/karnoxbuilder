import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FilePlus,
  FolderOpen,
  Play,
  Rocket,
  Sun,
  Moon,
  Settings as SettingsIcon,
  Undo2,
  Redo2,
  Save,
  SaveAll,
  Copy,
  Package,
  Hammer,
  Database,
  FolderX,
  Info
} from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import { applyTheme } from '@renderer/state/theme'
import { useProjectGroupStore } from '@renderer/state/projectGroupStore'
import {
  DELPHI_PROFILE_OPTIONS,
  isDelphiProfileId,
  type DelphiProfileId
} from '@renderer/state/delphiProfiles'
import { NewProjectWizard } from '../NewProjectWizard/NewProjectWizard'
import { AboutDialog } from '../About/AboutDialog'
import './Toolbar.css'

function findProjectFile(
  tree: { name: string; path: string; isDirectory: boolean; children?: unknown[] }[],
  profile: DelphiProfileId = 'delphi10_13'
): string | null {
  const extensions = profile === 'delphi10_13' ? ['.dproj', '.dpr'] : ['.dpr', '.dproj']
  for (const extension of extensions) {
    for (const node of tree) {
      if (!node.isDirectory && node.name.toLowerCase().endsWith(extension)) return node.path
    }
  }
  return null
}

function inferProfile(tree: { name: string; isDirectory: boolean }[]): DelphiProfileId {
  const hasDproj = tree.some((node) => !node.isDirectory && node.name.toLowerCase().endsWith('.dproj'))
  const hasLegacyMetadata = tree.some((node) => !node.isDirectory && /\.(dof|cfg)$/i.test(node.name))
  return !hasDproj && hasLegacyMetadata ? 'delphi7_2007' : 'delphi10_13'
}

export function Toolbar(): JSX.Element {
  const { t } = useTranslation()
  const {
    projectDir,
    projectName,
    delphiProfile,
    dprojPath,
    buildPlatform,
    buildConfig,
    fileTree,
    isCompiling,
    isGenerating,
    lastExePath,
    setProject,
    setDelphiProfile,
    resetWorkspace,
    setDprojPath,
    setFileTree,
    setBuildPlatform,
    setBuildConfig,
    setCompiling,
    setLastBuildResult,
    clearConsole,
    appendConsoleLine,
    setConsoleActiveTab,
    setShowSettings,
    theme,
    openTabs,
    activeTabPath,
    activeEditorInstance,
    saveActiveTab,
    saveAllTabs,
    renameActiveTab,
    requestAiGeneration,
    promptPanelCollapsed,
    togglePromptPanel
  } = useAppStore()

  const { group, isBuildingGroup, setGroup } = useProjectGroupStore()
  const [saving, setSaving] = useState(false)
  const [showNewProjectWizard, setShowNewProjectWizard] = useState(false)
  const [showCloseProject, setShowCloseProject] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [closingProject, setClosingProject] = useState(false)

  const activeTab = openTabs.find((t) => t.path === activeTabPath) ?? null
  const hasDirtyTabs = openTabs.some((t) => t.dirty)

  useEffect(() => {
    document.title = projectName ? `KarnoX Builder - ${projectName}` : 'KarnoX Builder'
  }, [projectName])

  function canSwitchProject(): boolean {
    if (isCompiling || isGenerating) {
      window.alert(isCompiling ? t('toolbar.compilingWait') : t('toolbar.generatingWait'))
      return false
    }
    if (hasDirtyTabs && !window.confirm(t('toolbar.unsavedConfirm'))) {
      return false
    }
    return true
  }

  function handleNewProjectClick(): void {
    if (!canSwitchProject()) return
    setShowNewProjectWizard(true)
  }

  async function handleWorkspaceReady(result: {
    projectDir: string
    projectName: string
    dprojPath: string | null
    profile: DelphiProfileId
  }): Promise<void> {
    const id = await window.api.projects.touch(result.projectName, result.projectDir)
    await window.api.projects.setDelphiProfile(result.projectDir, result.profile)
    resetWorkspace()
    setProject(result.projectDir, result.projectName, id, result.profile)
    setDprojPath(result.dprojPath)
    setFileTree(await window.api.fs.readProjectTree(result.projectDir))
  }

  function handleAiProjectReady(prompt: string): void {
    if (promptPanelCollapsed) togglePromptPanel()
    requestAiGeneration(prompt)
  }

  function closeWorkspace(): void {
    resetWorkspace()
    setGroup(null)
    window.dispatchEvent(new Event('karnox:close-workspace-tools'))
    setShowCloseProject(false)
  }

  function handleCloseProject(): void {
    if (isCompiling || isGenerating) {
      window.alert(isCompiling ? t('toolbar.compilingWaitShort') : t('toolbar.generatingWaitShort'))
      return
    }
    if (hasDirtyTabs) setShowCloseProject(true)
    else closeWorkspace()
  }

  async function saveAndCloseProject(): Promise<void> {
    setClosingProject(true)
    try {
      await saveAllTabs()
      closeWorkspace()
    } finally {
      setClosingProject(false)
    }
  }

  async function handleOpenProject(): Promise<void> {
    try {
      if (!canSwitchProject()) return
      const dir = await window.api.fs.selectDirectory(t('toolbar.selectProjectFolder'))
      if (!dir) return
      const tree = await window.api.fs.readProjectTree(dir)
      const found = findProjectFile(tree)
      const folderName = dir.split(/[\\/]/).pop() ?? dir
      const name = found ? (found.split(/[\\/]/).pop() ?? folderName).replace(/\.(dproj|dpr)$/i, '') : folderName
      const storedProfile = await window.api.projects.getDelphiProfile(dir)
      // Roda o mesmo diagnóstico que alimenta a tela "Diagnóstico do projeto" ANTES de
      // decidir o perfil ativo, para as duas nunca divergirem (a versão mostrada na tela
      // é sempre a mesma que efetivamente vira o perfil usado na geração por IA/compilação).
      let analysis: { delphiVersion?: { profile?: string } } | null = null
      let analysisError: Error | null = null
      try {
        analysis = await window.api.projects.analyze(dir)
      } catch (error) {
        analysisError = error as Error
      }
      const detectedProfile = analysis?.delphiVersion?.profile
      const profile = isDelphiProfileId(storedProfile)
        ? storedProfile
        : isDelphiProfileId(detectedProfile) ? detectedProfile : inferProfile(tree)
      const id = await window.api.projects.touch(name, dir)
      if (!isDelphiProfileId(storedProfile)) await window.api.projects.setDelphiProfile(dir, profile)
      resetWorkspace()
      setProject(dir, name, id, profile)
      setDprojPath(findProjectFile(tree, profile))
      setFileTree(tree)
      if (analysis) {
        setFileTree(await window.api.fs.readProjectTree(dir))
        window.dispatchEvent(new CustomEvent('karnox:project-analysis', { detail: analysis }))
      } else if (analysisError) {
        window.alert(t('toolbar.analysisIncomplete') + analysisError.message)
      }
    } catch (err) {
      window.alert(`${t('toolbar.openProjectError')}${(err as Error).message}`)
    }
  }

  async function handleCompile(): Promise<void> {
    if (!dprojPath || !projectDir || !projectName) {
      window.alert(t('toolbar.noProjectLoaded'))
      return
    }
    setCompiling(true)
    setLastBuildResult(null)
    setConsoleActiveTab('build')
    clearConsole()
    appendConsoleLine(`${t('toolbar.compiling', { name: projectName, platform: buildPlatform, config: buildConfig })}\n`)
    try {
      await window.api.compiler.build({
        dprojPath,
        projectDir,
        projectName,
        platform: buildPlatform,
        config: buildConfig,
        profile: delphiProfile
      })
    } finally {
      setCompiling(false)
    }
  }

  async function handleBuildAll(): Promise<void> {
    if (group) {
      window.dispatchEvent(new Event('karnox:build-all-projects'))
      return
    }
    if (!dprojPath || !projectDir || !projectName) {
      window.alert(t('toolbar.noProjectLoaded'))
      return
    }

    await saveAllTabs()
    setCompiling(true)
    setLastBuildResult(null)
    setConsoleActiveTab('build')
    clearConsole()
    appendConsoleLine(`${t('toolbar.rebuilding', { name: projectName, platform: buildPlatform, config: buildConfig })}\n`)
    try {
      await window.api.compiler.build({
        dprojPath,
        projectDir,
        projectName,
        platform: buildPlatform,
        config: buildConfig,
        profile: delphiProfile,
        rebuild: true
      })
    } finally {
      setCompiling(false)
    }
  }
  async function handleRun(): Promise<void> {
    if (!lastExePath || !projectDir) return
    await window.api.compiler.run({
      exePath: lastExePath,
      projectDir,
      platform: buildPlatform,
      config: buildConfig
    })
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    try {
      await saveActiveTab()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAll(): Promise<void> {
    setSaving(true)
    try {
      await saveAllTabs()
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAs(): Promise<void> {
    if (!activeTab) return
    const target = await window.api.fs.saveFileDialog(activeTab.path)
    if (!target) return
    const name = target.split(/[\\/]/).pop() ?? target
    setSaving(true)
    try {
      await renameActiveTab(target, name)
      if (projectDir) {
        const tree = await window.api.fs.readProjectTree(projectDir)
        setFileTree(tree)
      }
    } finally {
      setSaving(false)
    }
  }

  function handleUndo(): void {
    activeEditorInstance?.trigger('toolbar', 'undo', null)
  }

  function handleRedo(): void {
    activeEditorInstance?.trigger('toolbar', 'redo', null)
  }

  return (
    <div className="toolbar-wrapper">
      <div className="toolbar">
        <div className="toolbar-brand">
          Karno<span>X</span> Builder
        </div>

        <button className="toolbar-btn" onClick={handleNewProjectClick}>
          <FilePlus size={15} color="#4a9eff" /> {t('toolbar.newProject')}
        </button>
        <button className="toolbar-btn" onClick={handleOpenProject}>
          <FolderOpen size={15} color="#f5b942" /> {t('toolbar.openProject')}
        </button>
        {(projectDir || group) && <button className="toolbar-btn" onClick={handleCloseProject} title={t('toolbar.closeProjectTitle')}>
          <FolderX size={15} color="#f14c4c" /> {t('toolbar.closeProject')}
        </button>}

        {projectDir && (
          <select
            className="toolbar-select toolbar-profile-select"
            title={t('toolbar.profileTitle')}
            value={delphiProfile}
            onChange={async (event) => {
              const profile = event.target.value as DelphiProfileId
              setDelphiProfile(profile)
              await window.api.projects.setDelphiProfile(projectDir, profile)
              setDprojPath(findProjectFile(fileTree, profile))
              if (!DELPHI_PROFILE_OPTIONS.find((item) => item.id === profile)?.supportsWin64) {
                setBuildPlatform('Win32')
              }
            }}
          >
            {DELPHI_PROFILE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        )}

        <div className="toolbar-spacer" />

        <select
          className="toolbar-select"
          value={buildPlatform}
          onChange={(e) => setBuildPlatform(e.target.value as 'Win32' | 'Win64')}
        >
          <option value="Win32">Win32</option>
          <option
            value="Win64"
            disabled={!DELPHI_PROFILE_OPTIONS.find((item) => item.id === delphiProfile)?.supportsWin64}
          >Win64</option>
        </select>

        <select
          className="toolbar-select"
          value={buildConfig}
          onChange={(e) => setBuildConfig(e.target.value as 'Debug' | 'Release')}
        >
          <option value="Debug">Debug</option>
          <option value="Release">Release</option>
        </select>

        {projectDir && <button className="toolbar-btn" onClick={() => window.dispatchEvent(new Event('karnox:open-publish'))}>
          <Package size={15} color="#a78bfa" /> {t('toolbar.publish')}
        </button>}

        <button
          className="toolbar-btn toolbar-icon-btn"
          title={t('toolbar.toggleTheme')}
          onClick={() => applyTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? <Moon size={16} color="#818cf8" /> : <Sun size={16} color="#f5b942" />}
        </button>

        <button className="toolbar-btn" onClick={() => setShowSettings(true)}>
          <SettingsIcon size={15} color="#9099a8" /> {t('settings.title')}
        </button>

        <button className="toolbar-btn toolbar-icon-btn" title={t('toolbar.about')} onClick={() => setShowAbout(true)}>
          <Info size={16} color="#9099a8" />
        </button>
      </div>

      <div className="toolbar toolbar-secondary">
        <button className="toolbar-btn" onClick={handleUndo} disabled={!activeEditorInstance} title="Ctrl+Z">
          <Undo2 size={14} color="#9099a8" /> {t('toolbar.undo')}
        </button>
        <button className="toolbar-btn" onClick={handleRedo} disabled={!activeEditorInstance} title="Ctrl+Y">
          <Redo2 size={14} color="#9099a8" /> {t('toolbar.redo')}
        </button>

        <div className="toolbar-divider" />

        <button className="toolbar-btn" onClick={handleSave} disabled={saving || !activeTab?.dirty} title="Ctrl+S">
          <Save size={14} color="#4a9eff" /> {t('toolbar.save')}
        </button>
        <button className="toolbar-btn" onClick={handleSaveAll} disabled={saving || !hasDirtyTabs} title={t('toolbar.saveAll')}>
          <SaveAll size={14} color="#2dd4bf" /> {t('toolbar.saveAll')}
        </button>
        <button className="toolbar-btn" onClick={handleSaveAs} disabled={saving || !activeTab} title={t('toolbar.saveAs')}>
          <Copy size={14} color="#a78bfa" /> {t('toolbar.saveAs')}
        </button>

        <div className="toolbar-spacer" />
        <div className="toolbar-build-actions">
          <button className="toolbar-btn" onClick={() => window.dispatchEvent(new Event('karnox:open-database'))} title={t('toolbar.openDatabaseExplorer')}>
            <Database size={15} color="#38bdf8" /> {t('toolbar.database')}
          </button>
          <button className="toolbar-btn primary" onClick={handleCompile} disabled={isCompiling || !dprojPath}>
            <Play size={15} color="#3ecf8e" /> {isCompiling ? t('toolbar.compilingLabel') : t('toolbar.compile')}
          </button>
          <button
            className="toolbar-btn"
            onClick={handleBuildAll}
            disabled={isCompiling || isBuildingGroup || (!group && !dprojPath)}
            title={group ? t('toolbar.buildAllGroupTitle') : t('toolbar.buildAllTitle')}
          >
            <Hammer size={15} color="#a78bfa" /> {isBuildingGroup ? t('toolbar.buildingAll') : t('toolbar.buildAll')}
          </button>
          <button className="toolbar-btn" onClick={handleRun} disabled={!lastExePath}>
            <Rocket size={15} color="#ff9d4d" /> {t('toolbar.run')}
          </button>
        </div>
      </div>

      {showCloseProject && (
        <div className="new-project-overlay">
          <div className="new-project-modal close-project-modal" role="dialog" aria-modal="true" aria-labelledby="close-project-title">
            <h3 id="close-project-title">{t('toolbar.closeModalTitle')}</h3>
            <p>{t('toolbar.closeModalBody')}</p>
            <div className="new-project-actions">
              <button className="toolbar-btn" onClick={() => setShowCloseProject(false)} disabled={closingProject}>{t('common.cancel')}</button>
              <button className="toolbar-btn close-discard" onClick={closeWorkspace} disabled={closingProject}>{t('toolbar.discard')}</button>
              <button className="toolbar-btn primary" onClick={() => void saveAndCloseProject()} disabled={closingProject}>
                {closingProject ? t('toolbar.saving') : t('toolbar.saveAndClose')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewProjectWizard && (
        <NewProjectWizard
          onClose={() => setShowNewProjectWizard(false)}
          onWorkspaceReady={handleWorkspaceReady}
          onAiReady={handleAiProjectReady}
        />
      )}

      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
    </div>
  )
}
