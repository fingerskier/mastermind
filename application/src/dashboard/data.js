import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

import { listAgents, readCouncilConfig, readJson, pathExists } from '../council.js'
import { listJobs } from '../jobs.js'
import { createRetrievalService } from '../retrieval/service.js'
import { toCouncilRelative } from '../retrieval/path.js'
import { extractDashboardObjectsFromText, normalizeDashboardObjects } from './objects.js'

const TEXT_PREVIEW_LIMIT = 20_000

export async function readDashboardOverview({ councilRoot = process.cwd() } = {}) {
  const council = await readDashboardCouncil({ councilRoot })
  const [secretary, agents, jobs, projects, memory, runs] = await Promise.all([
    readSecretary({ councilRoot }),
    readDashboardAgents({ councilRoot }),
    readDashboardJobs({ councilRoot }),
    listProjects({ councilRoot }),
    readMemoryOverview({ councilRoot }),
    listRuns({ councilRoot }),
  ])

  return {
    council,
    secretary,
    agents,
    jobs,
    projects,
    memory,
    runs,
    counts: {
      councillors: agents.filter((agent) => agent.kind === 'councillor').length,
      jobs: jobs.length,
      projects: projects.length,
      runs: runs.length,
      memoryFiles: memory.files.length,
    },
  }
}

export async function readDashboardCouncil({ councilRoot = process.cwd() } = {}) {
  const { root, config } = await readCouncilConfig(councilRoot)
  return {
    root,
    config,
    paths: {
      agentsDir: config.agentsDir || 'council/agents',
      secretaryDir: config.secretaryDir || 'council/secretary',
      jobsDir: config.jobsDir || 'council/jobs',
      projectsDir: config.projectsDir || 'council/projects',
      memoryDir: config.memoryDir || 'council/memory',
    },
  }
}

export async function readSecretary({ councilRoot = process.cwd() } = {}) {
  const { root, config } = await readCouncilConfig(councilRoot)
  const secretaryDir = join(root, config.secretaryDir || 'council/secretary')
  const secretaryPath = join(secretaryDir, 'secretary.json')
  const secretary = await readJson(secretaryPath)
  const personaPath = join(secretaryDir, secretary.persona || 'persona.md')
  return {
    ...secretary,
    kind: 'secretary',
    path: toCouncilRelative(root, secretaryPath),
    personaPath: toCouncilRelative(root, personaPath),
    persona: await readOptionalText(personaPath),
  }
}

export async function readDashboardAgents({ councilRoot = process.cwd() } = {}) {
  const { root } = await readCouncilConfig(councilRoot)
  const agents = await listAgents({ councilRoot: root })

  return Promise.all(
    agents.map(async (agent) => {
      const agentDir = dirname(join(root, agent.path))
      const personaPath = join(agentDir, 'persona.md')
      const memoryDir = join(agentDir, 'memory')
      const workDir = join(agentDir, 'work')
      return {
        ...agent,
        personaPath: (await pathExists(personaPath)) ? toCouncilRelative(root, personaPath) : null,
        persona: (await pathExists(personaPath)) ? await readOptionalText(personaPath) : '',
        memoryFiles: (await pathExists(memoryDir)) ? await listDirectoryFiles(root, memoryDir) : [],
        workFiles: (await pathExists(workDir)) ? await listDirectoryFiles(root, workDir) : [],
      }
    }),
  )
}

export async function readDashboardJobs({ councilRoot = process.cwd() } = {}) {
  const { root, config } = await readCouncilConfig(councilRoot)
  const jobs = await listJobs({ councilRoot: root })
  const jobsDir = join(root, config.jobsDir || 'council/jobs')

  return Promise.all(
    jobs.map(async (job) => {
      const jobDir = join(jobsDir, job.id)
      const briefPath = join(jobDir, 'brief.md')
      const statusPath = join(jobDir, 'status.md')
      return {
        ...job,
        brief: await readOptionalText(briefPath),
        statusText: await readOptionalText(statusPath),
        runs: (await listRunsForJob({ root, job })).slice(0, 10),
      }
    }),
  )
}

export async function listProjects({ councilRoot = process.cwd() } = {}) {
  const { root, config } = await readCouncilConfig(councilRoot)
  const projectsDir = join(root, config.projectsDir || 'council/projects')
  const entries = await readDirSafe(projectsDir)
  const projects = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const projectDir = join(projectsDir, entry.name)
    projects.push({
      id: entry.name,
      path: toCouncilRelative(root, projectDir),
      brief: await readOptionalText(join(projectDir, 'brief.md')),
      decisions: await readOptionalText(join(projectDir, 'decisions.md')),
      notes: await readOptionalText(join(projectDir, 'notes.md')),
      files: await listDirectoryFiles(root, projectDir),
    })
  }

  return projects.sort((a, b) => a.id.localeCompare(b.id))
}

export async function readMemoryOverview({ councilRoot = process.cwd() } = {}) {
  const { root, config } = await readCouncilConfig(councilRoot)
  const memoryDir = join(root, config.memoryDir || 'council/memory')
  const factsPath = join(memoryDir, 'facts.json')
  const indexPath = join(memoryDir, 'index.md')

  return {
    path: toCouncilRelative(root, memoryDir),
    index: await readOptionalText(indexPath),
    facts: await readOptionalJson(factsPath),
    files: await listDirectoryFiles(root, memoryDir),
  }
}

