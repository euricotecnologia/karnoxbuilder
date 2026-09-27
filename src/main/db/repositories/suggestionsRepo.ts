import { randomUUID } from 'crypto'
import { getDatabase } from '../database'

export interface SuggestionRow {
  id: string
  label: string
  promptText: string
  category: string | null
  isDefault: boolean
}

export function listSuggestions(): SuggestionRow[] {
  const rows = getDatabase().prepare('SELECT * FROM prompt_suggestions ORDER BY category, label').all() as Array<{
    id: string
    label: string
    prompt_text: string
    category: string | null
    is_default: number
  }>
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    promptText: r.prompt_text,
    category: r.category,
    isDefault: r.is_default === 1
  }))
}

export function addSuggestion(label: string, promptText: string, category: string): string {
  const id = randomUUID()
  getDatabase()
    .prepare('INSERT INTO prompt_suggestions (id, label, prompt_text, category, is_default) VALUES (?, ?, ?, ?, 0)')
    .run(id, label, promptText, category)
  return id
}

export function removeSuggestion(id: string): void {
  getDatabase().prepare('DELETE FROM prompt_suggestions WHERE id = ? AND is_default = 0').run(id)
}
