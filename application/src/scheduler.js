import { CronExpressionParser } from 'cron-parser'
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { pathExists, readCouncilConfig, readJson, writeJson } from './council.js'
import { listJobs, runJob } from './jobs.js'

const SCHEDULER_STATE_PATH = '.landsraad/scheduler.json'
const SCHEDULER_LOG_PATH = '.landsraad/logs/scheduler.jsonl'
const DEFAULT_POLL_INTERVAL_MS = 30_000

export async function readSchedulerState({ councilRoot = process.cwd() } = {}) {
  const { root } = await readCouncilConfig(councilRoot)
  const statePath = join(root, SCHEDULER_STATE_PATH)
  if (!(await pathExists(statePath))) return emptyState()

  const state = await readJson(statePath)
  return {
    ...emptyState(),
    ...state,
    jobs: Array.isArray(state.jobs) ? state.jobs : [],
  }
}

export async function syncSchedulerState({ councilRoot = process.cwd(), now = new Date() } = {}) {
  const { root } = await readCouncilConfig(councilRoot)
  const nowDate = coerceDate(now)
  const nowIso = nowDate.toISOString()
  const previousState = await readSchedulerState({ councilRoot: root })
  const previousByJobId = new Map((previousState.jobs || []).map((job) => [job.jobId, job]))
  const jobs = await listJobs({ councilRoot: root })
  const schedulerJobs = []
  const registrationEvents = []

  for (const job of jobs) {
    if (job.type !== 'recurring') continue

    const previous = previousByJobId.get(job.id)
    const schedule = normalizeSchedule(job.schedule)
    const entry = {
      jobId: job.id,
      title: job.title,
      path: job.path,
      schedule,
      status: 'registered',
      registeredAt: previous?.registeredAt || nowIso,
      updatedAt: nowIso,
      lastScheduledFor: previous?.lastScheduledFor || null,
      lastRunAt: previous?.lastRunAt || null,
      lastRunId: previous?.lastRunId || null,
      nextRunAt: previous?.nextRunAt || null,
      runCount: Number(previous?.runCount || 0),
      failureCount: Number(previous?.failureCount || 0),
      lastError: previous?.lastError || null,
    }

    const validation = validateSchedule(schedule)
    if (!validation.valid) {
      const invalidEntry = {
        ...entry,
        status: 'invalid',
        nextRunAt: null,
        lastError: validation.error,
      }
      schedulerJobs.push(invalidEntry)
      if (shouldLogRegistration(previous, invalidEntry)) {
        registrationEvents.push(registrationEvent({ root, entry: invalidEntry, nowIso, status: 'invalid' }))
      }
      continue
    }

    entry.nextRunAt = nextSchedulerRunAt({ entry, now: nowDate })
    entry.lastError = null
    schedulerJobs.push(entry)

    if (shouldLogRegistration(previous, entry)) {
      registrationEvents.push(registrationEvent({ root, entry, nowIso, status: 'registered' }))
    }
  }

  const state = {
    version: 1,
    runner: 'internal-cron',
    councilRoot: root,
    statePath: SCHEDULER_STATE_PATH,
    logPath: SCHEDULER_LOG_PATH,
    updatedAt: nowIso,
    jobs: schedulerJobs.sort((a, b) => a.jobId.localeCompare(b.jobId)),
  }
  await writeSchedulerState(root, state)

  if (registrationEvents.length > 0) {
    await appendSchedulerEvents(root, registrationEvents)
  }

  return state
}

