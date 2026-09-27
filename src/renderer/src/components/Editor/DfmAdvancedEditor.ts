import { parseDfm, type DfmNode } from './dfmParser'
import { updateDfmProperty } from './DfmEditor'

type Bounds = { start: number; end: number; indent: string }

function objectBounds(content: string, targetName: string): Bounds | null {
  const lines = content.split(/\r?\n/)
  const stack: Array<{ name: string; start: number; indent: string }> = []
  for (let i = 0; i < lines.length; i += 1) {
    const open = lines[i].match(/^(?:\uFEFF)?([ \t]*)(?:object|inherited|inline)\s+(\w+)\s*:/i)
    if (open) stack.push({ name: open[2], start: i, indent: open[1] })
    if (/^\s*end\s*$/i.test(lines[i]) && stack.length) {
      const lineIndent = lines[i].match(/^[ \t]*/)?.[0] ?? ''
      const current = stack.at(-1)!
      // Um "end" mais recuado pode encerrar um item de coleção (Columns,
      // Items etc.). Somente um end no mesmo nível fecha o objeto atual.
      if (lineIndent.length !== current.indent.length) continue
      stack.pop()
      if (current.name === targetName) return { start: current.start, end: i, indent: current.indent }
    }
  }
  return null
}

function rebuild(lines: string[], newline: string): string {
  return lines.join(newline)
}

function nextName(base: string, used: Set<string>): string {
  const clean = base.replace(/\d+$/, '') || 'Component'
  let index = 1
  while (used.has(`${clean}${index}`.toLowerCase())) index += 1
  const value = `${clean}${index}`
  used.add(value.toLowerCase())
  return value
}

function flatten(node: DfmNode): DfmNode[] {
  return [node, ...node.children.flatMap(flatten)]
}

export function removeManyDfmProperties(content: string, names: string[], propertyName: string): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  for (const name of names) {
    const bounds = objectBounds(rebuild(lines, newline), name)
    if (!bounds) continue
    const expectedIndent = `${bounds.indent}  `.length
    const pattern = new RegExp(`^\\s*${propertyName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*=`, 'i')
    for (let index = bounds.start + 1; index < bounds.end; index += 1) {
      if (pattern.test(lines[index]) && (lines[index].match(/^[ \t]*/)?.[0].length ?? 0) === expectedIndent) {
        lines.splice(index, 1)
        break
      }
    }
  }
  return rebuild(lines, newline)
}
export function updateManyDfmProperties(
  content: string,
  changes: Array<{ name: string; property: string; value: string | number | boolean }>
): string {
  return changes.reduce((current, change) => {
    const raw = String(change.value)
    const type = typeof change.value === 'number'
      ? 'number'
      : typeof change.value === 'boolean'
        ? 'boolean'
        : /^(True|False)$/i.test(raw)
          ? 'boolean'
          : /^(Caption|Text|Hint)$/i.test(change.property)
            ? 'string'
            : 'identifier'
    return updateDfmProperty(current, change.name, change.property, raw, type)
  }, content)
}

export function removeManyDfmObjects(content: string, names: string[]): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const ranges = names
    .map((name) => objectBounds(content, name))
    .filter((value): value is Bounds => Boolean(value))
    .sort((a, b) => b.start - a.start)
  ranges.forEach((range) => lines.splice(range.start, range.end - range.start + 1))
  return rebuild(lines, newline)
}

export function copyDfmBlocks(content: string, names: string[]): string[] {
  const lines = content.split(/\r?\n/)
  const ranges = names
    .map((name) => ({ name, bounds: objectBounds(content, name) }))
    .filter((item): item is { name: string; bounds: Bounds } => Boolean(item.bounds))
  return ranges
    .filter((item) => !ranges.some((parent) => parent.name !== item.name && parent.bounds.start < item.bounds.start && parent.bounds.end > item.bounds.end))
    .map((item) => lines.slice(item.bounds.start, item.bounds.end + 1).join('\n'))
}

export function pasteDfmBlocks(
  content: string,
  parentName: string,
  blocks: string[]
): { content: string; names: string[] } {
  if (!blocks.length) return { content, names: [] }
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const root = parseDfm(content)
  const used = new Set(root ? flatten(root).map((node) => node.name.toLowerCase()) : [])
  const parent = objectBounds(content, parentName)
  if (!parent) return { content, names: [] }

  const parentIndent = `${parent.indent}  `
  const pastedNames: string[] = []
  const prepared = blocks.map((source) => {
    const originalLines = source.split(/\r?\n/)
    const firstIndent = originalLines[0].match(/^[ \t]*/)?.[0] ?? ''
    let block = originalLines
      .map((line) => `${parentIndent}${line.slice(firstIndent.length)}`)
      .join(newline)

    const headers = [...block.matchAll(/\b(?:object|inherited|inline)\s+(\w+)\s*:/gi)]
    const replacements = new Map<string, string>()
    headers.forEach((header) => {
      const oldName = header[1]
      if (!replacements.has(oldName)) replacements.set(oldName, nextName(oldName, used))
    })
    replacements.forEach((newName, oldName) => {
      block = block.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName)
    })
    const rootName = replacements.get(headers[0]?.[1] ?? '')
    if (rootName) pastedNames.push(rootName)

    // Move only the copied root. Nested controls keep their relative position.
    block = block.replace(/^(\s+Left\s*=\s*)(-?\d+)/m, (_, prefix, value) => `${prefix}${Number(value) + 16}`)
    block = block.replace(/^(\s+Top\s*=\s*)(-?\d+)/m, (_, prefix, value) => `${prefix}${Number(value) + 16}`)
    return block
  })

  const lines = content.split(/\r?\n/)
  lines.splice(parent.end, 0, ...prepared.flatMap((block) => block.split(/\r?\n/)))
  return { content: rebuild(lines, newline), names: pastedNames }
}

