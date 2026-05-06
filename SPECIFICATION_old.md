# Landsraad Specification

Landsraad is a local-first AI council chamber. It lets a human director create a council of specialized AI agents, give them shared context, assign work, review outputs, and coordinate recurring or ad hoc jobs from a single project directory.

This document turns the initial proposal into an executable product and technical specification. It is expected to evolve as implementation decisions are made.

## Proposal Review

The core proposal has a strong shape:

- The system is concrete: a council is made of agents, shared memory, and jobs.
- The storage model is inspectable: ordinary files in a project directory are the source of truth.
- The user role is clear: the human director provides goals, judgment, approvals, and real-world action.
- The market examples are useful: business operations, hedge fund research, and R&D all benefit from recurring expert workflows.

The main gaps to keep refining are:

- Agent contract: what every agent receives as input, what it must produce, and how failures are represented.
- Memory curation: how proposed shared-memory updates are reviewed, merged, and traced.
- Adapter details: how different CLI agents expose input, output, permissions, and streaming status.
- Dashboard schemas: the exact JSON objects agents can emit to request structured user input or visual display.
- Security boundaries: how external commands, secrets, and filesystem access are surfaced to the user.

## Goals

Landsraad should:

- Initialize and manage an AI council inside a normal filesystem directory.
- Instantiate a council from a shareable template that contains no private user data.
- Support multiple specialized agents with distinct personas, roles, and platform adapters.
- Store shared memory, project materials, job definitions, job outputs, and audit trails in plain text or structured files.
- Let users run ad hoc jobs and define recurring jobs.
- Provide a dashboard for monitoring council state and interacting with agents.
- Ship with prebuilt council templates for common use cases.
- Keep user data portable, reviewable, and editable without requiring Landsraad itself.

## Non-Goals

For the first implementation, Landsraad should not:

- Require a hosted backend.
- Require a database server.
- Hide important state in opaque binary formats.
- Attempt fully autonomous real-world actions without explicit user permission.
- Solve generic multi-agent research orchestration before the local council workflow works.
- Support every agent provider or model runtime immediately.

## Target Users

### Solo Operator

A founder, investor, researcher, or independent professional who wants a small council of agents to help think, plan, research, and execute.

### Small Team

A team that wants repeatable AI-assisted workflows for operations, research, reporting, strategy, or project management.

### Technical Power User

A user comfortable editing markdown, JSON, and CSV files who wants a transparent local system instead of a black-box hosted agent product.

## Core Concepts

### Director

The human user. The director creates councils, assigns projects and jobs, reviews outputs, provides feedback, approves risky actions, and handles real-world execution.

### Council

A configured group of agents, shared memory, jobs, and projects inside one directory.

### Council Template

A reusable, shareable definition of a council type.  A template defines the agent roles, personas, default adapter expectations, fundamental jobs, starter project structure, and empty memory scaffolding.

Templates must not contain user private data, operational history, business-specific facts, secrets, customer information, financial data, or other PII.  A C-Suite council template, for example, can be shared with another user so they can instantiate their own business council with the same roles and baseline jobs.

### Agent

A named council member with a role, persona, platform adapter, model/tool configuration, and optional private memory.

### Councillor

A domain or functional agent that performs council work. Councillors own job execution, domain analysis, job proposals, and memory updates related to their area of responsibility.

The Secretary is a singleton council-level agent, but it is not a councillor for ownership purposes. It bridges the director and councillors; councillors do the work.

Example agents:

- CFO
- CTO
- CMO
- Macro Strategist
- Quant Researcher
- Risk Manager
- Literature Reviewer
- Product Strategist

### Secretary

The generic council-operations agent created for every council. There is one Secretary per council. The Secretary is not a domain specialist or councillor; it keeps council process legible and acts as the communicator and translator between the director and the councillors.

The Secretary is mentally segregated from councillor work.  It operates over the entire council chamber directory, but it does not have its own `memory/` or `work/` directory and should not own durable work product.  Durable work belongs to the affected councillor, job, project, or shared memory area.

