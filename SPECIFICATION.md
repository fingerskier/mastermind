# Landsraad — Specification

Status: v0 (first pass after restart). High-level only. Implementation details live in `docs/` and in code.

## What it is

Landsraad is a local-first, single-directory **council chamber** for AI agents. A council is a group of agents working with a human director (you). The app is an `npx`-launchable Node.js + TypeScript application (SvelteKit) that lets the director create councils, configure councillors, and — eventually — invoke each councillor through a CLI or SDK adapter.

This v0 spec covers only the **council and councillor management surface**. Agent invocation, jobs, projects, memory, scheduling, and retrieval are deliberately out of scope here; they will be designed in follow-up specs once the management surface is solid.

## Non-goals (for v0)

- No agent execution / job runner / scheduler.
- No shared memory or retrieval index.
- No "Secretary" singleton agent. The director **is** the secretary — Landsraad is a tool the director drives, not an autonomous front-desk.
- No multi-user, no auth, no remote hosting. One operator, one machine.
- No provider-specific SDK code yet. Adapters are a future concept.

## Target Users

### Solo Operator

A founder, investor, researcher, or independent professional who wants a small council of agents to help think, plan, research, and execute.

### Small Team

A team that wants repeatable AI-assisted workflows for operations, research, reporting, strategy, or project management, with one designated director and file sharing handled outside Landsraad.

### Technical Power User

A user comfortable editing markdown, JSON, and CSV files who wants a transparent local system instead of a black-box hosted agent product.

## Core Concepts

### Director

The human user. The director creates councils, configures councillors, reviews outputs, provides feedback, approves risky actions, and handles real-world execution. The director also performs all coordination work — there is no secretary agent in v0.

### Council

A configured group of councillors plus the per-council state that supports them. Each council lives in its own directory on disk; the director can have many councils.

### Council Template

A reusable, shareable definition of a council type — agent roles, personas, default adapter expectations, and starter scaffolding. Templates must never contain user private data, operational history, business-specific facts, secrets, customer information, financial data, or other PII. (Templates are forward-looking; v0 ships a couple of built-in starters.)

### Councillor

A named council member with a role, persona, and (eventually) a platform adapter and model/tool configuration. Councillors own domain work in their area of responsibility.

Example councillors:

- CFO
- CTO
- CMO
- Macro Strategist
- Quant Researcher
- Risk Manager
- Literature Reviewer
- Product Strategist

### Agent adapter (forward-looking)

The bridge between a councillor's persona and an actual model invocation. In v0 there is no execution; the adapter slot on a councillor is configuration-only and will later be wired to either:

- a **CLI wrapper** (e.g. `claude`, `codex`, `gemini` invoked as a subprocess), or
- an **SDK wrapper** (direct API calls via the relevant provider SDK).

The spec for adapters is deferred. v0 only stores the intended adapter name as free-form metadata.

## v0 Functionality

The first pass ships exactly this:

1. **Launch the app.** From any directory: `npx landsraad` (eventually). For dev: `npm run dev` from the repo. The app opens a local web UI at `http://127.0.0.1:5173` (dev) or a chosen port in production.
2. **List councils.** Home page lists every council the director has created, with a "New council" action.
3. **Create a council.** Form: name, short description, optional template choice. On submit, a council directory is created on disk under a configured root.
4. **Open a council.** Council page shows: name, description, list of councillors, and actions to add/edit/remove councillors.
5. **Create a councillor.** Form: name, role (free text), persona (markdown), intended adapter (free text — `cli:claude`, `sdk:anthropic`, etc.).
6. **Edit a councillor.** Same form, pre-filled.
7. **Remove a councillor.** Confirm + delete.
8. **Delete a council.** Confirm + delete the entire council directory.

That is the entire v0 surface. No execution, no scheduling, no memory.

## Storage Model

All state lives on the filesystem. The director chooses a councils root (default: `~/.landsraad/councils/`); each council is a subdirectory.

```
<councils-root>/
  <council-slug>/
    council.json                    # name, description, template, created_at
    councillors/
      <councillor-slug>/
        councillor.json             # name, role, adapter, created_at
        persona.md                  # markdown persona
```

JSON files are the source of truth for structured fields; markdown files are the source of truth for prose. Filenames are slug-derived from display names.

The app never writes secrets to disk. It also never writes outside `<councils-root>`.

## UI Surfaces (v0)

| Route | Purpose |
|---|---|
| `/` | Council list + "New council" |
| `/councils/new` | Create council form |
| `/councils/[slug]` | Council detail: metadata + councillor list |
| `/councils/[slug]/edit` | Edit council metadata |
| `/councils/[slug]/councillors/new` | Add councillor |
| `/councils/[slug]/councillors/[c-slug]` | View councillor |
| `/councils/[slug]/councillors/[c-slug]/edit` | Edit councillor |

No global navigation beyond a header link back to `/`.

## Out of Scope (will be specified later)

- Agent adapters (CLI + SDK wrappers)
- Jobs, runs, transcripts
- Projects
- Shared memory + retrieval index
- Scheduler
- Permissions / audit log
- Templates marketplace, multi-user, auth

## Open Questions

- Where should councils default to? (`~/.landsraad/councils/` vs. a per-cwd `.landsraad/`)
- Should councillor personas be markdown only, or also support structured fields (style, tone, constraints) up front?
- How should the eventual adapter contract look — one process per invocation, or a long-running adapter daemon?

These are flagged here so they aren't lost; v0 ships with defaults and we revisit when adapters land.
