import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDown, ArrowUp, Blocks, Box, CheckCircle2, ChevronDown, ChevronRight, Circle,
  FileCode, FileCog, FileImage, Files, FlaskConical, Folder, FolderOpen, GitBranch,
  Network, Package, PanelLeftClose, Play, Server, Wrench
} from 'lucide-react'
import { useAppStore, type FileNode } from '@renderer/state/store'
import { activateGroupProject, useProjectGroupStore } from '@renderer/state/projectGroupStore'
import { GROUP_PROJECT_KIND_LABELS, type GroupProject, type GroupProjectKind } from '@renderer/projectGroup/projectGroup'
import { SourceControl } from './SourceControl'
import './Sidebar.css'
import './ProjectGroupSidebar.css'

function FileIcon({ node }: { node: FileNode }): JSX.Element {
  const extension = node.name.slice(node.name.lastIndexOf('.')).toLowerCase()
  if (extension === '.groupproj') return <Blocks size={14} color="#c084fc" />
  if (extension === '.dproj') return <FileCog size={14} color="#a78bfa" />
  if (extension === '.dpr' || extension === '.dpk') return <Play size={14} color="#3ecf8e" />
  if (extension === '.pas') return <FileCode size={14} color="#4a9eff" />
  if (extension === '.dfm') return <FileImage size={14} color="#f472b6" />
  return <FileCode size={14} color="#9099a8" />
}

function KindIcon({ kind }: { kind: GroupProjectKind }): JSX.Element {
  if (kind === 'package') return <Package size={13} color="#a78bfa" />
  if (kind === 'service') return <Server size={13} color="#38bdf8" />
  if (kind === 'dll') return <Box size={13} color="#fb923c" />
  if (kind === 'tests') return <FlaskConical size={13} color="#34d399" />
  if (kind === 'tool') return <Wrench size={13} color="#facc15" />
  return <Play size={13} color="#3ecf8e" />
}

function TreeNode({ node, depth, beforeOpen }: {
  node: FileNode
  depth: number
  beforeOpen?: () => boolean
}): JSX.Element {
  const [expanded, setExpanded] = useState(depth < 2)
  const { activeTabPath, openTab } = useAppStore()

  async function handleClick(): Promise<void> {
    if (node.isDirectory) {
      setExpanded((value) => !value)
      return
    }
    if (beforeOpen && !beforeOpen()) return
    const content = await window.api.fs.readFile(node.path)
    openTab(node.path, node.name, content)
  }

  return <div>
    <div className={`tree-node${activeTabPath === node.path ? ' active' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }} onClick={handleClick} title={node.path}>
      <span className="tree-icon">{node.isDirectory ? <>
        {expanded ? <ChevronDown size={12} color="#9099a8" /> : <ChevronRight size={12} color="#9099a8" />}
        {expanded ? <FolderOpen size={14} color="#f5b942" /> : <Folder size={14} color="#f5b942" />}
      </> : <FileIcon node={node} />}</span>
      <span>{node.name}</span>
    </div>
    {node.isDirectory && expanded && node.children?.map((child) =>
      <TreeNode key={child.path} node={child} depth={depth + 1} beforeOpen={beforeOpen} />
    )}
  </div>
}

function GroupProjectNode({ project, index, total }: {
  project: GroupProject
  index: number
  total: number
}): JSX.Element {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [showDependencies, setShowDependencies] = useState(false)
  const { group, activeProjectPath, toggleProject, moveProject, setDependency } = useProjectGroupStore()
  const activeTree = useAppStore((state) => state.fileTree)
  const isActive = activeProjectPath === project.path
  const tree = isActive ? activeTree : project.fileTree

  const activate = (): boolean => {
    const changed = activateGroupProject(project.path)
    if (changed) setExpanded(true)
    return changed
  }

  return <div className={`group-project${isActive ? ' active' : ''}${project.enabled ? '' : ' disabled'}`}>
    <div className="group-project-header" onClick={() => { activate(); setExpanded((value) => !value) }} title={project.path}>
      <button className="group-project-chevron" onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value) }}>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      <button className="group-project-enabled" title={project.enabled ? t('sidebar.includedInGroupBuild') : t('sidebar.ignoredInBuild')}
        onClick={(event) => { event.stopPropagation(); toggleProject(project.path) }}>
        {project.enabled ? <CheckCircle2 size={13} /> : <Circle size={13} />}
      </button>
      <KindIcon kind={project.kind} />
      <div className="group-project-name"><span>{project.name}</span><small>{GROUP_PROJECT_KIND_LABELS[project.kind]}</small></div>
      {isActive && <span className="group-project-active-label">{t('sidebar.active')}</span>}
      <div className="group-project-order">
        <button disabled={index === 0} title={t('sidebar.buildBefore')} onClick={(event) => { event.stopPropagation(); moveProject(project.path, -1) }}><ArrowUp size={11} /></button>
        <button disabled={index === total - 1} title={t('sidebar.buildAfter')} onClick={(event) => { event.stopPropagation(); moveProject(project.path, 1) }}><ArrowDown size={11} /></button>
        <button className={showDependencies ? 'active' : ''} title={t('sidebar.dependencies')} onClick={(event) => { event.stopPropagation(); setShowDependencies((value) => !value) }}><Network size={11} /></button>
      </div>
    </div>
    {showDependencies && group && <div className="group-dependencies">
      <div>{t('sidebar.buildBeforeThisProject')}</div>
      {group.projects.filter((candidate) => candidate.path !== project.path).map((candidate) =>
        <label key={candidate.path}><input type="checkbox" checked={project.dependencies.includes(candidate.path)}
          onChange={(event) => setDependency(project.path, candidate.path, event.target.checked)} />{candidate.name}</label>
      )}
    </div>}
    {expanded && <div className="group-project-tree">
      {tree.map((node) => <TreeNode key={node.path} node={node} depth={1} beforeOpen={activate} />)}
    </div>}
  </div>
}

export function Sidebar(): JSX.Element {
  const { t } = useTranslation()
  const { fileTree, projectName, sidebarWidth, workspaceVersion, toggleSidebar } = useAppStore()
  const group = useProjectGroupStore((state) => state.group)
  const [view, setView] = useState<'files' | 'git'>('files')
  useEffect(() => setView('files'), [workspaceVersion])

  return <div className="sidebar" style={{ width: sidebarWidth }}>
    <div className="sidebar-header-row">
      <div className="sidebar-header">{view === 'files' ? (group?.name ?? projectName ?? t('sidebar.explorer')) : t('sidebar.sourceControl')}</div>
      <div className="sidebar-view-buttons">
        <button className={view === 'files' ? 'active' : ''} onClick={() => setView('files')} title={t('sidebar.explorer')}><Files size={14} /></button>
        <button className={view === 'git' ? 'active' : ''} onClick={() => setView('git')} title={t('sidebar.sourceControl')}><GitBranch size={14} /></button>
        <button onClick={toggleSidebar} title={t('sidebar.collapseExplorer')}><PanelLeftClose size={14} /></button>
      </div>
    </div>
    {view === 'files' ? <div className="sidebar-tree">
      {group ? <div className="group-project-list">
        {group.projects.map((project, index) => <GroupProjectNode key={project.path} project={project} index={index} total={group.projects.length} />)}
      </div> : fileTree.length === 0 ? <div className="sidebar-empty">
        {t('sidebar.emptyState')}
      </div> : fileTree.map((node) => <TreeNode key={node.path} node={node} depth={0} />)}
    </div> : <SourceControl />}
  </div>
}
