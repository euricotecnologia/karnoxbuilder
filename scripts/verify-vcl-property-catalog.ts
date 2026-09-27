import { isKnownProperty, isCataloguedClass } from '../src/main/ai/vclPropertyCatalog'
import { sanitizeDfmContent } from '../src/main/ai/dfmConsistency'

function check(condition: unknown, message: string): void {
  if (!condition) {
    console.error('FALHOU: ' + message)
    process.exitCode = 1
  } else {
    console.log('OK: ' + message)
  }
}

// Reproduz exatamente o segundo erro em runtime relatado: TStatusBar não
// publica TabOrder (diferente da maioria dos TWinControl).
check(!isKnownProperty('TStatusBar', 'TabOrder'), 'TStatusBar não deve reconhecer TabOrder')
check(!isKnownProperty('TStatusBar', 'TabStop'), 'TStatusBar não deve reconhecer TabStop')
check(isKnownProperty('TStatusBar', 'SimplePanel'), 'TStatusBar deve reconhecer SimplePanel (propriedade própria real)')
check(isKnownProperty('TStatusBar', 'Align'), 'TStatusBar deve reconhecer Align (herdado de TControl)')

// Fim a fim: sanitizeDfmContent deve remover a linha TabOrder de TStatusBar
// e preservar as demais propriedades reais do bloco.
const dfm = `object FormMain: TFormMain
  Left = 0
  Top = 0
  object StatusBar1: TStatusBar
    Left = 0
    Top = 501
    Width = 860
    Height = 19
    Panels = <>
    SimplePanel = True
    Align = alBottom
    TabOrder = 2
  end
end
`
const result = sanitizeDfmContent(dfm)
check(!/TabOrder/i.test(result), 'sanitizeDfmContent deve remover TabOrder de TStatusBar')
check(/SimplePanel = True/.test(result), 'SimplePanel deve ser preservado')
check(/Align = alBottom/.test(result), 'Align deve ser preservado')

// Casos gerais de confusão entre componentes parecidos, cobertos de uma vez
// pelo catálogo (sem precisar de exceção específica para cada um).
check(!isKnownProperty('TLabel', 'Text'), 'TLabel não deve reconhecer Text (usa Caption)')
check(isKnownProperty('TLabel', 'Caption'), 'TLabel deve reconhecer Caption')
check(!isKnownProperty('TEdit', 'Caption'), 'TEdit não deve reconhecer Caption (usa Text)')
check(isKnownProperty('TEdit', 'Text'), 'TEdit deve reconhecer Text')
check(!isKnownProperty('TPanel', 'Text'), 'TPanel não deve reconhecer Text (usa Caption)')
check(isKnownProperty('TPanel', 'Caption'), 'TPanel deve reconhecer Caption')
check(!isKnownProperty('TImage', 'Color'), 'TImage não deve reconhecer Color (TGraphicControl sem pintura de fundo própria)')
check(!isKnownProperty('TButton', 'Color'), 'TButton não deve reconhecer Color (tema nativo do SO)')
check(!isKnownProperty('TLabel', 'TabOrder'), 'TLabel não deve reconhecer TabOrder (TGraphicControl, sem handle de janela)')

// "Left"/"Top" precisam valer para QUALQUER componente, inclusive
// não-visuais (TTimer, TDataSource, TFDConnection...), pois o Delphi grava a
// posição do ícone no designer via DesignInfo, independente da classe.
check(isKnownProperty('TTimer', 'Left'), 'TTimer (não-visual) deve reconhecer Left via DesignInfo')
check(isKnownProperty('TDataSource', 'Top'), 'TDataSource (não-visual) deve reconhecer Top via DesignInfo')
check(isKnownProperty('TFDConnection', 'Name'), 'TFDConnection deve reconhecer Name')

// Eventos (On*) nunca são barrados pelo catálogo, mesmo sem estarem listados
// individualmente — não são "propriedades" no sentido do catálogo.
check(isKnownProperty('TStatusBar', 'OnClick'), 'eventos On* nunca devem ser barrados pelo catálogo')

// Classe fora do catálogo: sem validação (não quebra componentes não cobertos).
check(isKnownProperty('TQualquerComponenteDesconhecido', 'PropriedadeQualquer'), 'classes fora do catálogo não devem ser validadas (evita falso positivo)')
check(!isCataloguedClass('TQualquerComponenteDesconhecido'), 'classe desconhecida não deve constar como catalogada')
check(isCataloguedClass('TStatusBar'), 'TStatusBar deve constar como catalogada')

if (process.exitCode === 1) {
  console.error('\nAlgum teste falhou.')
} else {
  console.log('\nTodos os testes passaram.')
}
