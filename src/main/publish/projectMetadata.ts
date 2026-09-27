import { existsSync, readFileSync, readdirSync } from 'fs'
import { dirname, isAbsolute, join, normalize } from 'path'

export interface ProjectPublishMetadata {
  dprojPath: string
  applicationName?: string
  version?: string
  companyName?: string
  productName?: string
  description?: string
  copyright?: string
  iconPath?: string
  manifestPath?: string
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .trim()
}

function lastTag(content: string, tag: string): string {
  const matches = Array.from(content.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi')))
  return decodeXml(matches.map((match) => match[1]).filter((value) => value.trim()).at(-1) ?? '')
}

function versionKeys(content: string): Map<string, string> {
  const result = new Map<string, string>()
  const raw = lastTag(content, 'VerInfo_Keys')
  for (const item of raw.split(';')) {
    const separator = item.indexOf('=')
    if (separator <= 0) continue
    result.set(item.slice(0, separator).trim().toLowerCase(), item.slice(separator + 1).trim())
  }
  return result
}

function projectFile(projectPath: string, projectName: string): string | null {
  const direct = join(projectPath, `${projectName}.dproj`)
  if (existsSync(direct)) return direct
  try {
    const names = readdirSync(projectPath)
    const matching = names.find((name) => name.toLowerCase() === `${projectName}.dproj`.toLowerCase())
      ?? names.find((name) => name.toLowerCase().endsWith('.dproj'))
    return matching ? join(projectPath, matching) : null
  } catch {
    return null
  }
}

function metadataPath(value: string, dprojPath: string): string | undefined {
  if (!value) return undefined
  if (/\$\([^)]+\)/.test(value)) return value
  return normalize(isAbsolute(value) ? value : join(dirname(dprojPath), value))
}

function numericPart(content: string, tag: string): number {
  return Number.parseInt(lastTag(content, tag), 10) || 0
}

export function readProjectPublishMetadata(projectPath: string, projectName: string): ProjectPublishMetadata | null {
  const dprojPath = projectFile(projectPath, projectName)
  if (!dprojPath) return null
  try {
    const content = readFileSync(dprojPath, 'utf8')
    const keys = versionKeys(content)
    const versionFromKeys = keys.get('productversion') || keys.get('fileversion') || ''
    const version = /^\d+\.\d+\.\d+\.\d+$/.test(versionFromKeys)
      ? versionFromKeys
      : [
          numericPart(content, 'VerInfo_MajorVer'),
          numericPart(content, 'VerInfo_MinorVer'),
          numericPart(content, 'VerInfo_Release'),
          numericPart(content, 'VerInfo_Build')
        ].join('.')
    const iconPath = metadataPath(lastTag(content, 'Icon_MainIcon'), dprojPath)
    const manifestPath = metadataPath(lastTag(content, 'Manifest_File'), dprojPath)
    return {
      dprojPath,
      applicationName: keys.get('internalname') || projectName,
      version,
      companyName: keys.get('companyname') || undefined,
      productName: keys.get('productname') || undefined,
      description: keys.get('filedescription') || undefined,
      copyright: keys.get('legalcopyright') || undefined,
      iconPath,
      manifestPath
    }
  } catch {
    return null
  }
}
