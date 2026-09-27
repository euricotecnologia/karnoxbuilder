import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync,
  statSync, writeFileSync
} from 'fs'
import { basename, dirname, extname, join, parse, resolve } from 'path'
import { deflateRawSync } from 'zlib'
import { detectDefaultDelphiInstall, validateDelphiPath } from '../delphi/detect'
import { getCompilerLibraryPaths } from '../delphi/libraryPaths'
import { getSetting } from '../db/repositories/settingsRepo'
import { getPublishCertificatePassword } from '../db/repositories/publishProfilesRepo'
import type {
  PublishAnalysis, PublishDependency, PublishProfile, PublishResult
} from './types'

const SYSTEM_DLLS = new Set([
  'advapi32.dll', 'bcrypt.dll', 'comctl32.dll', 'comdlg32.dll', 'crypt32.dll', 'dwmapi.dll',
  'gdi32.dll', 'imm32.dll', 'kernel32.dll', 'msimg32.dll', 'netapi32.dll', 'ntdll.dll',
  'ole32.dll', 'oleaut32.dll', 'rpcrt4.dll', 'secur32.dll', 'shell32.dll', 'shlwapi.dll',
  'user32.dll', 'userenv.dll', 'uxtheme.dll', 'version.dll', 'winhttp.dll', 'wininet.dll',
  'winmm.dll', 'ws2_32.dll', 'msvcrt.dll', 'iphlpapi.dll', 'setupapi.dll', 'psapi.dll',
  'dbghelp.dll', 'dnsapi.dll', 'wtsapi32.dll', 'winspool.drv', 'mpr.dll', 'urlmon.dll',
  'normaliz.dll', 'ncrypt.dll', 'cryptbase.dll', 'sspicli.dll', 'powrprof.dll', 'hid.dll'
])

function installation() {
  const configured = getSetting('delphi_studio_path')
  return configured ? validateDelphiPath(configured) : detectDefaultDelphiInstall()
}

function isSystemDependency(name: string): boolean {
  const lower = name.toLowerCase()
  return SYSTEM_DLLS.has(lower) || lower.startsWith('api-ms-win-') || lower.startsWith('ext-ms-')
}

function readCString(buffer: Buffer, offset: number): string {
  let end = offset
  while (end < buffer.length && buffer[end] !== 0) end += 1
  return buffer.toString('ascii', offset, end)
}

