import { AIProviderError } from './types'
import type { UnitSpec } from '../delphi/projectTemplate'
import { isCataloguedClass, isKnownProperty } from './vclPropertyCatalog'

// Aceita variações comuns de modelos menores: espaços extras, $RESOURCE e
// nome explícito do arquivo em vez de "*.dfm".
const DFM_RESOURCE_DIRECTIVE = /\{\$\s*(?:R|RESOURCE)\s+[^}]*\.dfm[^}]*\}/gi

const VCL_COLOR_NAMES = new Set(
  [
    'clBlack', 'clMaroon', 'clGreen', 'clOlive', 'clNavy', 'clPurple', 'clTeal', 'clGray',
    'clSilver', 'clRed', 'clLime', 'clYellow', 'clBlue', 'clFuchsia', 'clAqua', 'clWhite',
    'clMoneyGreen', 'clSkyBlue', 'clCream', 'clMedGray', 'clNone', 'clDefault', 'clScrollBar',
    'clBackground', 'clActiveCaption', 'clInactiveCaption', 'clMenu', 'clWindow', 'clWindowFrame',
    'clMenuText', 'clWindowText', 'clCaptionText', 'clActiveBorder', 'clInactiveBorder',
    'clAppWorkSpace', 'clHighlight', 'clHighlightText', 'clBtnFace', 'clBtnShadow', 'clGrayText',
    'clBtnText', 'clInactiveCaptionText', 'clBtnHighlight', 'cl3DDkShadow', 'cl3DLight', 'clInfoText',
    'clInfoBk', 'clHotLight', 'clGradientActiveCaption', 'clGradientInactiveCaption', 'clMenuHighlight',
    'clMenuBar'
  ].map((name) => name.toLowerCase())
)

const COLOR_ALIASES: Record<string, string> = {
  clnavyblue: 'clNavy',
  clgraydark: 'clGray',
  cldarkgray: 'clGray',
  cllightgray: 'clSilver',
  cluilite: 'clBtnFace'
}

/**
 * Classes/propriedades cuja intenção tem uma tradução real para outra API da
 * mesma classe, em vez de simplesmente descartar a linha. Por exemplo,
 * TStringGrid/TDrawGrid não têm "ReadOnly", mas a intenção (impedir edição de
 * células) tem equivalente exato via a flag "goEditing" de "Options".
 */
const PROPERTY_TRANSLATIONS = new Set(['tstringgrid.readonly', 'tdrawgrid.readonly'])

const INVALID_DFM_PROPERTIES = new Set([
  'parent',
  'controls',
  'objects',
  'components',
  'children',
  'font.bold',
  'font.size',
  'opacity',
  'bevelmargin'
])

interface DfmBlock {
  kind: 'object' | 'item'
  className?: string
  name?: string
  line: number
  optionsOutputIndex?: number
  pendingEditingFlag?: 'add' | 'remove'
}

/** Adiciona ou remove "goEditing" do conjunto "Options = [...]" de um grid. */
function toggleGoEditingInOptionsLine(line: string, action: 'add' | 'remove'): string {
  const match = /^(\s*Options\s*=\s*\[)([^\]]*)(\]\s*)$/i.exec(line)
  if (!match) return line
  const [, prefix, body, suffix] = match
  const items = body.split(',').map((item) => item.trim()).filter(Boolean)
  const hasFlag = items.some((item) => /^goEditing$/i.test(item))
  if (action === 'add' && !hasFlag) items.push('goEditing')
  if (action === 'remove' && hasFlag) {
    const index = items.findIndex((item) => /^goEditing$/i.test(item))
    items.splice(index, 1)
  }
  return prefix + items.join(', ') + suffix
}

const GRID_CLASSES = new Set(['tstringgrid', 'tdrawgrid'])

/**
 * TStringGrid/TDrawGrid (TCustomGrid) exigem, em tempo real, que
 * FixedRows < RowCount e FixedCols < ColCount — o próprio setter da
 * propriedade lança "Fixed row/col count must be less than row/col count" ao
 * carregar o formulário se essa relação não for respeitada, mesmo que os
 * quatro valores sejam individualmente válidos. A IA às vezes grava
 * RowCount/ColCount contando só a linha/coluna fixa (ex.: RowCount=1 igual a
 * FixedRows=1), sem reservar espaço para os dados. Corrige aumentando
 * RowCount/ColCount para caber a área fixa mais pelo menos uma linha/coluna
 * de dados — nunca diminui FixedRows/FixedCols, que refletem a intenção de
 * cabeçalho do usuário.
 */
