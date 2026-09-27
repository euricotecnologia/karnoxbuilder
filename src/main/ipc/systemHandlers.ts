import { app, ipcMain, shell } from 'electron'

// Lista fechada de URLs que a UI pode pedir para abrir no navegador padrão.
const ALLOWED_EXTERNAL_URLS = new Set(['https://github.com/euricotecnologia/karnoxbuilder'])

export function registerSystemHandlers(): void {
  ipcMain.handle('system:getVersion', () => app.getVersion())
  ipcMain.handle('system:openExternal', (_event, url: string) => {
    if (!ALLOWED_EXTERNAL_URLS.has(url)) throw new Error('URL não autorizada.')
    return shell.openExternal(url)
  })
}
