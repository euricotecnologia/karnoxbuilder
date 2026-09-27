import { sanitizeDfmContent } from '../src/main/ai/dfmConsistency'

function check(condition: unknown, message: string): void {
  if (!condition) {
    console.error('FALHOU: ' + message)
    process.exitCode = 1
  } else {
    console.log('OK: ' + message)
  }
}

// Reproduz exatamente o erro em runtime do screenshot: "EReadError ... Error
// reading GridClientes.ReadOnly: Property ReadOnly does not exist." Isso
// acontece porque o .dfm ainda tinha "ReadOnly = True" mesmo depois da
// correção no .pas — o VCL Streaming lê o .dfm por RTTI ao criar o form.

// Caso 1: Options ANTES de ReadOnly (caso real do screenshot).
const dfmOptionsFirst = `object FormMain: TFormMain
  object GridClientes: TStringGrid
    Left = 0
    Top = 144
    Options = [goFixedVertLine, goFixedHorzLine, goRowSelect]
    ReadOnly = True
    TabOrder = 1
  end
end
`
const resultOptionsFirst = sanitizeDfmContent(dfmOptionsFirst)
check(!/ReadOnly/i.test(resultOptionsFirst), 'caso Options-antes: a linha ReadOnly deve ser removida')
check(!/goEditing/i.test(resultOptionsFirst), 'caso Options-antes: ReadOnly=True não deve adicionar goEditing (grade continua não editável)')
check(/Options = \[goFixedVertLine, goFixedHorzLine, goRowSelect\]/.test(resultOptionsFirst), 'caso Options-antes: o restante da lista de Options deve ser preservado')

// Caso 2: ReadOnly ANTES de Options (ordem inversa).
const dfmReadOnlyFirst = `object FormMain: TFormMain
  object GridClientes: TStringGrid
    Left = 0
    ReadOnly = False
    Options = [goFixedVertLine, goFixedHorzLine]
    TabOrder = 1
  end
end
`
const resultReadOnlyFirst = sanitizeDfmContent(dfmReadOnlyFirst)
check(!/ReadOnly/i.test(resultReadOnlyFirst), 'caso ReadOnly-antes: a linha ReadOnly deve ser removida')
check(/goEditing/i.test(resultReadOnlyFirst), 'caso ReadOnly-antes: ReadOnly=False deve adicionar goEditing (grade editável)')

// Caso 3: Options ausente por completo.
const dfmNoOptions = `object FormMain: TFormMain
  object GridClientes: TStringGrid
    Left = 0
    ReadOnly = True
    TabOrder = 1
  end
end
`
const resultNoOptions = sanitizeDfmContent(dfmNoOptions)
check(!/ReadOnly/i.test(resultNoOptions), 'caso sem Options: a linha ReadOnly deve ser removida mesmo sem Options presente')

// TDBGrid: ReadOnly é uma propriedade real e deve ser preservada.
const dfmDbGrid = `object FormMain: TFormMain
  object DBGrid1: TDBGrid
    Left = 0
    ReadOnly = True
    TabOrder = 1
  end
end
`
const resultDbGrid = sanitizeDfmContent(dfmDbGrid)
check(/ReadOnly = True/.test(resultDbGrid), 'TDBGrid.ReadOnly é uma propriedade real e deve permanecer intacta')

if (process.exitCode === 1) {
  console.error('\nAlgum teste falhou.')
} else {
  console.log('\nTodos os testes passaram.')
}
