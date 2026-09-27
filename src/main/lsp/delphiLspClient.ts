import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { pathToFileURL } from 'url'

export type LspState = 'stopped' | 'starting' | 'ready' | 'fallback' | 'error'

export interface LspStatus {
  state: LspState
  message: string
  executablePath?: string
  projectDir?: string
}

type JsonRpcMessage = {
  jsonrpc: '2.0'
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

export interface DelphiLspClientOptions {
  executablePath: string
  projectDir: string
  settingsFile?: string | null
  onStatus: (status: LspStatus) => void
  onDiagnostics: (params: unknown) => void
  onLog?: (message: string) => void
}

export class DelphiLspClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private input = Buffer.alloc(0)
  private nextId = 1
  private pending = new Map<number | string, PendingRequest>()
  private ready = false
  private stopping = false

  constructor(private readonly options: DelphiLspClientOptions) {}

  get isReady(): boolean {
    return this.ready
  }

  async start(): Promise<LspStatus> {
    this.options.onStatus({
      state: 'starting',
      message: 'Iniciando DelphiLSP...',
      executablePath: this.options.executablePath,
      projectDir: this.options.projectDir
    })

    this.child = spawn(this.options.executablePath, [], {
      cwd: this.options.projectDir,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child.stdout.on('data', (chunk: Buffer) => this.receive(chunk))
    this.child.stderr.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8').trim()
      if (message) this.options.onLog?.(message)
    })
    this.child.once('error', (error) => this.fail(`Não foi possível iniciar o DelphiLSP: ${error.message}`))
    this.child.once('exit', (code) => {
      this.ready = false
      this.rejectPending(new Error(`DelphiLSP foi encerrado (código ${code ?? 'desconhecido'}).`))
      if (!this.stopping) this.fail(`DelphiLSP foi encerrado inesperadamente (código ${code ?? 'desconhecido'}).`)
    })

    try {
      await this.request(
        'initialize',
        {
          processId: process.pid,
          rootUri: pathToFileURL(this.options.projectDir).href,
          workspaceFolders: [
            { uri: pathToFileURL(this.options.projectDir).href, name: this.options.projectDir.split(/[\\/]/).pop() }
          ],
          capabilities: {
            workspace: { configuration: true, workspaceFolders: true },
            textDocument: {
              synchronization: { didSave: true, dynamicRegistration: false },
              completion: { completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'] } },
              hover: { contentFormat: ['markdown', 'plaintext'] },
              definition: { linkSupport: true },
              publishDiagnostics: { relatedInformation: true }
            }
          },
          initializationOptions: {
            serverType: 'controller',
            agentCount: 2,
            returnDccFlags: false,
            returnHoverModel: false,
            storeProjectSettings: false,
            enableFileWatcher: true
          }
        },
        45_000
      )
      this.notify('initialized', {})
      if (this.options.settingsFile) {
        this.notify('workspace/didChangeConfiguration', {
          settings: { settingsFile: pathToFileURL(this.options.settingsFile).href }
        })
      }
      this.ready = true
      const status: LspStatus = {
        state: 'ready',
        message: this.options.settingsFile ? 'DelphiLSP ativo' : 'DelphiLSP ativo (configuração automática)',
        executablePath: this.options.executablePath,
        projectDir: this.options.projectDir
      }
      this.options.onStatus(status)
      return status
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.stop(false)
      return this.fail(`Falha ao inicializar DelphiLSP: ${message}`)
    }
  }

  request(method: string, params: unknown, timeoutMs = 20_000): Promise<unknown> {
    if (!this.child || this.child.killed) return Promise.reject(new Error('DelphiLSP não está em execução.'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Tempo esgotado na operação ${method}.`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.write({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: unknown): void {
    if (!this.child || this.child.killed) return
    this.write({ jsonrpc: '2.0', method, params })
  }

  async stop(graceful = true): Promise<void> {
    if (!this.child) return
    this.stopping = true
    const child = this.child
    if (graceful && this.ready && !child.killed) {
      try {
        await this.request('shutdown', null, 3_000)
        this.notify('exit', null)
      } catch {
        // O encerramento forçado abaixo garante que não sobrem agentes do servidor.
      }
    }
    this.ready = false
    this.child = null
    this.rejectPending(new Error('DelphiLSP encerrado.'))
    if (!child.killed) child.kill()
    this.options.onStatus({ state: 'stopped', message: 'DelphiLSP parado.' })
  }

  private receive(chunk: Buffer): void {
    this.input = Buffer.concat([this.input, chunk])
    while (true) {
      const headerEnd = this.input.indexOf('\r\n\r\n')
      if (headerEnd < 0) return
      const header = this.input.subarray(0, headerEnd).toString('ascii')
      const match = /content-length:\s*(\d+)/i.exec(header)
      if (!match) {
        this.input = this.input.subarray(headerEnd + 4)
        continue
      }
      const length = Number(match[1])
      const bodyStart = headerEnd + 4
      if (this.input.length < bodyStart + length) return
      const body = this.input.subarray(bodyStart, bodyStart + length).toString('utf8')
      this.input = this.input.subarray(bodyStart + length)
      try {
        this.handle(JSON.parse(body) as JsonRpcMessage)
      } catch (error) {
        this.options.onLog?.(`Resposta inválida do DelphiLSP: ${String(error)}`)
      }
    }
  }

  private handle(message: JsonRpcMessage): void {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`))
      else pending.resolve(message.result)
      return
    }
    if (message.method === 'textDocument/publishDiagnostics') {
      this.options.onDiagnostics(message.params)
      return
    }
    if (message.method === 'window/logMessage' || message.method === 'window/showMessage' || message.method === '$/logTrace') {
      const params = message.params as { message?: string } | undefined
      if (params?.message) this.options.onLog?.(params.message)
    }
    if (message.id !== undefined && message.method) this.answerServerRequest(message)
  }

  private answerServerRequest(message: JsonRpcMessage): void {
    let result: unknown = null
    if (message.method === 'workspace/workspaceFolders') {
      result = [{ uri: pathToFileURL(this.options.projectDir).href, name: this.options.projectDir.split(/[\\/]/).pop() }]
    } else if (message.method === 'workspace/configuration') {
      const items = (message.params as { items?: unknown[] } | undefined)?.items ?? []
      result = items.map(() => null)
    }
    this.write({ jsonrpc: '2.0', id: message.id, result })
  }

  private write(message: JsonRpcMessage): void {
    if (!this.child || this.child.killed) return
    const json = JSON.stringify(message)
    const payload = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`
    this.child.stdin.write(payload, 'utf8')
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private fail(message: string): LspStatus {
    const status: LspStatus = {
      state: 'error',
      message,
      executablePath: this.options.executablePath,
      projectDir: this.options.projectDir
    }
    this.options.onStatus(status)
    return status
  }
}