export function insertAdvancedDfmObject(
  content: string,
  parentName: string,
  item: {
    name: string
    className: string
    keyword?: 'object' | 'inline'
    properties?: Record<string, string | number | boolean>
  }
): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const parent = objectBounds(content, parentName)
  if (!parent) return content
  const lines = content.split(/\r?\n/)
  const indent = `${parent.indent}  `
  const child = [`${indent}${item.keyword ?? 'object'} ${item.name}: ${item.className}`]
  Object.entries(item.properties ?? {}).forEach(([key, value]) => {
    // Eventos DFM são referências a métodos publicados e nunca strings.
    // Gravar OnClick = 'ButtonClick' faz o streamer VCL lançar EReadError.
    const eventIdentifier = /^On[A-Za-z0-9_]+$/.test(key) && /^[A-Za-z][A-Za-z0-9_]*$/.test(String(value))
    const formatted = typeof value === 'string' && !eventIdentifier && !/^(True|False|cl\w+|-?\d+(\.\d+)?)$/i.test(value)
      ? `'${value.replace(/'/g, "''")}'`
      : String(value)
    child.push(`${indent}  ${key} = ${formatted}`)
  })
  child.push(`${indent}end`)
  lines.splice(parent.end, 0, ...child)
  return rebuild(lines, newline)
}

function decodeDfmStringLine(line: string): string | null {
  const values: string[] = []
  for (const match of line.matchAll(/'((?:''|[^'])*)'|#(\d+)/g)) {
    values.push(match[1] !== undefined ? match[1].replace(/''/g, "'") : String.fromCharCode(Number(match[2])))
  }
  return values.length ? values.join('') : null
}

export function readDfmStringListProperty(content: string, objectName: string, propertyName: string): string[] {
  const lines = content.split(/\r?\n/)
  const bounds = objectBounds(content, objectName)
  if (!bounds) return []
  const expectedIndent = `${bounds.indent}  `.length
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^\\s*${escaped}\\s*=\\s*\\(`, 'i')
  for (let index = bounds.start + 1; index < bounds.end; index += 1) {
    if (!pattern.test(lines[index]) || (lines[index].match(/^[ \t]*/)?.[0].length ?? 0) !== expectedIndent) continue
    const result: string[] = []
    const first = lines[index].slice(lines[index].indexOf('(') + 1)
    const firstValue = decodeDfmStringLine(first)
    if (firstValue !== null) result.push(firstValue)
    for (let cursor = index + 1; cursor < bounds.end; cursor += 1) {
      if (/^\s*\)\s*$/.test(lines[cursor]) && (lines[cursor].match(/^[ \t]*/)?.[0].length ?? 0) === expectedIndent) break
      const value = decodeDfmStringLine(lines[cursor])
      if (value !== null) result.push(value)
    }
    return result
  }
  return []
}

export function updateDfmStringListProperty(content: string, objectName: string, propertyName: string, values: string[]): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const bounds = objectBounds(content, objectName)
  if (!bounds) return content
  const propertyIndent = `${bounds.indent}  `
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^\\s*${escaped}\\s*=`, 'i')
  for (let index = bounds.start + 1; index < bounds.end; index += 1) {
    if (!pattern.test(lines[index]) || (lines[index].match(/^[ \t]*/)?.[0].length ?? 0) !== propertyIndent.length) continue
    let finish = index
    if (/=\s*\(/.test(lines[index]) && !/\)\s*$/.test(lines[index])) {
      while (finish + 1 < bounds.end) {
        finish += 1
        if (/^\s*\)\s*$/.test(lines[finish]) && (lines[finish].match(/^[ \t]*/)?.[0].length ?? 0) === propertyIndent.length) break
      }
    }
    lines.splice(index, finish - index + 1)
    break
  }
  if (values.length) {
    const fresh = objectBounds(lines.join(newline), objectName)
    if (!fresh) return content
    const block = [
      `${propertyIndent}${propertyName} = (`,
      ...values.map((value) => `${propertyIndent}  '${value.replace(/'/g, "''")}'`),
      `${propertyIndent})`
    ]
    lines.splice(fresh.end, 0, ...block)
  }
  return lines.join(newline)
}

