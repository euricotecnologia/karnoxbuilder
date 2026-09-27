import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

export interface DelphiInstall {
  version: string
  studioPath: string
  rsvarsPath: string | null
  binPath: string
  dcc32Path: string
  dcc64Path: string | null
  isLegacy: boolean
}

const STUDIO_ROOTS = [
  'C:\\Program Files (x86)\\Embarcadero\\Studio',
  'C:\\Program Files\\Embarcadero\\Studio'
]

const LEGACY_INSTALLS = [
  { version: 'Delphi 7', path: 'C:\\Program Files (x86)\\Borland\\Delphi7' },
  { version: 'Delphi 7', path: 'C:\\Program Files\\Borland\\Delphi7' },
  { version: 'Delphi 2007', path: 'C:\\Program Files (x86)\\CodeGear\\RAD Studio\\5.0' },
  { version: 'Delphi 2007', path: 'C:\\Program Files\\CodeGear\\RAD Studio\\5.0' }
]

function installFromPath(studioPath: string, version?: string): DelphiInstall | null {
  const binPath = join(studioPath, 'bin')
  const dcc32Path = join(binPath, 'dcc32.exe')
  if (!existsSync(dcc32Path)) return null
  const rsvarsCandidate = join(binPath, 'rsvars.bat')
  const dcc64Candidate = join(binPath, 'dcc64.exe')
  return {
    version: version ?? studioPath.split(/[\\/]/).filter(Boolean).pop() ?? studioPath,
    studioPath,
    rsvarsPath: existsSync(rsvarsCandidate) ? rsvarsCandidate : null,
    binPath,
    dcc32Path,
    dcc64Path: existsSync(dcc64Candidate) ? dcc64Candidate : null,
    isLegacy: !existsSync(rsvarsCandidate)
  }
}

export function detectDelphiInstalls(): DelphiInstall[] {
  const found: DelphiInstall[] = []
  const seen = new Set<string>()
  const add = (install: DelphiInstall | null): void => {
    if (!install || seen.has(install.studioPath.toLowerCase())) return
    seen.add(install.studioPath.toLowerCase())
    found.push(install)
  }

  for (const root of STUDIO_ROOTS) {
    if (!existsSync(root)) continue
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory()) add(installFromPath(join(root, entry.name), entry.name))
      }
    } catch {
      // Uma instalaÃ§Ã£o sem permissÃ£o nÃ£o impede a detecÃ§Ã£o das demais.
    }
  }
  for (const candidate of LEGACY_INSTALLS) add(installFromPath(candidate.path, candidate.version))

  found.sort((a, b) => {
    const av = Number.parseFloat(a.version.replace(/[^\d.]/g, '')) || 0
    const bv = Number.parseFloat(b.version.replace(/[^\d.]/g, '')) || 0
    return bv - av
  })
  return found
}

export function detectDefaultDelphiInstall(): DelphiInstall | null {
  return detectDelphiInstalls()[0] ?? null
}

export function validateDelphiPath(studioPath: string): DelphiInstall | null {
  return installFromPath(studioPath)
}
