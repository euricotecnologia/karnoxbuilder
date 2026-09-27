import { existsSync, readFileSync, readdirSync } from 'fs'
import { basename, extname, join } from 'path'
import type { UnitSpec } from '../delphi/projectTemplate'

function readText(path: string): string {
  const buffer = readFileSync(path)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buffer).replace(/^\uFEFF/, '')
  }
}

export function loadExistingUnits(projectDir: string, projectName: string): UnitSpec[] {
  if (!existsSync(projectDir)) return []
  const names = readdirSync(projectDir)
  const pasFiles = names.filter((name) => extname(name).toLowerCase() === '.pas')
  const dprPath = join(projectDir, `${projectName}.dpr`)
  const dpr = existsSync(dprPath) ? readText(dprPath) : ''
  const firstCreatedClass = dpr.match(/Application\.CreateForm\(\s*([A-Za-z][A-Za-z0-9_]*)\s*,/i)?.[1]

  return pasFiles.map((fileName) => {
    const pasContent = readText(join(projectDir, fileName))
    const fallbackName = basename(fileName, extname(fileName))
    const unitName = pasContent.match(/^\s*unit\s+([A-Za-z][A-Za-z0-9_]*)\s*;/im)?.[1] ?? fallbackName
    const dfmPath = join(projectDir, `${fallbackName}.dfm`)
    const dfmContent = existsSync(dfmPath) ? readText(dfmPath) : null
    const formMatch = dfmContent?.match(/^\s*(?:object|inherited)\s+[A-Za-z][A-Za-z0-9_]*\s*:\s*([A-Za-z][A-Za-z0-9_]*)/im)
    const formClassName = formMatch?.[1]
    return {
      unitName,
      pasContent,
      dfmContent,
      isMainForm: Boolean(formClassName && firstCreatedClass === formClassName),
      formClassName
    }
  })
}

export function mergeWithExistingUnits(generated: UnitSpec[], existing: UnitSpec[]): UnitSpec[] {
  if (existing.length === 0) return generated
  const existingByName = new Map(existing.map((unit) => [unit.unitName.toLowerCase(), unit]))
  const existingMain = existing.find((unit) => unit.isMainForm)?.unitName.toLowerCase()

  const normalizedGenerated = generated.map((unit) => ({
    ...unit,
    isMainForm: existingMain ? unit.unitName.toLowerCase() === existingMain : unit.isMainForm
  }))
  // Mantém primeiro a ordem das units já conhecidas pelo projeto e acrescenta
  // somente as units realmente novas ao final.
  const generatedByName = new Map(normalizedGenerated.map((unit) => [unit.unitName.toLowerCase(), unit]))
  const ordered = existing.map((unit) => generatedByName.get(unit.unitName.toLowerCase()) ?? unit)
  ordered.push(...normalizedGenerated.filter((unit) => !existingByName.has(unit.unitName.toLowerCase())))
  return ordered
}