export function readPeImports(filePath: string): string[] {
  try {
    const buffer = readFileSync(filePath)
    if (buffer.length < 256 || buffer.toString('ascii', 0, 2) !== 'MZ') return []
    const peOffset = buffer.readUInt32LE(0x3c)
    if (peOffset + 256 >= buffer.length || buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') return []
    const coff = peOffset + 4
    const sectionsCount = buffer.readUInt16LE(coff + 2)
    const optionalSize = buffer.readUInt16LE(coff + 16)
    const optional = coff + 20
    const magic = buffer.readUInt16LE(optional)
    const directory = optional + (magic === 0x20b ? 112 : 96)
    const importRva = buffer.readUInt32LE(directory + 8)
    if (!importRva) return []
    const sectionTable = optional + optionalSize
    const sections: Array<{ va: number; size: number; raw: number }> = []
    for (let index = 0; index < sectionsCount; index += 1) {
      const offset = sectionTable + index * 40
      if (offset + 40 > buffer.length) break
      sections.push({
        va: buffer.readUInt32LE(offset + 12),
        size: Math.max(buffer.readUInt32LE(offset + 8), buffer.readUInt32LE(offset + 16)),
        raw: buffer.readUInt32LE(offset + 20)
      })
    }
    const rvaOffset = (rva: number): number => {
      const section = sections.find((item) => rva >= item.va && rva < item.va + item.size)
      return section ? section.raw + (rva - section.va) : rva
    }
    const imports: string[] = []
    let descriptor = rvaOffset(importRva)
    for (let count = 0; count < 2048 && descriptor + 20 <= buffer.length; count += 1, descriptor += 20) {
      const nameRva = buffer.readUInt32LE(descriptor + 12)
      const firstThunk = buffer.readUInt32LE(descriptor + 16)
      if (!nameRva && !firstThunk) break
      const name = readCString(buffer, rvaOffset(nameRva)).trim()
      if (name && !imports.some((item) => item.toLowerCase() === name.toLowerCase())) imports.push(name)
    }
    return imports
  } catch { return [] }
}

function findCaseInsensitive(directory: string, name: string): string | null {
  const direct = join(directory, name)
  if (existsSync(direct)) return direct
  try {
    const found = readdirSync(directory).find((item) => item.toLowerCase() === name.toLowerCase())
    return found ? join(directory, found) : null
  } catch { return null }
}

function dependencySearchPaths(profile: PublishProfile): string[] {
  const install = installation()
  const libraryPaths = getCompilerLibraryPaths(profile.projectPath, profile.platform, profile.buildConfig, install)
  const candidates = [dirname(profile.exePath), profile.projectPath, ...libraryPaths.runtime, ...libraryPaths.unit]
  if (install) candidates.push(install.binPath)
  return candidates.filter((item, index, all) => item && existsSync(item) && all.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index)
}

function runtimeDependencyHints(projectPath: string): string[] {
  const hints = new Set<string>()
  let inspected = 0
  const visit = (directory: string, depth: number): void => {
    if (depth > 6 || inspected > 1200) return
    let names: string[] = []
    try { names = readdirSync(directory) } catch { return }
    for (const name of names) {
      if (inspected > 1200 || /^(?:\.git|node_modules|Win32|Win64|publish)$/i.test(name)) continue
      const path = join(directory, name)
      try {
        if (statSync(path).isDirectory()) { visit(path, depth + 1); continue }
        if (!/\.(?:pas|dpr|dfm|ini|json|cfg)$/i.test(name)) continue
        inspected += 1
        const source = readFileSync(path, 'utf8')
        if (/DriverID\s*=\s*FB|TFDPhysFBDriverLink|Firebird/i.test(source)) hints.add('fbclient.dll')
        if (/DriverID\s*=\s*SQLite|TFDPhysSQLiteDriverLink/i.test(source)) hints.add('sqlite3.dll')
        if (/DriverID\s*=\s*PG|TFDPhysPgDriverLink|PostgreSQL/i.test(source)) hints.add('libpq.dll')
        if (/DriverID\s*=\s*MySQL|TFDPhysMySQLDriverLink|MySQL/i.test(source)) hints.add('libmysql.dll')
        if (/DriverID\s*=\s*Ora|TFDPhysOracleDriverLink|\bOCI\b/i.test(source)) hints.add('oci.dll')
        for (const match of source.matchAll(/["']([^"']+\.(?:dll|bpl))["']/gi)) hints.add(basename(match[1]))
      } catch { /* ignora arquivo ilegÃ­vel */ }
    }
  }
  if (existsSync(projectPath)) visit(projectPath, 0)
  return Array.from(hints)
}

export function analyzePublishDependencies(profile: PublishProfile): PublishDependency[] {
  if (!existsSync(profile.exePath)) return []
  const searchPaths = dependencySearchPaths(profile)
  const result = new Map<string, PublishDependency>()
  const queue: Array<{ path: string; requestedBy: string }> = [{ path: profile.exePath, requestedBy: basename(profile.exePath) }]
  const inspected = new Set<string>()
  while (queue.length) {
    const current = queue.shift()!
    const normalized = current.path.toLowerCase()
    if (inspected.has(normalized)) continue
    inspected.add(normalized)
    for (const name of readPeImports(current.path)) {
      const key = name.toLowerCase()
      if (isSystemDependency(name)) {
        if (!result.has(key)) result.set(key, { name, requestedBy: basename(current.path), sourcePath: null, system: true, status: 'system' })
        continue
      }
      const sourcePath = searchPaths.map((directory) => findCaseInsensitive(directory, name)).find(Boolean) ?? null
      const dependency: PublishDependency = {
        name, requestedBy: basename(current.path), sourcePath, system: false, status: sourcePath ? 'found' : 'missing'
      }
      const previous = result.get(key)
      if (!previous || previous.status === 'missing') result.set(key, dependency)
      if (sourcePath && !inspected.has(sourcePath.toLowerCase())) queue.push({ path: sourcePath, requestedBy: name })
    }
  }
  const addHint = (name: string, requestedBy: string): void => {
    const key = name.toLowerCase()
    if (result.has(key) || isSystemDependency(name)) return
    const sourcePath = searchPaths.map((directory) => findCaseInsensitive(directory, name)).find(Boolean) ?? null
    result.set(key, { name, requestedBy, sourcePath, system: false, status: sourcePath ? 'found' : 'missing' })
    if (!sourcePath || inspected.has(sourcePath.toLowerCase())) return
    inspected.add(sourcePath.toLowerCase())
    for (const imported of readPeImports(sourcePath)) addHint(imported, name)
  }
  for (const hint of runtimeDependencyHints(profile.projectPath)) addHint(hint, 'configuraÃ§Ã£o do projeto')
  return Array.from(result.values()).sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name))
}