function fixGridFixedCounts(lines: string[]): string[] {
  const result = [...lines]
  interface GridBlock { start: number; end: number }
  const stack: Array<{ className: string; start: number }> = []
  const gridBlocks: GridBlock[] = []
  for (let i = 0; i < result.length; i++) {
    const objectMatch = /^\s*(?:object|inherited|inline)\s+[A-Za-z][A-Za-z0-9_]*\s*:\s*([A-Za-z][A-Za-z0-9_.]*)/i.exec(result[i])
    if (objectMatch) {
      stack.push({ className: objectMatch[1].toLowerCase(), start: i })
      continue
    }
    if (/^\s*end\s*$/i.test(result[i])) {
      const top = stack.pop()
      if (top && GRID_CLASSES.has(top.className)) gridBlocks.push({ start: top.start, end: i })
      continue
    }
  }

  for (const block of gridBlocks) {
    let rowCountLine = -1, fixedRowsLine = -1, colCountLine = -1, fixedColsLine = -1
    let rowCount = 5, fixedRows = 1, colCount = 5, fixedCols = 1 // padrões reais da VCL para TCustomGrid
    for (let i = block.start + 1; i < block.end; i++) {
      const match = /^\s*(RowCount|FixedRows|ColCount|FixedCols)\s*=\s*(-?\d+)\s*$/i.exec(result[i])
      if (!match) continue
      const value = Number(match[2])
      switch (match[1].toLowerCase()) {
        case 'rowcount': rowCount = value; rowCountLine = i; break
        case 'fixedrows': fixedRows = value; fixedRowsLine = i; break
        case 'colcount': colCount = value; colCountLine = i; break
        case 'fixedcols': fixedCols = value; fixedColsLine = i; break
      }
    }

    if (fixedRows >= rowCount) {
      const fixedValue = fixedRows + 1
      if (rowCountLine !== -1) {
        result[rowCountLine] = result[rowCountLine].replace(/-?\d+\s*$/, String(fixedValue))
      } else {
        const indentMatch = /^(\s*)/.exec(result[fixedRowsLine === -1 ? block.start + 1 : fixedRowsLine])
        result.splice(block.end, 0, `${indentMatch?.[1] ?? '    '}RowCount = ${fixedValue}`)
      }
    }
    if (fixedCols >= colCount) {
      const fixedValue = fixedCols + 1
      if (colCountLine !== -1) {
        result[colCountLine] = result[colCountLine].replace(/-?\d+\s*$/, String(fixedValue))
      } else {
        const indentMatch = /^(\s*)/.exec(result[fixedColsLine === -1 ? block.start + 1 : fixedColsLine])
        result.splice(block.end, 0, `${indentMatch?.[1] ?? '    '}ColCount = ${fixedValue}`)
      }
    }
  }
  return result
}

/**
 * Corrige erros recorrentes de DFM produzidos por modelos locais pequenos.
 * O RLINK32 costuma reportar esses erros de sintaxe como "Error opening file",
 * embora o arquivo exista no disco.
 */
