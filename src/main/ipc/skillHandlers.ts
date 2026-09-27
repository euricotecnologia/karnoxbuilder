import { BrowserWindow, dialog, ipcMain } from 'electron'
import { createProjectSkill, getProjectSkillStatus, importProjectSkill } from '../skills/projectSkill'
import { normalizeDelphiProfile } from '../delphi/profiles'

export function registerSkillHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('skill:status', (_event, projectDir: string) => getProjectSkillStatus(projectDir))
  ipcMain.handle('skill:create', (_event, args: { projectDir: string; profile?: string }) =>
    createProjectSkill(args.projectDir, normalizeDelphiProfile(args.profile))
  )
  ipcMain.handle('skill:load', async (_event, args: { projectDir: string; profile?: string }) => {
    const selected = await dialog.showOpenDialog(mainWindow, {
      title: 'Carregar Skill do projeto',
      properties: ['openFile'],
      filters: [
        { name: 'Skill Markdown', extensions: ['md', 'txt'] },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    })
    if (selected.canceled || !selected.filePaths[0]) return null
    return importProjectSkill(args.projectDir, selected.filePaths[0], normalizeDelphiProfile(args.profile))
  })
}
