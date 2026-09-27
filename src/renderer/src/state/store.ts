import { create } from 'zustand'
import type { editor } from 'monaco-editor'
import type { DelphiProfileId } from './delphiProfiles'

function loadLayoutNumber(key: string, fallback: number): number {
  const raw = window.localStorage.getItem(key)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function saveLayoutNumber(key: string, value: number): void {
  window.localStorage.setItem(key, String(value))
}

function loadLayoutBoolean(key: string): boolean {
  return window.localStorage.getItem(key) === 'true'
}

function saveLayoutBoolean(key: string, value: boolean): void {
  window.localStorage.setItem(key, String(value))
}

const SIDEBAR_MIN = 160
const SIDEBAR_MAX = 560
const PROMPT_PANEL_MIN = 240
const PROMPT_PANEL_MAX = 640
const CONSOLE_MIN = 100
const CONSOLE_MAX = 700

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface OpenTab {
  path: string
  name: string
  content: string
  dirty: boolean
}

export interface AiProviderRow {
  id: string
  name: string
  kind: string
  providerType: 'anthropic' | 'openai-compatible'
  baseUrl: string | null
  defaultModel: string | null
  enabled: boolean
  hasApiKey: boolean
}

export interface SuggestionRow {
  id: string
  label: string
  promptText: string
  category: string | null
  isDefault: boolean
}

export interface CompileDiagnostic {
  file: string | null
  line: number | null
  column: number | null
  severity: 'error' | 'warning' | 'fatal' | 'hint'
  code: string | null
  message: string
}

export interface CompileResult {
  success: boolean
  exitCode: number | null
  exePath: string | null
  output: string
  diagnostics: CompileDiagnostic[]
}

export interface AiFixRequest {
  id: number
  buildOutput: string
  diagnostics: CompileDiagnostic[]
  attempt?: number
}

export interface AiGenerationRequest {
  id: number
  prompt: string
  providerId?: string
  reason?: 'generation' | 'migration'
}

export interface EditorNavigation {
  id: number
  path: string
  line: number
  column: number
}

interface AppState {
  workspaceVersion: number
  projectDir: string | null
  projectName: string | null
  projectId: string | null
  delphiProfile: DelphiProfileId
  dprojPath: string | null
  buildPlatform: 'Win32' | 'Win64'
  buildConfig: 'Debug' | 'Release'
  fileTree: FileNode[]
  openTabs: OpenTab[]
  activeTabPath: string | null
  activeEditorInstance: editor.IStandaloneCodeEditor | null
  editorNavigation: EditorNavigation | null

  consoleLines: string[]
  aiLines: string[]
  consoleActiveTab: 'build' | 'ai'
  isCompiling: boolean
  isGenerating: boolean
  liveProgress: string | null
  lastExePath: string | null
  lastBuildResult: CompileResult | null
  aiFixRequest: AiFixRequest | null
  aiGenerationRequest: AiGenerationRequest | null

  aiProviders: AiProviderRow[]
  activeProviderId: string | null
  suggestions: SuggestionRow[]

  showSettings: boolean
  theme: 'dark' | 'light'

  sidebarWidth: number
  promptPanelWidth: number
  consolePanelHeight: number
  sidebarCollapsed: boolean
  promptPanelCollapsed: boolean
  resizeSidebar: (deltaPx: number) => void
  resizePromptPanel: (deltaPx: number) => void
  resizeConsolePanel: (deltaPx: number) => void
  toggleSidebar: () => void
  togglePromptPanel: () => void
  ghostTextEnabled: boolean
  toggleGhostText: () => void

  setProject: (dir: string, name: string, id: string, profile?: DelphiProfileId) => void
  setDelphiProfile: (profile: DelphiProfileId) => void
  resetWorkspace: () => void
  setDprojPath: (p: string | null) => void
  setBuildPlatform: (p: 'Win32' | 'Win64') => void
  setBuildConfig: (c: 'Debug' | 'Release') => void
  setFileTree: (tree: FileNode[]) => void
  openTab: (path: string, name: string, content: string) => void
  updateTabContent: (path: string, content: string) => void
  closeTab: (path: string) => void
  setActiveTab: (path: string) => void
  setActiveEditorInstance: (instance: editor.IStandaloneCodeEditor | null) => void
  navigateEditor: (path: string, line: number, column?: number) => void
  clearEditorNavigation: () => void
  saveTab: (path: string) => Promise<void>
  saveActiveTab: () => Promise<void>
  saveAllTabs: () => Promise<void>
  refreshOpenTabs: (paths: string[]) => Promise<void>
  renameActiveTab: (newPath: string, newName: string) => Promise<void>

  appendConsoleLine: (line: string) => void
  clearConsole: () => void
  appendAiLine: (line: string) => void
  clearAiLines: () => void
  setConsoleActiveTab: (tab: 'build' | 'ai') => void
  setCompiling: (v: boolean) => void
  setGenerating: (v: boolean) => void
  setLiveProgress: (text: string | null) => void
  setLastExePath: (p: string | null) => void
  setLastBuildResult: (result: CompileResult | null) => void
  requestAiFix: (result: CompileResult, attempt?: number) => void
  clearAiFixRequest: () => void
  requestAiGeneration: (prompt: string, options?: { providerId?: string; reason?: 'generation' | 'migration' }) => void
  clearAiGenerationRequest: () => void

  setAiProviders: (providers: AiProviderRow[]) => void
  setActiveProviderId: (id: string | null) => void
  setSuggestions: (s: SuggestionRow[]) => void

  setShowSettings: (v: boolean) => void
  setTheme: (t: 'dark' | 'light') => void

}

export const useAppStore = create<AppState>((set, get) => ({
  workspaceVersion: 0,
  projectDir: null,
  projectName: null,
  projectId: null,
  delphiProfile: 'delphi10_13',
  dprojPath: null,
  buildPlatform: 'Win32',
  buildConfig: 'Debug',
  fileTree: [],
  openTabs: [],
  activeTabPath: null,
  activeEditorInstance: null,
  editorNavigation: null,

  consoleLines: [],
  aiLines: [],
  consoleActiveTab: 'build',
  isCompiling: false,
  isGenerating: false,
  liveProgress: null,
  lastExePath: null,
  lastBuildResult: null,
  aiFixRequest: null,
  aiGenerationRequest: null,

  aiProviders: [],
  activeProviderId: null,
  suggestions: [],

  showSettings: false,
  theme: 'dark',

  sidebarWidth: loadLayoutNumber('kx.sidebarWidth', 240),
  promptPanelWidth: loadLayoutNumber('kx.promptPanelWidth', 320),
  consolePanelHeight: loadLayoutNumber('kx.consolePanelHeight', 220),
  sidebarCollapsed: loadLayoutBoolean('kx.sidebarCollapsed'),
  promptPanelCollapsed: loadLayoutBoolean('kx.promptPanelCollapsed'),
  ghostTextEnabled: window.localStorage.getItem('kx.ghostTextEnabled') !== 'false',

  resizeSidebar: (deltaPx) => {
    const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, get().sidebarWidth + deltaPx))
    saveLayoutNumber('kx.sidebarWidth', next)
    set({ sidebarWidth: next })
  },
  resizePromptPanel: (deltaPx) => {
    const next = Math.min(PROMPT_PANEL_MAX, Math.max(PROMPT_PANEL_MIN, get().promptPanelWidth - deltaPx))
    saveLayoutNumber('kx.promptPanelWidth', next)
    set({ promptPanelWidth: next })
  },
  resizeConsolePanel: (deltaPx) => {
    const next = Math.min(CONSOLE_MAX, Math.max(CONSOLE_MIN, get().consolePanelHeight - deltaPx))
    saveLayoutNumber('kx.consolePanelHeight', next)
    set({ consolePanelHeight: next })
  },
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    saveLayoutBoolean('kx.sidebarCollapsed', next)
    set({ sidebarCollapsed: next })
  },
  togglePromptPanel: () => {
    const next = !get().promptPanelCollapsed
    saveLayoutBoolean('kx.promptPanelCollapsed', next)
    set({ promptPanelCollapsed: next })
  },
  toggleGhostText: () => {
    const next = !get().ghostTextEnabled
    window.localStorage.setItem('kx.ghostTextEnabled', String(next))
    set({ ghostTextEnabled: next })
  },

  setProject: (dir, name, id, profile = 'delphi10_13') =>
    set({ projectDir: dir, projectName: name, projectId: id, delphiProfile: profile }),
  setDelphiProfile: (profile) => set({ delphiProfile: profile }),
  resetWorkspace: () =>
    set({
      workspaceVersion: get().workspaceVersion + 1,
      projectDir: null,
      projectName: null,
      projectId: null,
      delphiProfile: 'delphi10_13',
      dprojPath: null,
      fileTree: [],
      openTabs: [],
      activeTabPath: null,
      activeEditorInstance: null,
      editorNavigation: null,
      consoleLines: [],
      aiLines: [],
      consoleActiveTab: 'build',
      isCompiling: false,
      isGenerating: false,
      liveProgress: null,
      lastExePath: null,
      lastBuildResult: null,
      aiFixRequest: null,
      aiGenerationRequest: null,
      showSettings: false
    }),
  setDprojPath: (p) => set({ dprojPath: p }),
  setBuildPlatform: (p) => set({ buildPlatform: p }),
  setBuildConfig: (c) => set({ buildConfig: c }),
  setFileTree: (tree) => set({ fileTree: tree }),

  openTab: (path, name, content) => {
    const existing = get().openTabs.find((t) => t.path === path)
    if (existing) {
      set({ activeTabPath: path })
      return
    }
    set({
      openTabs: [...get().openTabs, { path, name, content, dirty: false }],
      activeTabPath: path
    })
  },

  updateTabContent: (path, content) =>
    set({
      openTabs: get().openTabs.map((t) => (t.path === path ? { ...t, content, dirty: true } : t))
    }),

  closeTab: (path) => {
    const tabs = get().openTabs.filter((t) => t.path !== path)
    const wasActive = get().activeTabPath === path
    set({
      openTabs: tabs,
      activeTabPath: wasActive ? (tabs[tabs.length - 1]?.path ?? null) : get().activeTabPath
    })
  },

  setActiveTab: (path) => set({ activeTabPath: path }),
  setActiveEditorInstance: (instance) => set({ activeEditorInstance: instance }),
  navigateEditor: (path, line, column = 1) =>
    set({
      activeTabPath: path,
      editorNavigation: { id: Date.now(), path, line: Math.max(1, line), column: Math.max(1, column) }
    }),
  clearEditorNavigation: () => set({ editorNavigation: null }),

  saveTab: async (path) => {
    const tab = get().openTabs.find((t) => t.path === path)
    if (!tab) return
    await window.api.fs.writeFile(tab.path, tab.content)

    let pasSync: { changed: boolean; pasPath: string; content: string | null } | null = null
    if (/\.dfm$/i.test(path)) {
      const pasPath = path.replace(/\.dfm$/i, '.pas')
      const openPas = get().openTabs.find((item) => item.path.toLowerCase() === pasPath.toLowerCase())
      pasSync = await window.api.fs.syncDfmPas({ dfmPath: path, profile: get().delphiProfile, pasContent: openPas?.content })
    }

    set({
      openTabs: get().openTabs.map((item) => {
        if (item.path === path) return { ...item, dirty: false }
        if (pasSync?.changed && item.path.toLowerCase() === pasSync.pasPath.toLowerCase() && pasSync.content !== null) {
          return { ...item, content: pasSync.content, dirty: false }
        }
        return item
      })
    })
  },

  saveActiveTab: async () => {
    const path = get().activeTabPath
    if (!path) return
    await get().saveTab(path)
  },

  saveAllTabs: async () => {
    const dirtyPaths = get().openTabs.filter((t) => t.dirty).map((t) => t.path)
    for (const path of dirtyPaths) {
      await get().saveTab(path)
    }
  },

  refreshOpenTabs: async (paths) => {
    const normalized = new Set(paths.map((path) => path.toLowerCase()))
    const replacements = new Map<string, string>()
    for (const tab of get().openTabs) {
      if (normalized.has(tab.path.toLowerCase())) {
        try {
          replacements.set(tab.path, await window.api.fs.readFile(tab.path))
        } catch {
          // O arquivo pode ter sido removido por uma restauração.
        }
      }
    }
    set({
      openTabs: get().openTabs
        .filter((tab) => !normalized.has(tab.path.toLowerCase()) || replacements.has(tab.path))
        .map((tab) =>
          replacements.has(tab.path)
            ? { ...tab, content: replacements.get(tab.path) ?? '', dirty: false }
            : tab
        )
    })
  },

  renameActiveTab: async (newPath, newName) => {
    const oldPath = get().activeTabPath
    if (!oldPath) return
    const tab = get().openTabs.find((t) => t.path === oldPath)
    if (!tab) return
    await window.api.fs.writeFile(newPath, tab.content)
    set({
      openTabs: get().openTabs.map((t) =>
        t.path === oldPath ? { ...t, path: newPath, name: newName, dirty: false } : t
      ),
      activeTabPath: newPath
    })
  },

  appendConsoleLine: (line) => set({ consoleLines: [...get().consoleLines, line] }),
  clearConsole: () => set({ consoleLines: [] }),
  appendAiLine: (line) => set({ aiLines: [...get().aiLines, line] }),
  clearAiLines: () => set({ aiLines: [] }),
  setConsoleActiveTab: (tab) => set({ consoleActiveTab: tab }),
  setCompiling: (v) => set({ isCompiling: v }),
  setGenerating: (v) => set({ isGenerating: v }),
  setLiveProgress: (text) => set({ liveProgress: text }),
  setLastExePath: (p) => set({ lastExePath: p }),
  setLastBuildResult: (result) => set({ lastBuildResult: result }),
  requestAiFix: (result, attempt) =>
    set({ aiFixRequest: { id: Date.now(), buildOutput: result.output, diagnostics: result.diagnostics, attempt } }),
  clearAiFixRequest: () => set({ aiFixRequest: null }),
  requestAiGeneration: (prompt, options) =>
    set({ aiGenerationRequest: { id: Date.now(), prompt, providerId: options?.providerId, reason: options?.reason } }),
  clearAiGenerationRequest: () => set({ aiGenerationRequest: null }),

  setAiProviders: (providers) => set({ aiProviders: providers }),
  setActiveProviderId: (id) => set({ activeProviderId: id }),
  setSuggestions: (s) => set({ suggestions: s }),

  setShowSettings: (v) => set({ showSettings: v }),
  setTheme: (t) => set({ theme: t })
}))