The secretary is responsible for:

- Presenting memory summaries, gaps, conflicts, and stale context to the director.
- Triage of `council/inbox` into director-facing questions and councillor handoffs.
- Summarizing job runs into briefings for the director and the affected councillors.
- Aggregating cross-agent status into council briefings.
- Detecting stale, duplicated, or conflicting memories and routing the issue to the responsible councillor.
- Presenting the director with actionable observations, questions, and recommended next steps.
- Translating director feedback into clear context for the affected councillor, job, project, or memory work.
- Routing approved handoffs to the affected councillor.
- Producing valid structured dashboard objects.

The secretary loop is: identify relevant council state, present it to the director, collect the director's input, then hand the resulting context to the affected councillor. The Secretary does not perform domain work, create formal job proposals, update memories directly, make domain decisions, silently rewrite run history, or complete jobs.

### Platform Adapter

The mechanism Landsraad uses to invoke an agent. The first implementation targets CLI agents such as Claude, Codex, Gemini, and similar local command tools. The adapter boundary should remain general enough to support API and SDK providers later.

The adapter is responsible for:
- Receiving a task packet from Landsraad.
- Running the agent with the correct persona and context.
- Returning structured status, messages, artifacts, and errors.

### Persona

The durable role definition for an agent. It should describe:
- Role and responsibilities.
- Areas of expertise.
- Decision style.
- Boundaries and things the agent should not do.
- Expected output format.
- Collaboration rules with other agents.

### Job

A unit of work assigned to one or more agents.  Jobs may be ad hoc or recurring.

Only the director creates jobs.  Councillors may propose jobs, and council templates may include preset jobs, but proposed jobs do not become active until the director approves them.  The secretary may surface a need for work and route the director's feedback to the relevant councillor, but it does not author the formal job proposal.

Examples:
- Produce a weekly financial report.
- Review new research papers.
- Analyze portfolio risk.
- Draft a hiring plan.
- Audit product roadmap assumptions.

### Project

A persistent work area with a goal, context, files, decisions, and related jobs.

### Shared Memory

Plain text and structured files available to council members.  Shared memory contains durable context that should survive across jobs and agent sessions.

### Run

A concrete execution of a job.  Each run has inputs, status, logs, outputs, artifacts, and a review trail.

## Product Principles

- Local first: the project directory should be usable and inspectable without a cloud service.
- Text first: markdown, JSON, and CSV are preferred for durable data.
- Human-agent integration: the director and agents work together, each contributing their strengths.  The director provides judgment, goals, approvals, and real-world context; agents provide focused analysis, execution, memory, and structured follow-through.
- Auditable: important decisions, tool use, and outputs should leave a trail.
- Composable: users should be able to create new councils, agents, jobs, and project templates.
- Adapter friendly: agent platforms should be replaceable without rewriting council logic.

## MVP Scope

The first useful version should include:

- `npx landsraad init` to create a council directory structure.
- A council configuration file that records the selected template.
  - Agent definitions with persona files.
  - Job definitions with run history.
- A local filesystem-backed memory model.
  - FAISS vector database with auto-syncing of changed files
- A local dashboard for viewing agents, jobs, projects, memory, and run outputs.
- A CLI command to run an ad hoc job.
- A CLI command to run a configured job.
- Initial CLI platform adapters
  - claude
  - codex
  - gemini
- Basic templates for at least one council type.

Recommended first template:
- "Business Operations Council" with a CEO, CFO, CTO, CMO, and Operations agents.

## Directory Structure

Landsraad projects are normal directories. A proposed initialized directory:

