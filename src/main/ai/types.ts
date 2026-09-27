import type { UnitSpec } from '../delphi/projectTemplate'
import type { AgentToolDefinition } from './agentTools'

export interface TokenUsage {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

export interface ProjectGenerationResult {
  projectName: string
  units: UnitSpec[]
  explanation: string
  usage: TokenUsage
}

export interface AttachmentInput {
  name: string
  mimeType: string
  dataBase64: string
}

export interface AIProvider {
  readonly providerType: 'anthropic' | 'openai-compatible'
  generateProject(
    prompt: string,
    model: string,
    attachments: AttachmentInput[],
    onProgress?: (text: string) => void,
    signal?: AbortSignal
  ): Promise<ProjectGenerationResult>
  testConnection(model: string): Promise<{ ok: boolean; message: string }>
  /**
   * Loop agêntico curto: o modelo pode chamar ferramentas (ler/listar arquivos,
   * compilar) quantas vezes precisar antes de devolver um texto final. Usado só
   * para RESEARCH/contexto antes da geração principal, não para escrever código.
   * Opcional porque nem todo backend compatível com OpenAI aceita tool calling
   * de forma confiável (ex.: alguns servidores locais) — quando ausente ou
   * quando falha, o chamador deve simplesmente seguir sem esse contexto extra.
   */
  /**
   * Completação curta e rápida de código (Ghost Text): dado o texto antes e
   * depois do cursor, devolve só o trecho que deveria ser inserido no lugar
   * do cursor. Diferente de generateProject: sem protocolo de marcadores,
   * sem streaming, sem anexos — só uma resposta de texto curta e rápida.
   */
  completeText?(prefix: string, suffix: string, model: string, signal?: AbortSignal): Promise<string>
  runToolLoop?(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    tools: AgentToolDefinition[],
    executeTool: (name: string, input: Record<string, unknown>) => Promise<string>,
    onProgress?: (text: string) => void,
    signal?: AbortSignal
  ): Promise<string>
}

export class AIProviderError extends Error {}
