import { randomUUID } from 'crypto'
import { getDatabase } from '../database'

export type LibraryPlatform = 'Win32' | 'Win64' | 'All'
export type LibraryPathType = 'unit' | 'include' | 'resource' | 'object' | 'runtime'

export interface LibraryPathRow {
  id: string
  projectPath: string
  platform: LibraryPlatform
  pathType: LibraryPathType
  path: string
  source: 'manual' | 'delphi'
  enabled: boolean
}

interface DatabaseRow {
  id: string
  project_path: string
  platform: LibraryPlatform
  path_type: LibraryPathType
  path: string
  source: 'manual' | 'delphi'
  enabled: number
}

function mapRow(row: DatabaseRow): LibraryPathRow {
  return {
    id: row.id,
    projectPath: row.project_path,
    platform: row.platform,
    pathType: row.path_type,
    path: row.path,
    source: row.source,
    enabled: row.enabled === 1
  }
}

export function listLibraryPaths(projectPath: string): LibraryPathRow[] {
  return (getDatabase()
    .prepare('SELECT * FROM project_library_paths WHERE project_path = ? ORDER BY platform, path_type, path')
    .all(projectPath) as DatabaseRow[]).map(mapRow)
}

export function upsertLibraryPath(input: Omit<LibraryPathRow, 'id'> & { id?: string }): string {
  const id = input.id ?? randomUUID()
  getDatabase().prepare(
    `INSERT INTO project_library_paths (id, project_path, platform, path_type, path, source, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_path, platform, path_type, path) DO UPDATE SET
       source = excluded.source, enabled = excluded.enabled`
  ).run(id, input.projectPath, input.platform, input.pathType, input.path, input.source, input.enabled ? 1 : 0)
  const existing = getDatabase().prepare(
    'SELECT id FROM project_library_paths WHERE project_path = ? AND platform = ? AND path_type = ? AND path = ?'
  ).get(input.projectPath, input.platform, input.pathType, input.path) as { id: string }
  return existing.id
}

export function setLibraryPathEnabled(id: string, enabled: boolean): void {
  getDatabase().prepare('UPDATE project_library_paths SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
}

export function removeLibraryPath(id: string): void {
  getDatabase().prepare('DELETE FROM project_library_paths WHERE id = ?').run(id)
}

export function enabledLibraryPaths(projectPath: string, platform: 'Win32' | 'Win64'): LibraryPathRow[] {
  return (getDatabase().prepare(
    `SELECT * FROM project_library_paths
     WHERE project_path = ? AND enabled = 1 AND (platform = ? OR platform = 'All')
     ORDER BY source DESC, path_type, path`
  ).all(projectPath, platform) as DatabaseRow[]).map(mapRow)
}
