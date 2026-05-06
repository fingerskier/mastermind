# CLI Adapters

Status: draft MVP contract.

CLI adapters invoke local agent tools such as Claude, Codex, Gemini, or a generic command. The adapter hides provider-specific mechanics behind the agent invocation contract.

## Adapter Definition

```json
{
  "type": "cli",
  "preset": "codex",
  "workingDirectory": ".",
  "timeoutSeconds": 600,
  "input": {
    "mode": "stdin"
  },
  "output": {
    "mode": "stdout-and-files"
  },
  "environment": {
    "pass": [],
    "secrets": []
  },
  "permissions": {
    "integration": "adapter-managed"
  }
}
```

Required MVP fields:

- `type`
- `preset` for first-class providers, or `command` for `generic`
- `timeoutSeconds`

## Presets

MVP preset order:

1. `claude`
2. `codex`
3. `gemini`
4. `generic`

The generic adapter runs an explicitly configured command. It should not infer provider behavior beyond process execution, timeout, stdout, stderr, and exit code.

The implementation may also expose a deterministic `local` adapter for smoke tests and offline dogfood runs. The local adapter is a CLI child process that reads the same task packet from stdin and emits markdown, but it is not a substitute for a production provider preset.

MVP preset normalization:

| Preset | Command | Args | Input |
| --- | --- | --- | --- |
| `claude` | `claude` | `-p --output-format text --no-session-persistence` | stdin |
| `codex` | `codex` | `exec --color never -` | stdin |
| `gemini` | `gemini` | `--prompt` | prompt argument |
| `generic` | configured | configured | stdin by default |

An explicit `--adapter claude`, `--adapter codex`, or `--adapter gemini` selects the preset defaults while preserving neutral configuration such as timeout, working directory, environment, and permission settings. A configured provider adapter may override its own command or args, but provider-local files remain derived integration state.

## Execution Lifecycle

1. Resolve the council root and run directory.
2. Build and persist `input.md` from the task packet.
3. Resolve the adapter command and arguments.
4. Apply adapter-managed permission integration.
5. Start the process with the configured working directory and environment.
6. Stream stdout and stderr into `transcript.md`.
7. Collect provider output or synthesize `output.md` from stdout.
8. Return the adapter result.

When the director explicitly invokes `landsraad job run`, the MVP records the adapter process launch as an `allow-this-run` permission decision with `decisionSource: "director-command"` unless an `allow-always` grant in `.landsraad/permissions.json` matches the council root, adapter id, agent id, action kind, and normalized target. This records the action in the run and audit log without treating provider-local settings as canonical state.

## Streaming Events

Adapters should emit events that Landsraad can record in the run:

```json
{
  "timestamp": "2026-05-02T14:00:03Z",
  "kind": "stdout",
  "message": "Agent output chunk"
}
```

MVP event kinds:

- `process-started`
- `stdout`
- `stderr`
- `permission-requested`
- `permission-decided`
- `provider-managed-permission`
- `artifact-created`
- `process-exited`

## Permission Integration

Permission integration is adapter-managed. Landsraad owns canonical policy, council scoping, and audit records. The adapter may enforce permissions directly or delegate to provider-native prompts, sandbox flags, or project-local provider settings.

Provider-specific files such as `.claude/` or `.codex/` are derived integration state. They must not be treated as the canonical Landsraad permission store.

Visible provider-owned prompts or permission decisions are preserved in `transcript.md`. When Landsraad can detect them from stdout, stderr, or JSONL output, it records a `provider-managed-permission` event in both `events.jsonl` and the permission audit log.

## MVP Boundaries

- Provider-specific streaming formats may be normalized further later.
- Interactive provider prompts are acceptable when the transcript is captured.
- Machine-readable provider permission events are preferred but not required for MVP.
