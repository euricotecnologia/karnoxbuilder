export type PublishEnvironment = 'debug' | 'staging' | 'production'

export interface PublishProfile {
  projectPath: string
  projectName: string
  environment: PublishEnvironment
  platform: 'Win32' | 'Win64'
  buildConfig: 'Debug' | 'Release'
  delphiProfile: string
  dprojPath: string
  exePath: string
  outputDir: string
  applicationName: string
  version: string
  companyName: string
  productName: string
  description: string
  copyright: string
  iconPath: string
  manifestPath: string
  externalFiles: string[]
  copyDependencies: boolean
  generateZip: boolean
  generateInstaller: boolean
  installerCompilerPath: string
  installerOutputName: string
  signExecutable: boolean
  signToolPath: string
  certificatePath: string
  certificateThumbprint: string
  timestampUrl: string
  hasCertificatePassword: boolean
  generateUpdateManifest: boolean
  updateBaseUrl: string
  updateNotes: string
  updateMandatory: boolean
}

export interface PublishDependency {
  name: string
  requestedBy: string
  sourcePath: string | null
  system: boolean
  status: 'found' | 'missing' | 'system'
}

export interface PublishAnalysis {
  executableExists: boolean
  outputDirectoryValid: boolean
  dependencies: PublishDependency[]
  missingDependencies: string[]
  missingExternalFiles: string[]
  tools: {
    signTool: string | null
    installerCompiler: string | null
  }
  warnings: string[]
  canPublish: boolean
}

export interface PublishResult {
  success: boolean
  deliveryDir: string
  copiedFiles: string[]
  zipPath: string | null
  installerPath: string | null
  updateManifestPath: string | null
  signed: boolean
  warnings: string[]
}
