import { spawn } from 'node:child_process'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCAL_AGENT_PATH = fileURLToPath(new URL('../../bin/landsraad-local-agent.js', import.meta.url))

export const PROVIDER_PRESET_ORDER = ['claude', 'codex', 'gemini', 'generic']

const ADAPTER_DEFAULTS = {
  type: 'cli',
  timeoutSeconds: 600,
  workingDirectory: '.',
  input: {
    mode: 'stdin',
  },
  output: {
    mode: 'stdout-and-files',
  },
  permissions: {
    integration: 'adapter-managed',
  },
  environment: {
    inherit: true,
    pass: [],
    secrets: [],
  },
}

const PROVIDER_PRESETS = {
  claude: {
    ...ADAPTER_DEFAULTS,
    preset: 'claude',
    command: 'claude',
    args: ['-p', '--output-format', 'text', '--no-session-persistence'],
  },
  codex: {
    ...ADAPTER_DEFAULTS,
    preset: 'codex',
    command: 'codex',
    args: ['exec', '--color', 'never', '-'],
  },
  gemini: {
    ...ADAPTER_DEFAULTS,
    preset: 'gemini',
    command: 'gemini',
    args: ['--prompt'],
    input: {
      mode: 'argument',
    },
  },
}

export function resolveAdapter(adapter = {}, { override } = {}) {
  if (override === 'local') {
    return normalizeAdapter({
      ...ADAPTER_DEFAULTS,
      type: 'cli',
      preset: 'local',
      command: process.execPath,
      args: [LOCAL_AGENT_PATH],
      timeoutSeconds: 30,
      input: {
        mode: 'stdin',
      },
      output: {
        mode: 'stdout-and-files',
      },
      environment: {
        inherit: false,
        pass: [],
        secrets: [],
      },
    })
  }

  const requestedPreset = override || adapter.preset || (adapter.command ? 'generic' : null)

  if (PROVIDER_PRESETS[requestedPreset]) {
    return normalizeProviderPreset(requestedPreset, adapter, { override })
  }

  if (requestedPreset === 'generic' || adapter.command) {
    return normalizeGenericAdapter(adapter)
  }

  throw new Error('The selected agent adapter must name a CLI preset or command.')
}

