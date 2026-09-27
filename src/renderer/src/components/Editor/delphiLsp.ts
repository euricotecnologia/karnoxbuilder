import type { Monaco } from '@monaco-editor/react'

export interface DelphiLspStatus {
  state: 'stopped' | 'starting' | 'ready' | 'fallback' | 'error'
  message: string
  executablePath?: string
  projectDir?: string
}

interface LspPosition {
  line: number
  character: number
}

interface LspRange {
  start: LspPosition
  end: LspPosition
}

interface LspLocation {
  uri: string
  range: LspRange
  targetUri?: string
  targetSelectionRange?: LspRange
}

let registered = false

function range(monaco: Monaco, value: LspRange): import('monaco-editor').IRange {
  return new monaco.Range(
    value.start.line + 1,
    value.start.character + 1,
    value.end.line + 1,
    value.end.character + 1
  )
}

function completionKind(monaco: Monaco, kind?: number): number {
  const kinds = monaco.languages.CompletionItemKind
  const mapping: Record<number, number> = {
    2: kinds.Method,
    3: kinds.Function,
    4: kinds.Constructor,
    5: kinds.Field,
    6: kinds.Variable,
    7: kinds.Class,
    8: kinds.Interface,
    9: kinds.Module,
    10: kinds.Property,
    13: kinds.Enum,
    14: kinds.Keyword,
    15: kinds.Snippet,
    20: kinds.EnumMember,
    21: kinds.Constant,
    22: kinds.Struct
  }
  return (kind && mapping[kind]) || kinds.Text
}

function markdownContents(value: unknown): Array<{ value: string }> {
  if (typeof value === 'string') return [{ value }]
  if (Array.isArray(value)) return value.flatMap(markdownContents)
  if (!value || typeof value !== 'object') return []
  const item = value as { value?: unknown; language?: string; kind?: string }
  if (typeof item.value !== 'string') return []
  if (item.language) return [{ value: `\`\`\`${item.language}\n${item.value}\n\`\`\`` }]
  return [{ value: item.value }]
}

export function registerDelphiLsp(monaco: Monaco): void {
  if (registered) return
  registered = true

  monaco.languages.registerCompletionItemProvider('pascal', {
    triggerCharacters: ['.', '(', ','],
    async provideCompletionItems(model, position, context) {
      const response = (await window.api.lsp.completion({
        textDocument: { uri: model.uri.toString() },
        position: { line: position.lineNumber - 1, character: position.column - 1 },
        context: {
          triggerKind: context.triggerKind,
          ...(context.triggerCharacter ? { triggerCharacter: context.triggerCharacter } : {})
        }
      })) as { items?: unknown[] } | unknown[] | null
      const items = Array.isArray(response) ? response : response?.items ?? []
      const currentWord = model.getWordUntilPosition(position)
      const defaultRange = {
        startLineNumber: position.lineNumber,
        startColumn: currentWord.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: currentWord.endColumn
      }
      return {
        suggestions: items.map((raw) => {
          const item = raw as {
            label: string | { label: string }
            kind?: number
            detail?: string
            documentation?: unknown
            insertText?: string
            insertTextFormat?: number
            sortText?: string
            filterText?: string
            textEdit?: { newText?: string; range?: LspRange; insert?: LspRange }
          }
          const label = typeof item.label === 'string' ? item.label : item.label.label
          const editRange = item.textEdit?.range ?? item.textEdit?.insert
          return {
            label,
            kind: completionKind(monaco, item.kind),
            detail: item.detail,
            documentation: markdownContents(item.documentation)[0],
            insertText: item.textEdit?.newText ?? item.insertText ?? label,
            insertTextRules:
              item.insertTextFormat === 2
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : monaco.languages.CompletionItemInsertTextRule.KeepWhitespace,
            sortText: item.sortText,
            filterText: item.filterText,
            range: editRange ? range(monaco, editRange) : defaultRange
          }
        })
      }
    }
  })

  monaco.languages.registerHoverProvider('pascal', {
    async provideHover(model, position) {
      const response = (await window.api.lsp.hover({
        textDocument: { uri: model.uri.toString() },
        position: { line: position.lineNumber - 1, character: position.column - 1 }
      })) as { contents?: unknown; range?: LspRange } | null
      if (!response?.contents) return null
      const contents = markdownContents(response.contents)
      return contents.length ? { contents, ...(response.range ? { range: range(monaco, response.range) } : {}) } : null
    }
  })

  monaco.languages.registerDefinitionProvider('pascal', {
    async provideDefinition(model, position) {
      const response = (await window.api.lsp.definition({
        textDocument: { uri: model.uri.toString() },
        position: { line: position.lineNumber - 1, character: position.column - 1 }
      })) as LspLocation | LspLocation[] | null
      const locations = response ? (Array.isArray(response) ? response : [response]) : []
      return locations.map((location) => ({
        uri: monaco.Uri.parse(location.targetUri ?? location.uri),
        range: range(monaco, location.targetSelectionRange ?? location.range)
      }))
    }
  })

  window.api.lsp.onDiagnostics((raw) => {
    const params = raw as {
      uri?: string
      diagnostics?: Array<{
        range: LspRange
        severity?: number
        code?: string | number
        source?: string
        message: string
        tags?: number[]
      }>
    }
    if (!params.uri) return
    const model = monaco.editor.getModel(monaco.Uri.parse(params.uri))
    if (!model) return
    const markers = (params.diagnostics ?? []).map((diagnostic) => ({
      ...range(monaco, diagnostic.range),
      severity:
        diagnostic.severity === 1
          ? monaco.MarkerSeverity.Error
          : diagnostic.severity === 2
            ? monaco.MarkerSeverity.Warning
            : diagnostic.severity === 4
              ? monaco.MarkerSeverity.Hint
              : monaco.MarkerSeverity.Info,
      message: `${diagnostic.code !== undefined ? `${diagnostic.code}: ` : ''}${diagnostic.message}`,
      source: diagnostic.source ?? 'DelphiLSP',
      code: diagnostic.code === undefined ? undefined : String(diagnostic.code),
      tags: diagnostic.tags
    }))
    monaco.editor.setModelMarkers(model, 'delphi-lsp', markers)
  })
}

export function isDelphiLspFile(path: string): boolean {
  return /\.(?:pas|dpr|inc)$/i.test(path)
}
