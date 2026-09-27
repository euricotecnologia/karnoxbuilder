import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

export function getErrorStatus(err: unknown): number | null {
  const status = (err as { status?: unknown }).status
  if (typeof status === 'number') return status
  const message = err instanceof Error ? err.message : String(err)
  const match = /(?:^|\s)(429|502|503|504)(?:\s|$)/.exec(message)
  return match ? Number.parseInt(match[1], 10) : null
}

export function isRetryableProviderError(err: unknown): boolean {
  return [429, 502, 503, 504].includes(getErrorStatus(err) ?? 0)
}

export function getRetryAfterMs(err: unknown): number | null {
  const headers = (err as { headers?: unknown }).headers
  let raw: string | null = null

  if (headers && typeof (headers as { get?: unknown }).get === 'function') {
    raw = (headers as { get(name: string): string | null }).get('retry-after')
  } else if (headers && typeof headers === 'object') {
    const record = headers as Record<string, unknown>
    const value = record['retry-after'] ?? record['Retry-After']
    if (typeof value === 'string' || typeof value === 'number') raw = String(value)
  }

  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(60_000, Math.ceil(seconds * 1000))

  const date = Date.parse(raw)
  if (!Number.isNaN(date)) return Math.min(60_000, Math.max(1000, date - Date.now()))
  return null
}

export function isConnectionError(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) {
    return true
  }
  if (!(err instanceof Error)) return false
  const cause = (err as { cause?: unknown }).cause
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code
    if (code && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) return true
  }
  return false
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof Anthropic.APIUserAbortError || err instanceof OpenAI.APIUserAbortError) {
    return true
  }
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true
  }
  return err instanceof Error && err.name === 'AbortError'
}

export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)

  if (getErrorStatus(err) === 429) {
    return `Limite de requisições atingido (HTTP 429). Aguarde e tente novamente. No OpenRouter, modelos :free possuem limites por minuto e por dia. Detalhe: ${err.message}`
  }

  const parts = [err.message]
  const cause = (err as { cause?: unknown }).cause

  if (cause instanceof Error) {
    parts.push(cause.message)
    const code = (cause as NodeJS.ErrnoException).code
    if (code) parts.push(`[${code}]`)
  } else if (cause) {
    parts.push(String(cause))
  }

  const code = (err as NodeJS.ErrnoException).code
  if (code && !parts.some((p) => p.includes(code))) {
    parts.push(`[${code}]`)
  }

  return parts.join(' — ')
}
