import { ipcMain } from 'electron'
import { createGitCommit, getGitStatus, initializeGit } from '../git/gitService'

export function registerGitHandlers(): void {
  ipcMain.handle('git:status', (_event, projectDir: string) => getGitStatus(projectDir))
  ipcMain.handle('git:init', async (_event, projectDir: string) => {
    try {
      await initializeGit(projectDir)
      return { success: true as const }
    } catch (error) {
      return { success: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle('git:commit', async (_event, args: { projectDir: string; message: string }) => {
    try {
      return { success: true as const, output: await createGitCommit(args.projectDir, args.message) }
    } catch (error) {
      return { success: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
