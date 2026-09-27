import { randomUUID } from 'crypto'
import { getDatabase } from '../database'
import { normalizeDelphiProfile, type DelphiProfileId } from '../../delphi/profiles'

export interface ProjectRow {
  id: string
  name: string
  path: string
  lastOpenedAt: string
  delphiProfile: DelphiProfileId
}

export function listRecentProjects(limit = 10): ProjectRow[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM projects ORDER BY last_opened_at DESC LIMIT ?')
    .all(limit) as Array<{ id: string; name: string; path: string; last_opened_at: string; delphi_profile: string }>
  return rows.map((r) => ({ id: r.id, name: r.name, path: r.path, lastOpenedAt: r.last_opened_at, delphiProfile: normalizeDelphiProfile(r.delphi_profile) }))
}

export function touchProject(name: string, path: string): string {
  const db = getDatabase()
  const existing = db.prepare('SELECT id FROM projects WHERE path = ?').get(path) as { id: string } | undefined
  const now = new Date().toISOString()

  if (existing) {
    db.prepare('UPDATE projects SET last_opened_at = ?, name = ? WHERE id = ?').run(now, name, existing.id)
    return existing.id
  }

  const id = randomUUID()
  db.prepare('INSERT INTO projects (id, name, path, last_opened_at) VALUES (?, ?, ?, ?)').run(id, name, path, now)
  return id
}

export function removeProject(id: string): void {
  getDatabase().prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export function getProjectDelphiProfile(path: string): DelphiProfileId | null {
  const row = getDatabase().prepare('SELECT delphi_profile FROM projects WHERE path = ?').get(path) as { delphi_profile: string } | undefined
  return row ? normalizeDelphiProfile(row.delphi_profile) : null
}

export function setProjectDelphiProfile(path: string, profile: DelphiProfileId): void {
  getDatabase().prepare('UPDATE projects SET delphi_profile = ? WHERE path = ?').run(normalizeDelphiProfile(profile), path)
}
