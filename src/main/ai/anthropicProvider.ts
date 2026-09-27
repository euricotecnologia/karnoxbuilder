import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AttachmentInput, ProjectGenerationResult } from './types'
import { AIProviderError } from './types'
import { DELPHI_SYSTEM_PROMPT, buildUserPrompt } from './delphiKnowledge'
import { parseProjectGenerationResult } from './parseProjectResponse'
import { describeError } from './errorUtils'
import { MAX_TOOL_CALLS_PER_LOOP, type AgentToolDefinition } from './agentTools'
import { GHOST_TEXT_SYSTEM_PROMPT, buildGhostTextPrompt } from './ghostTextPrompt'

function buildContent(prompt: string, attachments: AttachmentInput[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [{ type: 'text', text: buildUserPrompt(prompt) }]

  for (const attachment of attachments) {
    if (attachment.mimeType.startsWith('image/')) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: attachment.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
          data: attachment.dataBase64
        }
      })
    } else if (attachment.mimeType === 'application/pdf') {
      blocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: attachment.dataBase64
        }
      })
    }
  }

  return blocks
}

export class AnthropicProvider implements AIProvider {
  readonly providerType = 'anthropic' as const
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async generateProject(
    prompt: string,
    model: string,
    attachments: AttachmentInput[],
    onProgress?: (text: string) => void,
    signal?: AbortSignal
  ): Promise<ProjectGenerationResult> {
    const stream = this.client.messages.stream(
      {
        model,
        max_tokens: 8192,
        system: DELPHI_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildContent(prompt, attachments) }]
      },
      { signal }
    )

    let inputTokens: number | null = null
    stream.on('streamEvent', (event) => {
      if (event.type === 'message_start') {
        inputTokens = event.message.usage.input_tokens
      } else if (event.type === 'message_delta') {
        const outputTokens = event.usage.output_tokens
        onProgress?.(
          inputTokens != null
            ? `Gerando... ${outputTokens} tokens de saída (entrada: ${inputTokens})`
            : `Gerando... ${outputTokens} tokens de saída`
        )
      }
    })

    const message = await stream.finalMessage()

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new AIProviderError('A resposta da Anthropic não contém texto.')
    }

    const parsed = parseProjectGenerationResult(textBlock.text)
    return {
      ...parsed,
      usage: {
        promptTokens: message.usage?.input_tokens ?? null,
        completionTokens: message.usage?.output_tokens ?? null,
        totalTokens:
          message.usage?.input_tokens != null && message.usage?.output_tokens != null
            ? message.usage.input_tokens + message.usage.output_tokens
            : null
      }
    }
  }

  async completeText(prefix: string, suffix: string, model: string, signal?: AbortSignal): Promise<string> {
    const message = await this.client.messages.create(
      {
        model,
        max_tokens: 200,
        system: GHOST_TEXT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildGhostTextPrompt(prefix, suffix) }]
      },
      { signal }
    )
    const textBlock = message.content.find((block) => block.type === 'text')
    return textBlock && textBlock.type === 'text' ? textBlock.text : ''
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
    const anthropicTools: Anthropic.Tool[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }))
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }]

    for (let turn = 0; turn < MAX_TOOL_CALLS_PER_LOOP; turn++) {
      const response = await this.client.messages.create(
        { model, max_tokens: 2048, system: systemPrompt, tools: anthropicTools, messages },
        { signal }
      )
      const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
      if (!toolUses.length) {
        return response.content.filter((block): block is Anthropic.TextBlock => block.type === 'text').map((block) => block.text).join('\n')
      }
      messages.push({ role: 'assistant', content: response.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUses) {
        onProgress?.(`IA consultando: ${toolUse.name}...`)
        const result = await executeTool(toolUse.name, (toolUse.input ?? {}) as Record<string, unknown>)
        results.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result })
      }
      messages.push({ role: 'user', content: results })
    }
    return 'O agente atingiu o limite de chamadas de ferramentas antes de concluir a pesquisa.'
  }

  async testConnection(model: string): Promise<{ ok: boolean; message: string }> {
    try {
      await this.client.messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }]
      })
      return { ok: true, message: 'Conexão com a Anthropic funcionando.' }
    } catch (err) {
      return { ok: false, message: describeError(err) }
    }
  }
}
