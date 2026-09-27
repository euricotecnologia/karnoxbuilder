import { safeStorage } from 'electron'

/**
 * Protege segredos usando o armazenamento seguro do Electron. No Windows,
 * safeStorage utiliza a proteção vinculada ao usuário do sistema (DPAPI).
 * Nunca existe fallback para texto simples.
 */
export function encryptSecret(value: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'A criptografia segura do Windows não está disponível. A chave/senha não foi salva para evitar armazenamento em texto simples.'
    )
  }
  return safeStorage.encryptString(value)
}

export function decryptSecret(value: Buffer): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(value)
  } catch {
    return null
  }
}
