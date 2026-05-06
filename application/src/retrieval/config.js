import { basename } from 'node:path'

export const DEFAULT_TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.jsonl',
  '.csv',
  '.tsv',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.css',
  '.html',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.sh',
  '.bash',
  '.ps1',
  '.sql',
  '.log',
  '.gitignore',
])

const IGNORED_DIRS = new Set([
  '.git',
  '.claude',
  '.codex',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.vite',
  '.svelte-kit',
])

export function extensionForPath(filePath) {
  const name = basename(filePath).toLowerCase()
  if (name === 'dockerfile' || name === 'makefile') return '.' + name
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot)
}

export function isIgnoredRelativePath(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/')
  const parts = normalized.split('/').filter(Boolean)
  const name = parts.at(-1) || ''

  if (parts.some((part) => IGNORED_DIRS.has(part))) return true

  if (normalized.startsWith('.landsraad/')) return true
  if (name === '.env' || name.startsWith('.env.')) return true
  if (name.endsWith('.lock')) return true
  if (name.endsWith('.tgz')) return true
  if (name === 'package-lock.json') return true

  return false
}

export function shouldIndexRelativePath(relativePath, extensions = DEFAULT_TEXT_EXTENSIONS) {
  if (isIgnoredRelativePath(relativePath)) return false
  const ext = extensionForPath(relativePath)
  if (!ext) return true
  return extensions.has(ext)
}
