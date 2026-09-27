import { BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import { readFileSync } from 'fs'
import { basename, extname } from 'path'
import * as XLSX from 'xlsx'
import { getNoCodeBinding, listDelphiForms, saveNoCodeBinding, type NoCodeBinding } from '../noCode/noCodeService'
import { createNoCodeForm, getNoCodeFormOptions, listManagedNoCodeForms, updateManagedNoCodeForm, type CreateNoCodeFormInput, type UpdateNoCodeFormInput } from '../noCode/noCodeFormGenerator'
import { bindDatabaseTable, type DatabaseBindingInput } from '../noCode/databaseBindingService'

export function registerNoCodeHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('nocode:getBinding', (_event, args: { projectDir: string; dfmPath: string; componentName: string; eventName: string }) =>
    getNoCodeBinding(args.projectDir, args.dfmPath, args.componentName, args.eventName))
  ipcMain.handle('nocode:saveBinding', (_event, args: { projectDir: string; binding: Omit<NoCodeBinding, 'id' | 'dfmPath'> & { dfmPath: string } }) =>
    saveNoCodeBinding(args.projectDir, args.binding))
  ipcMain.handle('nocode:listForms', (_event, projectDir: string) => listDelphiForms(projectDir))
  ipcMain.handle('nocode:formOptions', (_event, projectDir?: string) => getNoCodeFormOptions(projectDir))
  ipcMain.handle('nocode:createForm', (_event, input: CreateNoCodeFormInput) => createNoCodeForm(input))
  ipcMain.handle('nocode:managedForms', (_event, projectDir: string) => listManagedNoCodeForms(projectDir))
  ipcMain.handle('nocode:updateForm', (_event, input: UpdateNoCodeFormInput) => updateManagedNoCodeForm(input))
  ipcMain.handle('nocode:bindDatabase', (_event, input: DatabaseBindingInput) => bindDatabaseTable(input))
  ipcMain.handle('nocode:importGridFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importar dados para o TStringGrid',
      properties: ['openFile'],
      filters: [
        { name: 'Dados e planilhas', extensions: ['txt', 'csv', 'tsv', 'xls', 'xlsx', 'ods'] },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    let workbook: XLSX.WorkBook
    try { workbook = XLSX.read(readFileSync(filePath), { type: 'buffer', raw: false, cellDates: false }) }
    catch { throw new Error('Não foi possível interpretar o arquivo. Verifique se ele é TXT, CSV, XLS, XLSX ou ODS válido.') }
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('O arquivo não possui uma planilha ou dados legíveis.')
    const raw = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false }) as unknown[][]
    let data = raw.map((row) => row.map((cell) => cell == null ? '' : String(cell)))
    while (data.length && data[data.length - 1].every((cell) => !cell.length)) data.pop()
    const widest = Math.max(0, ...data.map((row) => row.length))
    let lastColumn = widest - 1
    while (lastColumn >= 0 && data.every((row) => !(row[lastColumn] ?? '').length)) lastColumn -= 1
    data = data.map((row) => row.slice(0, lastColumn + 1))
    if (!data.length || lastColumn < 0) throw new Error('O arquivo selecionado está vazio.')
    const originalRows = data.length
    const originalCols = lastColumn + 1
    const truncated = originalRows > 1000 || originalCols > 100 || originalRows * originalCols > 50000
    const maxRows = Math.min(1000, Math.floor(50000 / Math.min(100, originalCols)))
    data = data.slice(0, maxRows).map((row) => row.slice(0, 100))
    return { fileName: basename(filePath), sheetName, data, rows: data.length, cols: Math.max(1, ...data.map((row) => row.length)), originalRows, originalCols, truncated }
  })

  ipcMain.handle('nocode:selectGlyph', async (_event, purpose?: 'menu') => {
    const menuIcon = purpose === 'menu'
    const maxSize = menuIcon ? 20 : 32
    const result = await dialog.showOpenDialog(mainWindow, {
      title: menuIcon ? 'Selecionar ícone PNG para o menu' : 'Selecionar ícone PNG para o TBitBtn',
      properties: ['openFile'],
      filters: [{ name: 'Imagem PNG', extensions: ['png'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    if (extname(filePath).toLowerCase() !== '.png') throw new Error('Selecione uma imagem PNG válida.')
    const source = nativeImage.createFromPath(filePath)
    if (source.isEmpty()) throw new Error('Não foi possível carregar o PNG selecionado.')
    const original = source.getSize()
    const scale = Math.min(1, maxSize / original.width, maxSize / original.height)
    const image = scale < 1 ? source.resize({
      width: Math.max(1, Math.round(original.width * scale)),
      height: Math.max(1, Math.round(original.height * scale)), quality: 'good'
    }) : source
    const { width, height } = image.getSize()
    const pixels = image.toBitmap()
    const rowSize = Math.ceil((width * 3) / 4) * 4
    const pixelSize = rowSize * height
    const bmp = Buffer.alloc(54 + pixelSize)
    bmp.write('BM', 0, 'ascii')
    bmp.writeUInt32LE(bmp.length, 2)
    bmp.writeUInt32LE(54, 10)
    bmp.writeUInt32LE(40, 14)
    bmp.writeInt32LE(width, 18)
    bmp.writeInt32LE(height, 22)
    bmp.writeUInt16LE(1, 26)
    bmp.writeUInt16LE(24, 28)
    bmp.writeUInt32LE(pixelSize, 34)
    for (let y = 0; y < height; y += 1) {
      const targetY = height - 1 - y
      for (let x = 0; x < width; x += 1) {
        const sourceOffset = (y * width + x) * 4
        const targetOffset = 54 + targetY * rowSize + x * 3
        const alpha = pixels[sourceOffset + 3]
        if (alpha <= 8) {
          bmp[targetOffset] = 255
          bmp[targetOffset + 1] = 0
          bmp[targetOffset + 2] = 255
        } else {
          const opacity = alpha / 255
          const buttonFace = 240
          bmp[targetOffset] = Math.round(pixels[sourceOffset] * opacity + buttonFace * (1 - opacity))
          bmp[targetOffset + 1] = Math.round(pixels[sourceOffset + 1] * opacity + buttonFace * (1 - opacity))
          bmp[targetOffset + 2] = Math.round(pixels[sourceOffset + 2] * opacity + buttonFace * (1 - opacity))
        }
      }
    }
    const sizePrefix = Buffer.alloc(4)
    sizePrefix.writeUInt32LE(bmp.length)
    return {
      fileName: basename(filePath), width, height,
      glyphData: Buffer.concat([sizePrefix, bmp]).toString('hex').toUpperCase(),
      previewDataUrl: image.toDataURL()
    }
  })

  ipcMain.handle('nocode:selectImage', async (_event, profile: string) => {
    const legacy = profile === 'delphi7_2007'
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Selecionar imagem para o componente',
      properties: ['openFile'],
      filters: [{ name: legacy ? 'Imagens compatíveis com Delphi 7' : 'Imagens', extensions: legacy ? ['bmp', 'jpg', 'jpeg'] : ['bmp', 'jpg', 'jpeg', 'png'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null

    const filePath = result.filePaths[0]
    const extension = extname(filePath).toLowerCase()
    if (!['.bmp', '.jpg', '.jpeg', '.png'].includes(extension) || (legacy && extension === '.png')) {
      throw new Error('Formato de imagem incompatível com o perfil Delphi selecionado.')
    }

    const source = nativeImage.createFromPath(filePath)
    if (source.isEmpty()) throw new Error('O arquivo selecionado não é uma imagem válida.')
    const original = source.getSize()
    const scale = Math.min(1, 1280 / original.width, 960 / original.height)
    const image = scale < 1
      ? source.resize({
          width: Math.max(1, Math.round(original.width * scale)),
          height: Math.max(1, Math.round(original.height * scale)),
          quality: 'good'
        })
      : source

    const preserveTransparency = !legacy && extension === '.png'
    let className = preserveTransparency ? 'TPngImage' : 'TJPEGImage'
    let mime = preserveTransparency ? 'image/png' : 'image/jpeg'
    let encoded = preserveTransparency ? image.toPNG() : image.toJPEG(88)
    if (legacy || extension === '.jpg' || extension === '.jpeg') {
      className = 'TJPEGImage'
      mime = 'image/jpeg'
      encoded = image.toJPEG(88)
    } else if (encoded.length > 2 * 1024 * 1024) {
      className = 'TJPEGImage'
      mime = 'image/jpeg'
      encoded = image.toJPEG(88)
    }
    if (!encoded.length || encoded.length > 3 * 1024 * 1024) {
      throw new Error('A imagem continuou muito grande após a otimização. Use uma imagem menor.')
    }

    const size = image.getSize()
    const previewScale = Math.min(1, 360 / size.width, 240 / size.height)
    const preview = previewScale < 1
      ? image.resize({
          width: Math.max(1, Math.round(size.width * previewScale)),
          height: Math.max(1, Math.round(size.height * previewScale)),
          quality: 'good'
        })
      : image
    const previewDataUrl = mime === 'image/jpeg'
      ? `data:image/jpeg;base64,${preview.toJPEG(82).toString('base64')}`
      : preview.toDataURL()
    const pictureData = Buffer.concat([
      Buffer.from([Buffer.byteLength(className, 'ascii')]),
      Buffer.from(className, 'ascii'),
      encoded
    ]).toString('hex').toUpperCase()

    return {
      fileName: basename(filePath),
      pictureData,
      previewDataUrl,
      width: size.width,
      height: size.height,
      embeddedBytes: encoded.length,
      optimized: scale < 1
    }
  })
}