export async function runCliAdapter({
  councilRoot,
  runId,
  jobId,
  agent,
  adapter,
  prompt,
  transcriptPath,
  events,
  permissionEvents,
}) {
  const startedAt = new Date().toISOString()
  const command = adapter.command
  const args = adapter.args || []
  const workingDirectory = adapter.workingDirectory
    ? resolve(councilRoot, adapter.workingDirectory)
    : councilRoot
  const normalizedTarget = [command, ...args].join(' ')
  const adapterId = adapter.preset || adapter.command
  const permissionDecision = await resolveLaunchPermission({
    councilRoot,
    runId,
    jobId,
    agentId: agent.id,
    adapterId,
    actionKind: 'external-command',
    normalizedTarget,
    permissionsPath: adapter.permissions?.store,
  })

  const permissionEvent = {
    timestamp: startedAt,
    runId,
    jobId,
    agentId: agent.id,
    adapterId,
    actionKind: 'external-command',
    normalizedTarget,
    decision: permissionDecision.decision,
    decisionSource: permissionDecision.decisionSource,
    reason: permissionDecision.reason,
  }
  permissionEvents.push(permissionEvent)
  events.push({
    timestamp: startedAt,
    kind: 'permission-decided',
    message: `Allowed ${normalizedTarget} for this run.`,
    agentId: agent.id,
    decision: permissionEvent.decision,
  })

  await appendTranscript(transcriptPath, `\n## ${agent.name || agent.id}\n\n`)
  await appendTranscript(transcriptPath, `### process-started\n\n${normalizedTarget}\n\n`)
  events.push({
    timestamp: startedAt,
    kind: 'process-started',
    message: `Started ${normalizedTarget}.`,
    agentId: agent.id,
  })

  const env = buildEnvironment(adapter, {
    councilRoot,
    runId,
    jobId,
    agentId: agent.id,
    adapterId,
    permissionDecision,
  })
  const spawnArgs = buildSpawnArgs(adapter, args, prompt)
  let child
  try {
    child = spawn(command, spawnArgs, {
      cwd: workingDirectory,
      env,
      windowsHide: true,
    })
  } catch (error) {
    const finishedAt = new Date().toISOString()
    const adapterError = launchErrorFor(error, command)
    events.push({
      timestamp: finishedAt,
      kind: 'error',
      message: adapterError.message,
      agentId: agent.id,
      code: adapterError.code,
    })
    return {
      status: 'failed',
      startedAt,
      finishedAt,
      stdout: '',
      stderr: '',
      errors: [adapterError],
    }
  }

  let stdout = ''
  let stderr = ''
  let timedOut = false
  const timeoutMs = Math.max(1, Number(adapter.timeoutSeconds || 600)) * 1000
  const timer = setTimeout(() => {
    timedOut = true
    child.kill()
  }, timeoutMs)

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr?.on('data', (chunk) => {
    stderr += chunk
  })

  if ((adapter.input?.mode || 'stdin') === 'stdin') {
    child.stdin.end(prompt)
  } else {
    child.stdin.end()
  }

  let exitCode = null
  let signal = null
  let launchError = null

  await new Promise((resolveDone) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolveDone()
    }
    child.on('error', (error) => {
      launchError = error
      if (!child.pid) done()
    })
    child.on('close', (code, closeSignal) => {
      exitCode = code
      signal = closeSignal
      done()
    })
  })

  clearTimeout(timer)

  if (stdout) {
    await appendTranscript(transcriptPath, `### stdout\n\n${fence(stdout)}\n\n`)
    events.push({
      timestamp: new Date().toISOString(),
      kind: 'stdout',
      message: stdout,
      agentId: agent.id,
    })
  }

  if (stderr) {
    await appendTranscript(transcriptPath, `### stderr\n\n${fence(stderr)}\n\n`)
    events.push({
      timestamp: new Date().toISOString(),
      kind: 'stderr',
      message: stderr,
      agentId: agent.id,
    })
  }

  const finishedAt = new Date().toISOString()
  recordProviderManagedPermissionEvents({
    stdout,
    stderr,
    events,
    permissionEvents,
    timestamp: finishedAt,
    runId,
    jobId,
    agentId: agent.id,
    adapterId,
  })

  events.push({
    timestamp: finishedAt,
    kind: 'process-exited',
    message: `Exited with code ${exitCode ?? 'null'}${signal ? ` and signal ${signal}` : ''}.`,
    agentId: agent.id,
    exitCode,
    signal,
  })

  if (launchError) {
    const adapterError = launchErrorFor(launchError, command)
    return {
      status: 'failed',
      startedAt,
      finishedAt,
      stdout,
      stderr,
      errors: [adapterError],
    }
  }

  if (timedOut) {
    return {
      status: 'timed-out',
      startedAt,
      finishedAt,
      stdout,
      stderr,
      errors: [
        {
          code: 'adapter-timeout',
          message: `The adapter exceeded its ${adapter.timeoutSeconds || 600}s timeout.`,
          retryable: true,
        },
      ],
    }
  }

  if (exitCode !== 0) {
    const authError = providerAuthErrorFor({ adapter, stdout, stderr })
    if (authError) {
      return {
        status: 'failed',
        startedAt,
        finishedAt,
        stdout,
        stderr,
        errors: [authError],
      }
    }

    return {
      status: 'failed',
      startedAt,
      finishedAt,
      stdout,
      stderr,
      errors: [
        {
          code: 'adapter-exit-nonzero',
          message: `The adapter process exited with code ${exitCode}.`,
          detail: { exitCode },
          retryable: false,
        },
      ],
    }
  }

  return {
    status: 'succeeded',
    startedAt,
    finishedAt,
    stdout,
    stderr,
    errors: [],
  }
}

export async function appendPermissionAudit(councilRoot, auditLogPath, permissionEvents) {
  if (permissionEvents.length === 0) return
  const absolutePath = resolve(councilRoot, auditLogPath || '.landsraad/logs/permissions.jsonl')
  const lines = permissionEvents.map((event) => JSON.stringify(event)).join('\n') + '\n'
  await mkdir(dirname(absolutePath), { recursive: true })
  await appendFile(absolutePath, lines)
}

function normalizeProviderPreset(preset, adapter, { override } = {}) {
  const providerDefaults = PROVIDER_PRESETS[preset]
  const neutralConfig = pickDefined(adapter, ['timeoutSeconds', 'workingDirectory', 'environment', 'permissions'])
  const explicitProviderConfig = override
    ? {}
    : pickDefined(adapter, ['command', 'args', 'input', 'output'])

  return normalizeAdapter({
    ...providerDefaults,
    ...neutralConfig,
    ...explicitProviderConfig,
    preset,
  })
}

