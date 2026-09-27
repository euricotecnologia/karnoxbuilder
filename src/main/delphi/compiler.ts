import { spawn } from 'child_process'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { tmpdir } from 'os'
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { detectDefaultDelphiInstall, type DelphiInstall } from './detect'
import { sanitizeDfmContent } from '../ai/dfmConsistency'
import { repairPascalForDfm, ensureAllMethodsImplemented, fixInvalidComponentProperties, ensureForLoopVariablesDeclared } from '../ai/pasFixup'
import { applyNoCodeActions } from '../noCode/noCodeService'
import { DELPHI_PROFILES, type DelphiProfileId } from './profiles'
import type { CompilerLibraryPaths } from './libraryPaths'
import { scanDelphiComponentCatalog } from './componentCatalog'
import { parseCompileDiagnostics, type CompileDiagnostic } from './compilerDiagnostics'
export { parseCompileDiagnostics } from './compilerDiagnostics'
export type { CompileDiagnostic } from './compilerDiagnostics'

export type BuildPlatform = 'Win32' | 'Win64'
export type BuildConfig = 'Debug' | 'Release'

function copyDatabaseIniBesideExecutable(projectDir: string, exePath: string, emit: (chunk: string) => void): void {
  const sourcePath = join(projectDir, 'database.ini')
  if (!existsSync(sourcePath)) return
  try {
    let content = readFileSync(sourcePath, 'utf8')
    const driver = content.match(/^\s*DriverID\s*=\s*([^;\r\n]+)/im)?.[1].trim()
    const database = content.match(/^\s*Database\s*=\s*([^;\r\n]+)/im)?.[1].trim()
    if (driver?.toLowerCase() === 'sqlite' && database) {
      const absoluteDatabase = isAbsolute(database) ? database : resolve(dirname(sourcePath), database)
      const outputDatabase = relative(dirname(exePath), absoluteDatabase) || database
      content = content.replace(/^(\s*Database\s*=\s*)[^;\r\n]+/im, (_match, prefix: string) => prefix + outputDatabase)
    }
    writeFileSync(join(dirname(exePath), 'database.ini'), content, 'utf8')
    emit('database.ini copiado para a pasta do executável.\n')
  } catch (error) {
    emit(`Aviso: não foi possível copiar database.ini: ${error instanceof Error ? error.message : String(error)}\n`)
  }
}

export interface CompileResult {
  success: boolean
  exitCode: number | null
  exePath: string | null
  output: string
  diagnostics: CompileDiagnostic[]
}

interface SanitizeProjectResult {
  success: boolean
  changed: boolean
}

