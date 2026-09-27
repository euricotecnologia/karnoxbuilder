import type { Monaco } from '@monaco-editor/react'
import type { CompileDiagnostic } from '@renderer/state/store'

export interface PascalProjectFile {
  path: string
  name: string
  content: string
}

interface PascalSymbol {
  name: string
  detail: string
  path: string
  line: number
  column: number
  kind: 'unit' | 'class' | 'method' | 'field' | 'property'
}

export interface PascalDefinition {
  path: string
  line: number
  column: number
}

let symbols: PascalSymbol[] = []
let registered = false
let indexedUris = new Set<string>()
let externalIntelligenceActive = false
let ghostTextEnabled = true
let ghostTextProviderId: string | null = null

export function setExternalPascalIntelligenceActive(active: boolean): void {
  externalIntelligenceActive = active
}

export function setGhostTextEnabled(enabled: boolean): void {
  ghostTextEnabled = enabled
}

export function setGhostTextProviderId(providerId: string | null): void {
  ghostTextProviderId = providerId
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

function parseSymbols(file: PascalProjectFile): PascalSymbol[] {
  const result: PascalSymbol[] = []
  const lines = file.content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const patterns: Array<{ regex: RegExp; kind: PascalSymbol['kind']; detail: (match: RegExpExecArray) => string }> = [
      { regex: /^\s*unit\s+([A-Za-z_]\w*)\s*;/i, kind: 'unit', detail: () => 'Unit Delphi' },
      { regex: /^\s*([A-Za-z_]\w*)\s*=\s*class\b/i, kind: 'class', detail: (m) => `Classe ${m[1]}` },
      { regex: /^\s*(?:class\s+)?(?:procedure|function|constructor|destructor)\s+((?:[A-Za-z_]\w*\.)?[A-Za-z_]\w*)/i, kind: 'method', detail: (m) => `Método ${m[1]}` },
      { regex: /^\s*property\s+([A-Za-z_]\w*)\s*:/i, kind: 'property', detail: (m) => `Propriedade ${m[1]}` },
      { regex: /^\s*([A-Za-z_]\w*)\s*:\s*(T[A-Za-z_]\w*)\s*;/i, kind: 'field', detail: (m) => `${m[1]}: ${m[2]}` }
    ]
    for (const pattern of patterns) {
      const match = pattern.regex.exec(line)
      if (!match) continue
      const qualifiedName = match[1]
      const name = qualifiedName.includes('.') ? qualifiedName.slice(qualifiedName.lastIndexOf('.') + 1) : qualifiedName
      result.push({
        name,
        detail: pattern.detail(match),
        path: file.path,
        line: index + 1,
        column: Math.max(1, line.toLowerCase().indexOf(name.toLowerCase()) + 1),
        kind: pattern.kind
      })
      break
    }
  }
  return result
}

function symbolKind(monaco: Monaco, kind: PascalSymbol['kind']): number {
  if (kind === 'class') return monaco.languages.CompletionItemKind.Class
  if (kind === 'method') return monaco.languages.CompletionItemKind.Method
  if (kind === 'property') return monaco.languages.CompletionItemKind.Property
  if (kind === 'field') return monaco.languages.CompletionItemKind.Field
  return monaco.languages.CompletionItemKind.Module
}

export function findPascalDefinition(name: string): PascalDefinition | null {
  const matches = symbols.filter((symbol) => symbol.name.toLowerCase() === name.toLowerCase())
  matches.sort((a, b) => (a.kind === 'method' ? -1 : 0) - (b.kind === 'method' ? -1 : 0))
  const match = matches[0]
  return match ? { path: match.path, line: match.line, column: match.column } : null
}

