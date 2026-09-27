export type DfmPropertyType = 'number' | 'string' | 'identifier' | 'boolean' | 'set'

export interface NewDfmObject {
  name: string
  className: string
  properties: Array<{ name: string; value: string; type: DfmPropertyType }>
}

function leadingWhitespace(line: string): string {
  return line.match(/^\s*/)?.[0] ?? ''
}

function formatValue(value: string, type: DfmPropertyType): string {
  if (type === 'string') return `'${value.replace(/'/g, "''")}'`
  if (type === 'number') {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed)) throw new Error('Informe um número inteiro válido.')
    return String(parsed)
  }
  if (type === 'boolean') return /^(?:true|1)$/i.test(value) ? 'True' : 'False'
  if (type === 'set') {
    const normalized = value.trim()
    if (!/^\[(?:[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)?\]$/.test(normalized)) {
      throw new Error('Informe um conjunto Delphi válido, por exemplo: [fsBold, fsItalic].')
    }
    return normalized.replace(/\s*,\s*/g, ', ')
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_.$]*$/.test(value)) throw new Error('Valor DFM inválido.')
  return value
}

function escapedName(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function objectPattern(objectName: string): RegExp {
  return new RegExp(`^\\s*(?:object|inherited|inline)\\s+${escapedName(objectName)}\\s*:`, 'i')
}

function objectBounds(lines: string[], objectName: string): { start: number; end: number; indent: string } {
  const start = lines.findIndex((line) => objectPattern(objectName).test(line))
  if (start < 0) throw new Error(`Componente ${objectName} não encontrado no DFM.`)
  const indent = leadingWhitespace(lines[start])
  for (let index = start + 1; index < lines.length; index++) {
    if (/^\s*end\s*;?\s*$/i.test(lines[index]) && leadingWhitespace(lines[index]).length === indent.length) {
      return { start, end: index, indent }
    }
  }
  throw new Error(`Fim do componente ${objectName} não encontrado.`)
}

function splitContent(content: string): string[] {
  return content.replace(/^\uFEFF/, '').split(/\r?\n/)
}

function rebuild(content: string, lines: string[]): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  return `${content.startsWith('\uFEFF') ? '\uFEFF' : ''}${lines.join(newline)}`
}

export function insertDfmObject(content: string, parentName: string, object: NewDfmObject): string {
  if (!/^[A-Za-z_]\w*$/.test(object.name) || !/^T[A-Za-z_]\w*$/.test(object.className)) {
    throw new Error('Nome ou classe de componente inválido.')
  }
  const lines = splitContent(content)
  if (lines.some((line) => objectPattern(object.name).test(line))) {
    throw new Error(`Já existe um componente chamado ${object.name}.`)
  }
  const parent = objectBounds(lines, parentName)
  const childIndent = `${parent.indent}  `
  const propertyIndent = `${childIndent}  `
  const block = [
    `${childIndent}object ${object.name}: ${object.className}`,
    ...object.properties.map(
      (property) => `${propertyIndent}${property.name} = ${formatValue(property.value, property.type)}`
    ),
    `${childIndent}end`
  ]
  lines.splice(parent.end, 0, ...block)
  return rebuild(content, lines)
}

export function removeDfmObject(content: string, objectName: string): string {
  const lines = splitContent(content)
  const bounds = objectBounds(lines, objectName)
  if (bounds.indent.length === 0) throw new Error('O formulário principal não pode ser removido.')
  lines.splice(bounds.start, bounds.end - bounds.start + 1)
  return rebuild(content, lines)
}

export function updateDfmProperty(
  content: string,
  objectName: string,
  propertyName: string,
  value: string,
  type: DfmPropertyType
): string {
  const lines = splitContent(content)
  const bounds = objectBounds(lines, objectName)
  const propertyIndent = `${bounds.indent}  `
  const propertyPattern = new RegExp(`^\\s*${escapedName(propertyName)}\\s*=`, 'i')
  let insertAt = bounds.end

  for (let index = bounds.start + 1; index < bounds.end; index++) {
    const line = lines[index]
    const indent = leadingWhitespace(line)
    if (propertyPattern.test(line) && indent.length === propertyIndent.length) {
      lines[index] = `${indent}${propertyName} = ${formatValue(value, type)}`
      return rebuild(content, lines)
    }
    if (/^\s*(?:object|inherited|inline)\b/i.test(line) && indent.length === propertyIndent.length) {
      insertAt = index
      break
    }
  }

  lines.splice(insertAt, 0, `${propertyIndent}${propertyName} = ${formatValue(value, type)}`)
  return rebuild(content, lines)
}
