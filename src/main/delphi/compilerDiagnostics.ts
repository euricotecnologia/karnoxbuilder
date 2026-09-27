export interface CompileDiagnostic {
  file: string | null
  line: number | null
  column: number | null
  severity: 'error' | 'warning' | 'fatal' | 'hint'
  code: string | null
  message: string
}

function diagnosticSeverity(explicit: string | undefined, code: string | undefined): CompileDiagnostic['severity'] {
  if (explicit) return explicit.toLowerCase() as CompileDiagnostic['severity']
  const prefix = code?.charAt(0).toUpperCase()
  if (prefix === 'F') return 'fatal'
  if (prefix === 'W') return 'warning'
  if (prefix === 'H') return 'hint'
  return 'error'
}

export function parseCompileDiagnostics(output: string): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = []
  const seen = new Set<string>()
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const msbuild = /^(.+?)\((\d+)(?:,(\d+))?\)\s*:\s*(fatal|error|warning|hint)\s*([A-Z]+\d+)?\s*:\s*(.+)$/i.exec(line)
    const delphi = /^(.+?)\((\d+)(?:,(\d+))?\)\s*(?::\s*)?(?:(fatal|error|warning|hint)\s*:\s*)?([EFWH]\d+)\s*:?\s*(.+)$/i.exec(line)
    const located = msbuild ?? delphi
    const general = /\b(fatal|error|warning|hint)\s*:?\s*([A-Z]+\d+)?\s*:?\s*(.+)$/i.exec(line)
    if (!located && !general) continue

    const diagnostic: CompileDiagnostic = located
      ? {
          file: located[1].trim(),
          line: Number.parseInt(located[2], 10),
          column: located[3] ? Number.parseInt(located[3], 10) : null,
          severity: diagnosticSeverity(located[4], located[5]),
          code: located[5] || null,
          message: located[6].trim()
        }
      : {
          file: null,
          line: null,
          column: null,
          severity: diagnosticSeverity(general![1], general![2]),
          code: general![2] || null,
          message: general![3].trim()
        }
    const key = `${diagnostic.file}|${diagnostic.line}|${diagnostic.code}|${diagnostic.message}`
    if (!seen.has(key)) {
      seen.add(key)
      diagnostics.push(diagnostic)
    }
  }
  return diagnostics
}
