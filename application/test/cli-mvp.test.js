import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

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

async function makeTempRoot(prefix = 'landsraad-cli-') {
  return mkdtemp(join(tmpdir(), prefix))
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

test('init creates a business operations council without overwriting files', async () => {
  const root = await makeTempRoot()
  try {
    const { json } = await runCli(['--council', root, 'init', '--template', 'business-operations', '--json'])

    assert.equal(json.config.id, 'business-operations-council')
    assert.equal(json.template.id, 'business-operations')
    assert.ok(json.createdPaths.includes('landsraad.config.json'))

    const config = await readJson(join(root, 'landsraad.config.json'))
    assert.equal(config.template.id, 'business-operations')

    const template = await readJson(join(root, 'council', 'template.json'))
    assert.equal(template.shareable, true)
    assert.deepEqual(template.councillors, ['ceo', 'cfo', 'cto', 'cmo', 'operations'])

    const secretary = await readJson(join(root, 'council', 'secretary', 'secretary.json'))
    assert.equal(secretary.id, 'secretary')
    assert.equal(secretary.memoryDir, undefined)
    assert.equal(secretary.workDir, undefined)

    const cfo = await readJson(join(root, 'council', 'agents', 'cfo', 'agent.json'))
    assert.equal(cfo.memoryDir, 'memory')
    assert.equal(cfo.workDir, 'work')

    const job = await readJson(join(root, 'council', 'jobs', 'weekly-financial-report', 'job.json'))
    assert.equal(job.type, 'recurring')
    assert.equal(job.assignedAgents[0], 'cfo')

    await assert.rejects(
      runCli(['--council', root, 'init', '--template', 'business-operations', '--json']),
      /Refusing to overwrite/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('agent and job list commands read council files', async () => {
  const root = await makeTempRoot()
  try {
    await runCli(['--council', root, 'init', '--template', 'business-operations', '--json'])

    const agents = await runCli(['--council', root, 'agent', 'list', '--json'])
    assert.deepEqual(
      agents.json.agents.map((agent) => agent.id),
      ['secretary', 'ceo', 'cfo', 'cmo', 'cto', 'operations'],
    )
    assert.equal(agents.json.agents[0].kind, 'secretary')

    const jobs = await runCli(['--council', root, 'job', 'list', '--json'])
    assert.deepEqual(
      jobs.json.jobs.map((job) => job.id),
      ['marketing-performance-review', 'technical-progress-report', 'weekly-financial-report'],
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('job run uses the local CLI adapter and writes durable run/audit artifacts', async () => {
  const root = await makeTempRoot()
  try {
    await runCli(['--council', root, 'init', '--template', 'business-operations', '--json'])

    const { json } = await runCli([
      '--council',
      root,
      'job',
      'run',
      'weekly-financial-report',
      '--adapter',
      'local',
      '--json',
    ])

    assert.equal(json.run.status, 'succeeded')
    assert.match(json.run.runId, /^\d{4}-\d{2}-\d{2}T/)

    const runDir = join(root, json.runDir)
    const run = await readJson(join(runDir, 'run.json'))
    assert.equal(run.jobId, 'weekly-financial-report')
    assert.equal(run.status, 'succeeded')
    assert.deepEqual(run.inputs, ['input.md'])
    assert.deepEqual(run.outputs, ['output.md'])
    assert.equal(run.permissionEvents[0].decision, 'allow-this-run')

    const input = await readFile(join(runDir, 'input.md'), 'utf8')
    assert.match(input, /Weekly Financial Report/)
    assert.match(input, /council\/memory\/facts\.json/)

    const output = await readFile(join(runDir, 'output.md'), 'utf8')
    assert.match(output, /Local CLI Adapter Output/)
    assert.match(output, /weekly-financial-report/)

    const transcript = await readFile(join(runDir, 'transcript.md'), 'utf8')
    assert.match(transcript, /stdout/)

    const events = await readFile(join(runDir, 'events.jsonl'), 'utf8')
    assert.match(events, /permission-decided/)
    assert.match(events, /process-exited/)

    const audit = await readFile(join(root, '.landsraad', 'logs', 'permissions.jsonl'), 'utf8')
    assert.match(audit, /allow-this-run/)
    assert.match(audit, /weekly-financial-report/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('job proposal approval creates a queued job and records provenance', async () => {
  const root = await makeTempRoot()
  try {
    await runCli(['--council', root, 'init', '--template', 'business-operations', '--json'])

    const proposalId = '2026-05-02T150000Z-cto-upgrade-plan'
    const proposalDir = join(root, 'council', 'jobs', '_proposals', proposalId)
    await mkdir(proposalDir, { recursive: true })
    await writeFile(
      join(proposalDir, 'proposal.json'),
      JSON.stringify(
        {
          version: 1,
          id: proposalId,
          proposedBy: 'cto',
          title: 'Plan Infrastructure Upgrade',
          description: 'Create an actionable plan for the next infrastructure upgrade.',
          jobType: 'one-off',
          recommendedAgents: ['cto'],
          status: 'pending-director-approval',
          createdAt: '2026-05-02T15:00:00Z',
          proposedJobId: 'plan-infrastructure-upgrade',
        },
        null,
        2,
      ),
    )
    await writeFile(join(proposalDir, 'brief.md'), '# Plan Infrastructure Upgrade\n\nReview infrastructure risk.')

    const approved = await runCli(['--council', root, 'job', 'proposal', 'approve', proposalId, '--json'])

    assert.equal(approved.json.job.id, 'plan-infrastructure-upgrade')
    assert.equal(approved.json.proposal.status, 'approved')

    const job = await readJson(join(root, 'council', 'jobs', 'plan-infrastructure-upgrade', 'job.json'))
    assert.equal(job.status, 'queued')
    assert.equal(job.creation.source, 'proposal')
    assert.equal(job.creation.sourceProposal, proposalId)
    assert.deepEqual(job.assignedAgents, ['cto'])

    const proposal = await readJson(join(proposalDir, 'proposal.json'))
    assert.equal(proposal.status, 'approved')
    assert.equal(proposal.createdJobPath, 'council/jobs/plan-infrastructure-upgrade')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
