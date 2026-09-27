import { AIProviderError } from './types'
import type { ProjectGenerationResult } from './types'
import type { UnitSpec } from '../delphi/projectTemplate'
import { MARKERS } from './responseFormat'
import { referencesDfmResource, sanitizeDfmContent } from './dfmConsistency'

function extractUnitBlocks(text: string): { blocks: string[]; remainder: string } {
  const blocks: string[] = []
  let remainder = ''
  let cursor = 0

  while (true) {
    const startIdx = text.indexOf(MARKERS.UNIT, cursor)
    if (startIdx === -1) {
      remainder += text.slice(cursor)
      break
    }
    remainder += text.slice(cursor, startIdx)

    const contentStart = startIdx + MARKERS.UNIT.length
    const endIdx = text.indexOf(MARKERS.END_UNIT, contentStart)
    if (endIdx === -1) {
      blocks.push(text.slice(contentStart))
      cursor = text.length
      break
    }
    blocks.push(text.slice(contentStart, endIdx))
    cursor = endIdx + MARKERS.END_UNIT.length
  }

  return { blocks, remainder }
}

function extractMarkerFields(block: string, markers: string[]): Record<string, string> {
  const positions: Array<{ marker: string; index: number }> = []
  for (const marker of markers) {
    let idx = block.indexOf(marker)
    while (idx !== -1) {
      positions.push({ marker, index: idx })
      idx = block.indexOf(marker, idx + 1)
    }
  }
  positions.sort((a, b) => a.index - b.index)

  const fields: Record<string, string> = {}
  for (let i = 0; i < positions.length; i++) {
    const { marker, index } = positions[i]
    const contentStart = index + marker.length
    const contentEnd = i + 1 < positions.length ? positions[i + 1].index : block.length
    const value = block.slice(contentStart, contentEnd).replace(/^\r?\n/, '')
    fields[marker] = value.trim()
  }
  return fields
}

export function parseProjectGenerationResult(rawText: string): Omit<ProjectGenerationResult, 'usage'> {
  if (!rawText.includes(MARKERS.UNIT)) {
    throw new AIProviderError(
      `A resposta da IA não contém nenhuma unit no formato esperado (marcador "${MARKERS.UNIT}" ausente). Tente novamente.`
    )
  }

  const unitMarkerCount = rawText.split(MARKERS.UNIT).length - 1
  const endUnitMarkerCount = rawText.split(MARKERS.END_UNIT).length - 1
  if (unitMarkerCount !== endUnitMarkerCount) {
    throw new AIProviderError(
      `A resposta da IA foi interrompida: foram iniciadas ${unitMarkerCount} unit(s), mas somente ${endUnitMarkerCount} foram finalizadas com ${MARKERS.END_UNIT}.`
    )
  }

  const { blocks, remainder } = extractUnitBlocks(rawText)
  const topFields = extractMarkerFields(remainder, [MARKERS.PROJECT_NAME, MARKERS.EXPLANATION])

  const projectName = topFields[MARKERS.PROJECT_NAME] ?? ''
  if (!projectName || !/^[A-Za-z][A-Za-z0-9_]*$/.test(projectName)) {
    throw new AIProviderError('O nome do projeto retornado pela IA é inválido ou ausente.')
  }

  if (blocks.length === 0) {
    throw new AIProviderError('A IA não retornou nenhuma unit.')
  }

  const units: UnitSpec[] = blocks.map((block, idx) => {
    const fields = extractMarkerFields(block, [
      MARKERS.NAME,
      MARKERS.FORM_CLASS,
      MARKERS.IS_MAIN,
      MARKERS.PAS,
      MARKERS.DFM
    ])

    const unitName = fields[MARKERS.NAME] ?? ''
    if (!unitName || !/^[A-Za-z][A-Za-z0-9_]*$/.test(unitName)) {
      throw new AIProviderError(`Nome de unit inválido na posição ${idx}.`)
    }

    const pasContent = fields[MARKERS.PAS]
    if (!pasContent) {
      throw new AIProviderError(
        `A unit "${unitName}" não possui conteúdo .pas. A resposta da IA pode ter sido cortada — tente novamente.`
      )
    }

    const rawDfm = fields[MARKERS.DFM]
    const hasDfm = !!rawDfm
    if (hasDfm && !/^object\s/i.test(rawDfm)) {
      throw new AIProviderError(
        `O conteúdo .dfm da unit "${unitName}" retornado pela IA está incompleto ou inválido (não começa com "object"). A resposta provavelmente foi cortada por limite de tokens. Tente novamente.`
      )
    }
    const normalizedDfm = hasDfm ? sanitizeDfmContent(rawDfm) : null

    const hasDfmResourceReference = referencesDfmResource(pasContent)
    if (hasDfmResourceReference && !hasDfm) {
      throw new AIProviderError(
        `A unit "${unitName}" contém "{$R *.dfm}" no .pas, mas a IA não retornou o conteúdo .dfm correspondente. A resposta provavelmente foi cortada (limite de tokens do modelo/servidor). Tente novamente ou use um modelo com janela de contexto maior.`
      )
    }

    return {
      unitName,
      pasContent,
      dfmContent: normalizedDfm,
      isMainForm: (fields[MARKERS.IS_MAIN] ?? '').toLowerCase() === 'true',
      formClassName: fields[MARKERS.FORM_CLASS] || undefined
    }
  })

  if (!units.some((u) => u.isMainForm)) {
    const firstForm = units.find((u) => u.dfmContent !== null)
    if (!firstForm) {
      throw new AIProviderError('Nenhum form foi retornado pela IA.')
    }
    firstForm.isMainForm = true
  }

  return {
    projectName,
    units,
    explanation: topFields[MARKERS.EXPLANATION] ?? ''
  }
}