export function sanitizeDfmContent(dfmContent: string): string {
  const blocks: DfmBlock[] = []
  const output: string[] = []

  const lines = dfmContent.replace(/﻿/g, '').replace(/\r\n?/g, '\n').split('\n')
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex]
    const objectMatch = /^\s*(?:object|inherited|inline)\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*([A-Za-z][A-Za-z0-9_.]*)/i.exec(
      rawLine
    )
    if (objectMatch) {
      blocks.push({ kind: 'object', name: objectMatch[1], className: objectMatch[2], line: lineIndex + 1 })
      output.push(rawLine)
      continue
    }

    if (/^\s*item\s*$/i.test(rawLine)) {
      blocks.push({ kind: 'item', line: lineIndex + 1 })
      output.push(rawLine)
      continue
    }

    // Nas coleções DFM (por exemplo TDBGrid.Columns), o último item usa
    // "end>" para fechar simultaneamente o item e a coleção. O caractere
    // ">" não fecha um object; ele pertence apenas à sintaxe da coleção.
    if (/^\s*end>\s*$/i.test(rawLine)) {
      const current = blocks.at(-1)
      if (!current || current.kind !== 'item') {
        throw new AIProviderError(`DFM inválido: "end>" sem item de coleção correspondente na linha ${lineIndex + 1}.`)
      }
      output.push(rawLine)
      blocks.pop()
      continue
    }

    if (/^\s*end;\s*$/i.test(rawLine) || /^\s*end\s*$/i.test(rawLine)) {
      if (blocks.length === 0) {
        throw new AIProviderError(`DFM inválido: "end" sem bloco correspondente na linha ${lineIndex + 1}.`)
      }
      output.push(rawLine.replace(/end;\s*$/i, 'end'))
      blocks.pop()
      continue
    }

    const currentObject = [...blocks].reverse().find((block) => block.kind === 'object')
    const currentClass = currentObject?.className?.toLowerCase()
    const propertyMatch = /^\s*([A-Za-z][A-Za-z0-9_.]*)\s*=/.exec(rawLine)
    const propertyName = propertyMatch?.[1].toLowerCase()

    // Propriedades frequentemente inventadas por modelos e inexistentes em
    // QUALQUER componente VCL.
    if (propertyName && INVALID_DFM_PROPERTIES.has(propertyName)) continue

    // Rede de segurança principal contra propriedades inventadas: valida
    // contra o catálogo real de propriedades por classe (vclPropertyCatalog),
    // organizado por herança da VCL. Cobre de uma vez toda classe cadastrada
    // lá — não é preciso adicionar um caso especial para cada propriedade
    // inventada relatada, como acontecia antes. Eventos (On*) nunca são
    // validados aqui, pois não são "propriedades" no sentido do catálogo.
    if (currentClass && propertyName && !propertyName.startsWith('on') && isCataloguedClass(currentClass) && !isKnownProperty(currentClass, propertyName)) {
      if (PROPERTY_TRANSLATIONS.has(`${currentClass}.${propertyName}`) && propertyName === 'readonly') {
        // Traduz a intenção (ex.: TStringGrid.ReadOnly) para a API real da
        // classe (Options/goEditing) em vez de só descartar.
        const isTrue = /=\s*true\s*$/i.test(rawLine)
        const action: 'add' | 'remove' = isTrue ? 'remove' : 'add'
        if (currentObject && currentObject.optionsOutputIndex !== undefined) {
          output[currentObject.optionsOutputIndex] = toggleGoEditingInOptionsLine(output[currentObject.optionsOutputIndex], action)
        } else if (currentObject) {
          currentObject.pendingEditingFlag = action
        }
      }
      // Sem tradução conhecida: descarta a linha. Uma propriedade cosmética
      // ausente é sempre preferível a EReadError travando o executável.
      continue
    }
    if (currentClass && propertyName === 'options' && currentObject) {
      if (currentObject.pendingEditingFlag) {
        output.push(toggleGoEditingInOptionsLine(rawLine, currentObject.pendingEditingFlag))
        currentObject.pendingEditingFlag = undefined
        currentObject.optionsOutputIndex = output.length - 1
        continue
      }
      currentObject.optionsOutputIndex = output.length
    }

    // TextHeight é persistido pelo formulário, não por seus controles filhos.
    const objectCount = blocks.filter((block) => block.kind === 'object').length
    if (propertyName === 'textheight' && objectCount > 1) continue

    // Application.Run exibe o MainForm. Visible=True no DFM faria todos os
    // formulários autocriados aparecerem simultaneamente na inicialização.
    if (propertyName === 'visible' && objectCount === 1) continue

    let normalizedLine = rawLine.replace(/\bfsStandard\b/gi, 'fsNormal')

    // Recupera eventos que versões anteriores do designer gravaram como texto.
    // O formato válido do Delphi é OnClick = Metodo, sem aspas.
    if (propertyName?.startsWith('on')) {
      normalizedLine = normalizedLine.replace(
        /^(\s*On[A-Za-z0-9_]+\s*=\s*)'([A-Za-z][A-Za-z0-9_]*)'(\s*)$/i,
        '$1$2$3'
      )
    }

    if (propertyName === 'color' || propertyName?.endsWith('.color')) {
      const colorMatch = /=\s*([A-Za-z][A-Za-z0-9_]*)\s*$/.exec(normalizedLine)
      if (colorMatch) {
        const rawColor = colorMatch[1]
        const alias = COLOR_ALIASES[rawColor.toLowerCase()]
        const safeColor = propertyName === 'font.color' ? 'clWindowText' : 'clBtnFace'
        if (alias) {
          normalizedLine = normalizedLine.replace(rawColor, alias)
        } else if (rawColor.toLowerCase().startsWith('cl') && !VCL_COLOR_NAMES.has(rawColor.toLowerCase())) {
          normalizedLine = normalizedLine.replace(rawColor, safeColor)
        }
      }
    }

    output.push(normalizedLine)
  }

  if (blocks.length > 0) {
    const pending = blocks
      .map((block) => (block.kind === 'object' ? `${block.name ?? 'object'}:${block.className ?? '?'} (linha ${block.line})` : `item (linha ${block.line})`))
      .join(', ')
    throw new AIProviderError(
      `DFM incompleto: faltam ${blocks.length} fechamento(s) "end". Blocos não fechados: ${pending}.`
    )
  }

  const fixedOutput = fixGridFixedCounts(output)

  // O BOM informa ao compilador/streamer do Delphi que captions e demais
  // strings do DFM estão em UTF-8, preservando corretamente os acentos.
  return '﻿' + fixedOutput.join('\r\n').trimEnd() + '\r\n'
}

