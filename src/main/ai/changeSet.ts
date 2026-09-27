import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { createHash, randomUUID } from 'crypto'
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'path'
import type { ProjectGenerationResult, TokenUsage } from './types'
import type { ProjectContextSummary } from './projectContext'
import type { DelphiProfileId } from '../delphi/profiles'

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
  usage?: TokenUsage
  contextSummary: ProjectContextSummary
  isNewProject: boolean
  files: FileChangePreview[]
}

interface PendingChangeSet extends ChangeSetPreview {
  dprojRelativePath: string
  encoding: BufferEncoding
}

interface CheckpointFile {
  relativePath: string
  existed: boolean
}

interface CheckpointManifest {
  id: string
  projectDir: string
  projectName: string
  createdAt: string
  files: CheckpointFile[]
}

const DATA_ROOT = 'C:\\KarnoX\\Builder'
const CHECKPOINT_ROOT = join(DATA_ROOT, 'checkpoints')
const pendingChangeSets = new Map<string, PendingChangeSet>()

function safeTarget(projectDir: string, relativePath: string): string {
  if (!projectDir || !isAbsolute(projectDir) || isAbsolute(relativePath)) {
    throw new Error('Caminho de projeto inválido.')
  }
  const root = resolve(projectDir)
  const target = resolve(root, normalize(relativePath))
  const inside = relative(root, target)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`Arquivo fora do projeto: ${relativePath}`)
  }
  const allowed = new Set(['.pas', '.dfm', '.dpr', '.dproj'])
  if (!allowed.has(extname(target).toLowerCase())) {
    throw new Error(`Tipo de arquivo não permitido: ${relativePath}`)
  }
  return target
}

function countLines(content: string): number {
  if (!content) return 0
  return content.replace(/\r\n/g, '\n').split('\n').length
}

function diffCounts(oldContent: string | null, newContent: string): { additions: number; deletions: number } {
  if (oldContent === null) return { additions: countLines(newContent), deletions: 0 }
  const oldLines = oldContent.replace(/\r\n/g, '\n').split('\n')
  const newLines = newContent.replace(/\r\n/g, '\n').split('\n')
  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++
  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix++
  return {
    additions: Math.max(0, newLines.length - prefix - suffix),
    deletions: Math.max(0, oldLines.length - prefix - suffix)
  }
}

export function createPendingChangeSet(
  projectDir: string,
  result: ProjectGenerationResult,
  files: Map<string, string>,
  dprojRelativePath: string,
  contextSummary: ProjectContextSummary,
  profileId: DelphiProfileId = 'delphi10_13'
): ChangeSetPreview {
  const encoding: BufferEncoding = profileId === 'delphi7_2007' ? 'latin1' : 'utf-8'
  const changes: FileChangePreview[] = []
  for (const [relativePath, newContent] of files) {
    const target = safeTarget(projectDir, relativePath)
    const oldContent = existsSync(target) ? readFileSync(target, encoding) : null
    if (oldContent === newContent) continue
    const counts = diffCounts(oldContent, newContent)
    changes.push({
      relativePath,
      kind: oldContent === null ? 'added' : 'modified',
      ...counts,
      oldContent,
      newContent
    })
  }

  const id = randomUUID()
  const preview: PendingChangeSet = {
    id,
    projectName: result.projectName,
    projectDir,
    explanation: result.explanation,
    usage: result.usage,
    contextSummary,
    isNewProject:
      !existsSync(projectDir) ||
      !readdirSync(projectDir).some((name) => ['.dproj', '.dpr'].includes(extname(name).toLowerCase())),
    files: changes,
    dprojRelativePath,
    encoding
  }
  pendingChangeSets.set(id, preview)
  return preview
}

function checkpointDirectory(projectDir: string, checkpointId: string): string {
  const projectHash = createHash('sha256').update(resolve(projectDir).toLowerCase()).digest('hex').slice(0, 16)
  return join(CHECKPOINT_ROOT, projectHash, checkpointId)
}