export async function runSchedulerOnce({
  councilRoot = process.cwd(),
  adapterOverride,
  now = new Date(),
} = {}) {
  const { root } = await readCouncilConfig(councilRoot)
  const nowDate = coerceDate(now)
  let state = await syncSchedulerState({ councilRoot: root, now: nowDate })
  const dueJobs = findDueJobs(state, nowDate)
  const executed = []
  const errors = []

  for (const dueJob of dueJobs) {
    const dispatchedAt = new Date().toISOString()
    await appendSchedulerEvent(root, {
      timestamp: dispatchedAt,
      kind: 'scheduler-dispatched',
      jobId: dueJob.jobId,
      scheduledFor: dueJob.scheduledFor,
      expression: dueJob.schedule.expression,
      timezone: dueJob.schedule.timezone,
      message: `Scheduler dispatched ${dueJob.jobId}.`,
    })

    try {
      const result = await runJob({
        councilRoot: root,
        jobId: dueJob.jobId,
        adapterOverride,
        trigger: {
          type: 'scheduler',
          scheduledFor: dueJob.scheduledFor,
          expression: dueJob.schedule.expression,
          timezone: dueJob.schedule.timezone,
          dispatchedAt,
        },
      })
      executed.push({
        jobId: dueJob.jobId,
        scheduledFor: dueJob.scheduledFor,
        runId: result.run.runId,
        runDir: result.runDir,
        run: result.run,
      })
      state = await updateSchedulerJob(root, dueJob.jobId, (entry) => ({
        ...entry,
        status: 'registered',
        lastScheduledFor: dueJob.scheduledFor,
        lastRunAt: result.run.finishedAt,
        lastRunId: result.run.runId,
        nextRunAt: nextAfter(dueJob.schedule.expression, dueJob.schedule.timezone, dueJob.scheduledFor),
        runCount: Number(entry.runCount || 0) + 1,
        failureCount: Number(entry.failureCount || 0) + (result.run.status === 'succeeded' ? 0 : 1),
        lastError: result.run.status === 'succeeded' ? null : schedulerErrorFromRun(result.run),
      }))
      await appendRunSchedulerEvent(root, result.runDir, {
        timestamp: result.run.finishedAt,
        kind: 'scheduler-completed',
        jobId: dueJob.jobId,
        runId: result.run.runId,
        scheduledFor: dueJob.scheduledFor,
        status: result.run.status,
        message: `Scheduler completed ${dueJob.jobId} with status ${result.run.status}.`,
      })
      await appendSchedulerEvent(root, {
        timestamp: result.run.finishedAt,
        kind: 'scheduler-completed',
        jobId: dueJob.jobId,
        runId: result.run.runId,
        scheduledFor: dueJob.scheduledFor,
        status: result.run.status,
        message: `Scheduler completed ${dueJob.jobId} with status ${result.run.status}.`,
      })
    } catch (error) {
      const failedAt = new Date().toISOString()
      const schedulerError = {
        code: 'scheduler-run-failed',
        message: error.message,
        retryable: true,
      }
      errors.push({
        jobId: dueJob.jobId,
        scheduledFor: dueJob.scheduledFor,
        error: schedulerError,
      })
      state = await updateSchedulerJob(root, dueJob.jobId, (entry) => ({
        ...entry,
        status: 'registered',
        lastScheduledFor: dueJob.scheduledFor,
        nextRunAt: nextAfter(dueJob.schedule.expression, dueJob.schedule.timezone, dueJob.scheduledFor),
        failureCount: Number(entry.failureCount || 0) + 1,
        lastError: schedulerError,
      }))
      await appendSchedulerEvent(root, {
        timestamp: failedAt,
        kind: 'scheduler-error',
        jobId: dueJob.jobId,
        scheduledFor: dueJob.scheduledFor,
        error: schedulerError,
        message: `Scheduler failed ${dueJob.jobId}: ${error.message}`,
      })
    }
  }

  return {
    councilRoot: root,
    statePath: SCHEDULER_STATE_PATH,
    logPath: SCHEDULER_LOG_PATH,
    checkedAt: nowDate.toISOString(),
    registered: state.jobs.filter((job) => job.status === 'registered').length,
    due: dueJobs.length,
    executed,
    errors,
  }
}

export async function startScheduler({
  councilRoot = process.cwd(),
  adapterOverride,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
} = {}) {
  const { root } = await readCouncilConfig(councilRoot)
  const intervalMs = Math.max(1_000, Number(pollIntervalMs || DEFAULT_POLL_INTERVAL_MS))
  let stopped = false
  let running = false

  await syncSchedulerState({ councilRoot: root })
  await appendSchedulerEvent(root, {
    kind: 'scheduler-started',
    pollIntervalMs: intervalMs,
    message: `Scheduler started for ${root}.`,
  })

  const tick = async () => {
    if (stopped || running) return
    running = true
    try {
      await runSchedulerOnce({ councilRoot: root, adapterOverride })
    } catch (error) {
      await appendSchedulerEvent(root, {
        kind: 'scheduler-error',
        error: {
          code: 'scheduler-tick-failed',
          message: error.message,
          retryable: true,
        },
        message: `Scheduler tick failed: ${error.message}`,
      })
    } finally {
      running = false
    }
  }

  const immediate = setTimeout(tick, 0)
  const interval = setInterval(tick, intervalMs)

  return {
    councilRoot: root,
    statePath: SCHEDULER_STATE_PATH,
    logPath: SCHEDULER_LOG_PATH,
    pollIntervalMs: intervalMs,
    async stop() {
      if (stopped) return
      stopped = true
      clearTimeout(immediate)
      clearInterval(interval)
      while (running) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      await appendSchedulerEvent(root, {
        kind: 'scheduler-stopped',
        message: `Scheduler stopped for ${root}.`,
      })
    },
  }
}

function findDueJobs(state, nowDate) {
  return state.jobs
    .filter((job) => job.status === 'registered')
    .map((job) => {
      const scheduledFor = latestScheduledAt(job.schedule.expression, job.schedule.timezone, nowDate)
      if (!scheduledFor) return null
      if (job.lastScheduledFor && scheduledFor <= job.lastScheduledFor) return null
      return {
        ...job,
        scheduledFor,
      }
    })
    .filter(Boolean)
}

