import { fixInvalidComponentProperties, repairPascalForDfm } from '../src/main/ai/pasFixup'

function check(condition: unknown, message: string): void {
  if (!condition) {
    console.error('FALHOU: ' + message)
    process.exitCode = 1
  } else {
    console.log('OK: ' + message)
  }
}

// Reproduz exatamente o bug do screenshot: GridClientes.ReadOnly := True;
// em um campo TStringGrid, propriedade que não existe nessa classe.
const unit = `unit UnitMain;

interface

uses
  Vcl.Controls, Vcl.Forms, Vcl.Grids;

type
  TFormMain = class(TForm)
    GridClientes: TStringGrid;
    procedure FormCreate(Sender: TObject);
  private
    procedure InitializeGrid;
  end;

var
  FormMain: TFormMain;

implementation

{$R *.dfm}

procedure TFormMain.FormCreate(Sender: TObject);
begin
  InitializeGrid;
end;

procedure TFormMain.InitializeGrid;
begin
  GridClientes.ColCount := 4;
  GridClientes.Options := GridClientes.Options + [goRowSelect];
  GridClientes.ReadOnly := True;
end;

end.
`

const result = fixInvalidComponentProperties(unit)

check(result.fixed.includes('GridClientes.ReadOnly'), 'deveria detectar GridClientes.ReadOnly como propriedade inválida')
check(!/\.ReadOnly\s*:=/.test(result.content), 'a atribuição inválida a .ReadOnly não deve mais existir no conteúdo')
check(
  /GridClientes\.Options := GridClientes\.Options - \[goEditing\];/.test(result.content),
  'True deve virar remoção da flag goEditing (torna a grade não editável, comportamento equivalente pretendido)'
)

// False deve inverter a lógica (adicionar goEditing = permitir edição).
const unitFalse = unit.replace('GridClientes.ReadOnly := True;', 'GridClientes.ReadOnly := False;')
const resultFalse = fixInvalidComponentProperties(unitFalse)
check(
  /GridClientes\.Options := GridClientes\.Options \+ \[goEditing\];/.test(resultFalse.content),
  'False deve virar adição da flag goEditing (permite edição)'
)

// TDBGrid tem ReadOnly de verdade (diferente de TStringGrid/TDrawGrid) — não
// deve ser tocado. Usa um corpo realista de TDBGrid (sem ColCount, que é
// exclusivo de TStringGrid/TDrawGrid; no TDBGrid as colunas vêm de Columns).
const dbGridUnit = `unit UnitMain;

interface

uses
  Vcl.Controls, Vcl.Forms, Vcl.DBGrids;

type
  TFormMain = class(TForm)
    GridClientes: TDBGrid;
    procedure FormCreate(Sender: TObject);
  private
    procedure InitializeGrid;
  end;

var
  FormMain: TFormMain;

implementation

{$R *.dfm}

procedure TFormMain.FormCreate(Sender: TObject);
begin
  InitializeGrid;
end;

procedure TFormMain.InitializeGrid;
begin
  GridClientes.ReadOnly := True;
end;

end.
`
const dbGridResult = fixInvalidComponentProperties(dbGridUnit)
check(dbGridResult.fixed.length === 0, 'TDBGrid.ReadOnly é uma propriedade real e não deve ser alterada')
check(dbGridResult.content === dbGridUnit, 'conteúdo de TDBGrid não deve ser modificado')

// Fim a fim via repairPascalForDfm (o caminho real usado antes de compilar).
const dfm = `object FormMain: TFormMain
  Left = 0
  Top = 0
  object GridClientes: TStringGrid
    Left = 8
    Top = 8
  end
end
`
const fullRepair = repairPascalForDfm(unit, dfm, 'delphi10_13')
check(fullRepair.fixedProperties.includes('GridClientes.ReadOnly'), 'repairPascalForDfm (caminho real pré-compilação) também deve aplicar a correção')
check(!/\.ReadOnly\s*:=/.test(fullRepair.content), 'repairPascalForDfm não deve deixar a atribuição inválida no resultado final')

if (process.exitCode === 1) {
  console.error('\nAlgum teste falhou.')
} else {
  console.log('\nTodos os testes passaram.')
}
