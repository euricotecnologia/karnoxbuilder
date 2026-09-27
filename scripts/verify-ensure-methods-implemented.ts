import { ensureAllMethodsImplemented } from '../src/main/ai/pasFixup'

function check(condition: unknown, message: string): void {
  if (!condition) {
    console.error('FALHOU: ' + message)
    process.exitCode = 1
  } else {
    console.log('OK: ' + message)
  }
}

// Reproduz exatamente o padrão do screenshot: métodos declarados sem
// implementação (ClearEdits, GetSelectedIndex, LoadFromIndex).
const unit = `unit UnitMain;

interface

uses
  Winapi.Windows, Winapi.Messages, System.SysUtils, System.Variants, System.Classes, Vcl.Graphics,
  Vcl.Controls, Vcl.Forms, Vcl.Dialogs, Vcl.StdCtrls, Vcl.Grids;

type
  TFormMain = class(TForm)
    GridClientes: TStringGrid;
    procedure FormCreate(Sender: TObject);
  private
    procedure ClearEdits;
    function GetSelectedIndex: Integer;
    procedure LoadFromIndex(Index: Integer);
  end;

var
  FormMain: TFormMain;

implementation

{$R *.dfm}

procedure TFormMain.FormCreate(Sender: TObject);
begin
  ClearEdits;
end;

end.
`

const result = ensureAllMethodsImplemented(unit)

check(result.added.length === 3, `deveria detectar 3 métodos faltando, detectou ${result.added.length}: ${result.added.join(', ')}`)
check(result.added.includes('ClearEdits'), 'deveria detectar ClearEdits faltando')
check(result.added.includes('GetSelectedIndex'), 'deveria detectar GetSelectedIndex faltando')
check(result.added.includes('LoadFromIndex'), 'deveria detectar LoadFromIndex faltando')
check(/procedure TFormMain\.ClearEdits;/.test(result.content), 'deveria gerar stub de TFormMain.ClearEdits')
check(/function TFormMain\.GetSelectedIndex: Integer;/.test(result.content), 'deveria gerar stub de TFormMain.GetSelectedIndex com tipo de retorno Integer')
check(/procedure TFormMain\.LoadFromIndex\(Index: Integer\);/.test(result.content), 'deveria gerar stub de TFormMain.LoadFromIndex preservando os parâmetros')
check(result.content.trim().endsWith('end.'), 'o arquivo ainda deve terminar com "end."')

// Já implementado: FormCreate não deve ser duplicado.
const formCreateOccurrences = (result.content.match(/procedure TFormMain\.FormCreate/g) ?? []).length
check(formCreateOccurrences === 1, `FormCreate já estava implementado e não deve ser duplicado (encontrado ${formCreateOccurrences}x)`)

// Idempotência: rodar de novo não deve adicionar nada a mais.
const secondPass = ensureAllMethodsImplemented(result.content)
check(secondPass.added.length === 0, `segunda passada não deveria encontrar métodos faltando, encontrou ${secondPass.added.length}`)

// Caso sem problemas: não deve alterar o conteúdo.
const cleanUnit = `unit UnitClean;

interface

type
  TFormClean = class(TForm)
    procedure DoWork;
  end;

implementation

procedure TFormClean.DoWork;
begin
end;

end.
`
const cleanResult = ensureAllMethodsImplemented(cleanUnit)
check(cleanResult.added.length === 0, 'unit sem métodos faltando não deve reportar nada faltando')
check(cleanResult.content === cleanUnit, 'unit sem métodos faltando não deve ter o conteúdo alterado')

if (process.exitCode === 1) {
  console.error('\nAlgum teste falhou.')
} else {
  console.log('\nTodos os testes passaram.')
}
