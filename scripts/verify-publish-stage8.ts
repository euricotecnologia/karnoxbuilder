import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createZip, readPeImports } from '../src/main/publish/publishService'

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

const pe = Buffer.alloc(0x500)
pe.write('MZ', 0, 'ascii')
pe.writeUInt32LE(0x80, 0x3c)
pe.write('PE\0\0', 0x80, 'ascii')
const coff = 0x84
pe.writeUInt16LE(1, coff + 2)
pe.writeUInt16LE(224, coff + 16)
const optional = coff + 20
pe.writeUInt16LE(0x10b, optional)
pe.writeUInt32LE(0x1000, optional + 96 + 8)
const section = optional + 224
pe.writeUInt32LE(0x300, section + 8)
pe.writeUInt32LE(0x1000, section + 12)
pe.writeUInt32LE(0x300, section + 16)
pe.writeUInt32LE(0x200, section + 20)
pe.writeUInt32LE(0x1050, 0x200 + 12)
pe.writeUInt32LE(1, 0x200 + 16)
pe.write('TesteRuntime.bpl\0', 0x250, 'ascii')

const root = join(process.cwd(), '.tmp', 'publish-stage8')
rmSync(root, { recursive: true, force: true })
mkdirSync(join(root, 'source', 'config'), { recursive: true })
const pePath = join(root, 'sample.exe')
writeFileSync(pePath, pe)
check(readPeImports(pePath).includes('TesteRuntime.bpl'), 'A tabela de imports PE não foi interpretada.')

writeFileSync(join(root, 'source', 'app.exe'), Buffer.from('executavel'))
writeFileSync(join(root, 'source', 'config', 'app.ini'), Buffer.from('[app]\nmodo=producao'))
const zipPath = join(root, 'entrega.zip')
createZip(join(root, 'source'), zipPath)
check(existsSync(zipPath) && readFileSync(zipPath).readUInt32LE(0) === 0x04034b50, 'O ZIP não foi gerado corretamente.')
console.log(`Stage 8 publish smoke test: OK\n${zipPath}`)
