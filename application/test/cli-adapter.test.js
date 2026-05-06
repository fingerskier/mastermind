import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { resolveAdapter, runCliAdapter } from '../src/adapters/cli.js'

async function makeTempRoot(prefix = 'landsraad-adapter-') {
  return mkdtemp(join(tmpdir(), prefix))
}

async function makeScript(root, name, source) {
  const scriptPath = join(root, name)
  await writeFile(scriptPath, source)
  return scriptPath
}

function baseRunArgs(root, adapter, permissionEvents = []) {
  return {
    councilRoot: root,
    runId: '2026-05-03T120000Z',
    jobId: 'adapter-test',
    agent: { id: 'engineering', name: 'Engineering' },
    adapter,
    prompt: '# Test Prompt\n\nReturn a short smoke response.',
    transcriptPath: join(root, 'transcript.md'),
    events: [],
    permissionEvents,
  }
}

test('resolveAdapter normalizes first-class provider presets', () => {
  const codex = resolveAdapter({ preset: 'codex' })
  assert.equal(codex.command, 'codex')
  assert.deepEqual(codex.args, ['exec', '--color', 'never', '-'])
  assert.equal(codex.input.mode, 'stdin')
  assert.equal(codex.workingDirectory, '.')
  assert.equal(codex.output.mode, 'stdout-and-files')

  const claude = resolveAdapter(
    { preset: 'codex', command: 'custom-codex', args: ['custom'], timeoutSeconds: 45 },
    { override: 'claude' },
  )
  assert.equal(claude.preset, 'claude')
  assert.equal(claude.command, 'claude')
  assert.deepEqual(claude.args, ['-p', '--output-format', 'text', '--no-session-persistence'])
  assert.equal(claude.timeoutSeconds, 45)

  const gemini = resolveAdapter({ preset: 'gemini' })
  assert.equal(gemini.command, 'gemini')
  assert.deepEqual(gemini.args, ['--prompt'])
  assert.equal(gemini.input.mode, 'argument')
})

test('resolveAdapter keeps a generic command adapter for unsupported CLIs', () => {
  const adapter = resolveAdapter({
    preset: 'generic',
    command: 'custom-agent',
    args: ['run'],
    workingDirectory: 'council',
    timeoutSeconds: 12,
  })

  assert.equal(adapter.preset, 'generic')
  assert.equal(adapter.command, 'custom-agent')
  assert.deepEqual(adapter.args, ['run'])
  assert.equal(adapter.workingDirectory, 'council')
  assert.equal(adapter.timeoutSeconds, 12)

  assert.throws(() => resolveAdapter({ preset: 'generic' }), /requires a command/)
})

