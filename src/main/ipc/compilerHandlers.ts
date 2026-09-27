import { ipcMain, BrowserWindow } from 'electron'
import { compileProject, runExecutable, type BuildPlatform, type BuildConfig } from '../delphi/compiler'
import { detectDefaultDelphiInstall, validateDelphiPath } from '../delphi/detect'
import { getSetting } from '../db/repositories/settingsRepo'
import { normalizeDelphiProfile } from '../delphi/profiles'
import { getCompilerLibraryPaths } from '../delphi/libraryPaths'

export function registerCompilerHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    'compiler:build',
    async (
      _e,
      args: {
        dprojPath: string
        projectDir: string
        projectName: string
        platform: BuildPlatform
        config: BuildConfig
        profile?: string
        rebuild?: boolean
      }
    ) => {
      const onOutput = (chunk: string): void => {
        mainWindow.webContents.send('compiler:output', chunk)
      }
      const selectedPath = getSetting('delphi_studio_path')
      const install = selectedPath ? validateDelphiPath(selectedPath) : detectDefaultDelphiInstall()
      const libraryPaths = getCompilerLibraryPaths(args.projectDir, args.platform, args.config, install)
      const activePathCount = Object.values(libraryPaths).reduce((total, paths) => total + paths.length, 0)
      if (activePathCount > 0) onOutput(`${activePathCount} caminho(s) de bibliotecas e componentes aplicado(s).\n`)

      const result = await compileProject(
        args.dprojPath,
        args.projectDir,
        args.projectName,
        args.platform,
        args.config,
        normalizeDelphiProfile(args.profile),
        onOutput,
        install,
        libraryPaths,
        args.rebuild === true
      )

      mainWindow.webContents.send('compiler:done', result)
      return result
    }
  )

  ipcMain.handle('compiler:run', (_e, args: {
    exePath: string
    projectDir: string
    platform: BuildPlatform
    config: BuildConfig
  }) => {
    const selectedPath = getSetting('delphi_studio_path')
    const install = selectedPath ? validateDelphiPath(selectedPath) : detectDefaultDelphiInstall()
    const paths = getCompilerLibraryPaths(args.projectDir, args.platform, args.config, install)
    runExecutable(args.exePath, (chunk) => mainWindow.webContents.send('compiler:output', chunk), paths.runtime)
  })
}
