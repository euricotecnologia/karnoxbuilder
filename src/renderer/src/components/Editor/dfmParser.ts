export interface DfmNode {
  name: string
  className: string
  properties: Record<string, string>
  children: DfmNode[]
}

interface Token {
  type: 'ident' | 'num' | 'string' | 'punct'
  value: string
}

const OBJECT_KEYWORDS = new Set(['object', 'inherited', 'inline'])

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = text.length

  while (i < n) {
    const c = text[i]

    if (/\s/.test(c)) {
      i++
      continue
    }

    if (c === '{') {
      let depth = 1
      i++
      while (i < n && depth > 0) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') depth--
        i++
      }
      continue
    }

    if (c === "'") {
      let j = i + 1
      let value = ''
      while (j < n) {
        if (text[j] === "'") {
          if (text[j + 1] === "'") {
            value += "'"
            j += 2
            continue
          }
          j++
          break
        }
        value += text[j]
        j++
      }
      tokens.push({ type: 'string', value })
      i = j
      continue
    }

    if (c === '#') {
      let j = i + 1
      let numStr = ''
      while (j < n && /[0-9]/.test(text[j])) {
        numStr += text[j]
        j++
      }
      tokens.push({ type: 'string', value: numStr ? String.fromCharCode(Number(numStr)) : '' })
      i = j
      continue
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++
      tokens.push({ type: 'ident', value: text.slice(i, j) })
      i = j
      continue
    }

    if (/[0-9$]/.test(c) || (c === '-' && /[0-9]/.test(text[i + 1] ?? ''))) {
      let j = i
      if (text[j] === '$') {
        j++
        while (j < n && /[0-9A-Fa-f]/.test(text[j])) j++
        tokens.push({ type: 'num', value: text.slice(i, j) })
        i = j
        continue
      }
      while (j < n && /[0-9.\-eE]/.test(text[j])) j++
      tokens.push({ type: 'num', value: text.slice(i, j) })
      i = j
      continue
    }

    if ('[](),.:=+<>'.includes(c)) {
      tokens.push({ type: 'punct', value: c })
      i++
      continue
    }

    i++
  }

  return tokens
}

class DfmParser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++]
  }

  parseRoot(): DfmNode {
    return this.parseObject()
  }

  private parseObject(): DfmNode {
    const kw = this.next()
    if (!kw || kw.type !== 'ident' || !OBJECT_KEYWORDS.has(kw.value.toLowerCase())) {
      throw new Error('Esperado "object" no início do .dfm.')
    }

    let name = ''
    let className = ''

    const first = this.peek()
    if (first?.type === 'ident') {
      const firstValue = this.next()!.value
      if (this.peek()?.value === ':') {
        this.next()
        name = firstValue
        className = this.next()?.value ?? ''
      } else {
        className = firstValue
      }
    }

    const properties: Record<string, string> = {}
    const children: DfmNode[] = []

    while (true) {
      const t = this.peek()
      if (!t) break

      if (t.type === 'ident' && OBJECT_KEYWORDS.has(t.value.toLowerCase())) {
        children.push(this.parseObject())
        continue
      }

      if (t.type === 'ident' && t.value.toLowerCase() === 'end') {
        this.next()
        break
      }

      if (t.type !== 'ident') {
        this.next()
        continue
      }

      const propName = this.parseDottedIdent()
      if (this.peek()?.value !== '=') {
        continue
      }
      this.next()
      properties[propName] = this.parseValue()
    }

    return { name, className, properties, children }
  }

  private parseDottedIdent(): string {
    const parts = [this.next()?.value ?? '']
    while (this.peek()?.value === '.') {
      this.next()
      parts.push(this.next()?.value ?? '')
    }
    return parts.join('.')
  }

  private parseValue(): string {
    const t = this.peek()
    if (!t) return ''

    if (t.type === 'string') {
      let value = this.next()!.value
      while (this.peek()?.value === '+') {
        this.next()
        if (this.peek()?.type === 'string') value += this.next()!.value
        else break
      }
      return value
    }

    if (t.value === '[') {
      this.next()
      const items: string[] = []
      while (this.peek() && this.peek()!.value !== ']') {
        const it = this.next()!
        if (it.value !== ',') items.push(it.value)
      }
      this.next()
      return items.join(',')
    }

    if (t.value === '(') {
      this.next()
      const items: string[] = []
      while (this.peek() && this.peek()!.value !== ')') {
        items.push(this.next()!.value)
      }
      this.next()
      return items.join(' ')
    }

    if (t.value === '<') {
      // Propriedade de coleção (ex: TStatusBar.Panels = <item ... end>).
      // Não precisamos do conteúdo detalhado para a pré-visualização —
      // só consumimos os tokens de forma balanceada para não confundir o
      // restante do parser.
      this.next()
      let depth = 1
      const items: string[] = []
      while (this.peek() && depth > 0) {
        const it = this.next()!
        if (it.value === '<') depth++
        else if (it.value === '>') {
          depth--
          if (depth === 0) break
        } else {
          items.push(it.value)
        }
      }
      return items.join(' ')
    }

    if (t.type === 'ident') {
      return this.parseDottedIdent()
    }

    return this.next()?.value ?? ''
  }
}

export function parseDfm(text: string): DfmNode {
  // Picture.Data e outros blobs podem conter milhões de caracteres. O designer
  // não precisa tokenizar o conteúdo binário para montar a árvore visual.
  const structuralText = text.replace(/=\s*\{[\s\S]*?\}/g, '= 0')
  const tokens = tokenize(structuralText)
  if (tokens.length === 0) {
    throw new Error('Arquivo .dfm vazio.')
  }
  return new DfmParser(tokens).parseRoot()
}
