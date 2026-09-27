import { strict as assert } from 'assert'
import { parseCompileDiagnostics } from '../src/main/delphi/compilerDiagnostics'

const output = [
  'C:\\Projeto\\UnitMain.pas(19,7): error E2029: IMPLEMENTATION expected [C:\\Projeto\\App.dproj]',
  "UnitDashboard.pas(21) Error: E2029 Declaration expected but end of file found",
  "UnitCliente.pas(42): E2065 Unsatisfied forward or external declaration",
  "UnitAviso.pas(8) Warning: W1024 Combining signed and unsigned types"
].join('\n')

const diagnostics = parseCompileDiagnostics(output)
assert.equal(diagnostics.length, 4)
assert.deepEqual(
  diagnostics.map(({ file, line, column, severity, code }) => ({ file, line, column, severity, code })),
  [
    { file: 'C:\\Projeto\\UnitMain.pas', line: 19, column: 7, severity: 'error', code: 'E2029' },
    { file: 'UnitDashboard.pas', line: 21, column: null, severity: 'error', code: 'E2029' },
    { file: 'UnitCliente.pas', line: 42, column: null, severity: 'error', code: 'E2065' },
    { file: 'UnitAviso.pas', line: 8, column: null, severity: 'warning', code: 'W1024' }
  ]
)

process.stdout.write('Delphi compiler diagnostic line parsing test: OK\n')
