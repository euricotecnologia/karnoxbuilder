import { isKnownProperty } from '../src/main/ai/vclPropertyCatalog'
import { sanitizeDfmContent } from '../src/main/ai/dfmConsistency'

function check(condition: unknown, message: string): void {
  if (!condition) {
    console.error('FALHOU: ' + message)
    process.exitCode = 1
  } else {
    console.log('OK: ' + message)
  }
}

// Regressão encontrada em auditoria: a primeira versão do catálogo não
// reconhecia propriedades que o PRÓPRIO Delphi Designer grava automaticamente
// em qualquer formulário real (não só gerado por IA) — ExplicitLeft/Top/
// Width/Height, Margins, AlignWithMargins, StyleElements, Padding. Como
// sanitizeDfmContent roda em TODO projeto recompilado na IDE, isso corromperia
// silenciosamente qualquer .dfm legítimo reaberto no KarnoX Builder.
check(isKnownProperty('TLabel', 'ExplicitLeft'), 'ExplicitLeft deve ser reconhecido (gravado pelo Designer em qualquer controle com Align/Anchors)')
check(isKnownProperty('TEdit', 'ExplicitWidth'), 'ExplicitWidth deve ser reconhecido')
check(isKnownProperty('TPanel', 'Margins'), 'Margins deve ser reconhecido (TControl, desde Delphi 2010)')
check(isKnownProperty('TPanel', 'AlignWithMargins'), 'AlignWithMargins deve ser reconhecido')
check(isKnownProperty('TForm', 'StyleElements'), 'StyleElements deve ser reconhecido (VCL Styles, Delphi 10+)')
check(isKnownProperty('TButton', 'StyleElements'), 'StyleElements deve valer para qualquer TControl, não só TForm')
check(isKnownProperty('TPanel', 'Padding'), 'Padding deve ser reconhecido em TWinControl')
check(!isKnownProperty('TLabel', 'Padding'), 'Padding é exclusivo de TWinControl — TLabel (TGraphicControl) não deve reconhecer')

// Regressão: TextHint que o próprio noCodeFormGenerator.ts grava em campos de
// e-mail (`TextHint = 'nome@exemplo.com'`) precisa sobreviver ao sanitizador.
check(isKnownProperty('TEdit', 'TextHint'), 'TEdit.TextHint deve ser reconhecido (usado pelo próprio gerador No-Code)')
check(isKnownProperty('TComboBox', 'TextHint'), 'TComboBox.TextHint deve ser reconhecido')

// TComboBox não tem ReadOnly de verdade (usa Style = csDropDownList).
check(!isKnownProperty('TComboBox', 'ReadOnly'), 'TComboBox não deve reconhecer ReadOnly (não existe; usa Style = csDropDownList)')

// Fim a fim: um .dfm com a "cara" real do Delphi Designer moderno não deve
// perder nenhuma dessas propriedades ao passar pelo sanitizador.
const dfm = `object FormMain: TFormMain
  Left = 0
  Top = 0
  Caption = 'Cadastro'
  ClientHeight = 300
  ClientWidth = 500
  Color = clBtnFace
  StyleElements = [seFont, seClient, seBorder]
  object PanelTop: TPanel
    Left = 0
    Top = 0
    Width = 500
    Height = 100
    Align = alTop
    Margins.Left = 8
    Margins.Top = 8
    AlignWithMargins = True
    Padding.Left = 4
    BevelOuter = bvNone
    TabOrder = 0
    StyleElements = [seFont, seClient, seBorder]
    object EditEmail: TEdit
      Left = 8
      Top = 24
      Width = 200
      Height = 23
      ExplicitLeft = 0
      ExplicitTop = 16
      ExplicitWidth = 121
      TabOrder = 0
      TextHint = 'nome@exemplo.com'
    end
  end
end
`
const result = sanitizeDfmContent(dfm)
check(/StyleElements = \[seFont, seClient, seBorder\]/.test(result), 'StyleElements deve sobreviver ao sanitizador (aparece 2x no fixture)')
check(/Margins\.Left = 8/.test(result), 'Margins.Left deve sobreviver')
check(/AlignWithMargins = True/.test(result), 'AlignWithMargins deve sobreviver')
check(/Padding\.Left = 4/.test(result), 'Padding.Left deve sobreviver')
check(/ExplicitLeft = 0/.test(result), 'ExplicitLeft deve sobreviver')
check(/ExplicitWidth = 121/.test(result), 'ExplicitWidth deve sobreviver')
check(/TextHint = 'nome@exemplo\.com'/.test(result), 'TextHint deve sobreviver (usado pelo gerador No-Code)')

if (process.exitCode === 1) {
  console.error('\nAlgum teste falhou.')
} else {
  console.log('\nTodos os testes passaram.')
}
