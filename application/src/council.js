import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { resolveCouncilRoot, toCouncilRelative } from './retrieval/path.js'
import { getTemplate, templateJsonFor } from './templates.js'

export async function createCouncil({ councilRoot = process.cwd(), templateId = 'business-operations', name, id } = {}) {
  const root = resolveCouncilRoot(councilRoot)
  const template = getTemplate(templateId)
  const config = configForTemplate(template, {
    name: name || template.name,
    id: id || `${template.id}-council`,
  })

  const dirs = scaffoldDirs(template)
  const files = scaffoldFiles(template, config)
  const conflicts = []

  for (const file of files) {
    if (await pathExists(join(root, file.path))) conflicts.push(file.path)
  }

  if (conflicts.length > 0) {
    throw new Error(`Refusing to overwrite existing council files: ${conflicts.join(', ')}`)
  }

  for (const dir of dirs) {
    await mkdir(join(root, dir), { recursive: true })
  }

  const createdPaths = []
  for (const file of files) {
    const absolutePath = join(root, file.path)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, file.contents, { flag: 'wx' })
    createdPaths.push(file.path)
  }

  return {
    root,
    config,
    template: templateJsonFor(template),
    createdPaths,
  }
}

export async function readCouncilConfig(councilRoot = process.cwd()) {
  const root = resolveCouncilRoot(councilRoot)
  const configPath = join(root, 'landsraad.config.json')
  try {
    const config = await readJson(configPath)
    return { root, config }
  } catch (error) {
    throw new Error(`No Landsraad council found at ${root}. Expected landsraad.config.json.`)
  }
}

export async function listAgents({ councilRoot = process.cwd() } = {}) {
  const { root, config } = await readCouncilConfig(councilRoot)
  const agents = []

  const secretaryPath = join(root, config.secretaryDir || 'council/secretary', 'secretary.json')
  if (await pathExists(secretaryPath)) {
    const secretary = await readJson(secretaryPath)
    agents.push({
      kind: 'secretary',
      id: secretary.id,
      name: secretary.name,
      description: secretary.description,
      path: toCouncilRelative(root, secretaryPath),
      adapter: secretary.adapter || null,
    })
  }

  const agentsDir = join(root, config.agentsDir || 'council/agents')
  let entries = []
  try {
    entries = await readdir(agentsDir, { withFileTypes: true })
  } catch {
    return agents
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const agentPath = join(agentsDir, entry.name, 'agent.json')
    if (!(await pathExists(agentPath))) continue
    const agent = await readJson(agentPath)
    agents.push({
      kind: 'councillor',
      id: agent.id,
      name: agent.name,
      description: agent.description,
      path: toCouncilRelative(root, agentPath),
      capabilities: agent.capabilities || [],
      adapter: agent.adapter || null,
    })
  }

  return agents.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'secretary' ? -1 : 1
    return a.id.localeCompare(b.id)
  })
}

export async function readAgent({ councilRoot = process.cwd(), agentId }) {
  const { root, config } = await readCouncilConfig(councilRoot)
  const agentPath = join(root, config.agentsDir || 'council/agents', agentId, 'agent.json')
  const agent = await readJson(agentPath)
  return {
    agent,
    agentPath,
    personaPath: join(dirname(agentPath), agent.persona || 'persona.md'),
  }
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function writeJson(path, value, options = {}) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, options)
}

export async function writeText(path, value, options = {}) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value, options)
}

export async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function configForTemplate(template, { name, id }) {
  return {
    version: 1,
    id,
    name,
    description: template.description,
    template: {
      id: template.id,
      version: template.version,
      source: 'bundled',
    },
    agentsDir: 'council/agents',
    secretaryDir: 'council/secretary',
    jobsDir: 'council/jobs',
    projectsDir: 'council/projects',
    memoryDir: 'council/memory',
    adapterDefaults: {
      type: 'cli',
      timeoutSeconds: 600,
    },
    scheduler: {
      enabled: true,
      runner: 'internal-cron',
    },
    permissions: {
      scope: 'council-root',
      store: '.landsraad/permissions.json',
      auditLog: '.landsraad/logs/permissions.jsonl',
      requireApprovalForExternalCommands: true,
      requireApprovalForFileWritesOutsideProject: true,
    },
  }
}

function scaffoldDirs(template) {
  const dirs = [
    'council/agents',
    'council/inbox',
    'council/jobs/_proposals',
    'council/memory/sources',
    'council/projects/example-project/artifacts',
    'council/secretary',
    '.landsraad/index',
    '.landsraad/logs',
    '.landsraad/runs',
  ]

  for (const agent of template.councillors) {
    dirs.push(`council/agents/${agent.id}/memory`)
    dirs.push(`council/agents/${agent.id}/work`)
  }

  for (const job of template.jobs) {
    dirs.push(`council/jobs/${job.id}/runs`)
  }

  return dirs
}

