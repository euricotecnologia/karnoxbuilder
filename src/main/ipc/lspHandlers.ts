import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { BrowserWindow, ipcMain } from 'electron'
import { DelphiLspClient, type LspStatus } from '../lsp/delphiLspClient'
import { getSetting } from '../db/repositories/settingsRepo'
import { detectDefaultDelphiInstall, validateDelphiPath } from '../delphi/detect'

let client: DelphiLspClient | null = null
let currentProjectDir: string | null = null
let status: LspStatus = { state: 'stopped', message: 'DelphiLSP ainda não iniciado.' }

function sendStatus(mainWindow: BrowserWindow, next: LspStatus): void {
  status = next
  if (!mainWindow.isDestroyed()) mainWindow.webContents.send('lsp:statusChanged', next)
}

async function stopClient(): Promise<void> {
  const active = client
  client = null
  currentProjectDir = null
  if (active) await active.stop()
}

function findSettingsFile(projectDir: string, projectFile?: string | null): string | null {
  const candidates: string[] = []
  if (projectFile) candidates.push(projectFile.replace(/\.(dproj|dpr)$/i, '.delphilsp.json'))
  try {
    for (const name of readdirSync(projectDir)) {
      if (name.toLowerCase().endsWith('.delphilsp.json')) candidates.push(join(projectDir, name))
    }
  } catch {
    return null
  }
  return candidates.find(existsSync) ?? null
}

export function registerLspHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    'lsp:start',
    async (_event, args: { projectDir: string; projectFile?: string | null; profile: string }) => {
      if (args.profile !== 'delphi10_13') {
        await stopClient()
        const fallback: LspStatus = {
          state: 'fallback',
          message: 'Inteligência Pascal local ativa para este perfil Delphi.'
        }
        sendStatus(mainWindow, fallback)
        return fallback
      }

      const selectedPath = getSetting('delphi_studio_path')
      const install = (selectedPath && validateDelphiPath(selectedPath)) || detectDefaultDelphiInstall()
      const executablePath = install ? join(install.binPath, 'DelphiLSP.exe') : ''
      if (!install || !existsSync(executablePath)) {
        await stopClient()
        const fallback: LspStatus = {
          state: 'fallback',
          message: 'DelphiLSP não encontrado; inteligência Pascal local ativa.'
        }
        sendStatus(mainWindow, fallback)
        return fallback
      }

      if (client?.isReady && currentProjectDir?.toLowerCase() === args.projectDir.toLowerCase()) return status
      await stopClient()
      currentProjectDir = args.projectDir
      client = new DelphiLspClient({
        executablePath,
        projectDir: args.projectDir,
        settingsFile: findSettingsFile(args.projectDir, args.projectFile),
        onStatus: (next) => sendStatus(mainWindow, next),
        onDiagnostics: (params) => {
          if (!mainWindow.isDestroyed()) mainWindow.webContents.send('lsp:diagnostics', params)
        },
        onLog: (message) => {
          if (!mainWindow.isDestroyed()) mainWindow.webContents.send('lsp:log', message)
        }
      })
      return client.start()
    }
  )

  ipcMain.handle('lsp:stop', async () => {
    await stopClient()
    status = { state: 'stopped', message: 'DelphiLSP parado.' }
    return status
  })
  ipcMain.handle('lsp:status', () => status)
  ipcMain.handle('lsp:didOpen', (_event, args: { path: string; text: string; version: number }) => {
    client?.notify('textDocument/didOpen', {
      textDocument: { uri: pathToFileURL(args.path).href, languageId: 'pascal', version: args.version, text: args.text }
    })
  })
  ipcMain.handle('lsp:didChange', (_event, args: { path: string; text: string; version: number }) => {
    client?.notify('textDocument/didChange', {
      textDocument: { uri: pathToFileURL(args.path).href, version: args.version },
      contentChanges: [{ text: args.text }]
    })
  })
  ipcMain.handle('lsp:didSave', (_event, args: { path: string; text?: string }) => {
    client?.notify('textDocument/didSave', {
      textDocument: { uri: pathToFileURL(args.path).href },
      ...(args.text === undefined ? {} : { text: args.text })
    })
  })
  ipcMain.handle('lsp:didClose', (_event, path: string) => {
    client?.notify('textDocument/didClose', { textDocument: { uri: pathToFileURL(path).href } })
  })

  for (const [channel, method] of [
    ['lsp:completion', 'textDocument/completion'],
    ['lsp:hover', 'textDocument/hover'],
    ['lsp:definition', 'textDocument/definition'],
    ['lsp:references', 'textDocument/references']
  ] as const) {
    ipcMain.handle(channel, async (_event, params: unknown) => {
      if (!client?.isReady) return null
      return client.request(method, params)
    })
  }

  mainWindow.once('closed', () => void stopClient())
}
