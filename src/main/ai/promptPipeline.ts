import { buildProvider } from './providerFactory'
import { buildDpr, buildDproj, type ProjectSpec } from '../delphi/projectTemplate'
import type { AIProvider, AttachmentInput, ProjectGenerationResult } from './types'
import { assertFireDacProfileCompliance, assertNoConflictingConnectionDriver, repairUnitReferences } from './pasFixup'
import { repairAndValidateDfmArtifacts } from './dfmConsistency'
import { buildDatabaseContextForAi } from '../db/repositories/databaseProfilesRepo'
import { resolveProjectDatabaseProfile } from '../db/projectDatabaseProfile'
import { loadDatabaseSchema } from '../db/databaseExplorerService'
import {
  createPendingChangeSet,
  findExistingProjectName,
  readExistingProjectGuid,
  type ChangeSetPreview
} from './changeSet'
import { collectProjectContext, type ProjectContextSummary } from './projectContext'
import { loadExistingUnits, mergeWithExistingUnits } from './existingProject'
import { buildDelphiProfilePrompt, type DelphiProfileId } from '../delphi/profiles'
import { buildProjectSkillContext } from '../skills/projectSkill'
import { buildExistingConnectionPrompt, detectExistingConnections } from './existingConnectionDetection'
import { AGENT_TOOLS, executeAgentTool } from './agentTools'
import { existsSync, readdirSync } from 'fs'
import { extname } from 'path'

function withUtf8Bom(content: string): string {
  return '\uFEFF' + content.replace(/^\uFEFF/, '')
}

const SCHEMA_CONTEXT_MAX_TABLES = 60
const SCHEMA_CONTEXT_MAX_COLUMNS_PER_TABLE = 40

// A conex\u00E3o configurada (host/porta/tipo) n\u00E3o basta para a IA saber o que j\u00E1 existe
// no banco: sem isso, ela inventa nomes de tabela/coluna que podem colidir com dados
// reais. Aqui buscamos o schema de verdade do banco.ini do projeto, com limites de
// tamanho para n\u00E3o estourar o contexto em bancos legados muito grandes.
async function buildProjectDatabaseSchemaContext(projectDir: string): Promise<string> {
  try {
    const { profile, info } = resolveProjectDatabaseProfile(projectDir)
    const schema = await loadDatabaseSchema(profile.kind, profile)
    const tables = schema.objects.filter((item) => item.type === 'table')
    if (!tables.length) return ''
    const visibleTables = tables.slice(0, SCHEMA_CONTEXT_MAX_TABLES)
    const lines = visibleTables.map((table) => {
      const columns = table.columns.slice(0, SCHEMA_CONTEXT_MAX_COLUMNS_PER_TABLE)
      const columnList = columns
        .map((column) => `${column.name} ${column.dataType}${column.primaryKey ? ' (chave prim\u00E1ria)' : ''}${column.nullable ? '' : ' NOT NULL'}`)
        .join(', ')
      const truncatedNote = table.columns.length > columns.length ? ` [+${table.columns.length - columns.length} coluna(s) omitida(s)]` : ''
      const qualifiedName = table.schema && table.schema.toLowerCase() !== 'main' ? `${table.schema}.${table.name}` : table.name
      return `- ${qualifiedName}: ${columnList}${truncatedNote}`
    })
    const truncatedTablesNote = tables.length > visibleTables.length ? `\n(+${tables.length - visibleTables.length} tabela(s) omitida(s) por limite de tamanho)` : ''
    return `\n\nSchema real do banco ativo do projeto (${info.label}, ${info.database}). Use estes nomes exatos de tabela/coluna; nunca invente ou duplique nomes j\u00E1 existentes aqui. Se precisar de uma tabela nova, escolha um nome que n\u00E3o colida com os abaixo:\n${lines.join('\n')}${truncatedTablesNote}`
  } catch {
    // Projeto sem database.ini v\u00E1lido ainda, ou banco inacess\u00EDvel no momento da gera\u00E7\u00E3o:
    // segue sem o schema real em vez de bloquear a gera\u00E7\u00E3o por completo.
    return ''
  }
}

const RESEARCH_SYSTEM_PROMPT = `Você é a fase de pesquisa de um assistente de IA dentro de uma IDE Delphi, executada ANTES da geração de código.
Você tem ferramentas para listar os arquivos do projeto atual, ler o conteúdo deles, e compilar o projeto para ver erros reais.
Use as ferramentas quantas vezes forem necessárias (com moderação) para entender o código já existente relevante ao pedido do usuário a seguir.
Depois, responda em texto corrido, no máximo 400 palavras, resumindo o que você descobriu que é relevante (nomes de units/classes/campos/formulários já existentes, convenções de nomenclatura usadas, erros de compilação atuais, se houver). Não escreva código Delphi final aqui — isso é feito depois, em outra etapa.
Se o pedido do usuário já tiver contexto suficiente e não precisar de pesquisa (ex.: projeto novo, vazio), responda apenas: "Nenhuma pesquisa adicional necessária."`

/**
 * Fase de pesquisa opcional (equivalente ao "agente com ferramentas" descrito
 * como MCP-lite): antes da geração principal, deixa o modelo decidir sozinho
 * se quer ler arquivos existentes ou compilar para verificar erros, e resume
 * o que encontrou. Só roda quando o provedor suporta tool calling
 * (`runToolLoop`) e quando já existe algum arquivo-fonte no projeto — não faz
 * sentido pesquisar uma pasta vazia. Qualquer falha aqui é absorvida: a
 * geração principal segue normalmente sem esse contexto extra.
 */