function locateSignTool(custom: string): string | null {
  if (custom && existsSync(custom)) return custom
  const roots = ['C:\\Program Files (x86)\\Windows Kits\\10\\bin', 'C:\\Program Files\\Windows Kits\\10\\bin']
  const candidates: string[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    try {
      for (const version of readdirSync(root)) {
        for (const arch of ['x64', 'x86']) {
          const path = join(root, version, arch, 'signtool.exe')
          if (existsSync(path)) candidates.push(path)
        }
      }
    } catch { /* sem acesso */ }
  }
  return candidates.sort().at(-1) ?? null
}

function locateInstallerCompiler(custom: string): string | null {
  if (custom && existsSync(custom)) return custom
  const candidates = [
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe', 'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files (x86)\\Inno Setup 5\\ISCC.exe', 'C:\\Program Files\\Inno Setup 5\\ISCC.exe'
  ]
  return candidates.find(existsSync) ?? null
}

function outputIsSafe(profile: PublishProfile): boolean {
  if (!profile.outputDir.trim()) return false
  const output = resolve(profile.outputDir)
  const project = resolve(profile.projectPath)
  const root = parse(output).root
  return output.toLowerCase() !== project.toLowerCase() && output.toLowerCase() !== root.toLowerCase()
}

export function analyzePublish(profile: PublishProfile): PublishAnalysis {
  const dependencies = profile.copyDependencies ? analyzePublishDependencies(profile) : []
  const missingDependencies = dependencies.filter((item) => item.status === 'missing').map((item) => item.name)
  const missingExternalFiles = profile.externalFiles.filter((path) => !existsSync(path))
  const signTool = locateSignTool(profile.signToolPath)
  const installerCompiler = locateInstallerCompiler(profile.installerCompilerPath)
  const warnings: string[] = []
  if (!profile.iconPath) warnings.push('Nenhum ícone personalizado foi configurado.')
  if (!profile.manifestPath) warnings.push('Será utilizado o manifesto padrão do Delphi.')
  if (profile.generateUpdateManifest && !profile.updateBaseUrl) warnings.push('O manifesto de atualização será gerado com caminho relativo.')
  if (profile.signExecutable && !signTool) warnings.push('SignTool não encontrado.')
  if (profile.signExecutable && !profile.certificatePath && !profile.certificateThumbprint) warnings.push('Certificado de assinatura não configurado.')
  if (profile.generateInstaller && !installerCompiler) warnings.push('Compilador do Inno Setup não encontrado.')
  const executableExists = existsSync(profile.exePath)
  const outputDirectoryValid = outputIsSafe(profile)
  const requiredToolsReady = (!profile.signExecutable || (!!signTool && (!!profile.certificatePath || !!profile.certificateThumbprint)))
    && (!profile.generateInstaller || !!installerCompiler)
  return {
    executableExists, outputDirectoryValid, dependencies, missingDependencies, missingExternalFiles,
    tools: { signTool, installerCompiler }, warnings,
    canPublish: executableExists && outputDirectoryValid && !missingDependencies.length && !missingExternalFiles.length && requiredToolsReady
  }
}

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function backupOnce(path: string): void {
  const backup = `${path}.karnox-publish-backup`
  if (existsSync(path) && !existsSync(backup)) copyFileSync(path, backup)
}