```text
.
|-- landsraad.config.json
|-- council/
|   |-- README.md
|   |-- template.json
|   |-- secretary/
|   |   |-- secretary.json
|   |   `-- persona.md
|   |-- agents/
|   |   |-- cfo/
|   |   |   |-- agent.json
|   |   |   |-- persona.md
|   |   |   |-- memory/
|   |   |   `-- work/
|   |   `-- cto/
|   |       |-- agent.json
|   |       |-- persona.md
|   |       |-- memory/
|   |       `-- work/
|   |-- jobs/
|   |   |-- _proposals/
|   |   `-- weekly-financial-report/
|   |       |-- job.json
|   |       |-- brief.md
|   |       |-- status.md
|   |       `-- runs/
|   |-- projects/
|   |   `-- example-project/
|   |       |-- brief.md
|   |       |-- decisions.md
|   |       |-- notes.md
|   |       `-- artifacts/
|   |-- memory/
|   |   |-- index.md
|   |   |-- facts.json
|   |   `-- sources/
|   `-- inbox/
`-- .landsraad/
    |-- state.json
    |-- runs/
    `-- logs/
```

### Directory Roles

`landsraad.config.json`

Project-level configuration for the council.

`council/agents`

Human-editable councillor definitions, personas, per-councillor memory, and councillor-local working files.  Councillors should prefer their own subdirectory for notes, drafts, and private working state.

`council/secretary`

Singleton Secretary definition and persona.  The Secretary has council-wide read scope and no `memory/` or `work/` directory.

`council/jobs`

Job definitions, job-specific working context, proposals, status reports, artifacts, and run history.  Each job owns its own subdirectory.

`council/projects`

Project context, notes, decisions, and artifacts.

`council/memory`

Durable shared memory available to the council.  Agents may read shared memory.  Councillors may update shared memory when the information is useful beyond their own role or job, subject to review rules.

`council/inbox`

Unprocessed notes, files, requests, or imported material.

`.landsraad`

Internal runtime state, logs, indexes, and caches.  This directory remains local to the project but should not be the only place important user-facing information exists.

## Configuration

Proposed `landsraad.config.json`:

```json
{
  "version": 1,
  "name": "Example Council",
  "description": "A local AI council for business operations.",
  "template": {
    "id": "business-operations",
    "version": 1,
    "source": "bundled"
  },
  "agentsDir": "council/agents",
  "secretaryDir": "council/secretary",
  "jobsDir": "council/jobs",
  "projectsDir": "council/projects",
  "memoryDir": "council/memory",
  "adapterDefaults": {
    "type": "cli",
    "timeoutSeconds": 600
  },
  "permissions": {
    "requireApprovalForExternalCommands": true,
    "requireApprovalForFileWritesOutsideProject": true
  }
}
```

## Council Template Definition

Proposed `council/template.json`:
```json
{
  "version": 1,
  "id": "business-operations",
  "name": "Business Operations Council",
  "description": "A C-Suite-style operating council for a business.",
  "shareable": true,
  "privacy": {
    "containsPii": false,
    "containsSecrets": false,
    "containsOperationalHistory": false
  },
  "secretary": {
    "path": "council/secretary",
    "required": true
  },
  "councillors": ["ceo", "cfo", "cto", "cmo", "operations"],
  "presetJobs": [
    "weekly-financial-report",
    "technical-progress-report",
    "marketing-performance-review"
  ],
  "secretaryRoutines": [
    "inbox-triage",
    "memory-hygiene-review",
    "weekly-council-brief",
    "job-run-summarization"
  ],
  "memoryScaffold": [
    "council/memory/index.md",
    "council/memory/facts.json",
    "council/memory/sources"
  ]
}
```

Templates define reusable structure, not live council data.  Instantiating a template copies or generates agent definitions, persona files, starter jobs, and empty memory scaffolding into the user's council root.

## Agent Definition

Proposed `agent.json`:
```json
{
  "version": 1,
  "id": "cfo",
  "name": "CFO",
  "description": "Owns financial analysis, reporting, forecasting, and budget review.",
  "persona": "persona.md",
  "memoryDir": "memory",
  "workDir": "work",
  "adapter": {
    "type": "cli",
    "command": "codex",
    "args": ["exec"]
  },
  "capabilities": [
    "financial-reporting",
    "forecasting",
    "budget-review"
  ],
  "defaultOutputFormat": "markdown"
}
```

