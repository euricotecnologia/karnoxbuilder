import { create } from 'zustand'
import { useAppStore } from './store'
import type { ProjectGroup } from '@renderer/projectGroup/projectGroup'

interface ProjectGroupState {
  group: ProjectGroup | null
  groupId: string | null
  activeProjectPath: string | null
  isBuildingGroup: boolean
  setGroup: (group: ProjectGroup | null, groupId?: string | null) => void
  setBuildingGroup: (value: boolean) => void
  toggleProject: (path: string) => void
  moveProject: (path: string, direction: -1 | 1) => void
  setDependency: (projectPath: string, dependencyPath: string, enabled: boolean) => void
  setActiveProjectPath: (path: string | null) => void
}

export const useProjectGroupStore = create<ProjectGroupState>((set, get) => ({
  group: null,
  groupId: null,
  activeProjectPath: null,
  isBuildingGroup: false,
  setGroup: (group, groupId = null) => set({
    group,
    groupId: group ? groupId : null,
    activeProjectPath: group?.projects[0]?.path ?? null,
    isBuildingGroup: false
  }),
  setBuildingGroup: (value) => set({ isBuildingGroup: value }),
  toggleProject: (path) => {
    const group = get().group
    if (!group) return
    set({ group: { ...group, projects: group.projects.map((project) =>
      project.path === path ? { ...project, enabled: !project.enabled } : project
    ) } })
  },
  moveProject: (path, direction) => {
    const group = get().group
    if (!group) return
    const projects = [...group.projects]
    const index = projects.findIndex((project) => project.path === path)
    const target = index + direction
    if (index < 0 || target < 0 || target >= projects.length) return
    ;[projects[index], projects[target]] = [projects[target], projects[index]]
    set({ group: { ...group, projects } })
  },
  setDependency: (projectPath, dependencyPath, enabled) => {
    const group = get().group
    if (!group || projectPath === dependencyPath) return
    set({ group: { ...group, projects: group.projects.map((project) => {
      if (project.path !== projectPath) return project
      const dependencies = enabled
        ? Array.from(new Set([...project.dependencies, dependencyPath]))
        : project.dependencies.filter((path) => path !== dependencyPath)
      return { ...project, dependencies }
    }) } })
  },
  setActiveProjectPath: (path) => set({ activeProjectPath: path })
}))

export function activateGroupProject(path: string): boolean {
  const groupState = useProjectGroupStore.getState()
  const project = groupState.group?.projects.find((item) => item.path === path)
  if (!project) return false
  const app = useAppStore.getState()
  if (app.projectDir === project.directory) {
    groupState.setActiveProjectPath(project.path)
    return true
  }
  if (app.openTabs.some((tab) => tab.dirty) && !window.confirm(
    'Existem arquivos não salvos no projeto ativo. Deseja descartá-los e trocar de projeto?'
  )) return false

  app.resetWorkspace()
  app.setProject(project.directory, project.name, groupState.groupId ?? project.path, project.profile)
  app.setDprojPath(project.path)
  app.setFileTree(project.fileTree)
  groupState.setActiveProjectPath(project.path)
  return true
}
