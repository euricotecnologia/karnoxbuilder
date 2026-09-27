import { OpenAiCompatibleProvider } from '../src/main/ai/openAiCompatibleProvider'

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

function stream(text: string): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { content: text } }] }
      yield {
        choices: [{ delta: {} }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      }
    }
  }
}

const completeMain = `@@KX:PROJECT_NAME@@
ProjetoTeste
@@KX:EXPLANATION@@
Projeto para validar continuacao automatica.
@@KX:UNIT@@
@@KX:NAME@@
UnitMain
@@KX:FORM_CLASS@@
TFormMain
@@KX:IS_MAIN@@
true
@@KX:PAS@@
unit UnitMain;

interface

uses
  Vcl.Forms;

type
  TFormMain = class(TForm)
  end;

implementation

{$R *.dfm}

end.
@@KX:DFM@@
object FormMain: TFormMain
  Caption = 'Principal'
end
@@KX:END_UNIT@@
`

const interrupted = `${completeMain}@@KX:UNIT@@
@@KX:NAME@@
UnitDados
@@KX:IS_MAIN@@
false
@@KX:PAS@@
unit UnitDa`

const regeneratedTail = `@@KX:UNIT@@
@@KX:NAME@@
UnitDados
@@KX:IS_MAIN@@
false
@@KX:PAS@@
unit UnitDados;

interface

implementation

end.
@@KX:END_UNIT@@`

async function verify(): Promise<void> {
  const provider = new OpenAiCompatibleProvider('test-key', 'https://api.openai.com/v1') as any
  const responses = [interrupted, regeneratedTail]
  const sentMessages: unknown[] = []
  const progress: string[] = []

  provider.client = {
    chat: {
      completions: {
        create: async (params: { messages: unknown[] }) => {
          sentMessages.push(params.messages)
          const response = responses.shift()
          if (!response) throw new Error('A IDE solicitou mais continuacoes que o esperado.')
          return stream(response)
        }
      }
    }
  }

  const result = await provider.generateProject('Crie um projeto de teste.', 'gpt-5', [], (message: string) => {
    progress.push(message)
  })

  check(result.units.length === 2, 'A resposta recuperada deve conter as duas units.')
  check(result.units[0].unitName === 'UnitMain', 'A unit completa anterior deve ser preservada.')
  check(result.units[1].unitName === 'UnitDados', 'A unit interrompida deve ser regenerada.')
  check(sentMessages.length === 2, 'Deve haver uma chamada inicial e uma chamada de continuacao.')
  check(progress.some((message) => message.includes('Preservando 1 unit')), 'O progresso deve informar a recuperacao.')
  check(result.usage.totalTokens === 300, 'O uso das duas chamadas deve ser acumulado.')

  console.log('AI interrupted response recovery test: OK')
}

void verify()