## Job Definition

Proposed `job.json`:
```json
{
  "version": 1,
  "id": "weekly-financial-report",
  "title": "Weekly Financial Report",
  "description": "Summarize current financial status, risks, and recommended actions.",
  "type": "recurring",
  "status": "queued",
  "assignedAgents": ["cfo"],
  "schedule": {
    "type": "weekly",
    "day": "friday",
    "time": "09:00",
    "timezone": "local"
  },
  "inputs": [
    "council/memory/facts.json",
    "council/projects"
  ],
  "output": {
    "format": "markdown",
    "destination": "runs"
  },
  "review": {
    "requiresDirectorApproval": true
  },
  "creation": {
    "source": "template",
    "sourceProposal": null,
    "approvedByDirector": true,
    "approvedAt": "2026-05-02T14:00:00Z"
  }
}
```

## Job Proposals

Councillors may propose jobs by writing a proposal into `council/jobs/_proposals`. A proposal is advisory until the director approves it.

The secretary may identify that a new job is needed, explain the need to the director, and route the director's response to the relevant councillor. The formal proposal belongs to the councillor who would own or perform the work.

Proposed proposal path:

```text
council/jobs/_proposals/2026-05-02T150000Z-cto-upgrade-plan/
|-- proposal.json
|-- brief.md
`-- rationale.md
```

Proposed `proposal.json`:

```json
{
  "version": 1,
  "id": "2026-05-02T150000Z-cto-upgrade-plan",
  "proposedBy": "cto",
  "title": "Plan Infrastructure Upgrade",
  "description": "Create an actionable plan for the next infrastructure upgrade.",
  "jobType": "one-off",
  "recommendedAgents": ["cto"],
  "status": "pending-director-approval",
  "createdAt": "2026-05-02T15:00:00Z",
  "proposedJobId": "plan-infrastructure-upgrade"
}
```

### Proposal Approval Process

The job proposal process is:

1. A councillor identifies work that should become a job.
2. The councillor writes a proposal directory under `council/jobs/_proposals`.
3. The dashboard or CLI presents the proposal to the director.
4. The director approves, rejects, or requests changes.
5. On approval, Landsraad creates a real job directory under `council/jobs/<job-id>`.
6. Landsraad writes the approved `job.json`, `brief.md`, empty `status.md`, and `runs/` directory.
7. Landsraad marks the proposal as approved and records the created job path.
8. Landsraad queues the job to run.

Approved proposal output:

```text
council/jobs/plan-infrastructure-upgrade/
|-- job.json
|-- brief.md
|-- status.md
`-- runs/
```

The created `job.json` should preserve provenance:

```json
{
  "version": 1,
  "id": "plan-infrastructure-upgrade",
  "title": "Plan Infrastructure Upgrade",
  "description": "Create an actionable plan for the next infrastructure upgrade.",
  "type": "one-off",
  "status": "queued",
  "assignedAgents": ["cto"],
  "inputs": [
    "council/agents/cto/memory",
    "council/projects"
  ],
  "output": {
    "format": "markdown",
    "destination": "runs"
  },
  "review": {
    "requiresDirectorApproval": true
  },
  "creation": {
    "source": "proposal",
    "sourceProposal": "council/jobs/_proposals/2026-05-02T150000Z-cto-upgrade-plan",
    "proposedBy": "cto",
    "approvedByDirector": true,
    "approvedAt": "2026-05-02T15:10:00Z"
  }
}
```

After approval, the original proposal should not be deleted. Its `proposal.json` should be updated to `approved`, `rejected`, or `changes-requested` so the audit trail remains intact.

## Job Lifecycle

Jobs move through these states:

- `proposed`: a councillor has suggested a job that is not yet active.
- `draft`: job exists but is not ready to run.
- `queued`: job is ready and waiting for execution.
- `running`: an agent adapter is executing the job.
- `blocked`: the job needs director input or approval.
- `review`: output is ready for human review.
- `done`: output has been accepted or archived.
- `failed`: execution ended with an error.
- `canceled`: execution was intentionally stopped.

