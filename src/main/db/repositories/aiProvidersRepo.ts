import { randomUUID } from 'crypto'
import { getDatabase } from '../database'
import { decryptSecret, encryptSecret } from '../../security/secretStorage'

export interface AiProviderRow {
  id: string
  name: string
  kind: string
  providerType: 'anthropic' | 'openai-compatible'
  baseUrl: string | null
  defaultModel: string | null
  enabled: boolean
  hasApiKey: boolean
}

interface RawRow {
  id: string
  name: string
  kind: string
  provider_type: string
  base_url: string | null
  api_key_encrypted: Buffer | null
  default_model: string | null
  enabled: number
}

function toRow(raw: RawRow): AiProviderRow {
  return {
    id: raw.id,
    name: raw.name,
    kind: raw.kind,
    providerType: raw.provider_type as 'anthropic' | 'openai-compatible',
    baseUrl: raw.base_url,
    defaultModel: raw.default_model,
    enabled: raw.enabled === 1,
    hasApiKey: !!raw.api_key_encrypted && raw.api_key_encrypted.length > 0
  }
}

export function listAiProviders(): AiProviderRow[] {
  const rows = getDatabase().prepare('SELECT * FROM ai_providers ORDER BY name').all() as RawRow[]
  return rows.map(toRow)
}

export function upsertAiProvider(input: {
  id?: string
  name: string
  kind: string
  providerType: 'anthropic' | 'openai-compatible'
  baseUrl: string | null
  apiKey?: string
  defaultModel?: string
  enabled: boolean
}): string {
  const db = getDatabase()
  const id = input.id ?? randomUUID()

  let encryptedKey: Buffer | null | undefined = undefined
  if (input.apiKey !== undefined) {
    encryptedKey = input.apiKey ? encryptSecret(input.apiKey) : null
  }

  const existing = db.prepare('SELECT id FROM ai_providers WHERE id = ?').get(id)

  if (existing) {
    if (encryptedKey !== undefined) {
      db.prepare(
        'UPDATE ai_providers SET name = ?, kind = ?, provider_type = ?, base_url = ?, api_key_encrypted = ?, default_model = ?, enabled = ? WHERE id = ?'
      ).run(
        input.name,
        input.kind,
        input.providerType,
        input.baseUrl,
        encryptedKey,
        input.defaultModel ?? null,
        input.enabled ? 1 : 0,
        id
      )
    } else {
      db.prepare(
        'UPDATE ai_providers SET name = ?, kind = ?, provider_type = ?, base_url = ?, default_model = ?, enabled = ? WHERE id = ?'
      ).run(input.name, input.kind, input.providerType, input.baseUrl, input.defaultModel ?? null, input.enabled ? 1 : 0, id)
    }
  } else {
    db.prepare(
      'INSERT INTO ai_providers (id, name, kind, provider_type, base_url, api_key_encrypted, default_model, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      input.name,
      input.kind,
      input.providerType,
      input.baseUrl,
      encryptedKey ?? null,
      input.defaultModel ?? null,
      input.enabled ? 1 : 0
    )
  }

  return id
}

export function deleteAiProvider(id: string): void {
  getDatabase().prepare('DELETE FROM ai_providers WHERE id = ?').run(id)
}

export function getDecryptedApiKey(id: string): string | null {
  const row = getDatabase().prepare('SELECT api_key_encrypted FROM ai_providers WHERE id = ?').get(id) as
    | { api_key_encrypted: Buffer | null }
    | undefined
  if (!row?.api_key_encrypted || row.api_key_encrypted.length === 0) return null

  return decryptSecret(row.api_key_encrypted)
}

export function getAiProviderRaw(id: string): RawRow | undefined {
  return getDatabase().prepare('SELECT * FROM ai_providers WHERE id = ?').get(id) as RawRow | undefined
}