export function registerPascalIntelligence(monaco: Monaco): void {
  if (registered) return
  registered = true

  monaco.languages.registerCompletionItemProvider('pascal', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }
      const projectSuggestions = externalIntelligenceActive ? [] : symbols.map((symbol) => ({
        label: symbol.name,
        kind: symbolKind(monaco, symbol.kind),
        detail: `${symbol.detail} — ${symbol.path.split(/[\\/]/).pop()}`,
        insertText: symbol.name,
        range
      }))
      const snippets = [
        { label: 'procedure', insertText: 'procedure ${1:Nome}(Sender: TObject);\nbegin\n  ${0}\nend;', detail: 'Procedimento Delphi' },
        { label: 'tryf', insertText: 'try\n  ${1}\nfinally\n  ${0}\nend;', detail: 'Bloco try/finally' },
        { label: 'trye', insertText: 'try\n  ${1}\nexcept\n  on E: Exception do\n    ${0}\nend;', detail: 'Bloco try/except' },
        { label: 'fori', insertText: 'for ${1:I} := ${2:0} to ${3:Count - 1} do\nbegin\n  ${0}\nend;', detail: 'Laço for' }
      ].map((snippet) => ({
        ...snippet,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range
      }))
      return { suggestions: [...projectSuggestions, ...snippets] }
    }
  })

  monaco.languages.registerInlineCompletionsProvider('pascal', {
    async provideInlineCompletions(model, position, _context, token) {
      if (!ghostTextEnabled || !ghostTextProviderId || externalIntelligenceActive) return { items: [] }
      // Debounce simples: só pergunta à IA depois de uma pausa curta na digitação,
      // e cancela se o usuário já digitou de novo (token fica cancelado pelo Monaco).
      await new Promise((resolve) => setTimeout(resolve, 450))
      if (token.isCancellationRequested) return { items: [] }
      const fullText = model.getValue()
      const offset = model.getOffsetAt(position)
      const prefix = fullText.slice(0, offset)
      const suffix = fullText.slice(offset)
      if (!prefix.trim()) return { items: [] }
      try {
        const response = await window.api.ai.ghostComplete({ prefix, suffix, providerId: ghostTextProviderId })
        if (token.isCancellationRequested || !response.ok || !response.completion?.trim()) return { items: [] }
        return {
          items: [{
            insertText: response.completion,
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
          }]
        }
      } catch {
        return { items: [] }
      }
    },
    disposeInlineCompletions() { /* nada para liberar */ }
  })

  monaco.languages.registerDefinitionProvider('pascal', {
    provideDefinition(model, position) {
      if (externalIntelligenceActive) return null
      const word = model.getWordAtPosition(position)?.word
      if (!word) return null
      const matches = symbols.filter((symbol) => symbol.name.toLowerCase() === word.toLowerCase())
      matches.sort((a, b) => (a.kind === 'method' ? -1 : 0) - (b.kind === 'method' ? -1 : 0))
      return matches.map((symbol) => ({
        uri: monaco.Uri.file(symbol.path),
        range: new monaco.Range(symbol.line, symbol.column, symbol.line, symbol.column + symbol.name.length)
      }))
    }
  })

  monaco.languages.registerHoverProvider('pascal', {
    provideHover(model, position) {
      if (externalIntelligenceActive) return null
      const word = model.getWordAtPosition(position)?.word
      const symbol = symbols.find((item) => item.name.toLowerCase() === word?.toLowerCase())
      if (!symbol) return null
      return { contents: [{ value: `**${symbol.name}**` }, { value: `${symbol.detail}\n\n${symbol.path}` }] }
    }
  })
}

export function updatePascalProjectIndex(monaco: Monaco, files: PascalProjectFile[]): void {
  symbols = files.flatMap(parseSymbols)
  const nextUris = new Set<string>()
  for (const file of files) {
    const uri = monaco.Uri.file(file.path)
    nextUris.add(uri.toString())
    const model = monaco.editor.getModel(uri)
    if (!model) monaco.editor.createModel(file.content, 'pascal', uri)
    else if (model.getValue() !== file.content) model.setValue(file.content)
  }
  for (const oldUri of indexedUris) {
    if (!nextUris.has(oldUri)) monaco.editor.getModel(monaco.Uri.parse(oldUri))?.dispose()
  }
  indexedUris = nextUris
}

export function applyCompileMarkers(
  monaco: Monaco,
  diagnostics: CompileDiagnostic[],
  files: PascalProjectFile[]
): void {
  const diagnosticsByPath = new Map<string, CompileDiagnostic[]>()
  for (const diagnostic of diagnostics) {
    if (!diagnostic.file || !diagnostic.line) continue
    const normalizedDiagnostic = normalizePath(diagnostic.file)
    const match = files.find((file) => {
      const normalizedFile = normalizePath(file.path)
      return normalizedFile === normalizedDiagnostic || normalizedFile.endsWith(`/${normalizedDiagnostic}`) ||
        normalizedFile.split('/').pop() === normalizedDiagnostic.split('/').pop()
    })
    if (!match) continue
    diagnosticsByPath.set(match.path, [...(diagnosticsByPath.get(match.path) ?? []), diagnostic])
  }

  for (const file of files) {
    const model = monaco.editor.getModel(monaco.Uri.file(file.path))
    if (!model) continue
    const markers = (diagnosticsByPath.get(file.path) ?? []).map((diagnostic) => ({
      severity:
        diagnostic.severity === 'warning' || diagnostic.severity === 'hint'
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Error,
      message: `${diagnostic.code ? `${diagnostic.code}: ` : ''}${diagnostic.message}`,
      startLineNumber: Math.min(diagnostic.line ?? 1, model.getLineCount()),
      startColumn: Math.max(1, diagnostic.column ?? 1),
      endLineNumber: Math.min(diagnostic.line ?? 1, model.getLineCount()),
      endColumn: model.getLineMaxColumn(Math.min(diagnostic.line ?? 1, model.getLineCount()))
    }))
    monaco.editor.setModelMarkers(model, 'delphi-compiler', markers)
  }
}
