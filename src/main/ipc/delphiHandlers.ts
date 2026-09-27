import { ipcMain } from 'electron'
import { detectDelphiInstalls, detectDefaultDelphiInstall, validateDelphiPath } from '../delphi/detect'
import { getSetting, setSetting } from '../db/repositories/settingsRepo'

export function registerDelphiHandlers(): void {
  ipcMain.handle('delphi:detectInstalls', () => detectDelphiInstalls())

  ipcMain.handle('delphi:getActiveInstall', () => {
    const savedPath = getSetting('delphi_studio_path')
    const installs = detectDelphiInstalls()
    if (savedPath) {
      const match = installs.find((i) => i.studioPath === savedPath) ?? validateDelphiPath(savedPath)
      if (match) return match
    }
    return detectDefaultDelphiInstall()
  })

  ipcMain.handle('delphi:setActiveInstall', (_e, studioPath: string) => {
    setSetting('delphi_studio_path', studioPath)
  })

  ipcMain.handle('delphi:validatePath', (_e, studioPath: string) => validateDelphiPath(studioPath))
}