function normalizeGenericAdapter(adapter) {
  if (!adapter.command) {
    throw new Error('The generic CLI adapter requires a command.')
  }

  return normalizeAdapter({
    ...ADAPTER_DEFAULTS,
    ...adapter,
    preset: adapter.preset || 'generic',
  })
}

function normalizeAdapter(adapter) {
  if (!adapter.command) {
    throw new Error('The selected CLI adapter requires a command.')
  }

  const timeoutSeconds = Number(adapter.timeoutSeconds || ADAPTER_DEFAULTS.timeoutSeconds)
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error('The selected CLI adapter timeoutSeconds must be a positive number.')
  }

  return {
    type: 'cli',
    preset: adapter.preset || 'generic',
    command: adapter.command,
    args: Array.isArray(adapter.args) ? adapter.args : [],
    workingDirectory: adapter.workingDirectory || '.',
    timeoutSeconds,
    input: {
      ...ADAPTER_DEFAULTS.input,
      ...(adapter.input || {}),
    },
    output: {
      ...ADAPTER_DEFAULTS.output,
      ...(adapter.output || {}),
    },
    permissions: {
      ...ADAPTER_DEFAULTS.permissions,
      ...(adapter.permissions || {}),
    },
    environment: {
      ...ADAPTER_DEFAULTS.environment,
      ...(adapter.environment || {}),
    },
  }
}

function pickDefined(source, keys) {
  const picked = {}
  for (const key of keys) {
    if (source[key] !== undefined) picked[key] = source[key]
  }
  return picked
}