test('runCliAdapter returns adapter-not-found for missing executables', async () => {
  const root = await makeTempRoot()
  try {
    const permissionEvents = []
    const args = baseRunArgs(
      root,
      resolveAdapter({
        preset: 'generic',
        command: 'landsraad-missing-adapter-command-for-test',
        timeoutSeconds: 1,
      }),
      permissionEvents,
    )

    const result = await runCliAdapter(args)

    assert.equal(result.status, 'failed')
    assert.equal(result.errors[0].code, 'adapter-not-found')
    assert.equal(permissionEvents[0].decision, 'allow-this-run')
    assert.match(await readFile(args.transcriptPath, 'utf8'), /process-started/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runCliAdapter maps provider authentication failures to provider-auth-failed', async () => {
  const root = await makeTempRoot()
  try {
    const script = await makeScript(
      root,
      'auth-failed.mjs',
      "process.stderr.write('Authentication required. Please run codex login.\\n'); process.exit(1);\n",
    )
    const args = baseRunArgs(root, {
      type: 'cli',
      preset: 'codex',
      command: process.execPath,
      args: [script],
      timeoutSeconds: 5,
      input: { mode: 'stdin' },
      output: { mode: 'stdout-and-files' },
    })

    const result = await runCliAdapter(args)

    assert.equal(result.status, 'failed')
    assert.equal(result.errors[0].code, 'provider-auth-failed')
    assert.match(result.stderr, /Authentication required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runCliAdapter uses Landsraad grants as canonical launch permission state', async () => {
  const root = await makeTempRoot()
  try {
    await mkdir(join(root, '.landsraad'), { recursive: true })
    const script = await makeScript(root, 'granted.mjs', "process.stdout.write('grant matched\\n');\n")
    const adapter = {
      type: 'cli',
      preset: 'generic',
      command: process.execPath,
      args: [script],
      timeoutSeconds: 5,
      input: { mode: 'stdin' },
      output: { mode: 'stdout-and-files' },
    }
    await writeFile(
      join(root, '.landsraad', 'permissions.json'),
      JSON.stringify(
        {
          version: 1,
          grants: [
            {
              id: 'grant-test',
              councilRoot: root,
              adapterId: 'generic',
              agentId: 'engineering',
              actionKind: 'external-command',
              normalizedTarget: [process.execPath, script].join(' '),
              decision: 'allow-always',
              reason: 'Fixture grant for adapter launch.',
            },
          ],
        },
        null,
        2,
      ),
    )

    const permissionEvents = []
    const args = baseRunArgs(root, adapter, permissionEvents)
    const result = await runCliAdapter(args)

    assert.equal(result.status, 'succeeded')
    assert.equal(permissionEvents[0].decision, 'allow-always')
    assert.equal(permissionEvents[0].decisionSource, 'landsraad-grant')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runCliAdapter records visible provider-managed permission events', async () => {
  const root = await makeTempRoot()
  try {
    const script = await makeScript(
      root,
      'provider-permission.mjs',
      [
        "process.stdout.write('Provider permission request: allow Bash(npm test)?\\n');",
        "process.stdout.write('Provider permission approved for this run.\\n');",
      ].join('\n'),
    )
    const permissionEvents = []
    const args = baseRunArgs(
      root,
      {
        type: 'cli',
        preset: 'claude',
        command: process.execPath,
        args: [script],
        timeoutSeconds: 5,
        input: { mode: 'stdin' },
        output: { mode: 'stdout-and-files' },
      },
      permissionEvents,
    )

    const result = await runCliAdapter(args)

    assert.equal(result.status, 'succeeded')
    assert.equal(permissionEvents[1].actionKind, 'provider-managed-permission')
    assert.equal(permissionEvents[1].decisionSource, 'provider-managed')
    assert.ok(args.events.some((event) => event.kind === 'provider-managed-permission'))
    assert.match(await readFile(args.transcriptPath, 'utf8'), /Provider permission request/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runCliAdapter does not treat normal permission analysis text as a provider prompt', async () => {
  const root = await makeTempRoot()
  try {
    const script = await makeScript(
      root,
      'permission-analysis.mjs',
      [
        "process.stdout.write('- Permission audit records should show preset resolution.\\n');",
        "process.stdout.write('The configured permissions.requiresApprovalFor list is understandable.\\n');",
        "process.stdout.write(JSON.stringify({ kind: 'stderr', message: 'Permission audit records are normal output.' }) + '\\n');",
      ].join('\n'),
    )
    const permissionEvents = []
    const args = baseRunArgs(
      root,
      {
        type: 'cli',
        preset: 'codex',
        command: process.execPath,
        args: [script],
        timeoutSeconds: 5,
        input: { mode: 'stdin' },
        output: { mode: 'stdout-and-files' },
      },
      permissionEvents,
    )

    const result = await runCliAdapter(args)

    assert.equal(result.status, 'succeeded')
    assert.equal(permissionEvents.length, 1)
    assert.equal(permissionEvents[0].actionKind, 'external-command')
    assert.ok(!args.events.some((event) => event.kind === 'provider-managed-permission'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