function ensureRuntimeThemes(
  dprojPath: string,
  projectDir: string,
  projectName: string,
  profileId: DelphiProfileId,
  emit: (chunk: string) => void
): boolean {
  if (DELPHI_PROFILES[profileId].buildSystem !== 'msbuild') return false
  const dprPath = dprojPath.toLowerCase().endsWith('.dproj')
    ? dprojPath.replace(/\.dproj$/i, '.dpr')
    : join(projectDir, `${projectName}.dpr`)
  if (!existsSync(dprPath)) return false

  let changed = false
  let dpr = readFileSync(dprPath, 'utf8')
  if (!/\{\$R\s+\*\.res\s*\}/i.test(dpr)) {
    const beginPattern = /^\s*begin\b/im
    if (!beginPattern.test(dpr)) throw new Error('Não foi possível localizar o bloco principal do DPR para ativar os estilos visuais.')
    dpr = dpr.replace(beginPattern, '{$R *.res}\r\n\r\nbegin')
    changed = true
  }

  const seenCreateForms = new Set<string>()
  dpr = dpr.replace(/^\s*Application\.CreateForm\([^;]+;\s*$/gim, (statement) => {
    const normalized = statement.trim().replace(/\s+/g, ' ').toLowerCase()
    if (seenCreateForms.has(normalized)) {
      changed = true
      return ''
    }
    seenCreateForms.add(normalized)
    return statement
  })
  if (changed) writeFileSync(dprPath, dpr, 'utf8')

  if (existsSync(dprojPath) && dprojPath.toLowerCase().endsWith('.dproj')) {
    let dproj = readFileSync(dprojPath, 'utf8')
    let dprojChanged = false
    if (!/<EnableRuntimeThemes>true<\/EnableRuntimeThemes>/i.test(dproj)) {
      dproj = dproj.replace(/(<PropertyGroup[^>]*>[\s\S]*?<Base>true<\/Base>)/i, '$1\n        <EnableRuntimeThemes>true</EnableRuntimeThemes>')
      dprojChanged = true
    }
    if (!/<Manifest_File>[^<]+<\/Manifest_File>/i.test(dproj)) {
      dproj = dproj.replace(/(<PropertyGroup[^>]*>[\s\S]*?<Base_Win32>true<\/Base_Win32>)/i, '$1\n        <Manifest_File>$(BDS)\\bin\\default_app.manifest</Manifest_File>')
      dprojChanged = true
    }
    if (dprojChanged) {
      writeFileSync(dprojPath, dproj, 'utf8')
      changed = true
    }
  }

  if (changed) emit('Estilos visuais modernos do Windows restaurados no projeto.\n')
  return changed
}

function projectPropertyPaths(projectFile: string, propertyName: string): string[] {
  try {
    const content = readFileSync(projectFile, 'utf-8')
    const pattern = new RegExp(`<${propertyName}>([\\s\\S]*?)<\\/${propertyName}>`, 'gi')
    return Array.from(content.matchAll(pattern))
      .flatMap((match) => match[1].replace(/&quot;/gi, '"').split(';'))
      .map((value) => value.trim())
      .filter((value) => value && value.toLowerCase() !== `$(${propertyName.toLowerCase()})`)
  } catch {
    return []
  }
}

function mergedPropertyPaths(projectFile: string, propertyName: string, additions: string[]): string[] {
  return Array.from(new Set([...projectPropertyPaths(projectFile, propertyName), ...additions]))
}

function sanitizeProjectDfmFiles(
  projectDir: string,
  profileId: DelphiProfileId,
  platform: BuildPlatform,
  config: BuildConfig,
  onOutput: (chunk: string) => void
): SanitizeProjectResult {
  let repairedCount = 0
  let repairedPasCount = 0
  let encodedSourceCount = 0
  const legacyAnsi = profileId === 'delphi7_2007'
  const catalogUnits = Object.fromEntries(scanDelphiComponentCatalog(projectDir, platform, config).map((item) => [item.className, item.unitName]))
  const encoding: BufferEncoding = legacyAnsi ? 'latin1' : 'utf-8'

  try {
    const dfmFiles = readdirSync(projectDir, { withFileTypes: true }).filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.dfm')
    )

    for (const entry of dfmFiles) {
      const filePath = join(projectDir, entry.name)
      const original = readFileSync(filePath, encoding)
      let sanitizedRaw: string
      try {
        sanitizedRaw = sanitizeDfmContent(original)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`${entry.name}: ${detail}`)
      }
      const sanitized = legacyAnsi ? sanitizedRaw.replace(/^\uFEFF/, '') : sanitizedRaw
      if (sanitized !== original) {
        writeFileSync(filePath, sanitized, encoding)
        repairedCount++
      }

      const pasPath = join(projectDir, entry.name.replace(/\.dfm$/i, '.pas'))
      if (existsSync(pasPath)) {
        const originalPas = readFileSync(pasPath, encoding)
        const repair = repairPascalForDfm(originalPas, sanitized, profileId, catalogUnits)
        const generatedPas = applyNoCodeActions(repair.content, projectDir, filePath, profileId)
        if (generatedPas !== originalPas) {
          writeFileSync(pasPath, generatedPas, encoding)
          repairedPasCount++
          const details = [...repair.addedUnits, ...repair.addedFields, ...repair.addedMethods, ...repair.addedVariables].join(', ')
          onOutput('Unit sincronizada com o DFM: ' + entry.name.replace(/\.dfm$/i, '.pas') + (details ? ' (' + details + ')' : '') + '.\n')
        }
      }
    }

    const sourceFiles = readdirSync(projectDir, { withFileTypes: true }).filter(
      (entry) => entry.isFile() && /\.(?:pas|dpr|inc)$/i.test(entry.name)
    )
    let repairedMethodsCount = 0
    for (const entry of sourceFiles) {
      const filePath = join(projectDir, entry.name)
      let current = readFileSync(filePath, encoding)
      const original = current

      // Units sem .dfm (DataModules, utilit\u00E1rias) n\u00E3o passam pelo repairPascalForDfm
      // acima \u2014 aplica aqui a mesma rede de seguran\u00E7a contra m\u00E9todos declarados
      // sem implementa\u00E7\u00E3o ("Unsatisfied forward or external declaration"), para
      // que essas units tamb\u00E9m sempre compilem.
      if (/\.pas$/i.test(entry.name) && !existsSync(filePath.replace(/\.pas$/i, '.dfm'))) {
        const propertyFix = fixInvalidComponentProperties(current)
        const methodRepair = ensureAllMethodsImplemented(propertyFix.content)
        const varRepair = ensureForLoopVariablesDeclared(methodRepair.content)
        if (methodRepair.added.length || propertyFix.fixed.length || varRepair.added.length) {
          current = varRepair.content
          repairedMethodsCount++
        }
      }

      if (legacyAnsi && current.startsWith('\uFEFF')) {
        current = current.replace(/^\uFEFF/, '')
      } else if (!legacyAnsi && !current.startsWith('\uFEFF')) {
        current = '\uFEFF' + current
      }

      if (current !== original) {
        writeFileSync(filePath, current, encoding)
        encodedSourceCount++
      }
    }

    if (repairedMethodsCount > 0) {
      onOutput(`Implementa\u00E7\u00E3o de m\u00E9todo(s) ausente(s) gerada automaticamente em ${repairedMethodsCount} arquivo(s) antes da compila\u00E7\u00E3o.\n`)
    }
    if (repairedCount > 0) {
      onOutput(`Correção automática aplicada em ${repairedCount} arquivo(s) DFM antes da compilação.\n`)
    }
    if (encodedSourceCount > 0) {
      onOutput(`Codificação UTF-8 aplicada em ${encodedSourceCount} arquivo(s) Delphi.\n`)
    }
    return { success: true, changed: repairedCount > 0 || repairedPasCount > 0 || encodedSourceCount > 0 || repairedMethodsCount > 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    onOutput(`Não foi possível validar os arquivos DFM antes da compilação: ${message}\n`)
    return { success: false, changed: false }
  }
}

