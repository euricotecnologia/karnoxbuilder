import { getDatabase } from '../database'
import { decryptSecret, encryptSecret } from '../../security/secretStorage'
import type { PublishEnvironment, PublishProfile } from '../../publish/types'
import { readProjectPublishMetadata, type ProjectPublishMetadata } from '../../publish/projectMetadata'

interface RawProfile {
  project_path: string
  environment: PublishEnvironment
  config_json: string
  certificate_password_encrypted: Buffer | null
}

function defaults(projectPath: string, projectName: string, environment: PublishEnvironment, metadata: ProjectPublishMetadata | null): PublishProfile {
  const production = environment === 'production'
  const staging = environment === 'staging'
  return {
    projectPath, projectName, environment,
    platform: 'Win32', buildConfig: environment === 'debug' ? 'Debug' : 'Release', delphiProfile: 'delphi10_13',
    dprojPath: metadata?.dprojPath ?? '', exePath: '', outputDir: `${projectPath}\publish`, applicationName: metadata?.applicationName ?? projectName,
    version: metadata?.version ?? '1.0.0.0', companyName: metadata?.companyName ?? '', productName: metadata?.productName ?? projectName, description: metadata?.description ?? projectName,
    copyright: metadata?.copyright ?? `Copyright © ${new Date().getFullYear()}`, iconPath: metadata?.iconPath ?? '', manifestPath: metadata?.manifestPath ?? '', externalFiles: [],
    copyDependencies: true, generateZip: staging || production, generateInstaller: production,
    installerCompilerPath: '', installerOutputName: `${projectName}-Setup`, signExecutable: false,
    signToolPath: '', certificatePath: '', certificateThumbprint: '', timestampUrl: 'http://timestamp.digicert.com',
    hasCertificatePassword: false, generateUpdateManifest: staging || production, updateBaseUrl: '',
    updateNotes: '', updateMandatory: false
  }
}

function parse(raw: RawProfile, projectName: string, metadata: ProjectPublishMetadata | null): PublishProfile {
  let config: Partial<PublishProfile> = {}
  try { config = JSON.parse(raw.config_json) as Partial<PublishProfile> } catch { /* usa padrão */ }
  return {
    ...defaults(raw.project_path, projectName, raw.environment, metadata), ...config,
    projectPath: raw.project_path, projectName, environment: raw.environment,
    hasCertificatePassword: !!raw.certificate_password_encrypted?.length
  }
}

export function listPublishProfiles(projectPath: string, projectName: string): PublishProfile[] {
  const rows = getDatabase().prepare('SELECT * FROM publish_profiles WHERE project_path = ?').all(projectPath) as RawProfile[]
  const metadata = readProjectPublishMetadata(projectPath, projectName)
  const byEnvironment = new Map(rows.map((row) => [row.environment, parse(row, projectName, metadata)]))
  return (['debug', 'staging', 'production'] as PublishEnvironment[]).map(
    (environment) => byEnvironment.get(environment) ?? defaults(projectPath, projectName, environment, metadata)
  )
}

export function savePublishProfile(profile: PublishProfile, certificatePassword?: string): void {
  const database = getDatabase()
  const existing = database.prepare(
    'SELECT certificate_password_encrypted FROM publish_profiles WHERE project_path = ? AND environment = ?'
  ).get(profile.projectPath, profile.environment) as { certificate_password_encrypted: Buffer | null } | undefined
  const encrypted = certificatePassword === undefined
    ? (existing?.certificate_password_encrypted ?? null)
    : certificatePassword ? encryptSecret(certificatePassword) : null
  const stored = { ...profile, hasCertificatePassword: !!encrypted?.length }
  database.prepare(`
    INSERT INTO publish_profiles (project_path, environment, config_json, certificate_password_encrypted, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_path, environment) DO UPDATE SET
      config_json=excluded.config_json,
      certificate_password_encrypted=excluded.certificate_password_encrypted,
      updated_at=excluded.updated_at
  `).run(profile.projectPath, profile.environment, JSON.stringify(stored), encrypted, new Date().toISOString())
}

export function getPublishCertificatePassword(projectPath: string, environment: PublishEnvironment): string | null {
  const row = getDatabase().prepare(
    'SELECT certificate_password_encrypted FROM publish_profiles WHERE project_path = ? AND environment = ?'
  ).get(projectPath, environment) as { certificate_password_encrypted: Buffer | null } | undefined
  return row?.certificate_password_encrypted ? decryptSecret(row.certificate_password_encrypted) : null
}
