import type { FileNode } from '@renderer/state/store'
import type { DelphiProfileId } from '@renderer/state/delphiProfiles'

export type GroupProjectKind = 'application' | 'package' | 'service' | 'dll' | 'tests' | 'tool'

export interface GroupProject {
  path: string
  directory: string
  name: string
  guid: string | null
  sourcePath: string | null
  kind: GroupProjectKind
  dependencies: string[]
  enabled: boolean
  fileTree: FileNode[]
  profile: DelphiProfileId
}

export interface ProjectGroup {
  path: string
  directory: string
  name: string
  projects: GroupProject[]
}

function normalize(path: string): string {
  return path.replace(/\//g, '\\').replace(/\\+/g, '\\')
}

function directoryName(path: string): string {
  const normalized = normalize(path)
  return normalized.slice(0, normalized.lastIndexOf('\\'))
}

function baseName(path: string): string {
  return normalize(path).split('\\').pop() ?? path
}

function withoutExtension(path: string): string {
  return baseName(path).replace(/\.(?:dproj|dpr|dpk)$/i, '')
}

function resolveRelative(base: string, value: string): string {
  const clean = value.replace(/&quot;/gi, '"').trim()
  if (/^[A-Za-z]:[\\/]/.test(clean)) return normalize(clean)
  const prefix = normalize(base).split('\\')
  for (const part of normalize(clean).split('\\')) {
    if (!part || part === '.') continue
    if (part === '..') prefix.pop()
    else prefix.push(part)
  }
  return prefix.join('\\')
}

function flatten(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => node.isDirectory ? flatten(node.children ?? []) : [node])
}

function xmlElements(parent: ParentNode, name: string): Element[] {
  return Array.from((parent as Document).getElementsByTagNameNS?.('*', name) ?? [])
}

function projectKind(name: string, sourcePath: string | null, source: string): GroupProjectKind {
  const haystack = `${name} ${sourcePath ?? ''} ${source}`.toLowerCase()
  if (sourcePath?.toLowerCase().endsWith('.dpk') || /^\s*package\b/im.test(source)) return 'package'
  if (/^\s*library\b/im.test(source)) return 'dll'
  if (/\bsvcMgr\b|\bTService\b/i.test(source)) return 'service'
  if (/dunitx|testframework|\btests?\b|\bspecs?\b/i.test(haystack)) return 'tests'
  if (/\btools?\b|\butilities\b|\bauxiliar/i.test(haystack)) return 'tool'
  return 'application'
}

function dependencyTokens(element: Element): string[] {
  const dependency = Array.from(element.children).find((child) => child.localName === 'Dependencies')
  return (dependency?.textContent ?? '').split(/[;,]/).map((item) => item.trim()).filter(Boolean)
}

export async function loadProjectGroup(groupPath: string, xml: string): Promise<ProjectGroup> {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('O arquivo .groupproj possui XML inválido.')
  const groupDirectory = directoryName(groupPath)
  const entries = xmlElements(document, 'Projects').filter((element) => element.hasAttribute('Include'))
  if (entries.length === 0) throw new Error('Nenhum projeto foi encontrado no grupo.')

  const raw = await Promise.all(entries.map(async (element) => {
    const path = resolveRelative(groupDirectory, element.getAttribute('Include') ?? '')
    const directory = directoryName(path)
    const fileTree = await window.api.fs.readProjectTree(directory) as FileNode[]
    const projectXml = await window.api.fs.readFile(path)
    const guid = /<ProjectGuid>\s*([^<]+)\s*<\/ProjectGuid>/i.exec(projectXml)?.[1]?.trim() ?? null
    const files = flatten(fileTree)
    const preferredName = withoutExtension(path).toLowerCase()
    const sourceNode = files.find((file) =>
      /\.(?:dpr|dpk)$/i.test(file.name) && file.name.replace(/\.(?:dpr|dpk)$/i, '').toLowerCase() === preferredName
    ) ?? files.find((file) => /\.(?:dpr|dpk)$/i.test(file.name))
    const source = sourceNode ? await window.api.fs.readFile(sourceNode.path) : ''
    return {
      element,
      path,
      directory,
      name: withoutExtension(path),
      guid,
      sourcePath: sourceNode?.path ?? null,
      kind: projectKind(withoutExtension(path), sourceNode?.path ?? null, source),
      rawDependencies: dependencyTokens(element),
      enabled: true,
      fileTree,
      profile: 'delphi10_13' as const
    }
  }))

  const byGuid = new Map(raw.filter((item) => item.guid).map((item) => [item.guid!.toLowerCase(), item.path]))
  const byName = new Map(raw.flatMap((item) => [
    [item.name.toLowerCase(), item.path] as const,
    [baseName(item.path).toLowerCase(), item.path] as const
  ]))

  let orderedPaths: string[] = []
  const buildTarget = xmlElements(document, 'Target').find((element) => element.getAttribute('Name') === 'Build')
  const callTarget = buildTarget ? xmlElements(buildTarget, 'CallTarget')[0] : undefined
  const targetNames = (callTarget?.getAttribute('Targets') ?? '').split(';').map((item) => item.trim().toLowerCase())
  if (targetNames.length) {
    orderedPaths = targetNames.flatMap((target) => {
      const match = raw.find((item) => item.name.toLowerCase() === target || baseName(item.path).toLowerCase() === target)
      return match ? [match.path] : []
    })
  }
  for (const item of raw) if (!orderedPaths.some((path) => path.toLowerCase() === item.path.toLowerCase())) orderedPaths.push(item.path)

  const projects = orderedPaths.map((path) => raw.find((item) => item.path.toLowerCase() === path.toLowerCase())!)
    .map(({ element: _element, rawDependencies, ...item }) => ({
      ...item,
      dependencies: rawDependencies.flatMap((dependency) => {
        const key = dependency.toLowerCase()
        const resolved = byGuid.get(key) ?? byName.get(key) ?? byName.get(baseName(dependency).toLowerCase())
        return resolved ? [resolved] : []
      })
    }))

  return {
    path: groupPath,
    directory: groupDirectory,
    name: baseName(groupPath).replace(/\.groupproj$/i, ''),
    projects
  }
}

export function groupBuildOrder(group: ProjectGroup): GroupProject[] {
  const enabled = group.projects.filter((project) => project.enabled)
  const enabledPaths = new Set(enabled.map((project) => project.path.toLowerCase()))
  const result: GroupProject[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (project: GroupProject): void => {
    const key = project.path.toLowerCase()
    if (visited.has(key)) return
    if (visiting.has(key)) throw new Error(`Dependência circular envolvendo ${project.name}.`)
    visiting.add(key)
    for (const dependencyPath of project.dependencies) {
      if (!enabledPaths.has(dependencyPath.toLowerCase())) continue
      const dependency = enabled.find((item) => item.path.toLowerCase() === dependencyPath.toLowerCase())
      if (dependency) visit(dependency)
    }
    visiting.delete(key)
    visited.add(key)
    result.push(project)
  }

  for (const project of enabled) visit(project)
  return result
}

export const GROUP_PROJECT_KIND_LABELS: Record<GroupProjectKind, string> = {
  application: 'Aplicação', package: 'Package', service: 'Serviço', dll: 'DLL', tests: 'Testes', tool: 'Ferramenta'
}
