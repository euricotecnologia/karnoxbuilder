import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase } from './db/database'
import { registerIpcHandlers } from './ipc'

const FIXED_RUNTIME_DIR = 'C:\\KarnoX\\Builder\\Runtime'
const CHROMIUM_SESSION_DIR = join(FIXED_RUNTIME_DIR, 'Chromium-v1')

// O cache do Chromium é separado dos dados e configurações da IDE. Este código
// precisa executar antes do evento ready para impedir que uma entrada de cache
// corrompida no perfil padrão do Windows bloqueie a abertura da aplicação.
mkdirSync(CHROMIUM_SESSION_DIR, { recursive: true })
app.setPath('sessionData', CHROMIUM_SESSION_DIR)

// O renderer de desenvolvimento já é servido pelo Vite. Desabilitar seu cache
// evita referências antigas a arquivos temporários após recompilações e quedas.
if (!app.isPackaged) app.commandLine.appendSwitch('disable-http-cache')

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Em produção, a janela só pode navegar dentro do próprio app empacotado (file://):
  // impede que uma navegação (ex: link malicioso vindo de conteúdo externo) tire o
  // usuário do app ou carregue algo fora do pacote assinado/verificado.
  const allowedNavigationOrigin =
    is.dev && process.env['ELECTRON_RENDERER_URL'] ? new URL(process.env['ELECTRON_RENDERER_URL']).origin : null

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (allowedNavigationOrigin) {
      if (new URL(url).origin !== allowedNavigationOrigin) event.preventDefault()
      return
    }
    if (!url.startsWith('file://')) event.preventDefault()
  })

  // DevTools expõe o processo de renderização e facilita engenharia reversa do app
  // empacotado; em desenvolvimento continua liberado normalmente.
  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const isDevToolsShortcut =
        input.key === 'F12' ||
        (input.control && input.shift && ['I', 'J', 'C'].includes(input.key.toUpperCase()))
      if (isDevToolsShortcut) event.preventDefault()
    })
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools()
    })
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerIpcHandlers(mainWindow)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.karnox.builder')

  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  initDatabase()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})