function nextSchedulerRunAt({ entry, now }) {
  const scheduledFor = latestScheduledAt(entry.schedule.expression, entry.schedule.timezone, now)
  if (scheduledFor && (!entry.lastScheduledFor || scheduledFor > entry.lastScheduledFor)) {
    return scheduledFor
  }

  return nextAfter(
    entry.schedule.expression,
    entry.schedule.timezone,
    entry.lastScheduledFor && entry.lastScheduledFor > now.toISOString() ? entry.lastScheduledFor : now,
  )
}

async function updateSchedulerJob(root, jobId, update) {
  const state = await readSchedulerState({ councilRoot: root })
  const updatedAt = new Date().toISOString()
  const jobs = state.jobs.map((job) => {
    if (job.jobId !== jobId) return job
    return {
      ...update(job),
      updatedAt,
    }
  })
  const nextState = {
    ...state,
    updatedAt,
    jobs,
  }
  await writeSchedulerState(root, nextState)
  return nextState
}

async function writeSchedulerState(root, state) {
  await writeJson(join(root, SCHEDULER_STATE_PATH), state)
}

async function appendSchedulerEvent(root, event) {
  await appendSchedulerEvents(root, [event])
}

async function appendSchedulerEvents(root, events) {
  if (events.length === 0) return
  const lines =
    events
      .map((event) =>
        JSON.stringify({
          timestamp: event.timestamp || new Date().toISOString(),
          ...event,
        }),
      )
      .join('\n') + '\n'
  const logPath = join(root, SCHEDULER_LOG_PATH)
  await mkdir(dirname(logPath), { recursive: true })
  await appendFile(logPath, lines)
}

async function appendRunSchedulerEvent(root, runDir, event) {
  const eventsPath = join(root, runDir, 'events.jsonl')
  await appendFile(eventsPath, `${JSON.stringify(event)}\n`)
}

function validateSchedule(schedule) {
  if (!schedule || schedule.type !== 'cron') {
    return {
      valid: false,
      error: {
        code: 'scheduler-invalid-schedule',
        message: 'Recurring jobs must define schedule.type "cron".',
        retryable: false,
      },
    }
  }

  if (fieldCount(schedule.expression) !== 5) {
    return {
      valid: false,
      error: {
        code: 'scheduler-invalid-cron',
        message: 'Recurring jobs must use a five-field cron expression.',
        retryable: false,
      },
    }
  }

  try {
    parseCron(schedule.expression, schedule.timezone, new Date())
  } catch (error) {
    return {
      valid: false,
      error: {
        code: 'scheduler-invalid-cron',
        message: error.message,
        retryable: false,
      },
    }
  }

  return { valid: true, error: null }
}

function normalizeSchedule(schedule = {}) {
  return {
    type: schedule.type || 'cron',
    expression: String(schedule.expression || '').trim(),
    timezone: schedule.timezone || 'local',
  }
}

function latestScheduledAt(expression, timezone, now) {
  const currentDate = new Date(coerceDate(now).getTime() + 999)
  try {
    return parseCron(expression, timezone, currentDate).prev().toISOString()
  } catch {
    return null
  }
}

function nextAfter(expression, timezone, after) {
  return parseCron(expression, timezone, coerceDate(after)).next().toISOString()
}

function parseCron(expression, timezone, currentDate) {
  const options = { currentDate }
  if (timezone && timezone !== 'local') options.tz = timezone
  return CronExpressionParser.parse(expression, options)
}

function fieldCount(expression) {
  return String(expression || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function coerceDate(value) {
  if (value instanceof Date) return value
  return new Date(value)
}

function emptyState() {
  return {
    version: 1,
    runner: 'internal-cron',
    jobs: [],
  }
}

function shouldLogRegistration(previous, entry) {
  if (!previous) return true
  return (
    previous.status !== entry.status ||
    previous.schedule?.expression !== entry.schedule.expression ||
    previous.schedule?.timezone !== entry.schedule.timezone
  )
}

function registrationEvent({ root, entry, nowIso, status }) {
  return {
    timestamp: nowIso,
    kind: 'scheduler-registered',
    jobId: entry.jobId,
    path: entry.path,
    expression: entry.schedule.expression,
    timezone: entry.schedule.timezone,
    status,
    councilRoot: root,
    message: `Scheduler registered ${entry.jobId} as ${status}.`,
  }
}

function schedulerErrorFromRun(run) {
  return {
    code: 'scheduler-run-unsuccessful',
    message: `Scheduled run ${run.runId} finished with status ${run.status}.`,
    retryable: run.status === 'timed-out',
  }
}
