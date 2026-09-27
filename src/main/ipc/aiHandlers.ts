import { ipcMain, BrowserWindow } from 'electron'
import { buildProvider } from '../ai/providerFactory'
import { generateProject } from '../ai/promptPipeline'
import { normalizeDelphiProfile } from '../delphi/profiles'
import { addPromptHistory, updatePromptHistory } from '../db/repositories/promptHistoryRepo'
import { PROVIDER_PRESETS, getPreset } from '../ai/providerPresets'
import { fetchModelList } from '../ai/modelCatalog'
import { getAiProviderRaw, getDecryptedApiKey } from '../db/repositories/aiProvidersRepo'
import {
  describeError,
  getErrorStatus,
  getRetryAfterMs,
  isAbortError,
  isConnectionError,
  isRetryableProviderError
} from '../ai/errorUtils'
import type { AttachmentInput } from '../ai/types'
import {
  applyPendingChangeSet,
  discardPendingChangeSet,
  restoreCheckpoint
} from '../ai/changeSet'

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      },
      { once: true }
    )
  })
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new DOMException('The operation was aborted.', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

let currentGenerationController: AbortController | null = null
let currentGhostController: AbortController | null = null

export function registerAiHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('ai:presets', () => PROVIDER_PRESETS)

  ipcMain.handle('ai:ghostComplete', async (_e, args: { prefix: string; suffix: string; providerId: string }) => {
    // Cada nova sugestão enquanto o usuário digita cancela a anterior: só a
    // mais recente importa, e isso evita gastar tokens com sugestões obsoletas.
    currentGhostController?.abort()
    const controller = new AbortController()
    currentGhostController = controller
    try {
      const { provider, model } = buildProvider(args.providerId)
      if (!provider.completeText) return { ok: false as const, message: 'Este provedor não suporta completação inline.' }
      const completion = await provider.completeText(args.prefix, args.suffix, model, controller.signal)
      return { ok: true as const, completion: completion.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '') }
    } catch (err) {
      if (isAbortError(err)) return { ok: false as const, message: 'cancelado' }
      return { ok: false as const, message: describeError(err) }
    } finally {
      if (currentGhostController === controller) currentGhostController = null
    }
  })

  ipcMain.handle('ai:listModels', async (_e, args: { baseUrl: string; apiKey?: string }) => {
    try {
      const models = await fetchModelList(args.baseUrl, args.apiKey)
      return { ok: true as const, models }
    } catch (err) {
      return { ok: false as const, message: describeError(err) }
    }
  })

  ipcMain.handle('ai:listModelsForProvider', async (_e, providerId: string) => {
    try {
      const row = getAiProviderRaw(providerId)
      if (!row) return { ok: false as const, message: 'Provedor não encontrado.' }

      const preset = getPreset(row.kind)
      const baseUrl = row.base_url || preset.defaultBaseUrl
      if (!baseUrl) return { ok: false as const, message: 'Este provedor não expõe uma lista de modelos.' }

      const apiKey = getDecryptedApiKey(providerId)
      const models = await fetchModelList(baseUrl, apiKey)
      return { ok: true as const, models }
    } catch (err) {
      return { ok: false as const, message: describeError(err) }
    }
  })

  ipcMain.handle('ai:testConnection', async (_e, providerId: string) => {
    try {
      const { provider, model } = buildProvider(providerId)
      return await provider.testConnection(model)
    } catch (err) {
      return { ok: false, message: describeError(err) }
    }
  })

  ipcMain.handle('ai:cancelGeneration', () => {
    const controller = currentGenerationController
    if (!controller || controller.signal.aborted) return false
    controller.abort()
    mainWindow.webContents.send('ai:progress', 'Cancelando geração...')
    return true
  })

  ipcMain.handle(
    'ai:applyChangeSet',
    (_e, args: { changeSetId: string; selectedPaths: string[] }) => {
      try {
        return { success: true as const, ...applyPendingChangeSet(args.changeSetId, args.selectedPaths) }
      } catch (err) {
        return { success: false as const, error: describeError(err) }
      }
    }
  )

  ipcMain.handle('ai:discardChangeSet', (_e, changeSetId: string) => {
    discardPendingChangeSet(changeSetId)
    return { success: true as const }
  })

  ipcMain.handle(
    'ai:restoreCheckpoint',
    (_e, args: { checkpointId: string; projectDir: string }) => {
      try {
        return {
          success: true as const,
          changedPaths: restoreCheckpoint(args.checkpointId, args.projectDir)
        }
      } catch (err) {
        return { success: false as const, error: describeError(err) }
      }
    }
  )

  ipcMain.handle(
    'ai:generateProject',
    async (
      _e,
      args: {
        providerId: string
        prompt: string
        projectDir: string
        projectId: string | null
        profile?: string
        attachments?: AttachmentInput[]
      }
    ) => {
      const historyId = addPromptHistory(args.prompt, args.projectId)
      const controller = new AbortController()
      currentGenerationController = controller

      const onProgress = (text: string): void => {
        if (!controller.signal.aborted) {
          mainWindow.webContents.send('ai:progress', text)
        }
      }

      onProgress('Enviando prompt para a IA...')

      const attempt = (): ReturnType<typeof generateProject> =>
        generateProject(
          args.providerId,
          args.prompt,
          args.projectDir,
          normalizeDelphiProfile(args.profile),
          args.attachments ?? [],
          onProgress,
          controller.signal
        )

      try {
        const executeWithRetry = async (): ReturnType<typeof attempt> => {
          let lastError: unknown

          for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber++) {
            try {
              return await abortable(attempt(), controller.signal)
            } catch (err) {
              lastError = err
              if (isAbortError(err) || controller.signal.aborted) throw err

              const retryableProviderError = isRetryableProviderError(err)
              if (!isConnectionError(err) && !retryableProviderError) throw err
              if (attemptNumber === 3) throw err

              const status = getErrorStatus(err)
              const fallbackDelay = status === 429 ? (attemptNumber === 1 ? 8000 : 20_000) : 2500
              const waitMs = getRetryAfterMs(err) ?? fallbackDelay
              const waitSeconds = Math.max(1, Math.ceil(waitMs / 1000))
              onProgress(
                status === 429
                  ? `Limite temporário do provedor. Nova tentativa em ${waitSeconds}s (${attemptNumber + 1}/3)...`
                  : `Provedor indisponível. Nova tentativa em ${waitSeconds}s (${attemptNumber + 1}/3)...`
              )
              await delay(waitMs, controller.signal)
            }
          }

          throw lastError
        }

        const outcome = await executeWithRetry()

        const { result, changeSet } = outcome
        updatePromptHistory(historyId, 'success', result.explanation)
        onProgress('Alterações preparadas para sua revisão.')
        return { success: true as const, result, changeSet }
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) {
          updatePromptHistory(historyId, 'error', 'Cancelado pelo usuário.')
          mainWindow.webContents.send('ai:progress', 'Geração cancelada.')
          return { success: false as const, cancelled: true as const, error: 'Geração cancelada.' }
        }

        const message = describeError(err)
        updatePromptHistory(historyId, 'error', message)
        onProgress(`Erro: ${message}`)
        return { success: false as const, error: message }
      } finally {
        if (currentGenerationController === controller) {
          currentGenerationController = null
        }
      }
    }
  )
}