export function resolveExePath(
  projectDir: string,
  projectName: string,
  platform: BuildPlatform,
  config: BuildConfig
): string {
  return join(projectDir, platform, config, `${projectName}.exe`)
}

export function compileProject(
  dprojPath: string,
  projectDir: string,
  projectName: string,
  platform: BuildPlatform,
  config: BuildConfig,
  profileId: DelphiProfileId,
  onOutput: (chunk: string) => void,
  install?: DelphiInstall | null,
  libraryPaths: CompilerLibraryPaths = { unit: [], include: [], resource: [], object: [], runtime: [] },
  forceRebuild = false
): Promise<CompileResult> {
  let fullOutput = ''
  const emit = (chunk: string): void => {
    fullOutput += chunk
    if (fullOutput.length > 250_000) fullOutput = fullOutput.slice(-250_000)
    onOutput(chunk)
  }
  const finish = (success: boolean, exitCode: number | null, exePath: string | null): CompileResult => ({
    success,
    exitCode,
    exePath,
    output: fullOutput,
    diagnostics: parseCompileDiagnostics(fullOutput)
  })
  const delphi = install ?? detectDefaultDelphiInstall()
  const profile = DELPHI_PROFILES[profileId]

  if (!delphi) {
    emit('Nenhuma instalação do RAD Studio foi encontrada nesta máquina.\n')
    return Promise.resolve(finish(false, null, null))
  }

  if (!existsSync(dprojPath)) {
    emit(`Arquivo de projeto não encontrado: ${dprojPath}\n`)
    return Promise.resolve(finish(false, null, null))
  }

  if (platform === 'Win64' && (!profile.supportsWin64 || !delphi.dcc64Path)) {
    emit(`O perfil ${profile.label} ou a instalaÃ§Ã£o selecionada nÃ£o oferece compilador Win64.\n`)
    return Promise.resolve(finish(false, null, null))
  }

  let runtimeThemesChanged = false
  try {
    runtimeThemesChanged = ensureRuntimeThemes(dprojPath, projectDir, projectName, profileId, emit)
  } catch (error) {
    emit(`Não foi possível validar os estilos visuais do projeto: ${error instanceof Error ? error.message : String(error)}\n`)
    return Promise.resolve(finish(false, null, null))
  }

  const sanitizeResult = sanitizeProjectDfmFiles(projectDir, profileId, platform, config, emit)
  if (!sanitizeResult.success) {
    return Promise.resolve(finish(false, null, null))
  }

  return new Promise((resolve) => {
    // Se o pré-processamento alterou PAS/DFM, uma recompilação completa é
    // necessária para não reutilizar DCUs que ainda embutem o DFM inválido.
    const buildTarget = forceRebuild || sanitizeResult.changed || runtimeThemesChanged ? 'Rebuild' : 'Build'
    let child
    let commandFilePath: string | null = null
    const spawnCommandFile = (lines: string[], environment: NodeJS.ProcessEnv = process.env) => {
      commandFilePath = join(tmpdir(), 'karnox-build-' + process.pid + '-' + Date.now() + '.cmd')
      writeFileSync(commandFilePath, ['@echo off', 'chcp 65001 >nul', ...lines].join('\r\n') + '\r\n', 'utf8')
      return spawn('cmd.exe', ['/d', '/c', commandFilePath], {
        cwd: projectDir,
        shell: false,
        env: environment
      })
    }
    const removeCommandFile = (): void => {
      if (!commandFilePath) return
      try { unlinkSync(commandFilePath) } catch { /* limpeza posterior pelo Windows */ }
      commandFilePath = null
    }
    if (profile.buildSystem === 'msbuild') {
      if (!delphi.rsvarsPath || !dprojPath.toLowerCase().endsWith('.dproj')) {
        emit('Este perfil moderno exige uma instalaÃ§Ã£o RAD Studio com rsvars.bat e um projeto .dproj.\n')
        resolve(finish(false, null, null))
        return
      }
      const propertyGroups: Array<[string, string[]]> = [
        ['DCC_UnitSearchPath', libraryPaths.unit],
        ['DCC_IncludePath', libraryPaths.include],
        ['DCC_ResourcePath', libraryPaths.resource],
        ['DCC_ObjPath', libraryPaths.object]
      ]
      const msbuildEnvironment: NodeJS.ProcessEnv = { ...process.env }
      propertyGroups
        .map(([propertyName, additions]) => [propertyName, mergedPropertyPaths(dprojPath, propertyName, additions)] as const)
        .filter(([, paths]) => paths.length > 0)
        .forEach(([propertyName, paths]) => {
          // O MSBuild importa variáveis do ambiente como propriedades iniciais.
          // Isso preserva a lista real separada por ponto e vírgula sem colocá-la
          // na linha de comando, onde poderia virar um único nome de arquivo e
          // causar E2288 ao ultrapassar o limite MAX_PATH.
          msbuildEnvironment[propertyName] = paths.join(';')
        })
      const command = 'msbuild "' + dprojPath + '" /t:' + buildTarget + ' /p:Config=' + config + ' /p:Platform=' + platform
      child = spawnCommandFile(
        ['call "' + delphi.rsvarsPath + '"', 'if errorlevel 1 exit /b %errorlevel%', command],
        msbuildEnvironment
      )
    } else {
      const compilerPath = platform === 'Win64' ? delphi.dcc64Path : delphi.dcc32Path
      if (!compilerPath) {
        emit(`Compilador ${platform} nÃ£o encontrado na instalaÃ§Ã£o selecionada.\n`)
        resolve(finish(false, null, null))
        return
      }
      const dccArgs = [
        '-B',
        '-Q',
        `-D${config.toUpperCase()}`,
        ...(libraryPaths.unit.length ? [`-U${libraryPaths.unit.join(';')}`] : []),
        ...(libraryPaths.include.length ? [`-I${libraryPaths.include.join(';')}`] : []),
        ...(libraryPaths.resource.length ? [`-R${libraryPaths.resource.join(';')}`] : []),
        ...(libraryPaths.object.length ? [`-O${libraryPaths.object.join(';')}`] : []),
        dprojPath
      ]
      if (delphi.rsvarsPath) {
        const quotedArgs = dccArgs.map((arg) => `"${arg.replace(/"/g, '""')}"`).join(' ')
        const command = '"' + compilerPath + '" ' + quotedArgs
        child = spawnCommandFile(['call "' + delphi.rsvarsPath + '"', 'if errorlevel 1 exit /b %errorlevel%', command])
      } else {
        child = spawn(compilerPath, dccArgs, { cwd: projectDir, shell: false })
      }
    }

    child.stdout.on('data', (data: Buffer) => emit(data.toString('utf-8')))
    child.stderr.on('data', (data: Buffer) => emit(data.toString('utf-8')))

    child.on('close', (exitCode) => {
      removeCommandFile()
      const success = exitCode === 0
      const exePath = profile.buildSystem === 'msbuild'
        ? resolveExePath(projectDir, projectName, platform, config)
        : join(projectDir, `${projectName}.exe`)
      if (success && existsSync(exePath)) copyDatabaseIniBesideExecutable(projectDir, exePath, emit)
      resolve(finish(success, exitCode, success && existsSync(exePath) ? exePath : null))
    })

    child.on('error', (err) => {
      removeCommandFile()
      emit(`Falha ao iniciar o processo de build: ${err.message}\n`)
      resolve(finish(false, null, null))
    })
  })
}

export function runExecutable(
  exePath: string,
  onOutput: (chunk: string) => void,
  runtimePaths: string[] = []
): void {
  if (!existsSync(exePath)) {
    onOutput(`Executável não encontrado: ${exePath}\n`)
    return
  }
  const runtimePath = runtimePaths.filter(existsSync).join(';')
  const env = { ...process.env, PATH: runtimePath ? `${runtimePath};${process.env.PATH ?? ''}` : process.env.PATH }
  const child = spawn(exePath, [], { detached: true, stdio: 'ignore', cwd: dirname(exePath), env })
  child.unref()
  onOutput(`Executando ${exePath}...\n`)
}
