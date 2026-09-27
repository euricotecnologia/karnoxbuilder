import { OpenAiCompatibleProvider } from '../src/main/ai/openAiCompatibleProvider'

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

async function verify(): Promise<void> {
  const official = new OpenAiCompatibleProvider('test-key', 'https://api.openai.com/v1') as any
  const local = new OpenAiCompatibleProvider('not-required', 'http://localhost:1234/v1', true) as any

  const officialAttempts = official.tokenLimitAttempts(8)
  const localAttempts = local.tokenLimitAttempts(8)

  check(officialAttempts[0].max_completion_tokens === 8, 'OpenAI deve usar max_completion_tokens primeiro.')
  check(!('max_tokens' in officialAttempts[0]), 'OpenAI não pode enviar max_tokens na primeira tentativa.')
  check(localAttempts[0].max_tokens === 8, 'Servidor local deve usar max_tokens primeiro.')

  let retrievedModel = ''
  let chatCalled = false
  official.client = {
    models: {
      retrieve: async (model: string) => {
        retrievedModel = model
        return { id: model, object: 'model', created: 0, owned_by: 'openai' }
      }
    },
    chat: {
      completions: {
        create: async () => {
          chatCalled = true
          throw new Error('Chat Completions nÃ£o pode ser chamado pelo teste oficial.')
        }
      }
    }
  }

  const result = await official.testConnection('gpt-5')
  check(result.ok, 'O teste simulado da OpenAI deveria concluir com sucesso.')
  check(retrievedModel === 'gpt-5', 'O teste deve consultar os metadados do modelo selecionado.')
  check(!chatCalled, 'O teste oficial nÃ£o pode gerar texto nem chamar Chat Completions.')
  console.log('AI token parameter regression test: OK')
}

void verify()