export interface DfmCollectionItem {
  properties: Array<{ name: string; value: string; type: 'number' | 'string' | 'identifier' | 'boolean' }>
}

export function updateDfmCollectionProperty(
  content: string,
  objectName: string,
  propertyName: string,
  items: DfmCollectionItem[]
): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const bounds = objectBounds(content, objectName)
  if (!bounds) return content
  const propertyIndent = `${bounds.indent}  `
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const startPattern = new RegExp(`^\\s*${escaped}\\s*=\\s*<`, 'i')
  for (let index = bounds.start + 1; index < bounds.end; index += 1) {
    if (!startPattern.test(lines[index]) || (lines[index].match(/^[ \t]*/)?.[0].length ?? 0) !== propertyIndent.length) continue
    let finish = index
    while (finish + 1 < bounds.end) {
      finish += 1
      const indent = lines[finish].match(/^[ \t]*/)?.[0].length ?? 0
      const closesCollection = /^\s*>\s*$/.test(lines[finish]) && indent === propertyIndent.length
      const closesLastItem = /^\s*end>\s*$/.test(lines[finish]) && indent === propertyIndent.length + 2
      if (closesCollection || closesLastItem) break
    }
    lines.splice(index, finish - index + 1)
    break
  }
  if (!items.length) return lines.join(newline)
  const fresh = objectBounds(lines.join(newline), objectName)
  if (!fresh) return content
  const format = (value: string, type: DfmCollectionItem['properties'][number]['type']): string => {
    if (type === 'string') return `'${value.replace(/'/g, "''")}'`
    if (type === 'boolean') return /^(?:true|1)$/i.test(value) ? 'True' : 'False'
    if (type === 'number') return String(Number.parseInt(value, 10) || 0)
    return value
  }
  const block = [`${propertyIndent}${propertyName} = <`]
  items.forEach((item, itemIndex) => {
    block.push(`${propertyIndent}  item`)
    item.properties.forEach((property) => block.push(`${propertyIndent}    ${property.name} = ${format(property.value, property.type)}`))
    block.push(`${propertyIndent}  end${itemIndex === items.length - 1 ? '>' : ''}`)
  })
  lines.splice(fresh.end, 0, ...block)
  return lines.join(newline)
}
export function updateDfmBinaryProperty(content: string, objectName: string, propertyName: string, hexData: string | null): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const bounds = objectBounds(content, objectName)
  if (!bounds) return content
  const propertyIndent = `${bounds.indent}  `
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const startPattern = new RegExp('^[ \\t]*' + escaped + '\\s*=\\s*\\{', 'i')
  for (let index = bounds.start + 1; index < bounds.end; index += 1) {
    if (!startPattern.test(lines[index])) continue
    let finish = index
    while (finish < bounds.end && !lines[finish].includes('}')) finish += 1
    lines.splice(index, Math.max(1, finish - index + 1))
    break
  }
  if (hexData) {
    const clean = hexData.replace(/[^0-9A-F]/gi, '').toUpperCase()
    const chunks = clean.match(/.{1,1024}/g) ?? []
    const block = [`${propertyIndent}${propertyName} = {`, ...chunks.map((chunk, index) => `${propertyIndent}  ${chunk}${index === chunks.length - 1 ? '}' : ''}`)]
    const freshBounds = objectBounds(lines.join(newline), objectName)
    if (freshBounds) lines.splice(freshBounds.end, 0, ...block)
  }
  return lines.join(newline)
}

export function readDfmBinaryProperty(content: string, objectName: string, propertyName: string): string | null {
  const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const headerPattern = new RegExp('^(?:\\uFEFF)?([ \t]*)(?:object|inherited|inline)\\s+' + escape(objectName) + '\\s*:', 'im')
  const header = headerPattern.exec(content)
  if (!header) return null
  const endPattern = new RegExp('^' + escape(header[1]) + 'end\\s*$', 'gim')
  endPattern.lastIndex = header.index + header[0].length
  const endMatch = endPattern.exec(content)
  const objectBlock = content.slice(header.index, endMatch?.index ?? content.length)
  const propertyPattern = new RegExp('^[ \t]*' + escape(propertyName) + '\\s*=\\s*\\{([\\s\\S]*?)\\}', 'im')
  const match = propertyPattern.exec(objectBlock)
  if (!match) return null
  const clean = match[1].replace(/[^0-9A-F]/gi, '')
  return clean || null
}

export function findNode(root: DfmNode | null, name: string): DfmNode | null {
  if (!root) return null
  if (root.name === name) return root
  for (const child of root.children) {
    const found = findNode(child, name)
    if (found) return found
  }
  return null
}
export function collectNodes(root: DfmNode | null): DfmNode[] {
  return root ? flatten(root) : []
}

export function isInheritedDfm(content: string): boolean {
  return /^\s*inherited\s+/im.test(content)
}
