import { randomUUID } from 'crypto'
import { getDatabase } from '../database'

export type PromptStatus = 'pending' | 'success' | 'error'

export interface PromptHistoryRow {
  id: string
  projectId: string | null
  prompt: string
  responseSummary: string | null
  status: PromptStatus
  createdAt: string
}

export function addPromptHistory(prompt: string, projectId: string | null): string {
  const id = randomUUID()
  getDatabase()
    .prepare(
      'INSERT INTO prompt_history (id, project_id, prompt, response_summary, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, projectId, prompt, null, 'pending', new Date().toISOString())
  return id
}

export function updatePromptHistory(id: string, status: PromptStatus, responseSummary?: string): void {
  getDatabase()
    .prepare('UPDATE prompt_history SET status = ?, response_summary = ? WHERE id = ?')
    .run(status, responseSummary ?? null, id)
}

export function listPromptHistory(projectId: string, limit = 50): PromptHistoryRow[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM prompt_history WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(projectId, limit) as Array<{
    id: string
    project_id: string | null
    prompt: string
    response_summary: string | null
    status: PromptStatus
    created_at: string
  }>
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    prompt: r.prompt,
    responseSummary: r.response_summary,
    status: r.status,
    createdAt: r.created_at
  }))
}
