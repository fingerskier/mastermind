import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

import { createCouncil, runSchedulerOnce, syncSchedulerState } from '../src/index.js'

const execFileAsync = promisify(execFile)
const cliPath = join(import.meta.dirname, '..', 'bin', 'landsraad.js')

async function runCli(args, options = {}) {
  const result = await execFileAsync(process.execPath, [cliPath, ...args], {
    maxBuffer: 1024 * 1024 * 10,
    ...options,
  })
  return {
    ...result,
    json: result.stdout.trim() ? JSON.parse(result.stdout) : null,
  }
}

async function makeTempRoot(prefix = 'landsraad-scheduler-') {
  return mkdtemp(join(tmpdir(), prefix))
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

test('scheduler registers recurring jobs with five-field cron state', async () => {
  const root = await makeTempRoot()
  try {
    await createCouncil({ councilRoot: root, templateId: 'business-operations' })

    const state = await syncSchedulerState({
      councilRoot: root,
      now: new Date('2026-05-03T10:00:30Z'),
    })

    assert.equal(state.version, 1)
    assert.equal(state.runner, 'internal-cron')
    assert.equal(state.jobs.length, 3)

    const weekly = state.jobs.find((job) => job.jobId === 'weekly-financial-report')
    assert.equal(weekly.status, 'registered')
    assert.equal(weekly.path, 'council/jobs/weekly-financial-report/job.json')
    assert.equal(weekly.schedule.expression, '0 9 * * 5')
    assert.equal(weekly.schedule.timezone, 'local')
    assert.match(weekly.nextRunAt, /^2026-/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('scheduler once executes a due recurring job through runJob and records events', async () => {
  const root = await makeTempRoot()
  try {
    await createCouncil({ councilRoot: root, templateId: 'business-operations' })
    await makeOnlyWeeklyJobDue(root)

    const result = await runSchedulerOnce({
      councilRoot: root,
      adapterOverride: 'local',
      now: new Date('2026-05-03T10:00:30Z'),
    })

    assert.equal(result.executed.length, 1)
    assert.equal(result.executed[0].jobId, 'weekly-financial-report')
    assert.equal(result.executed[0].run.status, 'succeeded')
    assert.equal(result.executed[0].scheduledFor, '2026-05-03T10:00:00.000Z')

    const state = await readJson(join(root, '.landsraad', 'scheduler.json'))
    const weekly = state.jobs.find((job) => job.jobId === 'weekly-financial-report')
    assert.equal(weekly.lastRunId, result.executed[0].run.runId)
    assert.equal(weekly.lastScheduledFor, '2026-05-03T10:00:00.000Z')
    assert.equal(weekly.runCount, 1)
    assert.equal(weekly.failureCount, 0)

    const schedulerLog = await readFile(join(root, '.landsraad', 'logs', 'scheduler.jsonl'), 'utf8')
    assert.match(schedulerLog, /scheduler-dispatched/)
    assert.match(schedulerLog, /scheduler-completed/)

    const runDir = join(root, result.executed[0].runDir)
    const run = await readJson(join(runDir, 'run.json'))
    assert.equal(run.trigger.type, 'scheduler')
    assert.equal(run.trigger.scheduledFor, '2026-05-03T10:00:00.000Z')

    const events = await readFile(join(runDir, 'events.jsonl'), 'utf8')
    assert.match(events, /scheduler-dispatched/)
    assert.match(events, /scheduler-completed/)
    assert.match(events, /process-exited/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('scheduler CLI requires an explicit council root and supports one due pass', async () => {
  const root = await makeTempRoot()
  try {
    await createCouncil({ councilRoot: root, templateId: 'business-operations' })
    await makeOnlyWeeklyJobDue(root)

    await assert.rejects(
      runCli(['scheduler', 'start', '--once', '--json'], { cwd: root }),
      /requires --council/,
    )

    const { json } = await runCli([
      '--council',
      root,
      'scheduler',
      'start',
      '--once',
      '--adapter',
      'local',
      '--json',
    ])

    assert.equal(json.executed.length, 1)
    assert.equal(json.executed[0].jobId, 'weekly-financial-report')
    assert.equal(json.executed[0].run.status, 'succeeded')
    assert.equal(json.councilRoot, root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function makeOnlyWeeklyJobDue(root) {
  const weeklyPath = join(root, 'council', 'jobs', 'weekly-financial-report', 'job.json')
  const weekly = await readJson(weeklyPath)
  weekly.schedule = { type: 'cron', expression: '* * * * *', timezone: 'UTC' }
  await writeJson(weeklyPath, weekly)

  for (const jobId of ['technical-progress-report', 'marketing-performance-review']) {
    const jobPath = join(root, 'council', 'jobs', jobId, 'job.json')
    const job = await readJson(jobPath)
    job.type = 'one-off'
    await writeJson(jobPath, job)
  }
}
