import { ipcMain } from 'electron'
import { getSetting, setSetting, getAllSettings } from '../db/repositories/settingsRepo'
import {
  listAiProviders,
  upsertAiProvider,
  deleteAiProvider
} from '../db/repositories/aiProvidersRepo'
import { listRecentProjects, touchProject, removeProject, getProjectDelphiProfile, setProjectDelphiProfile } from '../db/repositories/projectsRepo'
import { normalizeDelphiProfile } from '../delphi/profiles'
import { listPromptHistory } from '../db/repositories/promptHistoryRepo'
import { listSuggestions, addSuggestion, removeSuggestion } from '../db/repositories/suggestionsRepo'
import { getPreset } from '../ai/providerPresets'
import { listDatabaseProfiles, upsertDatabaseProfile } from '../db/repositories/databaseProfilesRepo'

export function registerDbHandlers(): void {
  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => setSetting(key, value))
  ipcMain.handle('settings:getAll', () => getAllSettings())

  ipcMain.handle('databaseProfiles:list', () => listDatabaseProfiles())
  ipcMain.handle('databaseProfiles:upsert', (_e, input) => upsertDatabaseProfile(input))

  ipcMain.handle('aiProviders:list', () => listAiProviders())
  ipcMain.handle(
    'aiProviders:upsert',
    (
      _e,
      input: {
        id?: string
        name: string
        kind: string
        baseUrl?: string
        apiKey?: string
        defaultModel?: string
        enabled: boolean
      }
    ) => {
      const preset = getPreset(input.kind)
      return upsertAiProvider({
        id: input.id,
        name: input.name,
        kind: input.kind,
        providerType: preset.providerType,
        baseUrl: input.baseUrl || preset.defaultBaseUrl || null,
        apiKey: input.apiKey,
        defaultModel: input.defaultModel,
        enabled: input.enabled
      })
    }
  )
  ipcMain.handle('aiProviders:delete', (_e, id: string) => deleteAiProvider(id))

  ipcMain.handle('projects:listRecent', (_e, limit?: number) => listRecentProjects(limit))
  ipcMain.handle('projects:touch', (_e, name: string, path: string) => touchProject(name, path))
  ipcMain.handle('projects:remove', (_e, id: string) => removeProject(id))
  ipcMain.handle('projects:getDelphiProfile', (_e, path: string) => getProjectDelphiProfile(path))
  ipcMain.handle('projects:setDelphiProfile', (_e, path: string, profile: string) =>
    setProjectDelphiProfile(path, normalizeDelphiProfile(profile))
  )

  ipcMain.handle('promptHistory:list', (_e, projectId: string, limit?: number) => listPromptHistory(projectId, limit))

  ipcMain.handle('suggestions:list', () => listSuggestions())
  ipcMain.handle('suggestions:add', (_e, label: string, promptText: string, category: string) =>
    addSuggestion(label, promptText, category)
  )
  ipcMain.handle('suggestions:remove', (_e, id: string) => removeSuggestion(id))
}
