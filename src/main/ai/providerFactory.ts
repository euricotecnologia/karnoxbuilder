import { AIProviderError, type AIProvider } from './types'
import { AnthropicProvider } from './anthropicProvider'
import { OpenAiCompatibleProvider } from './openAiCompatibleProvider'
import { getAiProviderRaw, getDecryptedApiKey } from '../db/repositories/aiProvidersRepo'
import { getPreset } from './providerPresets'

export function buildProvider(providerId: string): { provider: AIProvider; model: string; isLocal: boolean } {
  const row = getAiProviderRaw(providerId)
  if (!row) {
    throw new AIProviderError('Provedor de IA não encontrado.')
  }

  const preset = getPreset(row.kind)
  const apiKey = getDecryptedApiKey(providerId)

  if (preset.requiresApiKey && !apiKey) {
    throw new AIProviderError(`Nenhuma chave de API cadastrada para "${row.name}".`)
  }

  const effectiveKey = apiKey ?? 'not-required'
  const baseUrl = row.base_url || preset.defaultBaseUrl || undefined
  const model = row.default_model || preset.staticModels[0] || ''

  if (row.provider_type === 'anthropic') {
    return { provider: new AnthropicProvider(effectiveKey), model, isLocal: false }
  }
  if (row.provider_type === 'openai-compatible') {
    return { provider: new OpenAiCompatibleProvider(effectiveKey, baseUrl, preset.isLocal), model, isLocal: preset.isLocal }
  }

  throw new AIProviderError(`Tipo de provedor desconhecido: ${row.provider_type}`)
}
