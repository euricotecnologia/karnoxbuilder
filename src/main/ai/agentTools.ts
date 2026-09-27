import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { extname, join, resolve, sep } from 'path'
import { compileProject, type BuildPlatform, type BuildConfig } from '../delphi/compiler'
import { detectDefaultDelphiInstall, validateDelphiPath } from '../delphi/detect'
import { getSetting } from '../db/repositories/settingsRepo'
import { getCompilerLibraryPaths } from '../delphi/libraryPaths'
import { normalizeDelphiProfile, type DelphiProfileId } from '../delphi/profiles'

export interface AgentToolDefinition {
  name: string
  description: string
  // Schema JSON simples (subconjunto usado por ambos os provedores: object/properties/required).
  inputSchema: { type: 'object'; properties: Record<string, { type: string; description?: string }>; required: string[] }
}

const ALLOWED_EXTENSIONS = new Set(['.pas', '.dfm', '.dpr', '.dproj'])
const MAX_FILE_BYTES = 200_000
const MAX_TOOL_CALLS_PER_LOOP = 6

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'list_project_files',
    description: 'Lista os arquivos-fonte Delphi (.pas, .dfm, .dpr, .dproj) já existentes na pasta raiz do projeto atual, para você decidir quais ler antes de responder.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'read_file',
    description: 'Lê o conteúdo completo de um arquivo do projeto (.pas, .dfm, .dpr ou .dproj) pelo nome retornado por list_project_files.',
    inputSchema: {
      type: 'object',
      properties: { fileName: { type: 'string', description: 'Nome do arquivo, ex.: UnitPrincipal.pas (sem caminho de pasta).' } },
      required: ['fileName']
    }
  },
  {
    name: 'compile_project',
    description: 'Compila o projeto Delphi atual (Win32/Debug) e devolve sucesso ou a lista real de erros do compilador. Use com moderação: cada chamada demora e tem custo real; não chame mais de uma vez seguida sem motivo novo.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  }
]

function listProjectFiles(projectDir: string): string[] {
  if (!existsSync(projectDir)) return []
  return readdirSync(projectDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ALLOWED_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

function readProjectFile(projectDir: string, fileName: string): string {
  // Impede path traversal: só aceita nome de arquivo simples (sem separador),
  // com extensão permitida, e confirma que o caminho resolvido continua
  // dentro da pasta do projeto antes de ler qualquer coisa do disco.
  if (typeof fileName !== 'string' || /[\\/]/.test(fileName) || !ALLOWED_EXTENSIONS.has(extname(fileName).toLowerCase())) {
    throw new Error(`Nome de arquivo inválido: "${fileName}". Use apenas o nome (sem caminho) de um .pas/.dfm/.dpr/.dproj já listado por list_project_files.`)
  }
  const root = resolve(projectDir)
  const target = resolve(join(root, fileName))
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error('Caminho fora da pasta do projeto.')
  }
  if (!existsSync(target)) throw new Error(`Arquivo não encontrado: ${fileName}`)
  const stats = statSync(target)
  if (stats.size > MAX_FILE_BYTES) throw new Error(`O arquivo ${fileName} é grande demais para ler de uma vez (${Math.round(stats.size / 1024)} KB).`)
  return readFileSync(target, 'utf8')
}

async function compileProjectForAgent(projectDir: string, profileId: DelphiProfileId): Promise<string> {
  if (!existsSync(projectDir)) return 'A pasta do projeto não existe.'
  const entries = readdirSync(projectDir)
  const projectFileName = entries.find((name) => extname(name).toLowerCase() === '.dproj') ?? entries.find((name) => extname(name).toLowerCase() === '.dpr')
  if (!projectFileName) return 'Nenhum arquivo .dpr/.dproj encontrado ainda; não é possível compilar.'
  const projectName = projectFileName.replace(/\.(dproj|dpr)$/i, '')
  const dprojPath = join(projectDir, projectFileName)
  const platform: BuildPlatform = 'Win32'
  const config: BuildConfig = 'Debug'
  const selectedPath = getSetting('delphi_studio_path')
  const install = selectedPath ? validateDelphiPath(selectedPath) : detectDefaultDelphiInstall()
  if (!install) return 'Nenhuma instalação do Delphi foi detectada nesta máquina; não é possível compilar para verificar.'
  const libraryPaths = getCompilerLibraryPaths(projectDir, platform, config, install)
  let output = ''
  const result = await compileProject(
    dprojPath, projectDir, projectName, platform, config, normalizeDelphiProfile(profileId),
    (chunk) => { output += chunk }, install, libraryPaths, false
  )
  if (result.success) return 'Compilação bem-sucedida, sem erros.'
  const errorLines = result.diagnostics
    .filter((item) => item.severity === 'error' || item.severity === 'fatal')
    .slice(0, 30)
    .map((item) => `- ${item.file ?? 'Projeto'}${item.line ? `(${item.line}${item.column ? `,${item.column}` : ''})` : ''}: ${item.code ?? ''} ${item.message}`)
    .join('\n')
  return `Compilação falhou.\n${errorLines || output.slice(-4000)}`
}

/**
 * Executa uma ferramenta pelo nome, sempre isolada à pasta do projeto atual.
 * Retorna sempre uma string (mensagem de erro incluída), nunca lança — quem
 * chama isso está dentro de um loop de ferramentas de IA e precisa devolver
 * o resultado (ou o erro) de volta ao modelo, não travar o processo.
 */
export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  projectDir: string,
  profileId: DelphiProfileId
): Promise<string> {
  try {
    if (name === 'list_project_files') {
      const files = listProjectFiles(projectDir)
      return files.length ? files.join('\n') : 'Nenhum arquivo .pas/.dfm/.dpr/.dproj encontrado no projeto ainda.'
    }
    if (name === 'read_file') {
      return readProjectFile(projectDir, String(input.fileName ?? ''))
    }
    if (name === 'compile_project') {
      return await compileProjectForAgent(projectDir, profileId)
    }
    return `Ferramenta desconhecida: ${name}`
  } catch (error) {
    return `Erro: ${error instanceof Error ? error.message : String(error)}`
  }
}

export { MAX_TOOL_CALLS_PER_LOOP }
