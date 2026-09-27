import { strict as assert } from 'assert'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { applyNoCodeActions, saveNoCodeBinding } from '../src/main/noCode/noCodeService'
import { repairPascalForDfm } from '../src/main/ai/pasFixup'

const project = mkdtempSync(join(tmpdir(), 'karnox-nocode-'))
try {
  mkdirSync(join(project, '.karnox'), { recursive: true })
  const dfmPath = join(project, 'UnitMain.dfm')
  writeFileSync(dfmPath, 'object FormMain: TFormMain\nend\n')
  saveNoCodeBinding(project, {
    dfmPath, formClass: 'TFormMain', componentName: 'Button1', eventName: 'OnClick', methodName: 'Button1Click',
    actions: [
      { type: 'confirm', message: 'Continuar?' },
      { type: 'message', message: "Cliente d'Ávila salvo" },
      { type: 'openForm', unitName: 'UnitClientes', formClass: 'TFormClientes', modal: true },
      { type: 'setProperty', target: 'Label1', property: 'Caption', value: 'Pronto' }
    ]
  })
  const pas = `unit UnitMain;\ninterface\nuses Vcl.Forms, Vcl.ExtCtrls;\ntype TFormMain = class(TForm)\n  procedure Button1Click(Sender: TObject);\n  procedure Image1Click(Sender: TObject);\nend;\nimplementation\nprocedure TFormMain.Button1Click(Sender: TObject);\nbegin\nend;\nprocedure TFormMain.Image1Click(Sender: TObject);\nbegin\nend;\nend.`
  saveNoCodeBinding(project, {
    dfmPath, formClass: 'TFormMain', componentName: 'Image1', eventName: 'OnClick', methodName: 'Image1Click',
    actions: [{ type: 'imageFit' }, { type: 'imageFullscreen' }, { type: 'imageClear' }]
  })
  const generated = applyNoCodeActions(pas, project, dfmPath, 'delphi10_13')
  assert(generated.includes('Vcl.Dialogs'))
  assert(generated.includes('UnitClientes'))
  assert(generated.includes("MessageDlg('Continuar?'"))
  assert(generated.includes("ShowMessage('Cliente d''Ávila salvo')"))
  assert(generated.includes('with TFormClientes.Create(Application) do'))
  assert(generated.includes('    ShowModal;'))
  assert(generated.includes("Label1.Caption := 'Pronto';"))
  assert(generated.includes('procedure KarnoXShowImageFullScreen'))
  assert(generated.includes('KarnoXShowImageFullScreen(Self, Image1.Picture);'))
  assert(!generated.includes('Image1.Proportional := True;'))
  assert(generated.includes('Image1.Picture.Assign(nil);'))
  assert(generated.includes('Vcl.Graphics'))
  assert.equal((generated.match(/<KARNOX-NOCODE:/g) ?? []).length, 3)
  const regenerated = applyNoCodeActions(generated, project, dfmPath, 'delphi10_13')
  assert.equal((regenerated.match(/<KARNOX-NOCODE:/g) ?? []).length, 3)
  saveNoCodeBinding(project, {
    dfmPath, formClass: 'TFormMain', componentName: 'Button1', eventName: 'OnClick', methodName: 'Button1Click', actions: []
  })
  saveNoCodeBinding(project, {
    dfmPath, formClass: 'TFormMain', componentName: 'Image1', eventName: 'OnClick', methodName: 'Image1Click', actions: []
  })
  const removed = applyNoCodeActions(regenerated, project, dfmPath, 'delphi10_13')
  assert.equal((removed.match(/<KARNOX-NOCODE:/g) ?? []).length, 0)
  process.stdout.write('No-Code Delphi action generator test: OK\n')
} finally {
  rmSync(project, { recursive: true, force: true })
}

// Regressão: um componente removido do DFM pode deixar um campo órfão depois
// de um método. O Delphi gera E2169 até que todos os campos sejam reposicionados.
const orphanPas = `unit UnitOrphan;
interface
uses Vcl.Forms, Vcl.ExtCtrls;
type
  TFormOrphan = class(TForm)
    Image1: TImage;
    procedure Image1Click(Sender: TObject);
    Panel1: TPanel;
  private
    FInternal: Integer;
  end;
implementation
end.`
const orphanDfm = `object FormOrphan: TFormOrphan
  object Image1: TImage
    Left = 8
    Top = 8
    OnClick = Image1Click
  end
end`
const orphanRepair = repairPascalForDfm(orphanPas, orphanDfm, 'delphi10_13').content
const imageFieldAt = orphanRepair.indexOf('Image1: TImage;')
const orphanFieldAt = orphanRepair.indexOf('Panel1: TPanel;')
const methodAt = orphanRepair.indexOf('procedure Image1Click')
if (!(imageFieldAt >= 0 && orphanFieldAt > imageFieldAt && orphanFieldAt < methodAt)) throw new Error('Campos órfãos não foram movidos antes dos métodos.')
const privateAt = orphanRepair.indexOf('private')
if (!(privateAt > methodAt && orphanRepair.indexOf('FInternal: Integer;', privateAt) > privateAt)) throw new Error('A visibilidade de campos privados foi alterada.')
