import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Hammer, Layers3, LayoutTemplate, ListPlus } from 'lucide-react'
import { useAppStore, type CompileResult, type FileNode } from '@renderer/state/store'
import { GROUP_PROJECT_KIND_LABELS, groupBuildOrder, loadProjectGroup } from '@renderer/projectGroup/projectGroup'
import { activateGroupProject, useProjectGroupStore } from '@renderer/state/projectGroupStore'
import './ProjectGroupBar.css'

function flatten(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => node.isDirectory ? flatten(node.children ?? []) : [node])
}

export function ProjectGroupBar(): JSX.Element {
  const { t } = useTranslation()
  const { group, activeProjectPath, isBuildingGroup, setGroup, setBuildingGroup } = useProjectGroupStore()
  const {
    projectDir, dprojPath, openTabs, isCompiling, isGenerating, buildPlatform, buildConfig,
    saveAllTabs, setCompiling, clearConsole, appendConsoleLine, setConsoleActiveTab,
    setLastBuildResult, setLastExePath
  } = useAppStore()

  useEffect(() => {
    if (group && projectDir && !group.projects.some((project) => project.directory.toLowerCase() === projectDir.toLowerCase())) {
      setGroup(null)
    }
  }, [projectDir, group, setGroup])

  async function openGroup(): Promise<void> {
    if (isCompiling || isGenerating || isBuildingGroup) {
      window.alert(t('projectGroup.waitCurrentOperation'))
      return
    }
    if (openTabs.some((tab) => tab.dirty) && !window.confirm(t('projectGroup.unsavedConfirm'))) return
    const directory = await window.api.fs.selectDirectory(t('projectGroup.selectFolder'))
    if (!directory) return
    try {
      const tree = await window.api.fs.readProjectTree(directory) as FileNode[]
      const candidates = flatten(tree).filter((node) => node.name.toLowerCase().endsWith('.groupproj'))
      if (!candidates.length) throw new Error(t('projectGroup.noGroupFile'))
      let selected = candidates[0]
      if (candidates.length > 1) {
        const answer = window.prompt(
          t('projectGroup.multipleGroupsFound', {
            count: candidates.length,
            list: candidates.map((item, index) => `${index + 1}. ${item.name}`).join('\n')
          }),
          '1'
        )
        if (answer === null) return
        const index = Number.parseInt(answer, 10) - 1
        if (!candidates[index]) throw new Error(t('projectGroup.invalidGroupSelection'))
        selected = candidates[index]
      }
      const xml = await window.api.fs.readFile(selected.path)
      const loaded = await loadProjectGroup(selected.path, xml)
      const groupId = await window.api.projects.touch(loaded.name, loaded.directory)
      setGroup(loaded, groupId)
      if (!activateGroupProject(loaded.projects[0].path)) throw new Error(t('projectGroup.activateFirstFailed'))
    } catch (error) {
      window.alert(`${t('projectGroup.openGroupError')}${(error as Error).message}`)
    }
  }

  async function buildGroup(rebuild = false): Promise<void> {
    if (!group || isBuildingGroup) return
    try {
      const order = groupBuildOrder(group)
      if (!order.length) throw new Error(t('projectGroup.noProjectMarked'))
      await saveAllTabs()
      setBuildingGroup(true)
      setCompiling(true)
      setConsoleActiveTab('build')
      clearConsole()
      appendConsoleLine(`${t(rebuild ? 'projectGroup.rebuildingGroup' : 'projectGroup.buildingGroup', { name: group.name, platform: buildPlatform, config: buildConfig })}\n`)
      appendConsoleLine(`${t('projectGroup.order')}: ${order.map((project) => project.name).join(' → ')}\n\n`)

      const results = new Map<string, CompileResult>()
      for (let index = 0; index < order.length; index++) {
        const project = order[index]
        appendConsoleLine(`[${index + 1}/${order.length}] ${project.name} — ${GROUP_PROJECT_KIND_LABELS[project.kind]}\n`)
        const result = await window.api.compiler.build({
          dprojPath: project.path,
          projectDir: project.directory,
          projectName: project.name,
          platform: buildPlatform,
          config: buildConfig,
          profile: project.profile,
          rebuild
        }) as CompileResult
        results.set(project.path, result)
        if (!result.success) {
          appendConsoleLine(`\n${t('projectGroup.groupInterrupted', { name: project.name })}\n`)
          break
        }
        appendConsoleLine(`${t('projectGroup.projectDone', { name: project.name })}\n\n`)
      }

      const completed = [...results.values()]
      const success = completed.length === order.length && completed.every((result) => result.success)
      const activeResult = activeProjectPath ? results.get(activeProjectPath) : undefined
      const aggregate: CompileResult = {
        success,
        exitCode: success ? 0 : (completed.at(-1)?.exitCode ?? null),
        exePath: activeResult?.exePath ?? null,
        output: completed.map((result) => result.output).join('\n'),
        diagnostics: completed.flatMap((result) => result.diagnostics)
      }
      setLastBuildResult(aggregate)
      setLastExePath(aggregate.exePath)
      appendConsoleLine(success ? `\n${t('projectGroup.groupBuildSuccess', { name: group.name })}\n` : `\n${t('projectGroup.groupBuildFailed')}\n`)
    } catch (error) {
      appendConsoleLine(`\n${t('projectGroup.groupError')}${(error as Error).message}\n`)
    } finally {
      setBuildingGroup(false)
      setCompiling(false)
    }
  }

  useEffect(() => {
    const handleBuildAll = (): void => { void buildGroup(true) }
    window.addEventListener('karnox:build-all-projects', handleBuildAll)
    return () => window.removeEventListener('karnox:build-all-projects', handleBuildAll)
  })
  return <div className={`project-group-bar${group ? ' open' : ''}`}>
    <button className="project-group-open" onClick={openGroup} title={t('projectGroup.openGroupTitle')}>
      <FolderOpen size={14} /> {t('projectGroup.openGroup')}
    </button>
    <button
      className="project-group-nocode"
      onClick={() => window.dispatchEvent(new Event('karnox:open-nocode-form'))}
      disabled={!projectDir || !dprojPath}
      title={projectDir ? t('projectGroup.createScreenTitle') : t('projectGroup.openProjectFirst')}
    >
      <LayoutTemplate size={14} /> {t('projectGroup.createScreen')}
    </button>
    <button
      className="project-group-manage"
      onClick={() => window.dispatchEvent(new Event('karnox:manage-nocode-form'))}
      disabled={!projectDir || !dprojPath}
      title={t('projectGroup.manageFieldsTitle')}
    >
      <ListPlus size={14} /> {t('projectGroup.manageFields')}
    </button>
    {group && <>
      <div className="project-group-identity" title={group.path}><Layers3 size={14} /><span>{group.name}</span><small>{t('projectGroup.projectCount', { count: group.projects.length })}</small></div>
      <label className="project-group-active"><span>{t('projectGroup.activeProject')}</span><select value={activeProjectPath ?? ''} onChange={(event) => activateGroupProject(event.target.value)}>
        {group.projects.map((project) => <option key={project.path} value={project.path}>{project.name} — {GROUP_PROJECT_KIND_LABELS[project.kind]}</option>)}
      </select></label>
      <div className="project-group-spacer" />
      <button className="project-group-build" disabled={isBuildingGroup || isCompiling} onClick={() => void buildGroup(false)}>
        <Hammer size={14} /> {isBuildingGroup ? t('projectGroup.buildingGroupLabel') : t('projectGroup.buildGroup')}
      </button>
    </>}
  </div>
}
