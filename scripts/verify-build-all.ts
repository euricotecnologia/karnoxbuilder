import { readFileSync } from 'fs'
import { join } from 'path'
import { groupBuildOrder, type GroupProject, type ProjectGroup } from '../src/renderer/src/projectGroup/projectGroup'

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

function project(name: string, dependencies: string[] = []): GroupProject {
  return {
    path: `C:\\Grupo\\${name}.dproj`,
    directory: `C:\\Grupo\\${name}`,
    name,
    guid: null,
    sourcePath: null,
    kind: name === 'App' ? 'application' : 'package',
    dependencies,
    enabled: true,
    fileTree: [],
    profile: 'delphi10_13'
  }
}

const runtime = project('Runtime')
const visual = project('Visual', [runtime.path])
const app = project('App', [visual.path])
const tests = project('Tests', [app.path])
const group: ProjectGroup = {
  path: 'C:\\Grupo\\Sistema.groupproj',
  directory: 'C:\\Grupo',
  name: 'Sistema',
  projects: [tests, app, visual, runtime]
}

const order = groupBuildOrder(group).map((item) => item.name)
check(order.join(',') === 'Runtime,Visual,App,Tests', `Ordem incorreta: ${order.join(',')}`)

const compiler = readFileSync(join(process.cwd(), 'src', 'main', 'delphi', 'compiler.ts'), 'utf8')
check(
  compiler.includes("forceRebuild || sanitizeResult.changed ? 'Rebuild' : 'Build'"),
  'O comando Compilar tudo deve forcar o alvo Rebuild.'
)

console.log('Build All dependency order and Rebuild target test: OK')
