import { mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { appendPermissionAudit, resolveAdapter, runCliAdapter } from './adapters/cli.js'
import { pathExists, readAgent, readCouncilConfig, readJson, slugify, writeJson, writeText } from './council.js'
import { createRetrievalService } from './retrieval/service.js'
import { toCouncilRelative } from './retrieval/path.js'

export async function listJobs({ councilRoot = process.cwd() } = {}) {
  const { root, config } = await readCouncilConfig(councilRoot)
  const jobsDir = join(root, config.jobsDir || 'council/jobs')
  let entries = []
  try {
    entries = await readdir(jobsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const jobs = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '_proposals') continue
    const jobPath = join(jobsDir, entry.name, 'job.json')
    if (!(await pathExists(jobPath))) continue
    const job = await readJson(jobPath)
    jobs.push({
      id: job.id,
      title: job.title,
      type: job.type,
      status: job.status,
      assignedAgents: job.assignedAgents || [],
      path: toCouncilRelative(root, jobPath),
      lastRunId: job.lastRunId || null,
      schedule: job.schedule || null,
    })
  }

  return jobs.sort((a, b) => a.id.localeCompare(b.id))
}

export async function runJob({ councilRoot = process.cwd(), jobId, adapterOverride, trigger } = {}) {
  if (!jobId) throw new Error('Usage: landsraad job run <job-id> [--adapter local|claude|codex|gemini]')

  const { root, config } = await readCouncilConfig(councilRoot)
  const jobsDir = join(root, config.jobsDir || 'council/jobs')
  const jobDir = join(jobsDir, jobId)
  const jobPath = join(jobDir, 'job.json')
  const job = await readJson(jobPath)
  const assignedAgents = job.assignedAgents || []

  if (assignedAgents.length === 0) {
    throw new Error(`Job "${jobId}" has no assigned agents.`)
  }

  const runId = await uniqueRunId(jobDir)
  const runDir = join(jobDir, 'runs', runId)
  const artifactsDir = join(runDir, 'artifacts')
  const transcriptPath = join(runDir, 'transcript.md')
  const inputPath = join(runDir, 'input.md')
  const outputPath = join(runDir, 'output.md')
  const eventsPath = join(runDir, 'events.jsonl')
  await mkdir(artifactsDir, { recursive: true })

  const startedAt = new Date().toISOString()
  const jobBriefPath = join(jobDir, 'brief.md')
  const jobBrief = await readOptional(jobBriefPath)
  const retrievedContext = await retrieveContext({ root, job })
  const agentTasks = []
  const events = []
  const permissionEvents = []
  const adapterResults = []
  const outputSections = []

  if (trigger?.type === 'scheduler') {
    events.push({
      timestamp: trigger.dispatchedAt || startedAt,
      kind: 'scheduler-dispatched',
      message: `Scheduler dispatched ${jobId}.`,
      jobId,
      scheduledFor: trigger.scheduledFor,
      expression: trigger.expression,
      timezone: trigger.timezone,
    })
  }

  for (const agentId of assignedAgents) {
    const { agent, personaPath } = await readAgent({ councilRoot: root, agentId })
    const persona = await readOptional(personaPath)
    const taskPacket = buildTaskPacket({
      root,
      config,
      job,
      jobId,
      runId,
      runDir,
      agent,
      personaPath,
      jobBriefPath,
      retrievedContext,
    })
    const prompt = buildPrompt({ taskPacket, persona, jobBrief, retrievedContext })
    const adapter = resolveAdapter(agent.adapter, { override: adapterOverride })
    agentTasks.push({ agentId, agent, adapter, prompt, taskPacket })
  }

  await writeText(inputPath, formatInput(agentTasks))
  await writeText(transcriptPath, `# Transcript\n\nRun ${runId} for job ${jobId}.\n`)

  for (const task of agentTasks) {
    const result = await runCliAdapter({
      councilRoot: root,
      runId,
      jobId,
      agent: task.agent,
      adapter: task.adapter,
      prompt: task.prompt,
      transcriptPath,
      events,
      permissionEvents,
    })
    adapterResults.push({ agentId: task.agentId, adapter: task.adapter, result })
    outputSections.push(formatAgentOutput(task.agent, result))
  }

  const finishedAt = new Date().toISOString()
  const status = adapterResults.every((entry) => entry.result.status === 'succeeded')
    ? 'succeeded'
    : adapterResults.some((entry) => entry.result.status === 'timed-out')
      ? 'timed-out'
      : 'failed'

  if (outputSections.some((section) => section.trim())) {
    await writeText(outputPath, `# Run Output\n\n${outputSections.join('\n\n')}\n`)
  }

  await writeText(eventsPath, events.map((event) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : ''))
  await appendPermissionAudit(root, config.permissions?.auditLog, permissionEvents)

  const errors = adapterResults.flatMap((entry) =>
    (entry.result.errors || []).map((error) => ({
      ...error,
      agentId: entry.agentId,
    })),
  )

  const run = {
    version: 1,
    runId,
    jobId,
    status,
    assignedAgents,
    adapter: {
      type: 'cli',
      id: resolvedRunAdapterId(adapterOverride, adapterResults),
      invocations: adapterResults.map((entry) => ({
        agentId: entry.agentId,
        preset: entry.adapter.preset || null,
        command: entry.adapter.command,
        args: entry.adapter.args || [],
        status: entry.result.status,
      })),
    },
    startedAt,
    finishedAt,
    inputs: ['input.md'],
    transcript: 'transcript.md',
    outputs: status === 'succeeded' ? ['output.md'] : outputSections.some((section) => section.trim()) ? ['output.md'] : [],
    artifacts: [],
    requestedActions: [],
    permissionEvents,
    errors,
  }
  if (trigger) {
    run.trigger = {
      type: trigger.type,
      scheduledFor: trigger.scheduledFor || null,
      expression: trigger.expression || null,
      timezone: trigger.timezone || null,
      dispatchedAt: trigger.dispatchedAt || null,
    }
  }
  await writeJson(join(runDir, 'run.json'), run)

  job.status = status
  job.lastRunId = runId
  job.lastRunAt = finishedAt
  await writeJson(jobPath, job)
  await writeText(join(jobDir, 'status.md'), `# Status\n\nLast run: ${runId}\nStatus: ${status}\nFinished: ${finishedAt}\n`)

  return {
    run,
    runDir: toCouncilRelative(root, runDir),
  }
}

function resolvedRunAdapterId(adapterOverride, adapterResults) {
  if (adapterOverride) return adapterOverride
  const presets = new Set(adapterResults.map((entry) => entry.adapter.preset || entry.adapter.command))
  return presets.size === 1 ? [...presets][0] : 'configured'
}

export async function listJobProposals({ councilRoot = process.cwd() } = {}) {
  const { root, config } = await readCouncilConfig(councilRoot)
  const proposalsDir = join(root, config.jobsDir || 'council/jobs', '_proposals')
  let entries = []
  try {
    entries = await readdir(proposalsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const proposals = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const proposalPath = join(proposalsDir, entry.name, 'proposal.json')
    if (!(await pathExists(proposalPath))) continue
    const proposal = await readJson(proposalPath)
    proposals.push({
      ...proposal,
      path: toCouncilRelative(root, proposalPath),
    })
  }

  return proposals.sort((a, b) => a.id.localeCompare(b.id))
}

export async function approveJobProposal({ councilRoot = process.cwd(), proposalId } = {}) {
  if (!proposalId) throw new Error('Usage: landsraad job proposal approve <proposal-id>')

  const { root, config } = await readCouncilConfig(councilRoot)
  const jobsDir = join(root, config.jobsDir || 'council/jobs')
  const proposalDir = join(jobsDir, '_proposals', proposalId)
  const proposalPath = join(proposalDir, 'proposal.json')
  const proposal = await readJson(proposalPath)
  const jobId = proposal.proposedJobId || slugify(proposal.title || proposal.id)
  const jobDir = join(jobsDir, jobId)

  if (await pathExists(join(jobDir, 'job.json'))) {
    throw new Error(`Refusing to overwrite existing job "${jobId}".`)
  }

  const approvedAt = new Date().toISOString()
  const job = {
    version: 1,
    id: jobId,
    title: proposal.title,
    description: proposal.description,
    type: proposal.jobType || 'one-off',
    status: 'queued',
    assignedAgents: proposal.recommendedAgents || [proposal.proposedBy].filter(Boolean),
    context: {
      requiredPaths: [],
      seedPaths: [`council/agents/${proposal.proposedBy}/memory`, 'council/projects'],
      retrieval: {
        enabled: true,
        mode: 'keyword-and-vector',
        maxResults: 20,
      },
    },
    output: {
      format: 'markdown',
      destination: 'runs',
    },
    review: {
      requiresDirectorApproval: true,
    },
    creation: {
      source: 'proposal',
      sourceProposal: proposal.id,
      approvedByDirector: true,
      approvedAt,
    },
  }

  await mkdir(join(jobDir, 'runs'), { recursive: true })
  await writeJson(join(jobDir, 'job.json'), job, { flag: 'wx' })

  const proposedBrief = await readOptional(join(proposalDir, 'brief.md'))
  const brief = proposedBrief || `# ${proposal.title}\n\n${proposal.description || ''}\n`
  await writeText(join(jobDir, 'brief.md'), brief, { flag: 'wx' })
  await writeText(join(jobDir, 'status.md'), '# Status\n\nQueued.\n', { flag: 'wx' })

  proposal.status = 'approved'
  proposal.approvedAt = approvedAt
  proposal.createdJobPath = toCouncilRelative(root, jobDir)
  await writeJson(proposalPath, proposal)

  return { proposal, job, jobPath: toCouncilRelative(root, join(jobDir, 'job.json')) }
}

export async function rejectJobProposal({ councilRoot = process.cwd(), proposalId } = {}) {
  if (!proposalId) throw new Error('Usage: landsraad job proposal reject <proposal-id>')

  const { root, config } = await readCouncilConfig(councilRoot)
  const proposalPath = join(root, config.jobsDir || 'council/jobs', '_proposals', proposalId, 'proposal.json')
  const proposal = await readJson(proposalPath)
  proposal.status = 'rejected'
  proposal.rejectedAt = new Date().toISOString()
  await writeJson(proposalPath, proposal)
  return { proposal }
}

function buildTaskPacket({ root, config, job, jobId, runId, runDir, agent, personaPath, jobBriefPath, retrievedContext }) {
  return {
    version: 1,
    council: {
      root: '.',
      name: config.name,
      description: config.description,
    },
    run: {
      runId,
      jobId,
      runDir: toCouncilRelative(root, runDir),
    },
    agent: {
      id: agent.id,
      name: agent.name,
      personaPath: toCouncilRelative(root, personaPath),
    },
    request: {
      directorRequest: `${job.title}: ${job.description}`,
      jobBriefPath: toCouncilRelative(root, jobBriefPath),
    },
    context: {
      requiredPaths: job.context?.requiredPaths || [],
      seedPaths: job.context?.seedPaths || [],
      retrievedPaths: retrievedContext.map((item) => ({
        filePath: item.filePath,
        chunkIndex: item.chunkIndex,
        score: item.score,
      })),
    },
    output: {
      format: job.output?.format || agent.defaultOutputFormat || 'markdown',
      expectedPrimaryPath: 'output.md',
      artifactDir: 'artifacts',
    },
    permissions: {
      allowedActions: [],
      requiresApprovalFor: ['external-command', 'file-write-outside-council', 'destructive-action'],
    },
  }
}

function buildPrompt({ taskPacket, persona, jobBrief, retrievedContext }) {
  return [
    '# Landsraad Task Packet',
    '',
    '```json',
    JSON.stringify(taskPacket, null, 2),
    '```',
    '',
    '# Agent Persona',
    '',
    persona || 'No persona file was found.',
    '',
    '# Job Brief',
    '',
    jobBrief || 'No job brief was found.',
    '',
    '# Retrieved Context',
    '',
    ...retrievedContext.map((result) => `## ${result.filePath}#${result.chunkIndex}\n\n${result.text}\n`),
  ].join('\n')
}

function formatInput(agentInputs) {
  return [
    '# Task Packets',
    '',
    ...agentInputs.flatMap(({ agentId, taskPacket }) => [
      `## ${agentId}`,
      '',
      '```json',
      JSON.stringify(taskPacket, null, 2),
      '```',
      '',
    ]),
  ].join('\n')
}

function formatAgentOutput(agent, result) {
  const stdout = result.stdout?.trim()
  const stderr = result.stderr?.trim()
  const lines = [`## ${agent.name || agent.id}`, '']

  if (stdout) {
    lines.push(stdout)
  } else {
    lines.push(`No stdout was produced by ${agent.name || agent.id}.`)
  }

  if (stderr) {
    lines.push('', '### stderr', '', stderr)
  }

  return lines.join('\n')
}

async function retrieveContext({ root, job }) {
  if (job.context?.retrieval?.enabled === false) return []
  const query = [job.title, job.description, ...(job.context?.seedPaths || [])].filter(Boolean).join(' ')
  if (!query.trim()) return []

  const service = createRetrievalService({ councilRoot: root })
  const mode = normalizeRetrievalMode(job.context?.retrieval?.mode)
  const limit = Number(job.context?.retrieval?.maxResults || 10)
  return service.search(query, { mode, limit })
}

function normalizeRetrievalMode(mode) {
  if (mode === 'keyword-and-vector') return 'hybrid'
  if (mode === 'semantic') return 'vector'
  if (mode === 'find') return 'keyword'
  return mode || 'hybrid'
}

async function uniqueRunId(jobDir) {
  const base = timestampForRunId(new Date())
  let runId = base
  let suffix = 2
  while (await pathExists(join(jobDir, 'runs', runId))) {
    runId = `${base}-${suffix}`
    suffix++
  }
  return runId
}

function timestampForRunId(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replaceAll(':', '')
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}
