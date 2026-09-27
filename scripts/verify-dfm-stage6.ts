import { repairPascalForDfm } from '../src/main/ai/pasFixup'
import { copyDfmBlocks, insertAdvancedDfmObject, pasteDfmBlocks, readDfmBinaryProperty, updateDfmBinaryProperty, updateManyDfmProperties } from '../src/renderer/src/components/Editor/DfmAdvancedEditor'
import { sanitizeDfmContent } from '../src/main/ai/dfmConsistency'
import { parseDfm } from '../src/renderer/src/components/Editor/dfmParser'

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

const pas = `unit UnitMain;
interface
uses Vcl.Forms;
type
  TFormMain = class(TForm)
  end;
implementation
{$R *.dfm}
end.
`
const dfm = `object FormMain: TFormMain
  Caption = 'Teste'
  object Button1: TButton
    Left = 16
    Top = 16
    Width = 75
    Height = 25
    Caption = 'Executar'
    OnClick = Button1Click
  end
end
`

const repaired = repairPascalForDfm(pas, dfm)
check(/Vcl\.StdCtrls/i.test(repaired.content), 'Unit do componente não foi adicionada.')
check(/Button1\s*:\s*TButton\s*;/i.test(repaired.content), 'Campo do componente não foi adicionado.')
check(/procedure\s+Button1Click\s*\(Sender:\s*TObject\)/i.test(repaired.content), 'Declaração do evento não foi adicionada.')
check(/procedure\s+TFormMain\.Button1Click/i.test(repaired.content), 'Implementação do evento não foi adicionada.')
check(repaired.content.indexOf('Button1: TButton;') < repaired.content.indexOf('procedure Button1Click'), 'O campo DFM precisa ficar antes do evento na classe.')
const repairedAgain = repairPascalForDfm(repaired.content, dfm)
check(repairedAgain.content === repaired.content, 'A sincronização DFM/Pascal precisa ser idempotente.')

const previouslyBroken = pas.replace('  end;', '    procedure Button1Click(Sender: TObject);\n    Button1: TButton;\n  end;')
const recovered = repairPascalForDfm(previouslyBroken, dfm)
check(recovered.content.indexOf('Button1: TButton;') < recovered.content.indexOf('procedure Button1Click'), 'Uma unit anteriormente inválida não foi recuperada.')

const bomDfm = '\uFEFF' + dfm
const insertedWithBom = insertAdvancedDfmObject(bomDfm, 'FormMain', { name: 'Button2', className: 'TButton', properties: { Left: 32, Top: 32, Caption: 'Novo' } })
check((insertedWithBom.match(/\uFEFF/g) ?? []).length === 1, 'O Designer propagou o BOM para as linhas do componente.')
const polluted = insertedWithBom.replace('    Left = 32', '\uFEFF    Left = 32')
const sanitized = sanitizeDfmContent(polluted)
check((sanitized.match(/\uFEFF/g) ?? []).length === 1 && sanitized.startsWith('\uFEFF'), 'O sanitizador não removeu BOMs internos.')

const imageDfm = insertAdvancedDfmObject(bomDfm, 'FormMain', { name: 'Image1', className: 'TImage', properties: { Left: 40, Top: 40, Width: 100, Height: 80 } })
const jpegPayload = '0A544A504547496D616765FFD8FFD9'
const withPicture = updateDfmBinaryProperty(imageDfm, 'Image1', 'Picture.Data', jpegPayload)
check(readDfmBinaryProperty(withPicture, 'Image1', 'Picture.Data') === jpegPayload, 'Picture.Data não foi persistido corretamente.')
check((withPicture.match(/Picture\.Data/g) ?? []).length === 1, 'Picture.Data foi duplicado.')
const imageRepair = repairPascalForDfm(pas, withPicture)
check(/Vcl\.Imaging\.jpeg/i.test(imageRepair.content), 'A unit JPEG não foi registrada para Picture.Data.')
const withoutPicture = updateDfmBinaryProperty(withPicture, 'Image1', 'Picture.Data', null)
check(!/Picture\.Data/.test(withoutPicture), 'Picture.Data não foi removido.')

const copied = copyDfmBlocks(dfm, ['Button1'])
const pasted = pasteDfmBlocks(dfm, 'FormMain', copied)
check(pasted.names.length === 1 && pasted.names[0] !== 'Button1', 'O componente colado não recebeu nome único.')
check((pasted.content.match(/object Button\d+: TButton/g) ?? []).length === 2, 'O componente não foi colado no DFM.')

console.log('Stage 6 DFM smoke test: OK')

const invalidImage = `object Form1: TForm
  object Image1: TImage
    Left = 8
    Top = 8
    Width = 100
    Height = 100
    TabOrder = 0
    TabStop = True
    Color = clRed
  end
end`
const repairedImage = sanitizeDfmContent(invalidImage)
check(!/TabOrder|TabStop|Color = clRed/.test(repairedImage), 'O sanitizador não removeu propriedades inválidas de TImage.')

const pictureWithBooleanProperties = `object Form1: TForm
  object Image1: TImage
    Left = 8
    Picture.Data = {
      0954506E67496D61676500}
    Stretch = False
    Proportional = False
    Center = False
  end
end`
const booleanUpdated = updateManyDfmProperties(pictureWithBooleanProperties, [
  { name: 'Image1', property: 'Stretch', value: true },
  { name: 'Image1', property: 'Proportional', value: true },
  { name: 'Image1', property: 'Center', value: true }
])
const parsedBooleanImage = parseDfm(booleanUpdated).children[0]
check(parsedBooleanImage.properties.Stretch === 'True', 'Stretch booleano não foi persistido como True.')
check(parsedBooleanImage.properties.Proportional === 'True', 'Proportional foi consumido pelo Picture.Data.')
check(parsedBooleanImage.properties.Center === 'True', 'Center booleano não foi persistido como True.')
