import { ipcMain } from 'electron'
import { scaffoldDelphiProject, type ScaffoldProjectInput } from '../delphi/projectScaffold'
import { analyzeDelphiProject } from '../delphi/projectAnalyzer'

export function registerProjectHandlers(): void {
  ipcMain.handle('projects:scaffold', (_event, input: ScaffoldProjectInput) => scaffoldDelphiProject(input))
  ipcMain.handle('projects:analyze', (_event, projectDir: string) => analyzeDelphiProject(projectDir))
}
