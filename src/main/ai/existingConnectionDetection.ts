import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// Cada entrada é [nome amigável, classe de conexão principal, regex de detecção].
// A ordem importa pouco aqui: um projeto real normalmente usa só um driver de
// acesso a dados; se detectarmos mais de um, listamos todos e deixamos claro
// que nenhum novo deve ser introduzido sem instrução explícita do usuário.
const KNOWN_CONNECTIONS: Array<{ label: string; className: string; pattern: RegExp }> = [
  { label: 'Zeos', className: 'TZConnection', pattern: /\bTZConnection\b/ },
  { label: 'UniDAC (Devart)', className: 'TUniConnection', pattern: /\bTUniConnection\b/ },
  { label: 'FireDAC', className: 'TFDConnection', pattern: /\bTFDConnection\b/ },
  { label: 'ADO', className: 'TADOConnection', pattern: /\bTADOConnection\b/ },
  { label: 'dbExpress', className: 'TSQLConnection', pattern: /\bTSQLConnection\b/ },
  { label: 'IBX', className: 'TIBDatabase', pattern: /\bTIBDatabase\b/ },
  { label: 'IBO', className: 'TIBODatabase', pattern: /\bTIBODatabase\b/ }
]

function readProjectPasFiles(projectDir: string): string[] {
  if (!existsSync(projectDir)) return []
  const contents: string[] = []
  for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.pas')) continue
    try { contents.push(readFileSync(join(projectDir, entry.name), 'utf8')) } catch { /* arquivo ilegível, ignora */ }
  }
  return contents
}

/**
 * O prompt de perfil só fala em FireDAC/ADO/dbExpress/IBX; projetos reais
 * abertos na IDE muitas vezes já usam Zeos, UniDAC ou outro driver de
 * terceiros escolhido antes de existir a KarnoX Builder. Sem avisar a IA
 * disso, ela pode introduzir um segundo mecanismo de conexão paralelo (ex.:
 * FireDAC) numa tela nova, mesmo que o resto do projeto seja 100% Zeos.
 */
export interface DetectedConnection { label: string; className: string }

export function detectExistingConnections(projectDir: string): DetectedConnection[] {
  const files = readProjectPasFiles(projectDir)
  if (!files.length) return []
  const combined = files.join('\n')
  return KNOWN_CONNECTIONS.filter((item) => item.pattern.test(combined)).map(({ label, className }) => ({ label, className }))
}

export function buildExistingConnectionPrompt(projectDir: string): string {
  const detected = detectExistingConnections(projectDir)
  if (!detected.length) return ''
  const list = detected.map((item) => `${item.label} (${item.className})`).join(', ')
  return `\n\n## CONEXÃO DE BANCO JÁ EXISTENTE NO PROJETO\nEste projeto já usa: ${list}. Reaproveite exatamente esse(s) mesmo(s) componente(s)/conexão para qualquer tela ou funcionalidade nova de acesso a dados. Nunca introduza um driver ou componente de conexão diferente (ex.: FireDAC, ADO, dbExpress, dentre outros não listados acima) a menos que o usuário peça explicitamente para trocar de driver.`
}
