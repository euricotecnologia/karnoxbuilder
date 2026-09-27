import { execFileSync } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { DelphiInstall } from './detect'
import {
  enabledLibraryPaths,
  upsertLibraryPath,
  type LibraryPathRow,
  type LibraryPathType
} from '../db/repositories/libraryPathsRepo'

export interface LibraryValidation extends LibraryPathRow {
  resolvedPath: string
  exists: boolean
  fileCount: number
  detectedTypes: string[]
}

export interface CompilerLibraryPaths {
  unit: string[]
  include: string[]
  resource: string[]
  object: string[]
  runtime: string[]
}

function registryCandidates(install: DelphiInstall, platform: 'Win32' | 'Win64'): string[] {
  const folderVersion = install.studioPath.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
  const version = /^\d+(?:\.\d+)?$/.test(folderVersion)
    ? folderVersion
    : /delphi7/i.test(install.studioPath)
      ? '7.0'
      : install.version.replace(/[^\d.]/g, '') || install.version
  const vendors = [
    `Embarcadero\\BDS\\${version}`,
    `CodeGear\\BDS\\${version}`,
    `Borland\\BDS\\${version}`,
    `Borland\\Delphi\\${version}`
  ]
  return vendors.flatMap((vendor) => [
    `HKCU\\Software\\${vendor}\\Library\\${platform}`,
    `HKCU\\Software\\WOW6432Node\\${vendor}\\Library\\${platform}`,
    `HKLM\\Software\\WOW6432Node\\${vendor}\\Library\\${platform}`,
    `HKCU\\Software\\${vendor}\\Library`,
    `HKCU\\Software\\WOW6432Node\\${vendor}\\Library`,
    `HKLM\\Software\\WOW6432Node\\${vendor}\\Library`
  ])
}

function queryRegistry(key: string): Record<string, string> {
  try {
    const output = execFileSync('reg.exe', ['query', key], { encoding: 'utf-8', windowsHide: true })
    const values: Record<string, string> = {}
    for (const line of output.split(/\r?\n/)) {
      const match = /^\s{2,}(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)$/i.exec(line)
      if (match) values[match[1].trim().toLowerCase()] = match[2].trim()
    }
    return values
  } catch {
    return {}
  }
}

function splitPaths(value?: string): string[] {
  return (value ?? '').split(';').map((path) => path.trim()).filter(Boolean)
}

export function importDelphiLibraryPaths(
  projectPath: string,
  install: DelphiInstall
): { imported: number; registryKeys: string[] } {
  let imported = 0
  const usedKeys: string[] = []
  for (const platform of ['Win32', 'Win64'] as const) {
    if (platform === 'Win64' && !install.dcc64Path) continue
    let values: Record<string, string> = {}
    for (const key of registryCandidates(install, platform)) {
      const candidate = queryRegistry(key)
      if (Object.keys(candidate).length > 0) {
        values = candidate
        usedKeys.push(key)
        break
      }
    }
    const groups: Array<[LibraryPathType, string[]]> = [
      ['unit', [...splitPaths(values['search path']), ...splitPaths(values['package dcp output'])]],
      ['runtime', [
        ...splitPaths(values['package dpl output']),
        ...splitPaths(values['package bpl output']),
        ...splitPaths(values['package search path']),
        ...splitPaths(values['package search output'])
      ]]
    ]
    for (const [pathType, paths] of groups) {
      for (const path of new Set(paths)) {
        upsertLibraryPath({ projectPath, platform, pathType, path, source: 'delphi', enabled: true })
        imported++
      }
    }
  }
  return { imported, registryKeys: usedKeys }
}

export function resolveLibraryPath(
  value: string,
  install: DelphiInstall | null,
  platform: 'Win32' | 'Win64',
  config: 'Debug' | 'Release'
): string {
  const commonDir = install
    ? `C:\\Users\\Public\\Documents\\Embarcadero\\Studio\\${install.version}`
    : ''
  const variables: Record<string, string> = {
    BDS: install?.studioPath ?? '',
    BDSBIN: install?.binPath ?? '',
    DELPHI: install?.studioPath ?? '',
    BDSCOMMONDIR: commonDir,
    BDSLIB: install ? join(install.studioPath, 'lib') : '',
    BDSUSERDIR: install ? join(homedir(), 'Documents', 'Embarcadero', 'Studio', install.version) : '',
    PLATFORM: platform,
    CONFIG: config,
    CONFIGURATION: config
  }
  return value
    .replace(/\$\(([^)]+)\)/g, (match, name: string) => variables[name.toUpperCase()] || process.env[name] || match)
    .replace(/%([^%]+)%/g, (match, name: string) => process.env[name] || match)
}

export function getCompilerLibraryPaths(
  projectPath: string,
  platform: 'Win32' | 'Win64',
  config: 'Debug' | 'Release',
  install: DelphiInstall | null
): CompilerLibraryPaths {
  const result: CompilerLibraryPaths = { unit: [], include: [], resource: [], object: [], runtime: [] }
  for (const row of enabledLibraryPaths(projectPath, platform)) {
    const resolved = resolveLibraryPath(row.path, install, platform, config)
    if (!result[row.pathType].includes(resolved)) result[row.pathType].push(resolved)
  }
  return result
}

export function validateLibraryPaths(
  rows: LibraryPathRow[],
  install: DelphiInstall | null,
  platform: 'Win32' | 'Win64',
  config: 'Debug' | 'Release'
): LibraryValidation[] {
  return rows.map((row) => {
    const rowPlatform = row.platform === 'All' ? platform : row.platform
    const resolvedPath = resolveLibraryPath(row.path, install, rowPlatform, config)
    const exists = existsSync(resolvedPath)
    let names: string[] = []
    if (exists) {
      try {
        names = statSync(resolvedPath).isDirectory() ? readdirSync(resolvedPath) : [resolvedPath]
      } catch {
        names = []
      }
    }
    const detectedTypes = Array.from(new Set(names.map((name) => name.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase()).filter(Boolean))) as string[]
    return { ...row, resolvedPath, exists, fileCount: names.length, detectedTypes }
  })
}
