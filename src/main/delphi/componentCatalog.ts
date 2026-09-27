import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { enabledLibraryPaths } from '../db/repositories/libraryPathsRepo'
import { getSetting } from '../db/repositories/settingsRepo'
import { detectDefaultDelphiInstall, validateDelphiPath } from './detect'
import { resolveLibraryPath } from './libraryPaths'

export interface DelphiComponentCatalogItem {
  className: string
  label: string
  category: 'Frames' | 'Terceiros'
  unitName: string
  sourcePath: string
  nonVisual: boolean
  width: number
  height: number
  keyword: 'object' | 'inline'
}

const catalogCache = new Map<string, { createdAt: number; items: DelphiComponentCatalogItem[] }>()
const CATALOG_CACHE_MS = 15_000

function pasFiles(root: string, limit: number): string[] {
  const result: string[] = []
  const visit = (directory: string, depth: number): void => {
    if (depth > 7 || result.length >= limit) return
    let names: string[] = []
    try { names = readdirSync(directory) } catch { return }
    for (const name of names) {
      if (result.length >= limit || /^(?:\.git|node_modules|__history|__recovery)$/i.test(name)) break
      const fullPath = join(directory, name)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) visit(fullPath, depth + 1)
        else if (extname(name).toLowerCase() === '.pas') result.push(fullPath)
      } catch { /* ignora arquivos sem acesso */ }
    }
  }
  if (existsSync(root)) visit(root, 0)
  return result
}

function readPas(path: string): string {
  try { return readFileSync(path, 'utf8') } catch { return '' }
}

function unitNameOf(source: string, filePath: string): string {
  return source.match(/^\s*unit\s+([A-Za-z][A-Za-z0-9_.]*)\s*;/im)?.[1] ?? basename(filePath, extname(filePath))
}

function classBaseMap(source: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const match of source.matchAll(/\b(T[A-Za-z][A-Za-z0-9_]*)\s*=\s*class\s*\(\s*(T[A-Za-z][A-Za-z0-9_.]*)/gim)) {
    result.set(match[1].toLowerCase(), match[2])
  }
  return result
}

export function scanDelphiComponentCatalog(
  projectPath: string,
  platform: 'Win32' | 'Win64' = 'Win32',
  config: 'Debug' | 'Release' = 'Debug'
): DelphiComponentCatalogItem[] {
  const cacheKey = `${projectPath.toLowerCase()}|${platform}|${config}`
  const cached = catalogCache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < CATALOG_CACHE_MS) return cached.items
  const result = new Map<string, DelphiComponentCatalogItem>()

  for (const filePath of pasFiles(projectPath, 1200)) {
    const source = readPas(filePath)
    const unitName = unitNameOf(source, filePath)
    for (const match of source.matchAll(/\b(T[A-Za-z][A-Za-z0-9_]*)\s*=\s*class\s*\(\s*TFrame\b/gim)) {
      const className = match[1]
      result.set(className.toLowerCase(), {
        className, label: className.replace(/^T/, ''), category: 'Frames', unitName, sourcePath: filePath,
        nonVisual: false, width: 320, height: 200, keyword: 'inline'
      })
    }
  }

  const savedPath = getSetting('delphi_studio_path')
  const install = savedPath ? validateDelphiPath(savedPath) : detectDefaultDelphiInstall()
  const libraryDirs = enabledLibraryPaths(projectPath, platform)
    .filter((row) => row.pathType === 'unit' || row.pathType === 'include')
    .map((row) => resolveLibraryPath(row.path, install, platform, config))
    .filter((path, index, all) => path !== projectPath && all.indexOf(path) === index)

  let remaining = 2500
  for (const directory of libraryDirs) {
    if (remaining <= 0) break
    const files = pasFiles(directory, Math.min(remaining, 600))
    remaining -= files.length
    for (const filePath of files) {
      const source = readPas(filePath)
      if (!/\bRegisterComponents\s*\(/i.test(source)) continue
      const unitName = unitNameOf(source, filePath)
      const bases = classBaseMap(source)
      for (const registration of source.matchAll(/\bRegisterComponents\s*\(\s*'([^']+)'\s*,\s*\[([\s\S]*?)\]\s*\)/gim)) {
        const page = registration[1]
        const classes = registration[2].match(/\bT[A-Za-z][A-Za-z0-9_]*\b/g) ?? []
        for (const className of classes) {
          if (result.has(className.toLowerCase())) continue
          const base = bases.get(className.toLowerCase()) ?? ''
          const nonVisual = /(?:Component|DataModule|Connection|Query|DataSource|Timer|ActionList)$/i.test(base) && !/(?:Control|Form|Frame)$/i.test(base)
          result.set(className.toLowerCase(), {
            className, label: `${className.replace(/^T/, '')} · ${page}`, category: 'Terceiros', unitName,
            sourcePath: filePath, nonVisual, width: nonVisual ? 48 : 121, height: nonVisual ? 48 : 33, keyword: 'object'
          })
        }
      }
    }
  }
  const items = Array.from(result.values()).sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label))
  catalogCache.set(cacheKey, { createdAt: Date.now(), items })
  return items
}