export function referencesDfmResource(pasContent: string): boolean {
  DFM_RESOURCE_DIRECTIVE.lastIndex = 0
  return DFM_RESOURCE_DIRECTIVE.test(pasContent)
}

function addDfmDirective(pasContent: string): string {
  const implementation = /\bimplementation\b/i.exec(pasContent)
  if (!implementation) return pasContent

  const insertAt = implementation.index + implementation[0].length
  return `${pasContent.slice(0, insertAt)}\n\n{$R *.dfm}${pasContent.slice(insertAt)}`
}

/**
 * Torna o vínculo PAS/DFM determinístico, sem depender de o modelo obedecer:
 * normaliza a diretiva quando o DFM existe e recusa qualquer referência órfã.
 */
export function repairAndValidateDfmArtifacts(units: UnitSpec[]): UnitSpec[] {
  return units.map((unit) => {
    const hasDfm = unit.dfmContent !== null && unit.dfmContent.trim().length > 0
    const hasReference = referencesDfmResource(unit.pasContent)

    if (!hasDfm && hasReference) {
      throw new AIProviderError(
        `A unit "${unit.unitName}" referencia um arquivo .dfm, mas a IA local não retornou esse arquivo. A geração foi interrompida antes da compilação para evitar o erro RLINK32.`
      )
    }

    if (!hasDfm && (unit.formClassName || unit.isMainForm)) {
      throw new AIProviderError(
        `A unit de formulário "${unit.unitName}" foi retornada sem o .dfm. A geração foi interrompida antes da compilação para evitar o erro RLINK32.`
      )
    }

    if (!hasDfm) return unit

    const dfmContent = sanitizeDfmContent(unit.dfmContent as string)

    let pasContent = unit.pasContent
    if (hasReference) {
      DFM_RESOURCE_DIRECTIVE.lastIndex = 0
      pasContent = pasContent.replace(DFM_RESOURCE_DIRECTIVE, '{$R *.dfm}')
    } else {
      pasContent = addDfmDirective(pasContent)
      if (!referencesDfmResource(pasContent)) {
        throw new AIProviderError(
          `A unit "${unit.unitName}" possui .dfm, mas o .pas não tem uma seção implementation válida para receber {$R *.dfm}.`
        )
      }
    }

    if (pasContent === unit.pasContent && dfmContent === unit.dfmContent) return unit
    return { ...unit, pasContent, dfmContent }
  })
}
