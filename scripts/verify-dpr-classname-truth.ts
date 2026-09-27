import { buildDpr, buildDproj, type UnitSpec } from '../src/main/delphi/projectTemplate'

function check(condition: unknown, message: string): void {
  if (!condition) {
    console.error('FALHOU: ' + message)
    process.exitCode = 1
  } else {
    console.log('OK: ' + message)
  }
}

// Reproduz exatamente o bug do screenshot: a unit "UnitDatabase" chega ao
// buildDpr/buildDproj SEM formClassName preenchido (ex.: resposta da IA sem
// o marcador FORM_CLASS, ou uma falha de merge) — mas o .dfm real diz que a
// classe é TdmDatabase, não "TUnitDatabase".
const units: UnitSpec[] = [
  {
    unitName: 'UnitMain',
    pasContent: 'unit UnitMain;\ninterface\ntype\n  TFormMain = class(TForm)\n  end;\nvar\n  FormMain: TFormMain;\nimplementation\n{$R *.dfm}\nend.\n',
    dfmContent: 'object FormMain: TFormMain\n  Left = 0\nend\n',
    isMainForm: true,
    formClassName: 'TFormMain'
  },
  {
    unitName: 'UnitDatabase',
    pasContent: 'unit UnitDatabase;\ninterface\ntype\n  TdmDatabase = class(TDataModule)\n  end;\nvar\n  dmDatabase: TdmDatabase;\nimplementation\n{$R *.dfm}\nend.\n',
    dfmContent: 'object dmDatabase: TdmDatabase\n  Height = 150\nend\n',
    isMainForm: false,
    formClassName: undefined // <- exatamente o cenário que causava o bug
  }
]

const dpr = buildDpr({ projectName: 'Novapasta22', units }, 'delphi10_13')
console.log(dpr)

check(dpr.includes('Application.CreateForm(TdmDatabase, dmDatabase);'), 'deve usar a classe real do DFM (TdmDatabase), não adivinhar "TUnitDatabase"')
check(!dpr.includes('TUnitDatabase'), 'não deve conter o identificador inventado "TUnitDatabase"')
check(dpr.includes("UnitDatabase in 'UnitDatabase.pas' {TdmDatabase}"), 'o comentário de form no uses também deve usar a classe real do DFM')

const dproj = buildDproj({ projectName: 'Novapasta22', units })
check(dproj.includes('<Form>dmDatabase</Form>'), 'o .dproj deve referenciar a instância real (dmDatabase), não "UnitDatabase"')

if (process.exitCode === 1) {
  console.error('\nAlgum teste falhou.')
} else {
  console.log('\nTodos os testes passaram.')
}
