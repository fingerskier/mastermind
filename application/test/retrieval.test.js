import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

import { createRetrievalService } from '../src/retrieval/service.js'

const execFileAsync = promisify(execFile)

async function makeCouncil() {
  const root = await mkdtemp(join(tmpdir(), 'landsraad-retrieval-'))
  await mkdir(join(root, 'council', 'memory'), { recursive: true })
  await mkdir(join(root, 'council', 'projects'), { recursive: true })
  await mkdir(join(root, '.landsraad', 'logs'), { recursive: true })
  await mkdir(join(root, '.claude'), { recursive: true })

  await writeFile(join(root, 'landsraad.config.json'), JSON.stringify({ version: 1, name: 'Test Council' }))
  await writeFile(join(root, 'council', 'memory', 'facts.md'), '# Facts\n\nThe CFO tracks runway burn, cash flow, and finance risk.')
  await writeFile(join(root, 'council', 'projects', 'dashboard.md'), '# Dashboard\n\nThe dashboard uses React, Fastify, and SSE events.')
  await writeFile(join(root, '.env'), 'API_KEY=should-not-be-indexed')
  await writeFile(join(root, '.landsraad', 'state.json'), '{"runtime":"state-should-not-be-indexed"}')
  await writeFile(join(root, '.landsraad', 'logs', 'permissions.jsonl'), '{"secret":"audit-log"}\n')
  await writeFile(join(root, '.claude', 'settings.local.json'), '{"permissions":["private-provider-state"]}')
  return root
}

test('sync indexes council text and excludes secrets/runtime/provider files', async () => {
  const root = await makeCouncil()
  try {
    const service = createRetrievalService({ councilRoot: root })
    const stats = await service.sync()

    assert.equal(stats.totalFiles, 3)
    assert.ok(stats.totalChunks >= 3)

    const indexed = await service.getAllMetadata()
    const paths = indexed.map((entry) => entry.filePath)
    assert.ok(paths.includes('landsraad.config.json'))
    assert.ok(paths.includes('council/memory/facts.md'))
    assert.ok(paths.includes('council/projects/dashboard.md'))
    assert.ok(!paths.includes('.env'))
    assert.ok(!paths.some((path) => path.startsWith('.landsraad/')))
    assert.ok(!paths.some((path) => path.startsWith('.claude/')))

    const metadata = JSON.parse(await readFile(join(root, '.landsraad', 'index', 'retrieval', 'metadata.json'), 'utf8'))
    assert.equal(metadata.length, indexed.length)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('hybrid search returns relevant snippets with council-relative paths', async () => {
  const root = await makeCouncil()
  try {
    const service = createRetrievalService({ councilRoot: root })
    await service.sync()

    const results = await service.search('runway burn finance', { limit: 3 })

    assert.ok(results.length > 0)
    assert.equal(results[0].filePath, 'council/memory/facts.md')
    assert.match(results[0].text, /runway burn/i)
    assert.equal(typeof results[0].score, 'number')
    assert.equal(typeof results[0].vectorScore, 'number')
    assert.equal(typeof results[0].keywordScore, 'number')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('sync removes stale chunks after file updates', async () => {
  const root = await makeCouncil()
  try {
    const service = createRetrievalService({ councilRoot: root })
    await service.sync()

    assert.equal((await service.search('runway burn finance', { limit: 1 }))[0].filePath, 'council/memory/facts.md')

    await writeFile(join(root, 'council', 'memory', 'facts.md'), '# Facts\n\nThe operations team tracks vendor onboarding.')
    await service.sync()

    const oldResults = await service.search('runway burn finance', { limit: 1 })
    assert.notEqual(oldResults[0]?.filePath, 'council/memory/facts.md')

    const newResults = await service.search('vendor onboarding', { limit: 1 })
    assert.equal(newResults[0].filePath, 'council/memory/facts.md')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('CLI memory search returns JSON search results', async () => {
  const root = await makeCouncil()
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      join(import.meta.dirname, '..', 'bin', 'landsraad.js'),
      '--council',
      root,
      'memory',
      'search',
      'React Fastify SSE',
      '--limit',
      '2',
      '--json',
    ])

    const body = JSON.parse(stdout)
    assert.equal(body.results[0].filePath, 'council/projects/dashboard.md')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
