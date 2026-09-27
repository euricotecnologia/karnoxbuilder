import { execFile } from 'child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface GitFileStatus {
  path: string
  indexStatus: string
  workTreeStatus: string
}

export interface GitCommitInfo {
  hash: string
  author: string
  date: string
  subject: string
}

export interface GitStatusResult {
  available: boolean
  isRepository: boolean
  branch: string | null
  ahead: number
  behind: number
  files: GitFileStatus[]
  commits: GitCommitInfo[]
  error?: string
}

function validateProjectDir(projectDir: string): string {
  if (!projectDir || !isAbsolute(projectDir)) throw new Error('Diretório de projeto inválido.')
  const directory = resolve(projectDir)
  if (!existsSync(directory) || !statSync(directory).isDirectory()) throw new Error('Diretório do projeto não encontrado.')
  return directory
}

async function git(projectDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: validateProjectDir(projectDir),
    windowsHide: true,
    encoding: 'utf-8',
    maxBuffer: 2 * 1024 * 1024
  })
  return stdout
}

async function gitIsAvailable(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version'], { windowsHide: true, encoding: 'utf-8' })
    return true
  } catch {
    return false
  }
}

function errorMessage(error: unknown): string {
  const stderr = (error as { stderr?: unknown }).stderr
  if (typeof stderr === 'string' && stderr.trim()) return stderr.trim()
  return error instanceof Error ? error.message : String(error)
}

function parseStatus(output: string): Pick<GitStatusResult, 'branch' | 'ahead' | 'behind' | 'files'> {
  const lines = output.replace(/\r/g, '').split('\n').filter(Boolean)
  const branchLine = lines.shift() ?? ''
  const branchMatch = /^##\s+([^.[\s]+|HEAD)/.exec(branchLine)
  const ahead = Number.parseInt(/ahead\s+(\d+)/.exec(branchLine)?.[1] ?? '0', 10)
  const behind = Number.parseInt(/behind\s+(\d+)/.exec(branchLine)?.[1] ?? '0', 10)
  const files = lines
    .filter((line) => line.length >= 3)
    .map((line) => ({
      indexStatus: line[0],
      workTreeStatus: line[1],
      path: line.slice(3).replace(/^"|"$/g, '').split(' -> ').pop() ?? line.slice(3)
    }))
  return { branch: branchMatch?.[1] ?? null, ahead, behind, files }
}

async function recentCommits(projectDir: string): Promise<GitCommitInfo[]> {
  try {
    const output = await git(projectDir, ['log', '-10', '--date=iso-strict', '--pretty=format:%h%x1f%an%x1f%ad%x1f%s%x1e', '--', '.'])
    return output
      .split('\x1e')
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const [hash, author, date, subject] = record.split('\x1f')
        return { hash, author, date, subject }
      })
  } catch {
    return []
  }
}

export async function getGitStatus(projectDir: string): Promise<GitStatusResult> {
  if (!(await gitIsAvailable())) {
    return { available: false, isRepository: false, branch: null, ahead: 0, behind: 0, files: [], commits: [], error: 'Git não foi encontrado.' }
  }
  if (!existsSync(projectDir)) {
    return { available: true, isRepository: false, branch: null, ahead: 0, behind: 0, files: [], commits: [] }
  }

  try {
    await git(projectDir, ['rev-parse', '--is-inside-work-tree'])
  } catch {
    return { available: true, isRepository: false, branch: null, ahead: 0, behind: 0, files: [], commits: [] }
  }

  try {
    const parsed = parseStatus(await git(projectDir, ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '--branch', '--', '.']))
    return { available: true, isRepository: true, ...parsed, commits: await recentCommits(projectDir) }
  } catch (error) {
    return { available: true, isRepository: true, branch: null, ahead: 0, behind: 0, files: [], commits: [], error: errorMessage(error) }
  }
}

export async function initializeGit(projectDir: string): Promise<void> {
  if (!projectDir || !isAbsolute(projectDir)) throw new Error('Diretório de projeto inválido.')
  const directory = resolve(projectDir)
  mkdirSync(directory, { recursive: true })
  await git(directory, ['init', '-b', 'main'])
  const ignorePath = join(directory, '.gitignore')
  if (!existsSync(ignorePath)) {
    writeFileSync(
      ignorePath,
      `# Delphi / RAD Studio\nWin32/\nWin64/\n__history/\n__recovery/\n*.dcu\n*.exe\n*.map\n*.rsm\n*.identcache\n*.dproj.local\n*.stat\n`,
      'utf-8'
    )
  }
}

export async function createGitCommit(projectDir: string, message: string): Promise<string> {
  const cleanMessage = message.trim()
  if (!cleanMessage || cleanMessage.length > 200 || /[\r\n]/.test(cleanMessage)) {
    throw new Error('A mensagem do commit deve ter entre 1 e 200 caracteres e uma única linha.')
  }
  await git(projectDir, ['add', '--all', '--', '.'])
  try {
    return (await git(projectDir, ['commit', '-m', cleanMessage, '--', '.'])).trim()
  } catch (error) {
    const messageText = errorMessage(error)
    if (/nothing to commit/i.test(messageText)) throw new Error('Não há alterações para criar um commit.')
    if (/user\.email|user\.name|identity unknown/i.test(messageText)) {
      throw new Error('Configure seu nome e e-mail no Git antes de criar o primeiro commit.')
    }
    throw new Error(messageText)
  }
}