Each run should create a run directory:

```text
council/jobs/weekly-financial-report/runs/2026-05-02T140000Z/
|-- run.json
|-- input.md
|-- transcript.md
|-- output.md
|-- review.md
`-- artifacts/
```

Proposed `run.json`:

```json
{
  "version": 1,
  "runId": "2026-05-02T140000Z",
  "jobId": "weekly-financial-report",
  "status": "review",
  "assignedAgents": ["cfo"],
  "startedAt": "2026-05-02T14:00:00Z",
  "finishedAt": "2026-05-02T14:04:33Z",
  "inputs": ["input.md"],
  "outputs": ["output.md"],
  "artifacts": [],
  "errors": []
}
```

## Orchestration Rules

The director is the only actor that can create active jobs. Councillors can recommend new jobs, revise job briefs, or request follow-up work, but those recommendations remain proposals until the director approves them.

The secretary is the standard coordinator for cross-cutting handoffs. It can identify an issue, summarize the tradeoffs, ask the director for input, and route the director's response to the affected councillor. This is communication and delegation support, not authority to create active jobs, author job proposals, update memories, or make domain decisions.

Council templates can include preset jobs. During `init`, preset jobs are copied into `council/jobs` as director-approved starter jobs because the director selected the template.

Jobs may be:

- `one-off`: created for a specific task, project, or decision.
- `recurring`: intended to be run on a cadence, either manually, by Landsraad scheduling, or by an external scheduler calling the CLI.

Councillors should write work in this order of preference:

- Their own agent subdirectory for private notes, drafts, and role-specific working memory.
- The relevant job subdirectory for job progress, reports, outputs, artifacts, and proposals.
- The relevant project subdirectory for project-level decisions, notes, and artifacts.
- Shared memory only when the information is durable and useful to the broader council.

For example, the CTO may do technical planning in `council/agents/cto/work`, then report progress in `council/jobs/technical-progress-report/status.md` or a run output under that job's `runs` directory. If the work establishes a durable technical fact, the CTO may propose or write an update to `council/memory`.

## Adapter Strategy

The first adapter family is CLI-based. Landsraad should be able to invoke local agent tools such as Claude, Codex, Gemini, or other command-line systems.

The CLI adapter should abstract:

- Executable command and arguments.
- Working directory.
- Environment variables and secret names.
- Input delivery mode, such as stdin, prompt file, or argument.
- Output capture mode, such as stdout, transcript file, or structured result file.
- Timeout, cancellation, and exit-code handling.
- Whether the agent can write files directly or must return proposed changes.

The adapter contract should not assume a specific CLI tool. SDK and API adapters can later implement the same task-packet and result contract without changing council, job, memory, or dashboard logic.

## Agent Invocation Contract

Before invoking an agent, Landsraad builds a task packet containing:

- Council name and description.
- Director request.
- Agent persona.
- Job brief.
- Target write locations.
- Relevant shared memory.
- Relevant project files.
- Expected output format.
- Allowed actions and permission boundaries.

The adapter should return:

- Final status.
- Assistant messages or transcript.
- Primary output.
- Artifact paths.
- Structured UI requests or display data.
- Requested follow-up actions.
- Councillor-proposed memory updates.
- Councillor-proposed jobs.
- Errors or warnings.

Secretary invocations should return briefings, handoff instructions, structured UI objects, and routing recommendations rather than formal job proposals or memory updates.

The contract should be stable enough that CLI, API, SDK, and local-model adapters can share the same orchestration layer.

## Dashboard

The dashboard should be local and project-scoped. Each major view should provide a text overview and a chat interface for interacting with the director, council, job, project, or agent currently in focus.

MVP dashboard views:

- Council overview: active agents, active jobs, recent runs, blocked items.
- Agents: persona, status, memory, capabilities, recent work.
- Jobs: definitions, schedules, run history, current status.
- Projects: briefs, notes, decisions, related jobs, artifacts.
- Memory: shared memory index, facts, sources, inbox items.
- Run detail: input packet, transcript, output, artifacts, review controls.

MVP dashboard actions:

- Create an ad hoc job.
- Run a configured job.
- Review and accept or reject a run output.
- Add director feedback.
- Open relevant files.
- Mark inbox items as processed.

### Structured Dashboard Objects

Agents may return structured JSON objects that the dashboard can render as UI. This lets agents ask for precise user input or present structured data without requiring a custom UI implementation for every job.

The dashboard should initially support:

- Forms for collecting specific user input.
- Tables for structured records.
- Charts for time series, category comparisons, and simple numeric summaries.
- Status cards for job, agent, or project state.

Proposed form object:

```json
{
  "type": "form",
  "id": "campaign-budget-window",
  "title": "Campaign Budget Window",
  "submitLabel": "Save",
  "fields": [
    {
      "id": "startTime",
      "label": "Start time",
      "kind": "datetime",
      "required": true
    },
    {
      "id": "endTime",
      "label": "End time",
      "kind": "datetime",
      "required": true
    },
    {
      "id": "budget",
      "label": "Budget",
      "kind": "currency",
      "currency": "USD",
      "required": true
    }
  ]
}
```

Proposed chart object:

```json
{
  "type": "chart",
  "id": "monthly-burn",
  "title": "Monthly Burn",
  "chartType": "line",
  "x": "month",
  "y": "burn",
  "data": [
    { "month": "2026-01", "burn": 42000 },
    { "month": "2026-02", "burn": 39000 }
  ]
}
```

Agents should be taught this dashboard object format as a reusable skill. The dashboard should validate structured objects before rendering them and fall back to a readable JSON/code view when an object is invalid or unsupported.

## CLI

Proposed commands:

```text
npx landsraad init
npx landsraad init --template business-operations
npx landsraad dashboard
npx landsraad agent list
npx landsraad job list
npx landsraad job run <job-id>
npx landsraad job create
npx landsraad job proposal list
npx landsraad job proposal approve <proposal-id>
npx landsraad job proposal reject <proposal-id>
npx landsraad run status <run-id>
npx landsraad memory add <path>
```

Command behavior should be conservative:

- Commands should operate on the current directory by default.
- Commands should fail clearly when not run inside a Landsraad project.
- Commands should not overwrite user files without confirmation.
- Commands should print paths to created files.
- `job proposal approve <proposal-id>` should create the approved job directory, write the job files, update the proposal status, and queue the job.

## Memory Model

Landsraad should use simple rules:

- Shared memory is for durable context any agent may read and any councillor may update when appropriate.
- Project memory is for context tied to a specific project.
- Agent memory is for role-specific preferences, working assumptions, and recurring observations.
- Job memory is for task-specific context, status, reports, and artifacts.
- Run history is for completed work and should not be silently rewritten.
- Inbox is for unprocessed material that may later be moved into memory, projects, or jobs.

Councillors should prefer local writes before broader writes. A councillor's own directory is the default scratchpad and role memory. A job directory is the default place for work performed under that job. Shared memory is for information that should become council-wide knowledge.

The secretary has special responsibility for making memory hygiene visible, but not authority over truth. It may summarize memory state, flag gaps or conflicts, and route memory work to the affected councillor. Councillors author memory updates; director approval is required for high-impact or ambiguous changes.

Important information should be promoted from transcripts into memory or decisions by an explicit user or councillor action. Raw transcripts alone should not be treated as curated truth. When a councillor is uncertain whether a shared-memory write is appropriate, it should create a proposed memory update for director review.

## Security and Permissions

Landsraad should assume agents may be powerful but fallible.

All council memories and operational data live under a single root directory selected by the user. The user is responsible for where that root lives, how it is backed up, and how it is shared. For example, a user may place a business council in a dedicated Dropbox folder and manage access through Dropbox.

MVP permission rules:

- Secrets should come from environment variables or local ignored files, not committed config.
- External commands should be allowlisted by adapter configuration.
- File writes outside the project directory should require explicit approval.
- Network access should be adapter-specific and visible in configuration.
- Destructive actions should require explicit director approval.
- Every run should record what agent ran, what inputs it saw, what output it produced, and any requested actions.
- Shareable templates must exclude PII, secrets, live memory, run history, and business-specific operating data.

## Templates

Templates should scaffold agents, jobs, memory files, and starter project structure. They are intended to be shared across users and organizations without exposing the creator's private data.

Initial templates to consider:

- Business Operations Council
- Hedge Fund Research Council
- R&D Council
- Product Strategy Council

Each template should include:

- Council description.
- Secretary agent.
- Agent list.
- Persona files.
- Preset one-off or recurring jobs.
- Empty starter memory index.
- Example project.

Every template should include the `secretary` agent unless the user explicitly removes it after initialization. Domain-specific templates should add specialized agents around the secretary rather than replacing it.

Recommended secretary starter jobs:

- `inbox-triage`
- `memory-hygiene-review`
- `weekly-council-brief`
- `job-run-summarization`
- `stale-context-review`

Each template must exclude:

- PII.
- Secrets or credentials.
- Live customer, employee, vendor, or investor data.
- Run transcripts and outputs from a real council.
- Private operating history or business facts.

## Implementation Direction

Recommended initial implementation:

- Node.js and TypeScript for the CLI.
- A local web dashboard started by the CLI.
- Filesystem storage as the primary persistence layer.
- JSON schemas for config, agents, jobs, and runs.
- JSON schemas for dashboard-renderable structured objects.
- Markdown for personas, briefs, notes, memory, outputs, and reviews.
- CLI adapter presets for common local agent tools.

Open framework decision:

- Express plus React gives direct control and familiar packaging.
- SvelteKit gives a compact full-stack app model but may add packaging complexity for `npx landsraad`.

The framework choice should be made after deciding how the dashboard will be bundled and launched from the CLI.

## Acceptance Criteria for First Release

A first release is usable when:

- A user can run `npx landsraad init` in an empty directory and select a council template.
- The command creates a valid council structure without overwriting files.
- The created council records its source template and contains no template-supplied private data.
- The created council includes a `secretary` agent by default.
- The user can inspect and edit council files manually.
- The user can define at least one agent and one job.
- The user can run a job from the CLI.
- A run creates a durable run directory with input, transcript, output, and status metadata.
- The dashboard shows agents, jobs, runs, and outputs.
- The dashboard provides text overviews and chat interfaces for council, agent, job, and project views.
- The dashboard can render at least one structured form object returned by an agent.
- The user can review an output and record feedback.
- The user can approve or reject a councillor-proposed job.
- Approving a job proposal creates the job file structure and queues the job to run.
- The project remains portable as plain files.

## Open Questions

- Which CLI tools should receive first-class adapter presets first: Claude, Codex, Gemini, or a generic command adapter only?
- Should recurring jobs be scheduled by Landsraad itself, or should the first version only expose commands that external schedulers can call?
- How should conflicting memory updates be reviewed and merged?
- Should `.landsraad` be committed to version control, ignored by default, or split into committed and ignored subdirectories?
- Which structured dashboard objects should be MVP besides forms: tables, charts, or status cards?
- What is the minimum useful allowlist model for CLI agent tool use?
- Should templates be bundled with the package only, or should a registry come later?
- Should the council support multiple human users, or remain single-director for the first release?

## Future Work

Potential later capabilities:

- Multi-agent deliberation sessions.
- Agent-to-agent critique workflows.
- Scheduled recurring jobs.
- Advanced memory curation workflows.
- Source ingestion from docs, email, chat, financial data, or research databases.
- Template marketplace.
- Provider-specific adapters.
- Cloud sync or hosted dashboard.
- Team collaboration and access control.
- Evaluation harnesses for agent output quality.
