import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { tokenize } from './embedder.js'

export class RetrievalStore {
  constructor({ indexDir, dimensions, embedderId }) {
    this.indexDir = indexDir
    this.dimensions = dimensions
    this.embedderId = embedderId
    this.metadataPath = join(indexDir, 'metadata.json')
    this.vectorsPath = join(indexDir, 'vectors.json')
    this.manifestPath = join(indexDir, 'manifest.json')
    this.metadata = []
    this.vectors = []
  }

  async load() {
    await mkdir(this.indexDir, { recursive: true })
    this.metadata = await readJson(this.metadataPath, [])
    this.vectors = await readJson(this.vectorsPath, [])

    if (this.metadata.length !== this.vectors.length) {
      this.metadata = []
      this.vectors = []
      await this.save()
    }
  }

  async save() {
    await mkdir(this.indexDir, { recursive: true })
    await writeJsonAtomic(this.metadataPath, this.metadata)
    await writeJsonAtomic(this.vectorsPath, this.vectors)
    await writeJsonAtomic(this.manifestPath, {
      version: 1,
      backend: 'direct',
      embedder: this.embedderId,
      dimensions: this.dimensions,
      totalChunks: this.metadata.length,
      savedAt: new Date().toISOString(),
    })
  }

  getAllMetadata() {
    return [...this.metadata]
  }

  getFileRecord(filePath) {
    return this.metadata.find((entry) => entry.filePath === filePath) || null
  }

  replaceFile({ filePath, chunks, vectors, densities, mtime, size, contentHash }) {
    this.removeFile(filePath)

    for (let i = 0; i < chunks.length; i++) {
      const chunkHash = sha256(chunks[i])
      this.metadata.push({
        id: `${filePath}:${i}:${contentHash.slice(0, 16)}`,
        filePath,
        chunkIndex: i,
        text: chunks[i],
        density: densities[i],
        mtime,
        size,
        contentHash,
        chunkHash,
      })
      this.vectors.push(vectors[i])
    }
  }

  removeFile(filePath) {
    const nextMetadata = []
    const nextVectors = []

    for (let i = 0; i < this.metadata.length; i++) {
      if (this.metadata[i].filePath !== filePath) {
        nextMetadata.push(this.metadata[i])
        nextVectors.push(this.vectors[i])
      }
    }

    this.metadata = nextMetadata
    this.vectors = nextVectors
  }

  removeFilesNotIn(presentFiles) {
    const nextMetadata = []
    const nextVectors = []

    for (let i = 0; i < this.metadata.length; i++) {
      if (presentFiles.has(this.metadata[i].filePath)) {
        nextMetadata.push(this.metadata[i])
        nextVectors.push(this.vectors[i])
      }
    }

    this.metadata = nextMetadata
    this.vectors = nextVectors
  }

  search(query, queryVector, { limit = 10, mode = 'hybrid' } = {}) {
    const queryTokens = new Set(tokenize(query))
    const scored = this.metadata.map((entry, index) => {
      const vectorScore = cosineScore(queryVector, this.vectors[index])
      const keywordScore = keywordScoreFor(entry, queryTokens)
      const score = combinedScore({ vectorScore, keywordScore, mode })
      return {
        score,
        vectorScore,
        keywordScore,
        filePath: entry.filePath,
        chunkIndex: entry.chunkIndex,
        text: entry.text,
        density: entry.density,
        contentHash: entry.contentHash,
        chunkHash: entry.chunkHash,
      }
    })

    return scored
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))
      .slice(0, limit)
  }

  stats() {
    const files = new Set(this.metadata.map((entry) => entry.filePath))
    const avgDensity = this.metadata.length
      ? this.metadata.reduce((sum, entry) => sum + entry.density, 0) / this.metadata.length
      : 0

    return {
      totalChunks: this.metadata.length,
      totalFiles: files.size,
      files: [...files].sort(),
      avgDensity,
      backend: 'direct',
      embedder: this.embedderId,
    }
  }
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function cosineScore(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return Math.max(0, Math.min(1, (dot + 1) / 2))
}

function keywordScoreFor(entry, queryTokens) {
  if (queryTokens.size === 0) return 0
  const haystack = `${entry.filePath}\n${entry.text}`.toLowerCase()
  let matched = 0

  for (const token of queryTokens) {
    if (haystack.includes(token)) matched++
  }

  return matched / queryTokens.size
}

function combinedScore({ vectorScore, keywordScore, mode }) {
  if (mode === 'vector') return vectorScore >= 0.58 ? vectorScore : 0
  if (mode === 'keyword') return keywordScore
  if (keywordScore === 0 && vectorScore < 0.66) return 0
  return keywordScore * 0.55 + vectorScore * 0.45
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJsonAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2))
  await rename(tmp, path)
}