function writeCheckpoint(changeSet: PendingChangeSet, selected: FileChangePreview[]): CheckpointManifest {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID()}`
  const directory = checkpointDirectory(changeSet.projectDir, id)
  const filesDirectory = join(directory, 'files')
  mkdirSync(filesDirectory, { recursive: true })

  const files = selected.map((change) => {
    const source = safeTarget(changeSet.projectDir, change.relativePath)
    const existed = existsSync(source)
    if (existed) {
      const backup = join(filesDirectory, change.relativePath)
      mkdirSync(dirname(backup), { recursive: true })
      copyFileSync(source, backup)
    }
    return { relativePath: change.relativePath, existed }
  })

  const manifest: CheckpointManifest = {
    id,
    projectDir: resolve(changeSet.projectDir),
    projectName: changeSet.projectName,
    createdAt: new Date().toISOString(),
    files
  }
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  return manifest
}

function restoreManifest(manifest: CheckpointManifest): void {
  const directory = checkpointDirectory(manifest.projectDir, manifest.id)
  for (const file of manifest.files) {
    const target = safeTarget(manifest.projectDir, file.relativePath)
    if (file.existed) {
      const backup = join(directory, 'files', file.relativePath)
      if (!existsSync(backup)) throw new Error(`Backup ausente: ${file.relativePath}`)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(backup, target)
    } else if (existsSync(target)) {
      rmSync(target)
    }
  }
}

export function applyPendingChangeSet(
  id: string,
  selectedPaths: string[]
): { dprojPath: string; checkpointId: string; changedPaths: string[] } {
  const changeSet = pendingChangeSets.get(id)
  if (!changeSet) throw new Error('Esta revisão expirou. Gere as alterações novamente.')

  const selectedSet = new Set(selectedPaths)
  const selected = changeSet.files.filter((file) => selectedSet.has(file.relativePath))
  if (selected.length === 0) throw new Error('Selecione pelo menos um arquivo para aplicar.')
  if (selected.length !== selectedSet.size) throw new Error('A seleção contém um arquivo inválido.')
  if (changeSet.isNewProject) {
    const required = Array.from(new Set([`${changeSet.projectName}.dpr`, changeSet.dprojRelativePath]))
    if (required.some((path) => !selectedSet.has(path))) {
      throw new Error('Em um projeto novo, os arquivos .dpr e .dproj são obrigatórios.')
    }
  }

  mkdirSync(changeSet.projectDir, { recursive: true })
  const manifest = writeCheckpoint(changeSet, selected)
  try {
    for (const change of selected) {
      const target = safeTarget(changeSet.projectDir, change.relativePath)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, change.newContent, changeSet.encoding)
      if (!existsSync(target) || statSync(target).size === 0) {
        throw new Error(`Falha ao gravar ${change.relativePath}.`)
      }
    }
  } catch (error) {
    restoreManifest(manifest)
    throw error
  }

  pendingChangeSets.delete(id)
  return {
    dprojPath: join(changeSet.projectDir, changeSet.dprojRelativePath),
    checkpointId: manifest.id,
    changedPaths: selected.map((file) => safeTarget(changeSet.projectDir, file.relativePath))
  }
}

export function discardPendingChangeSet(id: string): void {
  pendingChangeSets.delete(id)
}

export function restoreCheckpoint(checkpointId: string, projectDir: string): string[] {
  const directory = checkpointDirectory(projectDir, checkpointId)
  const manifestPath = join(directory, 'manifest.json')
  if (!existsSync(manifestPath)) throw new Error('Ponto de restauração não encontrado.')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as CheckpointManifest
  if (resolve(manifest.projectDir).toLowerCase() !== resolve(projectDir).toLowerCase()) {
    throw new Error('O ponto de restauração pertence a outro projeto.')
  }
  restoreManifest(manifest)
  return manifest.files.map((file) => safeTarget(projectDir, file.relativePath))
}

export function findExistingProjectName(projectDir: string): string | null {
  if (!existsSync(projectDir)) return null
  const entries = readdirSync(projectDir)
  const projectFile = entries.find((name) => extname(name).toLowerCase() === '.dproj')
    ?? entries.find((name) => extname(name).toLowerCase() === '.dpr')
  return projectFile ? basename(projectFile, extname(projectFile)) : null
}

export function readExistingProjectGuid(projectDir: string, projectName: string): string | undefined {
  const path = join(projectDir, `${projectName}.dproj`)
  if (!existsSync(path)) return undefined
  return readFileSync(path, 'utf-8').match(/<ProjectGuid>\s*([^<]+)\s*<\/ProjectGuid>/i)?.[1].trim()
}