async function runResearchAgent(
  provider: AIProvider,
  projectDir: string,
  profileId: DelphiProfileId,
  prompt: string,
  model: string,
  onProgress?: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!provider.runToolLoop) return ''
  const hasSourceFiles = existsSync(projectDir) &&
    readdirSync(projectDir).some((name) => ['.pas', '.dfm', '.dpr', '.dproj'].includes(extname(name).toLowerCase()))
  if (!hasSourceFiles) return ''
  try {
    onProgress?.('IA pesquisando o projeto atual antes de gerar (lendo arquivos, verificando compilação)...')
    const summary = await provider.runToolLoop(
      RESEARCH_SYSTEM_PROMPT,
      prompt,
      model,
      AGENT_TOOLS,
      (name, input) => executeAgentTool(name, input, projectDir, profileId),
      onProgress,
      signal
    )
    if (!summary.trim() || /nenhuma pesquisa adicional necess[aá]ria/i.test(summary)) return ''
    return `\n\n## PESQUISA AUTOMÁTICA NO PROJETO ATUAL\nAntes de gerar, a IA consultou arquivos reais do projeto e/ou compilou para verificar erros. Resumo do que foi encontrado:\n${summary.trim()}`
  } catch (error) {
    onProgress?.(`Pesquisa automática indisponível (${error instanceof Error ? error.message : String(error)}); seguindo sem esse contexto extra.`)
    return ''
  }
}

export function prepareProjectChanges(
  projectDir: string,
  result: ProjectGenerationResult,
  contextSummary: ProjectContextSummary,
  profileId: DelphiProfileId = 'delphi10_13'
): ChangeSetPreview {
  // Valida todos os artefatos antes de preparar a revisão. Nenhum arquivo do
  // projeto é alterado até o usuário confirmar as mudanças na interface.
  const projectName = findExistingProjectName(projectDir) ?? result.projectName
  const existingUnits = loadExistingUnits(projectDir, projectName)
  const validatedGeneratedUnits = repairAndValidateDfmArtifacts(result.units)
  assertFireDacProfileCompliance(validatedGeneratedUnits, profileId)
  assertNoConflictingConnectionDriver(validatedGeneratedUnits, detectExistingConnections(projectDir))
  const generatedNames = new Set(validatedGeneratedUnits.map((unit) => unit.unitName.toLowerCase()))
  const mergedUnits = mergeWithExistingUnits(validatedGeneratedUnits, existingUnits)
  const fullyRepaired = repairUnitReferences(mergedUnits, profileId)
  const units = fullyRepaired.map((unit) => {
    if (generatedNames.has(unit.unitName.toLowerCase())) return unit
    return existingUnits.find((existing) => existing.unitName.toLowerCase() === unit.unitName.toLowerCase()) ?? unit
  })
  contextSummary.preservedUnitCount = existingUnits.filter(
    (existing) => !validatedGeneratedUnits.some((generated) => generated.unitName.toLowerCase() === existing.unitName.toLowerCase())
  ).length
  const normalizedResult: ProjectGenerationResult = { ...result, projectName, units }
  const spec: ProjectSpec = { projectName, units }
  const files = new Map<string, string>()
  const encode = profileId === 'delphi7_2007'
    ? (value: string): string => value.replace(/^\uFEFF/, '')
    : withUtf8Bom

  for (const unit of units) {
    files.set(`${unit.unitName}.pas`, encode(unit.pasContent))
    if (unit.dfmContent !== null) {
      files.set(`${unit.unitName}.dfm`, encode(unit.dfmContent))
    }
  }

  files.set(`${projectName}.dpr`, encode(buildDpr(spec, profileId)))
  const projectEntry = profileId === 'delphi10_13' ? `${projectName}.dproj` : `${projectName}.dpr`
  if (profileId === 'delphi10_13') {
    files.set(projectEntry, buildDproj(spec, readExistingProjectGuid(projectDir, projectName)))
  }
  return createPendingChangeSet(projectDir, normalizedResult, files, projectEntry, contextSummary, profileId)
}

export async function generateProject(
  providerId: string,
  prompt: string,
  projectDir: string,
  profileId: DelphiProfileId = 'delphi10_13',
  attachments: AttachmentInput[] = [],
  onProgress?: (text: string) => void,
  signal?: AbortSignal
): Promise<{ result: ProjectGenerationResult; changeSet: ChangeSetPreview }> {
  const { provider, model, isLocal } = buildProvider(providerId)
  const databaseContext = buildDatabaseContextForAi()
  const skillContext = buildProjectSkillContext(projectDir, profileId, isLocal)
  onProgress?.('Analisando os arquivos Delphi do projeto atual...')
  const projectContext = collectProjectContext(projectDir, isLocal)
  onProgress?.('Lendo o schema real do banco de dados do projeto...')
  const projectDatabaseSchemaContext = await buildProjectDatabaseSchemaContext(projectDir)
  const existingConnectionContext = buildExistingConnectionPrompt(projectDir)
  onProgress?.(
    projectContext.summary.includedFiles.length > 0
      ? `${projectContext.summary.includedFiles.length} arquivo(s) do projeto incluído(s) no contexto.`
      : 'Projeto novo: nenhum arquivo existente para analisar.'
  )
  const researchContext = await runResearchAgent(provider, projectDir, profileId, prompt, model, onProgress, signal)
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
  const result = await provider.generateProject(
    prompt + buildDelphiProfilePrompt(profileId) + skillContext + databaseContext + projectDatabaseSchemaContext + existingConnectionContext + researchContext + projectContext.text,
    model,
    attachments,
    onProgress,
    signal
  )
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
  const changeSet = prepareProjectChanges(projectDir, result, projectContext.summary, profileId)
  return { result: { ...result, projectName: changeSet.projectName }, changeSet }
}