function scaffoldFiles(template, config) {
  const now = new Date().toISOString()
  const files = [
    jsonFile('landsraad.config.json', config),
    textFile(
      'README.md',
      `# ${config.name}\n\n${config.description}\n\nThis directory is a local Landsraad council. Source files under \`council/\` are the durable council state.\n`,
    ),
    textFile(
      'council/README.md',
      `# Council\n\nThis directory contains the Secretary, councillors, jobs, projects, shared memory, and inbox for ${config.name}.\n`,
    ),
    jsonFile('council/template.json', templateJsonFor(template)),
    jsonFile('council/secretary/secretary.json', secretaryJson()),
    textFile('council/secretary/persona.md', secretaryPersona()),
    textFile('council/memory/index.md', '# Shared Memory Index\n\nUse this file to summarize durable council context and point to source files.\n'),
    jsonFile('council/memory/facts.json', { version: 1, facts: [] }),
    textFile('council/memory/sources/.gitkeep', '\n'),
    textFile('council/inbox/.gitkeep', '\n'),
    textFile('council/projects/example-project/brief.md', '# Example Project\n\nReplace this starter project with real project context.\n'),
    textFile('council/projects/example-project/decisions.md', '# Decisions\n\n'),
    textFile('council/projects/example-project/notes.md', '# Notes\n\n'),
    jsonFile('.landsraad/state.json', { version: 1, createdAt: now }),
    jsonFile('.landsraad/scheduler.json', { version: 1, jobs: [] }),
    jsonFile('.landsraad/permissions.json', { version: 1, grants: [] }),
    textFile('.landsraad/logs/permissions.jsonl', ''),
  ]

  for (const agent of template.councillors) {
    files.push(jsonFile(`council/agents/${agent.id}/agent.json`, agentJson(agent)))
    files.push(textFile(`council/agents/${agent.id}/persona.md`, agent.persona))
    files.push(textFile(`council/agents/${agent.id}/memory/.gitkeep`, '\n'))
    files.push(textFile(`council/agents/${agent.id}/work/.gitkeep`, '\n'))
  }

  for (const job of template.jobs) {
    files.push(jsonFile(`council/jobs/${job.id}/job.json`, jobJson(job, now)))
    files.push(textFile(`council/jobs/${job.id}/brief.md`, job.brief))
    files.push(textFile(`council/jobs/${job.id}/status.md`, '# Status\n\nQueued.\n'))
  }

  return files
}

function secretaryJson() {
  return {
    version: 1,
    id: 'secretary',
    name: 'Secretary',
    description: 'Council-wide communicator and translator between the director and councillors.',
    persona: 'persona.md',
    scope: {
      read: ['council'],
    },
    outputs: ['director-briefing', 'councillor-handoff', 'structured-ui'],
    adapter: defaultAdapter(),
  }
}

function secretaryPersona() {
  return [
    '# Secretary Persona',
    '',
    'You are the council-wide communicator and translator between the director and councillors.',
    '',
    'Surface memory gaps, job status, inbox issues, and handoffs clearly. Do not perform domain work, create jobs, update memory truth, or own durable work product.',
    '',
  ].join('\n')
}

function agentJson(agent) {
  return {
    version: 1,
    id: agent.id,
    name: agent.name,
    description: agent.description,
    persona: 'persona.md',
    memoryDir: 'memory',
    workDir: 'work',
    adapter: defaultAdapter(),
    capabilities: agent.capabilities,
    defaultOutputFormat: 'markdown',
  }
}

function jobJson(job, approvedAt) {
  const body = {
    version: 1,
    id: job.id,
    title: job.title,
    description: job.description,
    type: job.type,
    status: 'queued',
    assignedAgents: job.assignedAgents,
    context: {
      requiredPaths: [],
      seedPaths: ['council/memory/facts.json', 'council/projects'],
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
      source: 'template',
      sourceProposal: null,
      approvedByDirector: true,
      approvedAt,
    },
  }

  if (job.schedule) body.schedule = job.schedule
  return body
}

function defaultAdapter() {
  return {
    type: 'cli',
    preset: 'codex',
    timeoutSeconds: 600,
    input: {
      mode: 'stdin',
    },
    output: {
      mode: 'stdout-and-files',
    },
  }
}

function jsonFile(path, value) {
  return {
    path,
    contents: `${JSON.stringify(value, null, 2)}\n`,
  }
}

function textFile(path, contents) {
  return { path, contents }
}
