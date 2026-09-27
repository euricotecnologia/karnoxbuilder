export interface ProviderPreset {
  kind: string
  label: string
  providerType: 'anthropic' | 'openai-compatible'
  defaultBaseUrl: string | null
  requiresApiKey: boolean
  isLocal: boolean
  staticModels: string[]
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    kind: 'anthropic',
    label: 'Anthropic (Claude)',
    providerType: 'anthropic',
    defaultBaseUrl: null,
    requiresApiKey: true,
    isLocal: false,
    staticModels: ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5-20251001', 'claude-fable-5']
  },
  {
    kind: 'openai',
    label: 'OpenAI',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    isLocal: false,
    staticModels: [
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o3',
      'o3-mini',
      'o4-mini',
      'o1',
      'o1-mini'
    ]
  },
  {
    kind: 'openrouter',
    label: 'OpenRouter',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    isLocal: false,
    staticModels: [
      'anthropic/claude-sonnet-5',
      'openai/gpt-4o',
      'qwen/qwen-2.5-72b-instruct',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-chat'
    ]
  },
  {
    kind: 'gemini',
    label: 'Google Gemini',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresApiKey: true,
    isLocal: false,
    staticModels: [
      'gemini-3.5-flash',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite'
    ]
  },
  {
    kind: 'qwen',
    label: 'Qwen (Alibaba DashScope)',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    requiresApiKey: true,
    isLocal: false,
    staticModels: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen2.5-72b-instruct', 'qwen2.5-coder-32b-instruct']
  },
  {
    kind: 'lmstudio',
    label: 'LM Studio (local)',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'http://localhost:1234/v1',
    requiresApiKey: false,
    isLocal: true,
    staticModels: []
  },
  {
    kind: 'ollama',
    label: 'Ollama (local)',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'http://localhost:11434/v1',
    requiresApiKey: false,
    isLocal: true,
    staticModels: []
  },
  {
    kind: 'custom',
    label: 'Personalizado (compatível com OpenAI)',
    providerType: 'openai-compatible',
    defaultBaseUrl: '',
    requiresApiKey: false,
    isLocal: false,
    staticModels: []
  }
]

export function getPreset(kind: string): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.kind === kind) ?? PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1]
}
