import OpenAI from 'openai'
import type { AIProvider, AttachmentInput, ProjectGenerationResult } from './types'
import { AIProviderError } from './types'
import { buildDelphiSystemPrompt, buildProviderUserPrompt } from './delphiKnowledge'
import { parseProjectGenerationResult } from './parseProjectResponse'
import { describeError, isAbortError } from './errorUtils'
import { MARKERS } from './responseFormat'
import { MAX_TOOL_CALLS_PER_LOOP, type AgentToolDefinition } from './agentTools'
import { GHOST_TEXT_SYSTEM_PROMPT, buildGhostTextPrompt } from './ghostTextPrompt'

const OUTPUT_TOKEN_LIMIT = 8192
const OPENROUTER_OUTPUT_TOKEN_LIMIT = 3500

interface StreamedResult {
  text: string
  usage: {
    promptTokens: number | null
    completionTokens: number | null
    totalTokens: number | null
  }
}

function buildContent(
  prompt: string,
  attachments: AttachmentInput[],
  isLocalProvider: boolean
): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  if (attachments.length === 0) {
    return buildProviderUserPrompt(prompt, isLocalProvider)
  }

  const unsupported = attachments.filter((a) => !a.mimeType.startsWith('image/'))
  const unsupportedNote =
    unsupported.length > 0
      ? `\n\nNota: ${unsupported.length} arquivo(s) anexado(s) não são suportados neste provedor e foram ignorados: ${unsupported.map((a) => a.name).join(', ')}.`
      : ''

  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: buildProviderUserPrompt(prompt, isLocalProvider) + unsupportedNote }
  ]

  for (const attachment of attachments) {
    if (attachment.mimeType.startsWith('image/')) {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${attachment.mimeType};base64,${attachment.dataBase64}` }
      })
    }
  }

  return parts
}

function isUnsupportedParamError(err: unknown): boolean {
  const status = (err as { status?: number }).status
  if (status !== 400 && status !== 422) return false

  const message = err instanceof Error ? err.message : String(err)
  return (
    /(?:unsupported|unknown|unrecognized|not supported|invalid|extra inputs?).*?(?:max_tokens|max_completion_tokens)/i.test(
      message
    ) ||
    /(?:max_tokens|max_completion_tokens).*?(?:unsupported|unknown|unrecognized|not supported|invalid)/i.test(
      message
    )
  )
}

function getHttpStatus(err: unknown): number | null {
  const status = (err as { status?: unknown }).status
  return typeof status === 'number' ? status : null
}

/**
 * O OpenRouter informa no erro 402 quantos tokens a chave ainda consegue
 * reservar. Usamos 95% desse valor para deixar margem para variações de
 * preço/roteamento sem transformar um saldo baixo em uma requisição de
 * 65 mil tokens por ausência do parâmetro.
 */
function getAffordableTokenLimit(err: unknown): number | null {
  if (getHttpStatus(err) !== 402) return null
  const message = err instanceof Error ? err.message : String(err)
  const match = /can only afford\s+(\d+)/i.exec(message)
  if (!match) return null

  const affordable = Number.parseInt(match[1], 10)
  if (!Number.isFinite(affordable) || affordable < 512) return null
  return Math.min(OUTPUT_TOKEN_LIMIT, Math.max(512, Math.floor(affordable * 0.95)))
}

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1
}

function findIncompleteUnitStart(text: string): number | null {
  if (countMarker(text, MARKERS.UNIT) <= countMarker(text, MARKERS.END_UNIT)) return null

  const lastCompleted = text.lastIndexOf(MARKERS.END_UNIT)
  const searchFrom = lastCompleted < 0 ? 0 : lastCompleted + MARKERS.END_UNIT.length
  const start = text.indexOf(MARKERS.UNIT, searchFrom)
  return start >= 0 ? start : null
}

function incompleteUnitName(text: string, start: number): string {
  const tail = text.slice(start)
  const nameStart = tail.indexOf(MARKERS.NAME)
  if (nameStart < 0) return 'desconhecida'
  return tail
    .slice(nameStart + MARKERS.NAME.length)
    .replace(/^\s+/, '')
    .split(/\r?\n/, 1)[0]
    .trim() || 'desconhecida'
}

function replaceIncompleteTail(text: string, continuation: string, incompleteStart: number): string {
  const continuationStart = continuation.indexOf(MARKERS.UNIT)
  if (continuationStart < 0) {
    throw new AIProviderError(`A continua\u00e7\u00e3o n\u00e3o come\u00e7ou com o marcador ${MARKERS.UNIT}.`)
  }
  return text.slice(0, incompleteStart) + continuation.slice(continuationStart)
}

function addUsage(first: StreamedResult['usage'], next: StreamedResult['usage']): StreamedResult['usage'] {
  const sum = (a: number | null, b: number | null): number | null =>
    a !== null && b !== null ? a + b : (b ?? a)
  return {
    promptTokens: sum(first.promptTokens, next.promptTokens),
    completionTokens: sum(first.completionTokens, next.completionTokens),
    totalTokens: sum(first.totalTokens, next.totalTokens)
  }
}
export class OpenAiCompatibleProvider implements AIProvider {
  readonly providerType = 'openai-compatible' as const
  private client: OpenAI
  private readonly isOpenRouter: boolean
  private readonly isOfficialOpenAi: boolean

  constructor(apiKey: string, baseUrl?: string, private readonly isLocalProvider = false) {
    // As novas tentativas são controladas no fluxo da IDE, com progresso
    // visível e respeito ao Retry-After, evitando tentativas duplicadas pelo SDK.
    this.client = new OpenAI({ apiKey, baseURL: baseUrl, maxRetries: 0 })
    this.isOpenRouter = /^https?:\/\/(?:[^/]+\.)?openrouter\.ai(?:\/|$)/i.test(baseUrl ?? '')
    this.isOfficialOpenAi = !baseUrl || /^https?:\/\/api\.openai\.com(?:\/|$)/i.test(baseUrl)
  }

  private async streamOnce(
    model: string,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    extraParams: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming>,
    onProgress: ((text: string) => void) | undefined,
    signal: AbortSignal | undefined
  ): Promise<StreamedResult> {
    const stream = await this.client.chat.completions.create(
      {
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...extraParams
      },
      { signal }
    )

    let text = ''
    let usage: OpenAI.CompletionUsage | undefined

    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        text += delta
        onProgress?.(`Gerando... ~${text.length} caracteres recebidos`)
      }
      if (chunk.usage) usage = chunk.usage
    }

    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    return {
      text,
      usage: {
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        totalTokens: usage?.total_tokens ?? null
      }
    }
  }

  /**
   * Nem todo backend compatível com OpenAI entende o mesmo parâmetro de
   * limite de tokens de saída: modelos de raciocínio recentes da OpenAI
   * exigem "max_completion_tokens" e rejeitam "max_tokens"; servidores
   * locais (LM Studio/Ollama) geralmente só entendem "max_tokens" e alguns
   * respondem com conteúdo vazio (sem erro HTTP) se receberem um campo que
   * não reconhecem. Por isso tentamos em cascata: max_tokens ->
   * max_completion_tokens -> sem limite nenhum (deixa o backend decidir).
   */
  private tokenLimitAttempts(limit: number): Array<{ max_tokens?: number; max_completion_tokens?: number }> {
    const current = { max_completion_tokens: limit }
    const legacy = { max_tokens: limit }

    // A API oficial da OpenAI e os modelos de raciocÃ­nio recentes usam o
    // parÃ¢metro atual. Servidores locais continuam preferindo o legado.
    return this.isOfficialOpenAi ? [current, legacy] : [legacy, current]
  }
  private async createCompletion(
    model: string,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    onProgress: ((text: string) => void) | undefined,
    signal: AbortSignal | undefined
  ): Promise<StreamedResult> {
    // O OpenRouter reserva créditos considerando o teto solicitado. Um teto
    // alto pode causar 402 antes de qualquer token ser gerado, inclusive ao
    // usar rotas gratuitas. Começamos com um limite conservador e ainda
    // respeitamos uma redução adicional informada pelo próprio servidor.
    const outputTokenLimit = this.isOpenRouter ? OPENROUTER_OUTPUT_TOKEN_LIMIT : OUTPUT_TOKEN_LIMIT
    const attempts: Array<Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming>> = [
      ...this.tokenLimitAttempts(outputTokenLimit),
      {}
    ]

    let lastResult: StreamedResult | null = null

    for (const extraParams of attempts) {
      try {
        const result = await this.streamOnce(model, messages, extraParams, onProgress, signal)
        if (result.text) return result
        lastResult = result
      } catch (err) {
        if (isAbortError(err)) throw err

        const affordableLimit = getAffordableTokenLimit(err)
        if (affordableLimit !== null) {
          onProgress?.(`O OpenRouter reduziu o limite disponível. Tentando novamente com até ${affordableLimit} tokens...`)
          const adjustedParams =
            'max_completion_tokens' in extraParams
              ? { max_completion_tokens: affordableLimit }
              : { max_tokens: affordableLimit }
          return await this.streamOnce(model, messages, adjustedParams, onProgress, signal)
        }

        // Modelos locais nem sempre retornam uma descrição padronizada no
        // erro 400, por isso preservamos a cascata somente para eles.
        const localUnsupportedParameter = this.isLocalProvider && getHttpStatus(err) === 400
        if (!isUnsupportedParamError(err) && !localUnsupportedParameter) throw err
      }
    }

    if (lastResult) return lastResult
    throw new AIProviderError('O provedor não retornou nenhuma resposta em nenhuma tentativa.')
  }

  async generateProject(
    prompt: string,
    model: string,
    attachments: AttachmentInput[],
    onProgress?: (text: string) => void,
    signal?: AbortSignal
  ): Promise<ProjectGenerationResult> {
    const baseMessages = (requestPrompt: string): OpenAI.Chat.Completions.ChatCompletionMessageParam[] => [
      { role: 'system', content: buildDelphiSystemPrompt(this.isLocalProvider) },
      { role: 'user', content: buildContent(requestPrompt, attachments, this.isLocalProvider) }
    ]

    const completeAndRecover = async (requestPrompt: string): Promise<StreamedResult> => {
      const messages = baseMessages(requestPrompt)
      let completion = await this.createCompletion(model, messages, onProgress, signal)

      for (let recovery = 1; recovery <= 3; recovery++) {
        const incompleteStart = findIncompleteUnitStart(completion.text)
        if (incompleteStart === null) return completion

        const unitName = incompleteUnitName(completion.text, incompleteStart)
        const completedCount = countMarker(completion.text.slice(0, incompleteStart), MARKERS.END_UNIT)
        onProgress?.(
          `Resposta interrompida na unit ${unitName}. Preservando ${completedCount} unit(s) completa(s) e solicitando continua\u00e7\u00e3o (${recovery}/3)...`
        )

        const continuationPrompt =
          `Sua resposta anterior foi interrompida durante a unit "${unitName}". ` +
          `As ${completedCount} unit(s) anteriores j\u00e1 est\u00e3o completas e N\u00c3O devem ser repetidas. ` +
          `Comece obrigatoriamente por ${MARKERS.UNIT}, regenere a unit "${unitName}" inteira desde o in\u00edcio, ` +
          `finalize-a com ${MARKERS.END_UNIT} e depois gere quaisquer units restantes. ` +
          `N\u00e3o repita ${MARKERS.PROJECT_NAME}, n\u00e3o use markdown e n\u00e3o escreva coment\u00e1rios fora dos marcadores.`

        const continuation = await this.createCompletion(
          model,
          [
            ...messages,
            { role: 'assistant', content: completion.text },
            { role: 'user', content: continuationPrompt }
          ],
          onProgress,
          signal
        )
        if (!continuation.text) throw new AIProviderError('A IA n\u00e3o retornou a continua\u00e7\u00e3o solicitada.')

        completion = {
          text: replaceIncompleteTail(completion.text, continuation.text, incompleteStart),
          usage: addUsage(completion.usage, continuation.usage)
        }
      }

      return completion
    }

    let completion: StreamedResult
    let parsed: Omit<ProjectGenerationResult, 'usage'>

    try {
      completion = await completeAndRecover(prompt)
      parsed = parseProjectGenerationResult(completion.text)
    } catch (err) {
      if (!this.isLocalProvider || signal?.aborted) throw err

      const reason = err instanceof Error ? err.message : String(err)
      onProgress?.('A IA local retornou um projeto inv\u00e1lido. Solicitando corre\u00e7\u00e3o autom\u00e1tica completa...')
      const retryPrompt = `${prompt}\n\nCORRE\u00c7\u00c3O AUTOM\u00c1TICA OBRIGAT\u00d3RIA: a tentativa anterior foi rejeitada pela IDE pelo seguinte motivo: ${reason}\nGere novamente o projeto inteiro desde o in\u00edcio. Feche todos os blocos object do DFM com end, finalize cada unit com @@KX:END_UNIT@@ e n\u00e3o interrompa a resposta.`
      completion = await completeAndRecover(retryPrompt)
      parsed = parseProjectGenerationResult(completion.text)
    }

    return { ...parsed, usage: completion.usage }
  }
  async completeText(prefix: string, suffix: string, model: string, signal?: AbortSignal): Promise<string> {
    const response = await this.client.chat.completions.create(
      {
        model,
        max_tokens: 200,
        messages: [
          { role: 'system', content: GHOST_TEXT_SYSTEM_PROMPT },
          { role: 'user', content: buildGhostTextPrompt(prefix, suffix) }
        ]
      },
      { signal }
    )
    return response.choices[0]?.message?.content ?? ''
  }

  async runToolLoop(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    tools: AgentToolDefinition[],
    executeTool: (name: string, input: Record<string, unknown>) => Promise<string>,
    onProgress?: (text: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const openAiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema }
    }))
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    for (let turn = 0; turn < MAX_TOOL_CALLS_PER_LOOP; turn++) {
      const response = await this.client.chat.completions.create({ model, messages, tools: openAiTools }, { signal })
      const choice = response.choices[0]?.message
      const toolCalls = choice?.tool_calls?.filter((call) => call.type === 'function') ?? []
      if (!toolCalls.length) return choice?.content ?? ''
      messages.push({ role: 'assistant', content: choice?.content ?? null, tool_calls: choice?.tool_calls })
      for (const call of toolCalls) {
        onProgress?.(`IA consultando: ${call.function.name}...`)
        let input: Record<string, unknown> = {}
        try { input = JSON.parse(call.function.arguments || '{}') } catch { /* argumentos vazios/inválidos viram objeto vazio */ }
        const result = await executeTool(call.function.name, input)
        messages.push({ role: 'tool', tool_call_id: call.id, content: result })
      }
    }
    return 'O agente atingiu o limite de chamadas de ferramentas antes de concluir a pesquisa.'
  }

  async testConnection(model: string): Promise<{ ok: boolean; message: string }> {
    try {
      if (this.isOfficialOpenAi) {
        // Validate credentials, permission and the selected model without
        // generating text or consuming completion tokens.
        const availableModel = await this.client.models.retrieve(model)
        if (availableModel.id !== model) {
          return { ok: false, message: `A OpenAI retornou um modelo diferente do solicitado: ${availableModel.id}.` }
        }
        return { ok: true, message: `Conex\u00e3o funcionando. Modelo ${availableModel.id} dispon\u00edvel.` }
      }

      let lastError: unknown
      for (const tokenParams of this.tokenLimitAttempts(16)) {
        try {
          await this.client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: 'Responda apenas OK.' }],
            ...tokenParams
          })
          return { ok: true, message: 'Conex\u00e3o funcionando.' }
        } catch (err) {
          lastError = err
          if (!isUnsupportedParamError(err)) throw err
        }
      }

      throw lastError
    } catch (err) {
      return { ok: false, message: describeError(err) }
    }
  }
}
