import { sanitizeDfmContent } from '../src/main/ai/dfmConsistency'

function check(condition: unknown, message: string): void {
  if (!condition) {
    console.error('FALHOU: ' + message)
    process.exitCode = 1
  } else {
    console.log('OK: ' + message)
  }
}

// Reproduz exatamente o terceiro erro em runtime relatado: "Fixed row count
// must be less than row count." TStringGrid/TDrawGrid exigem FixedRows <
// RowCount (e FixedCols < ColCount) em tempo real — o setter da propriedade
// lança exceção ao carregar o formulário se isso não for respeitado, mesmo
// com todas as propriedades sendo válidas individualmente.
const dfm = `object FormMain: TFormMain
  Left = 0
  Top = 0
  object GridClientes: TStringGrid
    Left = 0
    Top = 144
    Width = 860
    Height = 357
    Align = alClient
    ColCount = 4
    DefaultColWidth = 200
    FixedCols = 0
    FixedRows = 1
    RowCount = 1
    Options = [goFixedVertLine, goFixedHorzLine, goVertLine, goHorzLine, goRowSelect]
    TabOrder = 1
    OnClick = GridClientesClick
  end
end
`
const result = sanitizeDfmContent(dfm)
check(/RowCount = 2/.test(result), 'RowCount deve ser elevado para 2 (FixedRows=1 + 1 linha de dados)')
check(/FixedRows = 1/.test(result), 'FixedRows não deve ser alterado (reflete a intenção de cabeçalho)')
check(/FixedCols = 0/.test(result), 'FixedCols (já válido: 0 < 4) não deve ser alterado')
check(/ColCount = 4/.test(result), 'ColCount (já válido) não deve ser alterado')
check(/Options = \[goFixedVertLine, goFixedHorzLine, goVertLine, goHorzLine, goRowSelect\]/.test(result), 'Options deve permanecer intacto')

// Caso ColCount também precisando de ajuste (FixedCols >= ColCount).
const dfmCols = `object FormMain: TFormMain
  object Grid1: TDrawGrid
    ColCount = 2
    FixedCols = 2
    RowCount = 5
    FixedRows = 1
  end
end
`
const resultCols = sanitizeDfmContent(dfmCols)
check(/ColCount = 3/.test(resultCols), 'ColCount deve ser elevado para 3 (FixedCols=2 + 1 coluna de dados)')
check(/FixedCols = 2/.test(resultCols), 'FixedCols não deve ser alterado')

// Caso já válido: nada deve mudar.
const dfmValid = `object FormMain: TFormMain
  object GridOk: TStringGrid
    ColCount = 4
    FixedCols = 1
    RowCount = 10
    FixedRows = 1
  end
end
`
const resultValid = sanitizeDfmContent(dfmValid)
check(/RowCount = 10/.test(resultValid), 'grid já válido: RowCount não deve mudar')
check(/ColCount = 4/.test(resultValid), 'grid já válido: ColCount não deve mudar')

// TDBGrid não usa RowCount/FixedRows (vêm do DataSet) — não deve ser tocado.
const dfmDbGrid = `object FormMain: TFormMain
  object DBGrid1: TDBGrid
    DataSource = DataSource1
  end
end
`
const resultDbGrid = sanitizeDfmContent(dfmDbGrid)
check(resultDbGrid.includes('DataSource = DataSource1'), 'TDBGrid não deve ser afetado pela correção de grids')

if (process.exitCode === 1) {
  console.error('\nAlgum teste falhou.')
} else {
  console.log('\nTodos os testes passaram.')
}
