import { BrowserWindow } from 'electron'
import { registerFsHandlers } from './fsHandlers'
import { registerDbHandlers } from './dbHandlers'
import { registerDelphiHandlers } from './delphiHandlers'
import { registerAiHandlers } from './aiHandlers'
import { registerCompilerHandlers } from './compilerHandlers'
import { registerGitHandlers } from './gitHandlers'
import { registerSkillHandlers } from './skillHandlers'
import { registerLibraryHandlers } from './libraryHandlers'
import { registerLspHandlers } from './lspHandlers'
import { registerDatabaseExplorerHandlers } from './databaseExplorerHandlers'
import { registerPublishHandlers } from './publishHandlers'
import { registerNoCodeHandlers } from './noCodeHandlers'
import { registerProjectHandlers } from './projectHandlers'
import { registerSystemHandlers } from './systemHandlers'

let registered = false

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  if (registered) return
  registered = true

  registerFsHandlers(mainWindow)
  registerDbHandlers()
  registerDelphiHandlers()
  registerAiHandlers(mainWindow)
  registerCompilerHandlers(mainWindow)
  registerGitHandlers()
  registerSkillHandlers(mainWindow)
  registerLibraryHandlers()
  registerLspHandlers(mainWindow)
  registerDatabaseExplorerHandlers()
  registerPublishHandlers(mainWindow)
  registerNoCodeHandlers(mainWindow)
  registerProjectHandlers()
  registerSystemHandlers()
}
