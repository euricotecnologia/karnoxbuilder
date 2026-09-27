import { performance } from 'node:perf_hooks'
import { parseDfm } from '../src/renderer/src/components/Editor/dfmParser'
import { readDfmBinaryProperty, updateDfmBinaryProperty } from '../src/renderer/src/components/Editor/DfmAdvancedEditor'

const raw = `09${Buffer.from('TPngImage').toString('hex').toUpperCase()}${'AB'.repeat(3 * 1024 * 1024)}`
const chunks = raw.match(/.{1,1024}/g) ?? []
const dfm = ['object Form1: TForm', '  object Image1: TImage', '    Left = 8', '    Top = 8', '    Picture.Data = {', ...chunks.map((line, index) => `      ${line}${index === chunks.length - 1 ? '}' : ''}`), '  end', 'end'].join('\n')

const parseStart = performance.now()
const root = parseDfm(dfm)
const parseMs = performance.now() - parseStart
if (root.children[0]?.name !== 'Image1') throw new Error('Parser perdeu o componente Image1')

const readStart = performance.now()
const recovered = readDfmBinaryProperty(dfm, 'Image1', 'Picture.Data')
const readMs = performance.now() - readStart
if (recovered !== raw) throw new Error('Leitura do Picture.Data retornou conteúdo diferente')

const updateStart = performance.now()
const updated = updateDfmBinaryProperty(dfm, 'Image1', 'Picture.Data', raw.slice(0, 20000))
const updateMs = performance.now() - updateStart
if (!updated.includes('Picture.Data = {')) throw new Error('Atualização do Picture.Data falhou')
if (parseMs > 1000 || readMs > 1000 || updateMs > 1500) throw new Error(`Desempenho insuficiente: parse=${parseMs.toFixed(0)} read=${readMs.toFixed(0)} update=${updateMs.toFixed(0)} ms`)
console.log(`Large DFM image: OK (parse ${parseMs.toFixed(0)} ms, read ${readMs.toFixed(0)} ms, update ${updateMs.toFixed(0)} ms)`)
