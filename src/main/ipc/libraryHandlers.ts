import { ipcMain } from 'electron'
import { getSetting } from '../db/repositories/settingsRepo'
import {
  listLibraryPaths,
  removeLibraryPath,
  setLibraryPathEnabled,
  upsertLibraryPath,
  type LibraryPathType,
  type LibraryPlatform
} from '../db/repositories/libraryPathsRepo'
import { detectDefaultDelphiInstall, validateDelphiPath } from '../delphi/detect'
import { importDelphiLibraryPaths, validateLibraryPaths } from '../delphi/libraryPaths'
import { scanDelphiComponentCatalog } from '../delphi/componentCatalog'

function activeInstall() {
  const savedPath = getSetting('delphi_studio_path')
  return savedPath ? validateDelphiPath(savedPath) : detectDefaultDelphiInstall()
}

function validateInput(input: { projectPath: string; platform: string; pathType: string; path: string }): void {
  if (!input.projectPath || !input.path.trim()) throw new Error('Informe o projeto e a pasta da biblioteca.')
  if (!['Win32', 'Win64', 'All'].includes(input.platform)) throw new Error('Plataforma inválida.')
  if (!['unit', 'include', 'resource', 'object', 'runtime'].includes(input.pathType)) throw new Error('Tipo de biblioteca inválido.')
  if (/["\r\n]/.test(input.path)) throw new Error('O caminho contém caracteres inválidos.')
}

export function registerLibraryHandlers(): void {
  ipcMain.handle('libraries:list', (_event, projectPath: string) => listLibraryPaths(projectPath))
  ipcMain.handle('libraries:componentCatalog', (_event, args: { projectPath: string; platform?: 'Win32' | 'Win64'; config?: 'Debug' | 'Release' }) => scanDelphiComponentCatalog(args.projectPath, args.platform, args.config))
  ipcMain.handle('libraries:add', (_event, input: {
    projectPath: string
    platform: LibraryPlatform
    pathType: LibraryPathType
    path: string
  }) => {
    validateInput(input)
    return upsertLibraryPath({ ...input, path: input.path.trim(), source: 'manual', enabled: true })
  })
  ipcMain.handle('libraries:setEnabled', (_event, id: string, enabled: boolean) => setLibraryPathEnabled(id, enabled))
  ipcMain.handle('libraries:remove', (_event, id: string) => removeLibraryPath(id))
  ipcMain.handle('libraries:importDelphi', (_event, projectPath: string) => {
    const install = activeInstall()
    if (!install) throw new Error('Selecione uma instalação do Delphi antes de importar os caminhos.')
    return importDelphiLibraryPaths(projectPath, install)
  })
  ipcMain.handle('libraries:validate', (_event, args: {
    projectPath: string
    platform: 'Win32' | 'Win64'
    config: 'Debug' | 'Release'
  }) => validateLibraryPaths(listLibraryPaths(args.projectPath), activeInstall(), args.platform, args.config))
}
