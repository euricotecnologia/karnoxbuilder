import type { Monaco } from '@monaco-editor/react'

const KEYWORDS = [
  'and', 'array', 'as', 'asm', 'begin', 'case', 'class', 'const', 'constructor', 'destructor', 'dispinterface',
  'div', 'do', 'downto', 'else', 'end', 'except', 'exports', 'file', 'finalization', 'finally', 'for', 'function',
  'goto', 'if', 'implementation', 'in', 'inherited', 'initialization', 'inline', 'interface', 'is', 'label',
  'library', 'mod', 'nil', 'not', 'object', 'of', 'or', 'out', 'packed', 'private', 'procedure', 'program',
  'property', 'protected', 'public', 'published', 'raise', 'record', 'repeat', 'resourcestring', 'set', 'shl',
  'shr', 'string', 'then', 'threadvar', 'to', 'try', 'type', 'unit', 'until', 'uses', 'var', 'while', 'with',
  'xor', 'override', 'virtual', 'overload', 'reintroduce', 'stdcall', 'cdecl', 'read', 'write', 'default'
]

let registered = false

export function registerPascalLanguage(monaco: Monaco): void {
  if (registered) return
  registered = true

  monaco.languages.register({ id: 'pascal' })

  monaco.languages.setMonarchTokensProvider('pascal', {
    ignoreCase: true,
    keywords: KEYWORDS,
    tokenizer: {
      root: [
        [/\{\$[^}]*\}/, 'annotation'],
        [/\{[^$][^}]*\}/, 'comment'],
        [/\(\*[\s\S]*?\*\)/, 'comment'],
        [/\/\/.*$/, 'comment'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/#\d+/, 'string'],
        [/\$[0-9a-fA-F]+/, 'number.hex'],
        [/\d+\.\d+([eE][-+]?\d+)?/, 'number.float'],
        [/\d+/, 'number'],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier'
            }
          }
        ],
        [/[:=<>+\-*/@^]/, 'operator'],
        [/[;,.]/, 'delimiter']
      ]
    }
  })

  monaco.languages.setLanguageConfiguration('pascal', {
    comments: { lineComment: '//', blockComment: ['{', '}'] },
    brackets: [
      ['begin', 'end'],
      ['(', ')'],
      ['[', ']']
    ],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: "'", close: "'" },
      { open: '{', close: '}' }
    ]
  })
}

export function languageForFile(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  if (ext === '.pas' || ext === '.dpr' || ext === '.dfm' || ext === '.inc') return 'pascal'
  if (ext === '.dproj') return 'xml'
  if (ext === '.json') return 'json'
  return 'plaintext'
}