export function preparePublishMetadata(profile: PublishProfile): { changedFiles: string[]; warnings: string[] } {
  const changedFiles: string[] = [], warnings: string[] = []
  const version = profile.version.split('.').map((item) => Number.parseInt(item, 10) || 0)
  while (version.length < 4) version.push(0)
  if (profile.dprojPath && existsSync(profile.dprojPath) && extname(profile.dprojPath).toLowerCase() === '.dproj') {
    backupOnce(profile.dprojPath)
    let content = readFileSync(profile.dprojPath, 'utf8')
    content = content.replace(/\s*<PropertyGroup Label="KarnoXPublish">[\s\S]*?<\/PropertyGroup>/gi, '')
    const keys = [
      `CompanyName=${profile.companyName}`, `FileDescription=${profile.description}`,
      `FileVersion=${profile.version}`, `InternalName=${profile.applicationName}`,
      `LegalCopyright=${profile.copyright}`, `OriginalFilename=${basename(profile.exePath)}`,
      `ProductName=${profile.productName}`, `ProductVersion=${profile.version}`
    ].join(';')
    const group = `\n  <PropertyGroup Label="KarnoXPublish">\n` +
      `    <VerInfo_IncludeVerInfo>true</VerInfo_IncludeVerInfo>\n` +
      `    <VerInfo_MajorVer>${version[0]}</VerInfo_MajorVer>\n` +
      `    <VerInfo_MinorVer>${version[1]}</VerInfo_MinorVer>\n` +
      `    <VerInfo_Release>${version[2]}</VerInfo_Release>\n` +
      `    <VerInfo_Build>${version[3]}</VerInfo_Build>\n` +
      `    <VerInfo_Keys>${xml(keys)}</VerInfo_Keys>\n` +
      (profile.iconPath ? `    <Icon_MainIcon>${xml(profile.iconPath)}</Icon_MainIcon>\n` : '') +
      (profile.manifestPath ? `    <Manifest_File>${xml(profile.manifestPath)}</Manifest_File>\n` : '') +
      `  </PropertyGroup>\n`
    content = content.replace(/\s*<\/Project>\s*$/i, `${group}</Project>\n`)
    writeFileSync(profile.dprojPath, content, 'utf8')
    changedFiles.push(profile.dprojPath)
    return { changedFiles, warnings }
  }

  const dprPath = profile.dprojPath && extname(profile.dprojPath).toLowerCase() === '.dpr'
    ? profile.dprojPath : join(profile.projectPath, `${profile.projectName}.dpr`)
  const install = installation()
  const brcc32 = install ? join(install.binPath, 'brcc32.exe') : ''
  if (!existsSync(dprPath) || !brcc32 || !existsSync(brcc32)) {
    warnings.push('Metadados do executável legado não foram aplicados: DPR ou BRCC32 não encontrado.')
    return { changedFiles, warnings }
  }
  const rcPath = join(profile.projectPath, 'KarnoXPublish.rc')
  const resPath = join(profile.projectPath, 'KarnoXPublish.res')
  const quote = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const rc = `${profile.iconPath ? `MAINICON ICON "${quote(profile.iconPath)}"\n` : ''}` +
    `${profile.manifestPath ? `1 24 "${quote(profile.manifestPath)}"\n` : ''}` +
    `1 VERSIONINFO\nFILEVERSION ${version.join(',')}\nPRODUCTVERSION ${version.join(',')}\n` +
    `FILEOS 0x40004\nFILETYPE 0x1\nBEGIN\n BLOCK "StringFileInfo"\n BEGIN\n  BLOCK "041604E4"\n  BEGIN\n` +
    `   VALUE "CompanyName", "${quote(profile.companyName)}\\0"\n   VALUE "FileDescription", "${quote(profile.description)}\\0"\n` +
    `   VALUE "FileVersion", "${quote(profile.version)}\\0"\n   VALUE "ProductName", "${quote(profile.productName)}\\0"\n` +
    `   VALUE "ProductVersion", "${quote(profile.version)}\\0"\n  END\n END\n` +
    ` BLOCK "VarFileInfo" BEGIN VALUE "Translation", 0x416, 1252 END\nEND\n`
  writeFileSync(rcPath, rc, 'utf8')
  execFileSync(brcc32, ['-fo', resPath, rcPath], { cwd: profile.projectPath, windowsHide: true })
  backupOnce(dprPath)
  let dpr = readFileSync(dprPath, 'utf8')
  if (!/\{\$R\s+KarnoXPublish\.res\}/i.test(dpr)) {
    if (/\{\$R\s+\*\.res\}/i.test(dpr)) dpr = dpr.replace(/\{\$R\s+\*\.res\}/i, '{$R KarnoXPublish.res}')
    else dpr = dpr.replace(/\bbegin\b/i, '{$R KarnoXPublish.res}\n\nbegin')
    writeFileSync(dprPath, dpr, 'utf8')
  }
  changedFiles.push(rcPath, resPath, dprPath)
  return { changedFiles, warnings }
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function filesRecursive(root: string): Array<{ path: string; relative: string }> {
  const output: Array<{ path: string; relative: string }> = []
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) visit(path)
      else output.push({ path, relative: path.slice(root.length + 1).replace(/\\/g, '/') })
    }
  }
  visit(root)
  return output
}

