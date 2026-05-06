import { watch } from 'node:fs'
import { mkdir, open, readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { chunkText } from './chunker.js'
import { shouldIndexRelativePath } from './config.js'
import { informationDensity } from './density.js'
import { createHashEmbedder } from './embedder.js'
import { resolveCouncilRoot, toCouncilRelative } from './path.js'
import { RetrievalStore, sha256 } from './store.js'

const PROBE_BYTES = 8192

export function createRetrievalService(options = {}) {
  return new RetrievalService(options)
}

export class RetrievalService {
  constructor({ councilRoot = process.cwd(), indexDir, embedder = createHashEmbedder() } = {}) {
    this.councilRoot = resolveCouncilRoot(councilRoot)
    this.indexDir = resolve(indexDir || join(this.councilRoot, '.landsraad', 'index', 'retrieval'))
    this.embedder = embedder
    this.store = new RetrievalStore({
      indexDir: this.indexDir,
      dimensions: embedder.dimensions,
      embedderId: embedder.id,
    })
    this.loaded = false
    this.watcher = null
    this.syncTimer = null
  }

  async ensureLoaded() {
    if (this.loaded) return
    await this.store.load()
    this.loaded = true
  }

  async sync() {
    await this.ensureLoaded()
    await mkdir(this.indexDir, { recursive: true })

    const files = await listIndexableFiles(this.councilRoot)
    const present = new Set(files.map((file) => file.relativePath))

    for (const file of files) {
      await this.processFile(file)
    }

    this.store.removeFilesNotIn(present)
    await this.store.save()
    return this.store.stats()
  }

  async processFile({ absolutePath, relativePath }) {
    const text = await readFile(absolutePath, 'utf8')
    if (!text.trim()) {
      this.store.removeFile(relativePath)
      return
    }

    const fileStat = await stat(absolutePath)
    const contentHash = sha256(text)
    const existing = this.store.getFileRecord(relativePath)

    if (
      existing &&
      existing.contentHash === contentHash &&
      existing.size === fileStat.size &&
      existing.mtime === fileStat.mtime.toISOString()
    ) {
      return
    }

    const chunks = chunkText(text)
    const vectors = []
    const densities = chunks.map((chunk) => informationDensity(chunk))

    for (const chunk of chunks) {
      vectors.push(await this.embedder.embed(chunk))
    }

    this.store.replaceFile({
      filePath: relativePath,
      chunks,
      vectors,
      densities,
      mtime: fileStat.mtime.toISOString(),
      size: fileStat.size,
      contentHash,
    })
  }

  async search(query, options = {}) {
    await this.ensureLoaded()
    if (options.sync !== false) await this.sync()
    const vector = await this.embedder.embed(query)
    return this.store.search(query, vector, options)
  }

  async stats() {
    await this.ensureLoaded()
    return this.store.stats()
  }

  async getAllMetadata() {
    await this.ensureLoaded()
    return this.store.getAllMetadata()
  }

  async start() {
    await this.sync()
    if (this.watcher) return
    this.watcher = watch(this.councilRoot, { recursive: true }, () => this.scheduleSync())
  }

  async stop() {
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = null
    this.watcher?.close()
    this.watcher = null
  }

  scheduleSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => {
      this.sync().catch(() => {})
    }, 150)
  }
}

async function listIndexableFiles(councilRoot) {
  const out = []
  await walk(councilRoot, out, councilRoot)
  return out
}

async function walk(dir, out, councilRoot) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const absolutePath = join(dir, entry.name)
    const relativePath = toCouncilRelative(councilRoot, absolutePath)

    if (entry.isDirectory()) {
      if (!shouldIndexRelativePath(`${relativePath}/placeholder.md`)) continue
      await walk(absolutePath, out, councilRoot)
      continue
    }

    if (!entry.isFile()) continue
    if (!shouldIndexRelativePath(relativePath)) continue
    if (!(await looksLikeText(absolutePath, relativePath))) continue
    out.push({ absolutePath, relativePath })
  }
}

async function looksLikeText(absolutePath, relativePath) {
  const ext = relativePath.split('/').at(-1)?.includes('.') ? relativePath.split('.').at(-1) : ''
  if (ext) return true

  let handle
  try {
    handle = await open(absolutePath, 'r')
    const buffer = Buffer.alloc(PROBE_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, PROBE_BYTES, 0)
    const slice = buffer.subarray(0, bytesRead)
    if (slice.includes(0)) return false
    new TextDecoder('utf-8', { fatal: true }).decode(slice)
    return true
  } catch {
    return false
  } finally {
    await handle?.close().catch(() => {})
  }
}
