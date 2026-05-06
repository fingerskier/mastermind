import { relative, resolve, sep } from 'node:path'

export function resolveCouncilRoot(councilRoot = process.cwd()) {
  return resolve(councilRoot)
}

export function toCouncilRelative(councilRoot, filePath) {
  const rel = relative(councilRoot, resolve(filePath))
  return rel.split(sep).join('/')
}

export function isInsideCouncil(councilRoot, filePath) {
  const root = resolve(councilRoot)
  const target = resolve(filePath)
  return target === root || target.startsWith(root + sep)
}
