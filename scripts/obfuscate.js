// Ofusca o JS já compilado em out/ (main, preload, renderer) antes de empacotar o
// executável. Roda depois de "electron-vite build" e antes do electron-builder.
// Config conservadora: evita transforms agressivos (control flow flattening,
// self-defending, debug protection) que costumam introduzir bugs ou travamentos
// em apps Electron/React reais — o objetivo é dificultar leitura casual do código,
// não é uma barreira intransponível.
const fs = require('fs')
const path = require('path')
const JavaScriptObfuscator = require('javascript-obfuscator')

const OUT_DIR = path.join(__dirname, '..', 'out')

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  stringArray: true,
  stringArrayThreshold: 0.5,
  rotateStringArray: true,
  stringArrayEncoding: ['base64']
}

function listJsFiles(dir) {
  const result = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...listJsFiles(fullPath))
    else if (entry.name.endsWith('.js')) result.push(fullPath)
  }
  return result
}

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error(`Diretório não encontrado: ${OUT_DIR}. Rode "npm run build" antes.`)
    process.exit(1)
  }

  const files = listJsFiles(OUT_DIR)
  let ok = 0
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    try {
      const obfuscated = JavaScriptObfuscator.obfuscate(source, OBFUSCATOR_OPTIONS).getObfuscatedCode()
      fs.writeFileSync(file, obfuscated, 'utf8')
      ok++
    } catch (error) {
      console.error(`Falha ao ofuscar ${path.relative(OUT_DIR, file)}: ${error.message}`)
      process.exit(1)
    }
  }
  console.log(`Ofuscados ${ok}/${files.length} arquivos .js em out/`)
}

main()