function buildEnvironment(adapter, context) {
  const inherit = adapter.environment?.inherit !== false
  const env = inherit ? { ...process.env } : {}
  for (const key of ['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) {
    if (process.env[key] !== undefined && env[key] === undefined) env[key] = process.env[key]
  }

  const pass = adapter.environment?.pass || []
  for (const key of pass) {
    if (process.env[key] !== undefined) env[key] = process.env[key]
  }

  env.LANDSRAAD_COUNCIL_ROOT = context.councilRoot
  env.LANDSRAAD_RUN_ID = context.runId
  env.LANDSRAAD_JOB_ID = context.jobId
  env.LANDSRAAD_AGENT_ID = context.agentId
  env.LANDSRAAD_ADAPTER_ID = context.adapterId
  env.LANDSRAAD_PERMISSION_DECISION = context.permissionDecision.decision
  env.LANDSRAAD_PERMISSION_SOURCE = context.permissionDecision.decisionSource
  return env
}

function buildSpawnArgs(adapter, args, prompt) {
  if ((adapter.input?.mode || 'stdin') === 'argument') {
    return [...args, prompt]
  }
  return args
}

async function appendTranscript(transcriptPath, text) {
  await appendFile(transcriptPath, text)
}

function fence(text) {
  const fenceText = text.includes('```') ? '````' : '```'
  return `${fenceText}\n${text.trimEnd()}\n${fenceText}`
}

async function resolveLaunchPermission({
  councilRoot,
  runId,
  jobId,
  agentId,
  adapterId,
  actionKind,
  normalizedTarget,
  permissionsPath,
}) {
  const grant = await findPermissionGrant({
    councilRoot,
    adapterId,
    agentId,
    actionKind,
    normalizedTarget,
    permissionsPath,
  })

  if (grant) {
    return {
      decision: grant.decision,
      decisionSource: 'landsraad-grant',
      reason: grant.reason || `Persistent Landsraad grant ${grant.id || ''} matched this adapter launch.`.trim(),
      grantId: grant.id || null,
    }
  }

  return {
    decision: 'allow-this-run',
    decisionSource: 'director-command',
    reason: 'Director invoked job run from the Landsraad CLI.',
    runId,
    jobId,
  }
}

async function findPermissionGrant({ councilRoot, adapterId, agentId, actionKind, normalizedTarget, permissionsPath }) {
  const storePath = resolve(councilRoot, permissionsPath || '.landsraad/permissions.json')
  let store
  try {
    store = JSON.parse(await readFile(storePath, 'utf8'))
  } catch {
    return null
  }

  const root = resolve(councilRoot)
  return (store.grants || []).find((grant) => {
    if (grant.decision !== 'allow-always') return false
    if (grant.councilRoot && resolve(grant.councilRoot) !== root) return false
    if (grant.adapterId && grant.adapterId !== adapterId) return false
    if (grant.agentId && grant.agentId !== agentId) return false
    if (grant.actionKind !== actionKind) return false
    return grant.normalizedTarget === normalizedTarget
  }) || null
}

function launchErrorFor(error, command) {
  const notFound = error?.code === 'ENOENT'
  return {
    code: notFound ? 'adapter-not-found' : 'adapter-launch-failed',
    message: notFound
      ? `The adapter executable "${command}" was not found on PATH.`
      : error.message,
    detail: {
      command,
      systemCode: error?.code || null,
    },
    retryable: notFound,
  }
}

function providerAuthErrorFor({ adapter, stdout, stderr }) {
  const text = `${stdout}\n${stderr}`
  if (!isProviderPreset(adapter.preset)) return null
  if (!/(auth(?:entication)?\s+(?:required|failed)|not\s+(?:authenticated|logged in)|please\s+(?:log in|login)|api\s*key|credentials?|oauth|setup-token|anthropic_api_key|gemini_api_key|google_api_key)/i.test(text)) {
    return null
  }

  return {
    code: 'provider-auth-failed',
    message: `The ${adapter.preset} adapter reported an authentication or setup failure.`,
    detail: {
      adapterId: adapter.preset,
    },
    retryable: true,
  }
}

function recordProviderManagedPermissionEvents({
  stdout,
  stderr,
  events,
  permissionEvents,
  timestamp,
  runId,
  jobId,
  agentId,
  adapterId,
}) {
  const detections = detectProviderManagedPermissionEvents(`${stdout}\n${stderr}`)
  for (const detection of detections) {
    const permissionEvent = {
      timestamp,
      runId,
      jobId,
      agentId,
      adapterId,
      actionKind: 'provider-managed-permission',
      normalizedTarget: detection.target || adapterId,
      decision: detection.decision,
      decisionSource: 'provider-managed',
      reason: detection.message,
    }
    permissionEvents.push(permissionEvent)
    events.push({
      timestamp,
      kind: 'provider-managed-permission',
      message: detection.message,
      agentId,
      decision: detection.decision,
    })
  }
}

function detectProviderManagedPermissionEvents(text) {
  const detections = []
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  for (const line of lines) {
    const jsonDetection = detectProviderPermissionJsonLine(line)
    if (jsonDetection) {
      detections.push(jsonDetection)
      continue
    }

    if (isVisibleProviderPermissionText(line)) {
      detections.push({
        message: line,
        decision: decisionFromText(line),
        target: targetFromText(line),
      })
    }
  }

  return dedupeDetections(detections).slice(0, 10)
}

function detectProviderPermissionJsonLine(line) {
  if (!line.startsWith('{')) return null
  let value
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }

  const kind = String(value.kind || value.type || value.event || '')
  const permissionShaped = /permission/i.test(kind)
    || value.permissionRequest
    || value.permissionDecision
    || value.permission !== undefined
  if (!permissionShaped) return null

  const flattened = JSON.stringify(value)
  return {
    message: value.message || value.summary || flattened,
    decision: decisionFromText(flattened),
    target: value.target || value.tool || value.command || null,
  }
}

function dedupeDetections(detections) {
  const seen = new Set()
  const unique = []
  for (const detection of detections) {
    const key = `${detection.decision}\0${detection.target || ''}\0${detection.message}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(detection)
  }
  return unique
}

function decisionFromText(text) {
  if (/\b(denied|deny|rejected)\b/i.test(text)) return 'deny'
  if (/\b(approved|allowed|allow)\b/i.test(text)) return 'allow-this-run'
  return 'provider-managed'
}

function isVisibleProviderPermissionText(line) {
  if (!/permission/i.test(line)) return false
  if (/(permission audit|permissions\.|requiresApprovalFor|directorRequest|permissionEvents|permission state|permission boundary|permission boundaries)/i.test(line)) {
    return false
  }

  return /(?:provider|claude|codex|gemini)\s+permission/i.test(line)
    || /\bpermission\s+(?:request|prompt|decision)\b/i.test(line)
    || /\b(?:approval|permission)\s+required\b/i.test(line)
    || /\b(?:allow|approve|deny)\b.+\?/i.test(line)
}

function targetFromText(text) {
  const match = text.match(/\b(?:Bash|Shell|Command|Tool)\(([^)]+)\)/i)
  return match ? match[1] : null
}

function isProviderPreset(preset) {
  return preset === 'claude' || preset === 'codex' || preset === 'gemini'
}
