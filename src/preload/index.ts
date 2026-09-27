import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  system: {
    getVersion: () => ipcRenderer.invoke('system:getVersion'),
    openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url)
  },
  fs: {
    readProjectTree: (projectDir: string) => ipcRenderer.invoke('fs:readProjectTree', projectDir),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    syncDfmPas: (args: { dfmPath: string; profile?: string; pasContent?: string }) => ipcRenderer.invoke('fs:syncDfmPas', args),
    restoreLastDfmBackup: (filePath: string) => ipcRenderer.invoke('fs:restoreLastDfmBackup', filePath),
    selectDirectory: (title: string) => ipcRenderer.invoke('fs:selectDirectory', title),
    selectFiles: () => ipcRenderer.invoke('fs:selectFiles'),
    selectDatabaseFile: (title: string, extensions: string[]) => ipcRenderer.invoke('fs:selectDatabaseFile', title, extensions),
    createSqliteDatabase: () => ipcRenderer.invoke('fs:createSqliteDatabase'),
    selectNewFirebirdDatabase: () => ipcRenderer.invoke('fs:selectNewFirebirdDatabase'),
    readFileBase64: (filePath: string) => ipcRenderer.invoke('fs:readFileBase64', filePath),
    saveFileDialog: (defaultPath: string) => ipcRenderer.invoke('fs:saveFileDialog', defaultPath)
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },
  databaseProfiles: {
    list: () => ipcRenderer.invoke('databaseProfiles:list'),
    upsert: (input: unknown) => ipcRenderer.invoke('databaseProfiles:upsert', input)
  },
  databaseExplorer: {
    profiles: () => ipcRenderer.invoke('databaseExplorer:profiles'),
    projectInfo: (projectDir: string) => ipcRenderer.invoke('databaseExplorer:projectInfo', projectDir),
    projectTest: (projectDir: string) => ipcRenderer.invoke('databaseExplorer:projectTest', projectDir),
    projectSchema: (projectDir: string) => ipcRenderer.invoke('databaseExplorer:projectSchema', projectDir),
    test: (kind: string) => ipcRenderer.invoke('databaseExplorer:test', kind),
    createFirebirdDatabase: (input: { databasePath: string; host?: string; port?: string; username?: string; password?: string }) => ipcRenderer.invoke('databaseExplorer:createFirebirdDatabase', input),
    schema: (kind: string) => ipcRenderer.invoke('databaseExplorer:schema', kind),
    query: (args: { kind: string; sql: string }) => ipcRenderer.invoke('databaseExplorer:query', args),
    projectQuery: (args: { projectDir: string; sql: string }) => ipcRenderer.invoke('databaseExplorer:projectQuery', args),
    history: (kind?: string, limit?: number) => ipcRenderer.invoke('databaseExplorer:history', kind, limit),
    clearHistory: (kind?: string) => ipcRenderer.invoke('databaseExplorer:clearHistory', kind),
    compare: (args: { left: string; right: string }) => ipcRenderer.invoke('databaseExplorer:compare', args),
    migrations: (kind: string) => ipcRenderer.invoke('databaseExplorer:migrations', kind),
    saveMigration: (input: { profileKind: string; version: string; name: string; upSql: string; downSql: string }) => ipcRenderer.invoke('databaseExplorer:saveMigration', input),
    applyMigration: (args: { id: string; direction: 'up' | 'down' }) => ipcRenderer.invoke('databaseExplorer:applyMigration', args)
  },
  aiProviders: {
    list: () => ipcRenderer.invoke('aiProviders:list'),
    upsert: (input: unknown) => ipcRenderer.invoke('aiProviders:upsert', input),
    delete: (id: string) => ipcRenderer.invoke('aiProviders:delete', id),
    testConnection: (providerId: string) => ipcRenderer.invoke('ai:testConnection', providerId)
  },
  projects: {
    listRecent: (limit?: number) => ipcRenderer.invoke('projects:listRecent', limit),
    touch: (name: string, path: string) => ipcRenderer.invoke('projects:touch', name, path),
    remove: (id: string) => ipcRenderer.invoke('projects:remove', id),
    getDelphiProfile: (path: string) => ipcRenderer.invoke('projects:getDelphiProfile', path),
    setDelphiProfile: (path: string, profile: string) => ipcRenderer.invoke('projects:setDelphiProfile', path, profile),
    analyze: (projectDir: string) => ipcRenderer.invoke('projects:analyze', projectDir),
    scaffold: (input: { projectDir: string; profile?: string; projectName?: string; includeDataModule?: boolean; allowedExistingFiles?: string[] }) => ipcRenderer.invoke('projects:scaffold', input)
  },
  promptHistory: {
    list: (projectId: string, limit?: number) => ipcRenderer.invoke('promptHistory:list', projectId, limit)
  },
  suggestions: {
    list: () => ipcRenderer.invoke('suggestions:list'),
    add: (label: string, promptText: string, category: string) => ipcRenderer.invoke('suggestions:add', label, promptText, category),
    remove: (id: string) => ipcRenderer.invoke('suggestions:remove', id)
  },
  git: {
    status: (projectDir: string) => ipcRenderer.invoke('git:status', projectDir),
    init: (projectDir: string) => ipcRenderer.invoke('git:init', projectDir),
    commit: (args: { projectDir: string; message: string }) => ipcRenderer.invoke('git:commit', args)
  },
  skill: {
    status: (projectDir: string) => ipcRenderer.invoke('skill:status', projectDir),
    create: (args: { projectDir: string; profile: string }) => ipcRenderer.invoke('skill:create', args),
    load: (args: { projectDir: string; profile: string }) => ipcRenderer.invoke('skill:load', args)
  },
  libraries: {
    list: (projectPath: string) => ipcRenderer.invoke('libraries:list', projectPath),
    componentCatalog: (args: { projectPath: string; platform?: 'Win32' | 'Win64'; config?: 'Debug' | 'Release' }) => ipcRenderer.invoke('libraries:componentCatalog', args),
    add: (input: { projectPath: string; platform: string; pathType: string; path: string }) => ipcRenderer.invoke('libraries:add', input),
    setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('libraries:setEnabled', id, enabled),
    remove: (id: string) => ipcRenderer.invoke('libraries:remove', id),
    importDelphi: (projectPath: string) => ipcRenderer.invoke('libraries:importDelphi', projectPath),
    validate: (args: { projectPath: string; platform: 'Win32' | 'Win64'; config: 'Debug' | 'Release' }) => ipcRenderer.invoke('libraries:validate', args)
  },
  lsp: {
    start: (args: { projectDir: string; projectFile?: string | null; profile: string }) => ipcRenderer.invoke('lsp:start', args),
    stop: () => ipcRenderer.invoke('lsp:stop'),
    status: () => ipcRenderer.invoke('lsp:status'),
    didOpen: (args: { path: string; text: string; version: number }) => ipcRenderer.invoke('lsp:didOpen', args),
    didChange: (args: { path: string; text: string; version: number }) => ipcRenderer.invoke('lsp:didChange', args),
    didSave: (args: { path: string; text?: string }) => ipcRenderer.invoke('lsp:didSave', args),
    didClose: (path: string) => ipcRenderer.invoke('lsp:didClose', path),
    completion: (params: unknown) => ipcRenderer.invoke('lsp:completion', params),
    hover: (params: unknown) => ipcRenderer.invoke('lsp:hover', params),
    definition: (params: unknown) => ipcRenderer.invoke('lsp:definition', params),
    references: (params: unknown) => ipcRenderer.invoke('lsp:references', params),
    onDiagnostics: (callback: (params: unknown) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, params: unknown): void => callback(params)
      ipcRenderer.on('lsp:diagnostics', listener)
      return () => { ipcRenderer.removeListener('lsp:diagnostics', listener) }
    },
    onStatus: (callback: (status: unknown) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, status: unknown): void => callback(status)
      ipcRenderer.on('lsp:statusChanged', listener)
      return () => { ipcRenderer.removeListener('lsp:statusChanged', listener) }
    },
    onLog: (callback: (message: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, message: string): void => callback(message)
      ipcRenderer.on('lsp:log', listener)
      return () => { ipcRenderer.removeListener('lsp:log', listener) }
    }
  },
  nocode: {
    getBinding: (args: { projectDir: string; dfmPath: string; componentName: string; eventName: string }) => ipcRenderer.invoke('nocode:getBinding', args),
    saveBinding: (args: { projectDir: string; binding: unknown }) => ipcRenderer.invoke('nocode:saveBinding', args),
    listForms: (projectDir: string) => ipcRenderer.invoke('nocode:listForms', projectDir),
    selectImage: (profile: string) => ipcRenderer.invoke('nocode:selectImage', profile),
    selectGlyph: (purpose?: 'menu') => ipcRenderer.invoke('nocode:selectGlyph', purpose),
    importGridFile: () => ipcRenderer.invoke('nocode:importGridFile'),
    formOptions: (projectDir?: string) => ipcRenderer.invoke('nocode:formOptions', projectDir),
    createForm: (input: unknown) => ipcRenderer.invoke('nocode:createForm', input),
    managedForms: (projectDir: string) => ipcRenderer.invoke('nocode:managedForms', projectDir),
    updateForm: (input: unknown) => ipcRenderer.invoke('nocode:updateForm', input),
    bindDatabase: (input: unknown) => ipcRenderer.invoke('nocode:bindDatabase', input)
  },
  delphi: {
    detectInstalls: () => ipcRenderer.invoke('delphi:detectInstalls'),
    getActiveInstall: () => ipcRenderer.invoke('delphi:getActiveInstall'),
    setActiveInstall: (studioPath: string) => ipcRenderer.invoke('delphi:setActiveInstall', studioPath),
    validatePath: (studioPath: string) => ipcRenderer.invoke('delphi:validatePath', studioPath)
  },
  ai: {
    listPresets: () => ipcRenderer.invoke('ai:presets'),
    listModels: (args: { baseUrl: string; apiKey?: string }) => ipcRenderer.invoke('ai:listModels', args),
    listModelsForProvider: (providerId: string) => ipcRenderer.invoke('ai:listModelsForProvider', providerId),
    generateProject: (args: { providerId: string; prompt: string; projectDir: string; projectId: string | null; profile: string; attachments?: Array<{ name: string; mimeType: string; dataBase64: string }> }) => ipcRenderer.invoke('ai:generateProject', args),
    ghostComplete: (args: { prefix: string; suffix: string; providerId: string }) => ipcRenderer.invoke('ai:ghostComplete', args),
    applyChangeSet: (args: { changeSetId: string; selectedPaths: string[] }) => ipcRenderer.invoke('ai:applyChangeSet', args),
    discardChangeSet: (changeSetId: string) => ipcRenderer.invoke('ai:discardChangeSet', changeSetId),
    restoreCheckpoint: (args: { checkpointId: string; projectDir: string }) => ipcRenderer.invoke('ai:restoreCheckpoint', args),
    cancelGeneration: () => ipcRenderer.invoke('ai:cancelGeneration'),
    onProgress: (callback: (text: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, text: string): void => callback(text)
      ipcRenderer.on('ai:progress', listener)
      return () => { ipcRenderer.removeListener('ai:progress', listener) }
    }
  },
  publish: {
    profiles: (args: { projectPath: string; projectName: string }) => ipcRenderer.invoke('publish:profiles', args),
    saveProfile: (args: { profile: unknown; certificatePassword?: string }) => ipcRenderer.invoke('publish:saveProfile', args),
    analyze: (profile: unknown) => ipcRenderer.invoke('publish:analyze', profile),
    prepareMetadata: (profile: unknown) => ipcRenderer.invoke('publish:prepareMetadata', profile),
    run: (profile: unknown) => ipcRenderer.invoke('publish:run', profile),
    generateUpdater: (profile: unknown) => ipcRenderer.invoke('publish:generateUpdater', profile),
    onProgress: (callback: (message: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, message: string): void => callback(message)
      ipcRenderer.on('publish:progress', listener)
      return () => { ipcRenderer.removeListener('publish:progress', listener) }
    }
  },
  compiler: {
    build: (args: { dprojPath: string; projectDir: string; projectName: string; platform: 'Win32' | 'Win64'; config: 'Debug' | 'Release'; profile: string; rebuild?: boolean }) => ipcRenderer.invoke('compiler:build', args),
    run: (args: { exePath: string; projectDir: string; platform: 'Win32' | 'Win64'; config: 'Debug' | 'Release' }) => ipcRenderer.invoke('compiler:run', args),
    onOutput: (callback: (chunk: string) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, chunk: string): void => callback(chunk)
      ipcRenderer.on('compiler:output', listener)
      return () => { ipcRenderer.removeListener('compiler:output', listener) }
    },
    onDone: (callback: (result: unknown) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, result: unknown): void => callback(result)
      ipcRenderer.on('compiler:done', listener)
      return () => { ipcRenderer.removeListener('compiler:done', listener) }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) { console.error(error) }
} else {
  const globalWindow = window as unknown as { electron: typeof electronAPI; api: typeof api }
  globalWindow.electron = electronAPI
  globalWindow.api = api
}

export type Api = typeof api