export async function listRuns({ councilRoot = process.cwd(), limit = 100 } = {}) {
  const { root } = await readCouncilConfig(councilRoot)
  const jobs = await listJobs({ councilRoot: root })
  const runs = []

  for (const job of jobs) {
    runs.push(...(await listRunsForJob({ root, job })))
  }

  return runs.sort(compareRuns).slice(0, limit)
}

export async function readRunDetail({ councilRoot = process.cwd(), jobId, runId } = {}) {
  if (!jobId || !runId) throw new Error('Run detail requires jobId and runId.')

  const { root, config } = await readCouncilConfig(councilRoot)
  const runDir = resolve(root, config.jobsDir || 'council/jobs', jobId, 'runs', runId)
  assertInsideRoot(root, runDir)

  const runJsonPath = join(runDir, 'run.json')
  const inputPath = join(runDir, 'input.md')
  const transcriptPath = join(runDir, 'transcript.md')
  const outputPath = join(runDir, 'output.md')
  const eventsPath = join(runDir, 'events.jsonl')

  const run = await readJson(runJsonPath)
  const output = await readOptionalText(outputPath)
  const runObjects = normalizeDashboardObjects(run.structuredObjects || run.dashboardObjects || [], {
    sourcePath: toCouncilRelative(root, runJsonPath),
  })
  const outputObjects = extractDashboardObjectsFromText(output, {
    sourcePath: toCouncilRelative(root, outputPath),
  })

  return {
    run,
    path: toCouncilRelative(root, runDir),
    files: {
      runJson: await readOptionalText(runJsonPath),
      inputMd: await readOptionalText(inputPath),
      transcriptMd: await readOptionalText(transcriptPath),
      outputMd: output,
      eventsJsonl: await readOptionalText(eventsPath),
    },
    events: await readJsonl(eventsPath),
    structuredObjects: [...runObjects, ...outputObjects],
  }
}

export async function searchDashboardRetrieval({ councilRoot = process.cwd(), query, limit = 10, mode = 'hybrid' } = {}) {
  if (!query || !String(query).trim()) return []
  const service = createRetrievalService({ councilRoot })
  return service.search(String(query), {
    limit: clampInt(limit, 10, 1, 50),
    mode: ['hybrid', 'vector', 'keyword'].includes(mode) ? mode : 'hybrid',
  })
}

async function listRunsForJob({ root, job }) {
  const runRoot = join(root, dirname(job.path), 'runs')
  const entries = await readDirSafe(runRoot)
  const runs = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const runDir = join(runRoot, entry.name)
    const runPath = join(runDir, 'run.json')
    if (!(await pathExists(runPath))) continue

    const run = await readOptionalJson(runPath)
    const runStat = await statSafe(runPath)
    runs.push({
      runId: run?.runId || entry.name,
      jobId: run?.jobId || job.id,
      jobTitle: job.title,
      status: run?.status || 'unknown',
      startedAt: run?.startedAt || null,
      finishedAt: run?.finishedAt || null,
      assignedAgents: run?.assignedAgents || [],
      path: toCouncilRelative(root, runDir),
      runJsonPath: toCouncilRelative(root, runPath),
      updatedAt: runStat?.mtime?.toISOString() || null,
    })
  }

  return runs.sort(compareRuns)
}

async function listDirectoryFiles(root, absoluteDir) {
  const entries = await readDirSafe(absoluteDir)
  const files = []

  for (const entry of entries) {
    if (entry.name === '.gitkeep') continue
    const absolutePath = join(absoluteDir, entry.name)
    const entryStat = await statSafe(absolutePath)
    files.push({
      name: entry.name,
      path: toCouncilRelative(root, absolutePath),
      kind: entry.isDirectory() ? 'directory' : 'file',
      size: entryStat?.size || 0,
      updatedAt: entryStat?.mtime?.toISOString() || null,
    })
  }

  return files.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.path.localeCompare(b.path)
  })
}

async function readOptionalText(path) {
  try {
    const text = await readFile(path, 'utf8')
    if (text.length <= TEXT_PREVIEW_LIMIT) return text
    return `${text.slice(0, TEXT_PREVIEW_LIMIT)}\n\n[truncated at ${TEXT_PREVIEW_LIMIT} characters]`
  } catch {
    return ''
  }
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function readJsonl(path) {
  const text = await readOptionalText(path)
  if (!text.trim()) return []
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return { parseError: true, line }
      }
    })
}

async function readDirSafe(path) {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch {
    return []
  }
}

async function statSafe(path) {
  try {
    return await stat(path)
  } catch {
    return null
  }
}

function compareRuns(a, b) {
  const aTime = a.finishedAt || a.startedAt || a.updatedAt || a.runId
  const bTime = b.finishedAt || b.startedAt || b.updatedAt || b.runId
  return String(bTime).localeCompare(String(aTime))
}

function clampInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

function assertInsideRoot(root, target) {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(target)
  const prefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(prefix)) {
    throw new Error(`Refusing to read outside council root: ${target}`)
  }
}
