import { ensureForLoopVariablesDeclared, repairPascalForDfm } from '../src/main/ai/pasFixup'

function check(condition: unknown, message: string): void {
  if (!condition) {
    console.error('FALHOU: ' + message)
    process.exitCode = 1
  } else {
    console.log('OK: ' + message)
  }
}

// Reproduz o bug original relatado: contadores de "for" (C, I) e uma
// variável auxiliar (SearchIn) usados em RefreshGrid sem nenhum "var"
// declarado na rotina, causando "Undeclared identifier" em cascata.
const unitOriginal = `unit UnitMain;

interface

uses
  System.SysUtils, Vcl.Forms, Vcl.Grids;

type
  TFormMain = class(TForm)
    GridClientes: TStringGrid;
    procedure RefreshGrid;
  end;

var
  FormMain: TFormMain;

implementation

{$R *.dfm}

procedure TFormMain.RefreshGrid;
begin
  SearchIn := 'nome';
  for I := 1 to 10 do
  begin
    for C := 0 to 3 do
      GridClientes.Cells[C, I] := SearchIn;
  end;
end;

end.
`

const { content, added } = ensureForLoopVariablesDeclared(unitOriginal)
check(added.length === 2 && added.includes('I') && added.includes('C') && !added.includes('SearchIn'), 'deve declarar apenas os contadores de for (I, C), não variáveis livres como SearchIn')
check(/var\s*\n\s*(I|C): Integer;\s*\n\s*(I|C): Integer;/.test(content), 'deve inserir "var I: Integer; C: Integer;" antes do begin')
check(/procedure TFormMain\.RefreshGrid;\s*\nvar/.test(content), 'seção var deve vir logo após o cabeçalho do método')

// Idempotência: rodar de novo não deve duplicar declarações.
const second = ensureForLoopVariablesDeclared(content)
check(second.added.length === 0, 'rodar novamente não deve encontrar mais variáveis faltando (idempotente)')
check((content.match(/\bI: Integer;/g) || []).length === 1, 'não deve duplicar a declaração de I na segunda passada')
check((content.match(/\bC: Integer;/g) || []).length === 1, 'não deve duplicar a declaração de C na segunda passada')

// Caso já com "var" existente (parcialmente declarado): deve completar sem
// duplicar o que já existe.
const unitPartialVar = `unit UnitMain;

interface

implementation

procedure TFormMain.RefreshGrid;
var
  C: TCliente;
begin
  for I := 1 to 10 do
    C.Nome := 'x';
end;

end.
`
const partialResult = ensureForLoopVariablesDeclared(unitPartialVar)
check(partialResult.added.length === 1 && partialResult.added[0] === 'I', 'deve declarar apenas I quando C já está declarado (ainda que com outro tipo)')
check(/var\s*\n\s*I: Integer;\s*\n\s*C: TCliente;/.test(partialResult.content), 'deve inserir a nova declaração logo após "var", preservando a existente')

// Caso limpo: nenhuma alteração.
const unitClean = `unit UnitMain;

interface

implementation

procedure TFormMain.RefreshGrid;
var
  I: Integer;
begin
  for I := 1 to 10 do
    ShowMessage(IntToStr(I));
end;

end.
`
const cleanResult = ensureForLoopVariablesDeclared(unitClean)
check(cleanResult.added.length === 0, 'unit já correta não deve ser alterada')
check(cleanResult.content === unitClean, 'conteúdo deve permanecer idêntico quando não há nada a corrigir')

// Parâmetro de rotina usado como contador de for não deve ser redeclarado.
const unitParam = `unit UnitMain;

interface

implementation

procedure TFormMain.FillRange(I: Integer);
begin
  for I := 1 to 10 do
    ShowMessage(IntToStr(I));
end;

end.
`
const paramResult = ensureForLoopVariablesDeclared(unitParam)
check(paramResult.added.length === 0, 'parâmetro da rotina não deve ser tratado como variável faltando')

// Fim a fim via repairPascalForDfm (unit COM dfm), garantindo que a nova
// rede de segurança está conectada ao fluxo principal de reparo.
const dfm = `object FormMain: TFormMain
  object GridClientes: TStringGrid
  end
end
`
const e2e = repairPascalForDfm(unitOriginal, dfm)
check(e2e.addedVariables.includes('I') && e2e.addedVariables.includes('C'), 'repairPascalForDfm deve expor addedVariables com I e C')
check(/var\s*\n\s*(I|C): Integer;/.test(e2e.content), 'repairPascalForDfm deve aplicar a declaração de variáveis de for no conteúdo final')

if (process.exitCode === 1) {
  console.error('\nAlgum teste falhou.')
} else {
  console.log('\nTodos os testes passaram.')
}
