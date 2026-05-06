import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createCouncil, runJob } from '../src/index.js'
import { createDashboardServer } from '../src/dashboard/server.js'
import { normalizeDashboardObjects, validateDashboardObject } from '../src/dashboard/objects.js'

const cliPath = join(import.meta.dirname, '..', 'bin', 'landsraad.js')

async function makeTempRoot(prefix = 'landsraad-dashboard-') {
  return mkdtemp(join(tmpdir(), prefix))
}

test('dashboard API exposes council state, retrieval search, and run detail artifacts', async () => {
  const root = await makeTempRoot()
  let app
  try {
    await createCouncil({ councilRoot: root, templateId: 'business-operations' })
    const runResult = await runJob({
      councilRoot: root,
      jobId: 'weekly-financial-report',
      adapterOverride: 'local',
    })

    app = await createDashboardServer({ councilRoot: root, serveStatic: false })

    const overview = await injectJson(app, '/api/overview')
    assert.equal(overview.council.config.template.id, 'business-operations')
    assert.equal(overview.secretary.id, 'secretary')
    assert.equal(overview.counts.councillors, 5)
    assert.ok(overview.jobs.some((job) => job.id === 'weekly-financial-report'))
    assert.ok(overview.runs.some((run) => run.runId === runResult.run.runId))

    const agents = await injectJson(app, '/api/agents')
    assert.deepEqual(
      agents.agents.map((agent) => agent.id),
      ['secretary', 'ceo', 'cfo', 'cmo', 'cto', 'operations'],
    )

    const search = await injectJson(app, '/api/retrieval/search?query=financial%20risk&limit=2')
    assert.ok(search.results.length > 0)
    assert.equal(typeof search.results[0].filePath, 'string')

    const detail = await injectJson(app, `/api/runs/weekly-financial-report/${runResult.run.runId}`)
    assert.equal(detail.run.jobId, 'weekly-financial-report')
    assert.match(detail.files.inputMd, /Weekly Financial Report/)
    assert.match(detail.files.transcriptMd, /stdout/)
    assert.match(detail.files.outputMd, /Local CLI Adapter Output/)
    assert.match(detail.files.eventsJsonl, /permission-decided/)
    assert.ok(detail.events.some((event) => event.kind === 'process-exited'))
  } finally {
    await app?.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('dashboard object validation accepts supported objects and marks invalid objects for JSON fallback', () => {
  const table = {
    type: 'table',
    id: 'risks',
    title: 'Risks',
    columns: [{ id: 'risk', label: 'Risk' }],
    rows: [{ risk: 'Runway' }],
  }
  const badStatus = {
    type: 'status-card',
    id: 'status',
    title: 'Status',
    status: 'unknown',
  }

  assert.equal(validateDashboardObject(table).valid, true)

  const normalized = normalizeDashboardObjects([table, badStatus])
  assert.equal(normalized[0].renderer, 'table')
  assert.equal(normalized[0].valid, true)
  assert.equal(normalized[1].renderer, 'json')
  assert.equal(normalized[1].valid, false)
  assert.match(normalized[1].errors.join('\n'), /Unsupported status/)
})

test('dashboard CLI starts a project-scoped server', async () => {
  const root = await makeTempRoot()
  let child
  try {
    await createCouncil({ councilRoot: root, templateId: 'business-operations' })
    child = spawn(process.execPath, [cliPath, '--council', root, '--json', 'dashboard', '--host', '127.0.0.1', '--port', '0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const launch = await readJsonLine(child)
    assert.equal(launch.councilRoot, root)
    assert.match(launch.url, /^http:\/\/127\.0\.0\.1:\d+$/)

    const response = await fetch(`${launch.url}/api/health`)
    assert.equal(response.status, 200)
    const health = await response.json()
    assert.equal(health.ok, true)
    assert.equal(health.councilRoot, root)
  } finally {
    child?.kill()
    await onceExit(child)
    await rm(root, { recursive: true, force: true })
  }
})

async function injectJson(app, url) {
  const response = await app.inject({ method: 'GET', url })
  assert.equal(response.statusCode, 200, response.payload)
  return response.json()
}

async function readJsonLine(child) {
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for dashboard launch. stderr: ${stderr}`)), 10_000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      const line = stdout.split(/\r?\n/).find((candidate) => candidate.trim())
      if (!line) return
      clearTimeout(timer)
      try {
        resolve(JSON.parse(line))
      } catch (error) {
        reject(error)
      }
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      if (!stdout.trim()) {
        clearTimeout(timer)
        reject(new Error(`Dashboard process exited with code ${code}. stderr: ${stderr}`))
      }
    })
  })
}

async function onceExit(child) {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => child.once('exit', resolve))
}
