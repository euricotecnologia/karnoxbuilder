import { ipcMain, dialog, BrowserWindow } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { createHash, randomUUID } from 'crypto'
import { join, extname, basename, dirname } from 'path'
import { repairPascalForDfm } from '../ai/pasFixup'
import { normalizeDelphiProfile } from '../delphi/profiles'
import { scanDelphiComponentCatalog } from '../delphi/componentCatalog'
import { applyNoCodeActions, findNoCodeProjectRoot } from '../noCode/noCodeService'

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain'
}

function inferMimeType(filePath: string): string {
  return MIME_BY_EXTENSION[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

const IGNORED_ENTRIES = new Set(['__history', '__recovery', '.dproj.local', 'node_modules', '.git'])
const IGNORED_EXTENSIONS = new Set(['.dcu', '.identcache', '.local', '.tvsconfig'])
const DFM_BACKUP_ROOT = 'C:\\KarnoX\\Builder\\designer-backups'

function dfmBackupDirectory(filePath: string): string {
  const hash = createHash('sha256').update(filePath.toLowerCase()).digest('hex').slice(0, 20)
  return join(DFM_BACKUP_ROOT, hash)
}

function backupDfm(filePath: string): void {
  if (!existsSync(filePath) || extname(filePath).toLowerCase() !== '.dfm') return
  const directory = dfmBackupDirectory(filePath)
  mkdirSync(directory, { recursive: true })
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID()}.dfm`
  copyFileSync(filePath, join(directory, name))
}

function buildTree(dirPath: string): FileNode[] {
  let entries: string[]
  try {
    entries = readdirSync(dirPath)
  } catch {
    return []
  }

  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (IGNORED_ENTRIES.has(entry)) continue
    const ext = entry.slice(entry.lastIndexOf('.'))
    if (IGNORED_EXTENSIONS.has(ext)) continue

    const fullPath = join(dirPath, entry)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      nodes.push({ name: entry, path: fullPath, isDirectory: true, children: buildTree(fullPath) })
    } else {
      nodes.push({ name: entry, path: fullPath, isDirectory: false })
    }
  }

  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return nodes
}

export function registerFsHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('fs:readProjectTree', (_e, projectDir: string) => buildTree(projectDir))

  ipcMain.handle('fs:readFile', (_e, filePath: string) => readFileSync(filePath, 'utf-8'))

  ipcMain.handle('fs:writeFile', (_e, filePath: string, content: string) => {
    if (extname(filePath).toLowerCase() === '.dfm' && existsSync(filePath)) {
      const current = readFileSync(filePath, 'utf-8')
      if (current !== content) backupDfm(filePath)
    }
    writeFileSync(filePath, content, 'utf-8')
  })

  ipcMain.handle('fs:syncDfmPas', (_e, args: { dfmPath: string; profile?: string; pasContent?: string }) => {
    if (extname(args.dfmPath).toLowerCase() !== '.dfm') throw new Error('A sincronização exige um arquivo DFM.')
    const pasPath = args.dfmPath.replace(/\.dfm$/i, '.pas')
    if (!existsSync(pasPath)) return { changed: false, pasPath, content: null, addedUnits: [], addedFields: [], addedEvents: [], addedMethods: [], fixedProperties: [], addedVariables: [] }

    const profile = normalizeDelphiProfile(args.profile)
    const encoding: BufferEncoding = profile === 'delphi7_2007' ? 'latin1' : 'utf-8'
    const diskContent = readFileSync(pasPath, encoding)
    const sourceContent = typeof args.pasContent === 'string' ? args.pasContent : diskContent
    const dfmContent = readFileSync(args.dfmPath, encoding)
    const catalogUnits = Object.fromEntries(scanDelphiComponentCatalog(dirname(args.dfmPath)).map((item) => [item.className, item.unitName]))
    const repair = repairPascalForDfm(sourceContent, dfmContent, profile, catalogUnits)
    const noCodeContent = applyNoCodeActions(repair.content, findNoCodeProjectRoot(args.dfmPath), args.dfmPath, profile)
    if (noCodeContent !== diskContent) writeFileSync(pasPath, noCodeContent, encoding)
    return { ...repair, content: noCodeContent, changed: noCodeContent !== diskContent, pasPath }
  })

  ipcMain.handle('fs:restoreLastDfmBackup', (_e, filePath: string) => {
    try {
      if (extname(filePath).toLowerCase() !== '.dfm') throw new Error('O arquivo selecionado não é um DFM.')
      const directory = dfmBackupDirectory(filePath)
      const latest = existsSync(directory)
        ? readdirSync(directory).filter((name) => name.endsWith('.dfm')).sort().at(-1)
        : undefined
      if (!latest) return { success: false as const, error: 'Nenhuma gravação anterior foi encontrada.' }
      copyFileSync(join(directory, latest), filePath)
      return { success: true as const, content: readFileSync(filePath, 'utf-8') }
    } catch (error) {
      return { success: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('fs:selectDirectory', async (_e, title: string) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('fs:selectFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Anexar arquivos',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Imagens e PDF', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'] },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    })
    if (result.canceled) return []
    return result.filePaths
  })

  ipcMain.handle('fs:selectDatabaseFile', async (_e, title: string, extensions: string[]) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      properties: ['openFile'],
      filters: [{ name: 'Arquivos de banco de dados', extensions }]
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('fs:createSqliteDatabase', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Criar banco de dados SQLite',
      defaultPath: 'database.sqlite',
      filters: [{ name: 'Banco SQLite', extensions: ['sqlite', 'sqlite3', 'db'] }]
    })
    if (result.canceled || !result.filePath) return null
    if (!existsSync(result.filePath)) writeFileSync(result.filePath, Buffer.alloc(0))
    return result.filePath
  })

  ipcMain.handle('fs:selectNewFirebirdDatabase', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Escolher local para o novo banco Firebird',
      defaultPath: 'database.fdb',
      filters: [{ name: 'Banco Firebird', extensions: ['fdb', 'gdb'] }]
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle('fs:saveFileDialog', async (_e, defaultPath: string) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar como',
      defaultPath
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle('fs:readFileBase64', (_e, filePath: string) => {
    const buffer = readFileSync(filePath)
    return {
      name: basename(filePath),
      mimeType: inferMimeType(filePath),
      sizeBytes: buffer.length,
      dataBase64: buffer.toString('base64')
    }
  })
}