export function createZip(sourceDir: string, zipPath: string): void {
  const localParts: Buffer[] = [], centralParts: Buffer[] = []
  let offset = 0
  for (const file of filesRecursive(sourceDir)) {
    const raw = readFileSync(file.path), compressed = deflateRawSync(raw), name = Buffer.from(file.relative, 'utf8')
    const crc = crc32(raw)
    const modified = statSync(file.path).mtime
    const dosTime = (modified.getHours() << 11) | (modified.getMinutes() << 5) | Math.floor(modified.getSeconds() / 2)
    const dosDate = ((Math.max(1980, modified.getFullYear()) - 1980) << 9) | ((modified.getMonth() + 1) << 5) | modified.getDate()
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26)
    localParts.push(local, name, compressed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + compressed.length
  }
  const central = Buffer.concat(centralParts), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centralParts.length / 2, 8); end.writeUInt16LE(centralParts.length / 2, 10)
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16)
  writeFileSync(zipPath, Buffer.concat([...localParts, central, end]))
}

function sha256(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex') }
function safeName(value: string): string { return value.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'Aplicacao' }

function sign(path: string, profile: PublishProfile, signTool: string): void {
  const args = ['sign', '/fd', 'SHA256']
  if (profile.timestampUrl) args.push('/tr', profile.timestampUrl, '/td', 'SHA256')
  if (profile.certificatePath) {
    args.push('/f', profile.certificatePath)
    const password = getPublishCertificatePassword(profile.projectPath, profile.environment)
    if (password) args.push('/p', password)
  } else if (profile.certificateThumbprint) args.push('/sha1', profile.certificateThumbprint)
  args.push(path)
  execFileSync(signTool, args, { windowsHide: true, stdio: 'pipe' })
}

function createInstaller(profile: PublishProfile, deliveryDir: string, compiler: string): string {
  const outputName = safeName(profile.installerOutputName || `${profile.applicationName}-Setup`)
  const issPath = join(profile.outputDir, `${outputName}.iss`)
  const appId = createHash('sha1').update(profile.projectPath.toLowerCase()).digest('hex').slice(0, 24)
  const exeName = basename(profile.exePath)
  const script = `[Setup]\nAppId={{${appId}}}\nAppName=${profile.applicationName}\nAppVersion=${profile.version}\n` +
    `AppPublisher=${profile.companyName}\nDefaultDirName={autopf}\\${profile.companyName || profile.applicationName}\\${profile.applicationName}\n` +
    `DefaultGroupName=${profile.applicationName}\nOutputDir=${profile.outputDir}\nOutputBaseFilename=${outputName}\n` +
    `Compression=lzma2\nSolidCompression=yes\n${profile.platform === 'Win64' ? 'ArchitecturesInstallIn64BitMode=x64compatible\n' : ''}` +
    `[Files]\nSource: "${deliveryDir}\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs\n` +
    `[Icons]\nName: "{group}\\${profile.applicationName}"; Filename: "{app}\\${exeName}"\nName: "{autodesktop}\\${profile.applicationName}"; Filename: "{app}\\${exeName}"; Tasks: desktopicon\n` +
    `[Tasks]\nName: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"\n` +
    `[Run]\nFilename: "{app}\\${exeName}"; Description: "Executar ${profile.applicationName}"; Flags: nowait postinstall skipifsilent\n`
  writeFileSync(issPath, script, 'utf8')
  execFileSync(compiler, [issPath], { cwd: profile.outputDir, windowsHide: true, stdio: 'pipe' })
  return join(profile.outputDir, `${outputName}.exe`)
}

export function publishProject(profile: PublishProfile, onProgress: (message: string) => void): PublishResult {
  const analysis = analyzePublish(profile)
  if (!analysis.canPublish) throw new Error('A publicação possui pendências. Execute a análise e corrija os itens obrigatórios.')
  mkdirSync(profile.outputDir, { recursive: true })
  const deliveryDir = join(profile.outputDir, `${safeName(profile.applicationName)}-${profile.environment}-${safeName(profile.version)}`)
  const resolvedOutput = resolve(profile.outputDir)
  if (!resolve(deliveryDir).toLowerCase().startsWith(`${resolvedOutput.toLowerCase()}\\`)) throw new Error('Diretório de entrega inválido.')
  if (existsSync(deliveryDir)) rmSync(deliveryDir, { recursive: true, force: true })
  mkdirSync(deliveryDir, { recursive: true })
  const copiedFiles: string[] = [], warnings = [...analysis.warnings]
  const copy = (source: string): string => {
    const target = join(deliveryDir, basename(source))
    copyFileSync(source, target); copiedFiles.push(target); return target
  }
  onProgress('Copiando executável...')
  const publishedExe = copy(profile.exePath)
  if (profile.copyDependencies) {
    for (const dependency of analysis.dependencies.filter((item) => item.status === 'found' && item.sourcePath)) {
      onProgress(`Copiando dependência ${dependency.name}...`)
      const target = join(deliveryDir, dependency.name)
      if (!existsSync(target)) { copyFileSync(dependency.sourcePath!, target); copiedFiles.push(target) }
    }
  }
  for (const external of profile.externalFiles) { onProgress(`Copiando ${basename(external)}...`); copy(external) }

  let signed = false
  if (profile.signExecutable && analysis.tools.signTool) {
    onProgress('Assinando digitalmente o executável...')
    sign(publishedExe, profile, analysis.tools.signTool); signed = true
  }
  let installerPath: string | null = null
  if (profile.generateInstaller && analysis.tools.installerCompiler) {
    onProgress('Gerando instalador...')
    installerPath = createInstaller(profile, deliveryDir, analysis.tools.installerCompiler)
    if (profile.signExecutable && analysis.tools.signTool) sign(installerPath, profile, analysis.tools.signTool)
  }
  let zipPath: string | null = null
  if (profile.generateZip) {
    onProgress('Gerando arquivo ZIP...')
    zipPath = `${deliveryDir}.zip`; createZip(deliveryDir, zipPath)
  }
  let updateManifestPath: string | null = null
  if (profile.generateUpdateManifest) {
    const artifact = installerPath ?? zipPath ?? publishedExe
    updateManifestPath = join(profile.outputDir, 'update.json')
    const baseUrl = profile.updateBaseUrl.replace(/\/$/, '')
    writeFileSync(updateManifestPath, JSON.stringify({
      application: profile.applicationName, environment: profile.environment, version: profile.version,
      file: basename(artifact), url: baseUrl ? `${baseUrl}/${encodeURIComponent(basename(artifact))}` : basename(artifact),
      sha256: sha256(artifact), sizeBytes: statSync(artifact).size, mandatory: profile.updateMandatory,
      notes: profile.updateNotes, publishedAt: new Date().toISOString()
    }, null, 2), 'utf8')
  }
  onProgress('Publicação concluída.')
  return { success: true, deliveryDir, copiedFiles, zipPath, installerPath, updateManifestPath, signed, warnings }
}

export function generateUpdaterUnit(profile: PublishProfile): string {
  const path = join(profile.projectPath, 'KarnoXAutoUpdate.pas')
  const source = `unit KarnoXAutoUpdate;\n\ninterface\n\nuses\n  Windows, SysUtils, Classes, ShellAPI, UrlMon;\n\ntype\n  TKarnoXUpdate = class\n  public\n    class function CheckAndDownload(const ManifestUrl, CurrentVersion: string): Boolean; static;\n  end;\n\nimplementation\n\nfunction JsonString(const Text, Name: string): string;\nvar\n  P, Q: Integer; Key: string;\nbegin\n  Result := '';\n  Key := '"' + Name + '"';\n  P := Pos(Key, Text);\n  if P = 0 then Exit;\n  P := P + Length(Key);\n  while (P <= Length(Text)) and (Text[P] <> ':') do Inc(P);\n  Inc(P);\n  while (P <= Length(Text)) and (Text[P] in [' ', #9, #13, #10]) do Inc(P);\n  if (P > Length(Text)) or (Text[P] <> '"') then Exit;\n  Inc(P);\n  Q := P;\n  while (Q <= Length(Text)) and (Text[Q] <> '"') do Inc(Q);\n  Result := Copy(Text, P, Q - P);\nend;\n\nfunction VersionPart(const Version: string; Index: Integer): Integer;\nvar\n  I, StartAt, Part: Integer;\nbegin\n  Result := 0; StartAt := 1; Part := 0;\n  for I := 1 to Length(Version) + 1 do\n    if (I > Length(Version)) or (Version[I] = '.') then\n    begin\n      if Part = Index then\n      begin\n        Result := StrToIntDef(Copy(Version, StartAt, I - StartAt), 0);\n        Exit;\n      end;\n      Inc(Part); StartAt := I + 1;\n    end;\nend;\n\nfunction IsNewerVersion(const Available, Current: string): Boolean;\nvar\n  I, A, C: Integer;\nbegin\n  Result := False;\n  for I := 0 to 3 do\n  begin\n    A := VersionPart(Available, I); C := VersionPart(Current, I);\n    if A > C then begin Result := True; Exit; end;\n    if A < C then Exit;\n  end;\nend;\n\nfunction ResolveUrl(const ManifestUrl, ArtifactUrl: string): string;\nvar\n  P: Integer;\nbegin\n  Result := ArtifactUrl;\n  if Pos('://', ArtifactUrl) > 0 then Exit;\n  P := LastDelimiter('/', ManifestUrl);\n  if P > 0 then Result := Copy(ManifestUrl, 1, P) + ArtifactUrl;\nend;\n\nclass function TKarnoXUpdate.CheckAndDownload(const ManifestUrl, CurrentVersion: string): Boolean;\nvar\n  ManifestFile, ArtifactFile, Text, Version, Url, FileName: string;\n  Lines: TStringList;\nbegin\n  Result := False;\n  ManifestFile := IncludeTrailingPathDelimiter(GetEnvironmentVariable('TEMP')) + 'karnox-update.json';\n  if URLDownloadToFile(nil, PChar(ManifestUrl), PChar(ManifestFile), 0, nil) <> 0 then Exit;\n  Lines := TStringList.Create;\n  try\n    Lines.LoadFromFile(ManifestFile); Text := Lines.Text;\n    Version := JsonString(Text, 'version');\n    if (Version = '') or not IsNewerVersion(Version, CurrentVersion) then Exit;\n    Url := ResolveUrl(ManifestUrl, JsonString(Text, 'url'));\n    FileName := JsonString(Text, 'file');\n    if (Url = '') or (FileName = '') then Exit;\n    ArtifactFile := IncludeTrailingPathDelimiter(GetEnvironmentVariable('TEMP')) + ExtractFileName(FileName);\n    if URLDownloadToFile(nil, PChar(Url), PChar(ArtifactFile), 0, nil) <> 0 then Exit;\n    Result := ShellExecute(0, 'open', PChar(ArtifactFile), nil, nil, SW_SHOWNORMAL) > 32;\n  finally\n    Lines.Free;\n    DeleteFile(PChar(ManifestFile));\n  end;\nend;\n\nend.\n`
  writeFileSync(path, source, 'utf8')
  return path
}
