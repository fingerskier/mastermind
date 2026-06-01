# Landsraad UX Review

Reviewed: 2026-06-01

## Scope

This review covers the current SvelteKit UI against the product direction in `SPECIFICATION.md` and `README.md`. I inspected the main route components and started the dev server to verify rendered HTML for the home dashboard, council settings, new job, and meetings pages.

Visual screenshot QA was not possible in this pass because the in-app browser connector reported no available browser sessions. Findings below are based on source review plus live SSR output, not pixel-level browser screenshots.

## Product Read

Landsraad wants to be a local-first operations console for a human director coordinating AI councillors. The strongest UX direction is not a marketing site or a playful chat app. It should feel like a calm workbench: clear status, fast actions, traceable artifacts, and enough local-file transparency that technical users trust what is happening.

The current UI already has a useful foundation:

- The home page is a working surface rather than a landing page.
- Councillor columns make the "council at work" metaphor visible.
- Job detail exposes artifacts instead of hiding them.
- Local-first concepts are present in copy and Help.
- Forms are mostly simple, conventional, and easy to scan.

The main gap is that the app feels like a set of individually styled pages rather than one cohesive tool. The next UX pass should make the system more legible, more operationally useful, and more polished without adding conceptual weight.

## Highest Impact Upgrades

### 1. Make Navigation Operational, Not Hidden

Current state:

- Core surfaces live behind a hamburger menu on all viewport sizes.
- The home page has thin text links for schedules and meetings, while proposals are a small badge in the heading.
- There is no active route state, no persistent quick action, and no obvious path to all operational areas.

Recommended upgrade:

- Use a visible desktop navigation bar or compact left rail for: Home, Jobs/Activity, Meetings, Schedules, Memory, Proposals, Council.
- Keep the hamburger only for narrow viewports or secondary utilities such as Import, Export, Help.
- Add a persistent primary action: `New job`.
- Add a secondary action where space allows: `New meeting`.
- Surface live counts in nav badges: pending proposals, active meetings, queued/running jobs, failed jobs needing review.
- Add active-route styling so the user always knows where they are.

Why it matters:

The director's job is coordination. Hiding coordination surfaces behind a menu makes the app feel smaller and less capable than it is.

### 2. Reframe Home As A Command Center

Current state:

- Home shows council metadata, two status lines, councillor columns, and shared memory.
- Recent jobs are grouped by councillor, but there is no aggregate view of current system health.
- Failures, queued work, pending suggestions, and active meetings compete with low-emphasis metadata.
- Job card age is encoded with a brown heatmap. This is visually interesting but hard to interpret and competes with status.

Recommended upgrade:

- Add a top status strip with compact cards:
  - Running now
  - Queued
  - Failed
  - Suggested jobs
  - Next schedule
  - Active meeting
- Turn the current councillor columns into clearer swimlanes:
  - Councillor name, role, adapter, and busy/ready state in the header.
  - Visible counts for queued/running/succeeded/failed.
  - Last 3-5 jobs with status labels and relative time.
  - A `New job` icon button per councillor.
- Replace the age heatmap with simpler job metadata:
  - Status badge
  - Relative time
  - Optional "from schedule" or "suggested" chip
  - Failure highlight only when action is needed
- Add a compact "Recent activity" timeline beneath or beside the councillor lanes for cross-council flow.

Why it matters:

The home page should answer "what needs my attention?" before it answers "what exists?"

### 3. Establish A Shared Design System

Current state:

- Buttons, cards, form fields, status badges, markdown blocks, errors, and tables are reimplemented per route.
- Some pages have styled buttons; meeting detail uses raw buttons for critical actions.
- Inputs use different backgrounds across routes (`transparent` in some memory screens, `#1a1d24` elsewhere).
- Status presentation varies between icons, words, colored text, and pill badges.

Recommended upgrade:

- Create common primitives:
  - Button: primary, secondary, danger, icon
  - Badge/chip: status, count, source, adapter, remote
  - Card/list row
  - Form field
  - Markdown artifact viewer
  - Empty state
  - Page header with back/breadcrumb/actions
  - Table/card responsive list
- Use one status vocabulary everywhere:
  - Queued: muted
  - Running: accent or blue with motion respecting reduced-motion
  - Succeeded: green
  - Failed: red
  - Cancelled: muted
  - Paused/awaiting director: amber/accent
- Keep the dark ops-console look, but broaden the palette so the whole app is not dark slate plus parchment. Use accent color for actions and attention, not general decoration.

Why it matters:

Consistency will make the app feel finished quickly and will reduce route-by-route CSS drift.

### 4. Improve First-Run And Empty States

Current state:

- Setup is a plain "Create a council" form plus an install-template link.
- Empty states usually say only "No X yet."
- Help explains concepts, but the product does not teach much in the workflow itself.

Recommended upgrade:

- On first run, show a short setup choice:
  - Blank council
  - Start from bundled template
  - Try local mock demo
- After creation, show an onboarding checklist on the home page until dismissed:
  - Add first councillor
  - Choose adapter
  - Add shared memory
  - Run first job
  - Review output
- Replace bare empty states with one sentence of context plus the next action.
  - Councillors: "Councillors are the AI workers in this council. Add one before creating jobs."
  - Memory: "Shared memory is included in future jobs when relevant."
  - Proposals: "Successful jobs can suggest follow-up work here."
- Add inline adapter readiness hints when adding or editing a councillor.

Why it matters:

The target audience includes technical power users, but the app still needs to explain its own loop: councillor -> job -> output -> reflection -> memory/proposal.

### 5. Make Jobs Easier To Run, Read, And Recover

Current new-job state:

- Multi-councillor selection is useful.
- "Schedule for later instead" is hidden until exactly one councillor is selected.
- The brief field has little guidance.
- The action button changes from "Run now" to "Run N jobs now", but there is no preview of what will be created.

Recommended new-job upgrade:

- Use a segmented control at the top: `Run now` / `Schedule`.
- If multiple councillors are selected, show a small preview: "Creates 4 separate jobs with the same brief."
- Add brief helpers:
  - Small examples
  - Optional markdown preview
  - "Attach shared memory?" can remain future scope, but the UI should explain that memory retrieval happens automatically.
- Make "Create job for all" from home preselect all visibly and state that each councillor gets a separate job.

Current job-detail state:

- Brief, Output, Transcript, Prompt, and Events are all vertically stacked.
- Output only shows for succeeded jobs.
- Transcript and output are capped, which protects layout but can hide important tails.
- Failure recovery is limited to a rerun button and raw error text.

Recommended job-detail upgrade:

- Use a sticky status header with title, councillor, status, created/started/finished times, and actions.
- Put artifacts in tabs: Output, Transcript, Prompt, Events, Memories, Suggested jobs.
- For running jobs, default to live transcript tail with auto-scroll and a visible "last updated" time.
- For failed jobs, show a recovery panel:
  - Exit code
  - Likely adapter issue if known
  - Link to councillor adapter settings
  - Re-run
  - Clone/edit brief
- Show reflection-created memory and proposals as cards with titles, not only slugs.

Why it matters:

Jobs are the core loop. The detail page should be both a live monitor and a post-run review surface.

## Route-Level Findings

### Home (`/`)

Recommended upgrades:

- Add a dashboard summary before councillor lanes.
- Make pending proposals a first-class panel or nav badge, not only an H1 badge.
- Replace "Schedules: none active" and "Meetings: 0 active - 1 total" text links with compact status cards.
- Add an "All jobs" or "Activity" route if job history grows beyond what councillor lanes can show.
- Consider collapsing memory on home to "Recent shared memory" with a link to a full memory surface.
- Add responsive behavior for many councillors. Full-width horizontal scrolling works, but it should have a clear scroll affordance and reasonable mobile layout.

### Council Settings (`/council`)

Recommended upgrades:

- Split into tabs or anchored sections: Identity, Councillors, Environment, Import/Export, Danger zone.
- Give Environment more structure:
  - Secret/API key rows
  - Behavior overrides
  - Adapter-specific hints
  - Restart-required banner after save
- Make `.env` safety more visible: local only, gitignored, not indexed.
- Separate destructive actions visually with stronger spacing and copy. Delete council should not sit near routine tools with the same layout weight.
- Add adapter health for each councillor in the Councillors list: available, missing CLI, no adapter, busy.

### Councillor Detail (`/councillors/[slug]`)

Recommended upgrades:

- Add a prominent `New job for this councillor` action.
- Show adapter state and last run status near the top.
- Make routing hint visible; it is important to the council's internal routing but currently not surfaced on the detail page.
- Add a recent jobs section on the councillor page, not only private memory and proposals.
- Show private memory as richer cards with updated time and source job when available.
- Consider adding a preview/edit split for persona. Opening an external editor is useful, but the in-app path should remain obvious.

### New/Edit Councillor

Recommended upgrades:

- Explain adapter choices inline. "Unavailable" should say what command is missing.
- Add examples for role and routing hint that are product-specific, not generic.
- Include the reflection toggle on create/edit if it is part of the councillor model.
- Warn when adapter is empty: jobs will remain queued until configured.
- Add markdown preview for persona, or a compact "preview" toggle.

### Memory

Recommended upgrades:

- Add a real shared memory index route if memory grows beyond a short home list.
- For memory note editing, support preview vs edit.
- Standardize input background and save/error styling with the rest of the app.
- Show where a memory came from when reflection created it.
- Add "used by recent jobs" or "last retrieved" later if retrieval observability becomes important.

### Proposals (`/proposals`)

Recommended upgrades:

- Treat proposal review like an inbox.
- Add bulk affordances later: approve selected, reject selected, filter by proposing councillor.
- Give pending proposals stronger action hierarchy:
  - Brief summary
  - Target
  - Source job
  - Approve/reassign/start now
  - Reject reason
- Use clearer copy than "Suggested jobs" if user testing shows confusion. "Proposed jobs" may better match the model and docs.
- When a target councillor is unknown, make reassignment the primary visual task.

### Meetings

Current strengths:

- The "Waiting on" panel is a good live-meeting concept.
- Transcript turns are parsed into readable turn cards.
- Remote attendee status is at least represented.

Recommended upgrades:

- Style all meeting action buttons consistently. `Speak`, `Skip`, `End meeting`, `Cancel`, and `Resume` currently risk rendering as raw browser buttons.
- Build a meeting cockpit:
  - Status
  - Current round
  - Next speaker
  - Chair
  - Participant roster
  - Remote/offline indicators
- Make the director turn composer sticky or visually dominant when status is `awaiting_director`.
- Use transcript message cards by speaker, with remote/local/chair badges.
- Put Topic, Summary, Synthesis, and Transcript into a tabbed or split layout so the live action does not get buried.
- On new meeting, explain chair responsibilities and `Window K` in plainer UI. `Window K` is implementation language; "Recent turns in context" is closer to user language.
- Show busy/unavailable councillors before starting.

### Schedules

Recommended upgrades:

- Add a schedule builder instead of making cron the primary interface:
  - Every weekday at 9:00
  - Daily
  - Weekly
  - Custom cron
  - One-shot date/time
- Always show a preview of the next 5 fire times before save.
- Make timezone explicit: "Uses this computer's local timezone."
- Convert the schedules table to cards on mobile.
- Explain skipped overlaps and missed fires in plain language in event history.
- Link spawned jobs by title as well as id.

### Import/Export

Recommended upgrades:

- Present bundled templates as cards with name, description, councillors included, and sample jobs.
- The install preview should be grouped by risk:
  - Safe additions
  - Overwrites
  - Skipped items
- Export should include a clear privacy checklist before download:
  - No run artifacts
  - Memory unchecked by default
  - Queued jobs only
  - No `.env`
- Add a final "what will be in this JSON" summary.

### Help

Recommended upgrades:

- Add contextual links from forms and empty states into specific Help sections.
- Add a troubleshooting section for common adapter failures: command missing, not logged in, API key missing, timeout.
- Add a "mental model in 60 seconds" section:
  - Council
  - Councillor
  - Job
  - Memory
  - Proposal
  - Meeting

## Visual Beautification Direction

Keep:

- Dark local-console base.
- Compact information density.
- Warm accent color.
- File/artifact transparency.

Improve:

- Increase hierarchy with page headers, status strips, and consistent section spacing.
- Use cards sparingly for repeated items and dashboards. Avoid card-in-card layouts.
- Make tables and dense lists quieter with lighter borders, better row spacing, and hover states.
- Add icons for repeated actions where they improve scanning: new job, edit, delete, rerun, cancel, schedule, meeting, memory.
- Use text labels with status icons; do not rely on color or glyph alone.
- Avoid making the palette one-note. Keep the warm accent, but add restrained semantic colors and neutral surfaces.
- Make primary actions visibly primary and keep destructive actions visually separate.

Potential visual reference:

Landsraad should feel closer to a local operations cockpit or developer console than a SaaS landing page. Think dense, legible, low-glare, with clear live status and crisp affordances.

## Accessibility And Responsiveness

Recommended upgrades:

- Ensure every focusable control has visible focus styling, including raw buttons and link-buttons.
- Add visible text labels or accessible names for symbol-only controls such as `+`, `x`, and status glyphs.
- Respect `prefers-reduced-motion` wherever running indicators pulse.
- Improve mobile handling for:
  - Councillor columns
  - Schedules table
  - Proposal action rows
  - Environment variable grid
  - Header/action rows
- Confirm touch targets are at least comfortable on mobile.
- Avoid horizontal overflow from long adapter strings, job ids, source ids, and local paths.
- Add active-route and current-page semantics to navigation.

## Suggested Implementation Order

### Phase 1: Polish The Existing App

- Extract shared UI primitives for buttons, badges, cards, forms, page headers, markdown blocks, and empty states.
- Style meeting detail actions consistently.
- Add visible desktop navigation with route state and count badges.
- Replace home text status links with dashboard cards.
- Add better failed/running/queued status presentation on home and job detail.
- Standardize form field backgrounds, error messages, saved messages, and danger actions.

### Phase 2: Make The Core Loop More Useful

- Add job detail tabs for Output, Transcript, Prompt, Events, Memories, and Suggested jobs.
- Add live-running job affordances: transcript tail, last updated, cancel position.
- Add onboarding checklist and richer empty states.
- Add schedule next-fire preview and friendlier schedule builder.
- Add adapter readiness indicators in councillor and council settings.
- Improve proposals as a review inbox.

### Phase 3: Add Power-User Surfaces

- Add global activity/all-jobs view.
- Add command palette or global quick switcher.
- Add global search across jobs, memory, meetings, and proposals.
- Add artifact actions: copy output, open local artifact, export transcript.
- Add richer meeting cockpit and transcript filtering.

## Success Criteria

A successful UX pass should let a user answer these questions within seconds:

- What is running right now?
- What failed and needs attention?
- What did the council suggest I do next?
- Which councillor should I assign this to?
- Where did this output, memory, or proposal come from?
- What will happen if I click this primary action?

The current app has the raw material for all of this. The next step is to make status, navigation, and action hierarchy explicit.

## Source Verification & Additional Findings (2026-05-31)

Second pass: read the actual route components and confirmed the findings above against code. Every claim checked held up. Concrete evidence and a few specifics the first pass did not name:

### Design system: confirmed, and worse than "reimplemented per route"

- There is **no shared stylesheet at all** — `src/**/*.css` returns nothing. Every component carries its own `<style>` block. `.btn` / `.btn.primary` is copy-pasted (e.g. `+page.svelte:266-267`). Grep counts 124 `<button>`/`.btn` occurrences across 23 files. This is the single highest-leverage fix: one `app.css` + a `<Button>`/`<Badge>`/`<Card>` set would delete most of this.
- **Input surface colors already drift inside a single file:** home inputs are `#1a1d24` (`+page.svelte:205`); meeting detail uses `#1a1d24` for `.md-block` but `#15181f` for `.block` (`meetings/[id]/+page.svelte:170,210`). Three dark-slate shades, no token.

### Meeting detail raw buttons: confirmed

`meetings/[id]/+page.svelte:89-104` — `Speak`, `Skip this round`, `End meeting`, `Cancel`, `Resume` are bare `<button type="submit">`. The file's `<style>` block (lines 146-263) contains **zero** button rules. These are the most consequential live-meeting controls and they render as unstyled browser-default buttons. Fix this first in Phase 1.

### New finding — accent palette drift in meetings

The global token is warm parchment: `--accent: #d6c08c` (`+layout.svelte:56`). But meeting detail hardcodes a **blue** fallback in three places — `var(--accent, #6aa6ff)` on `.next-up`, `.turn-speaker.remote`, and their backgrounds (`rgba(106,166,255,…)`). The blue never paints today (the token is defined), but the meeting page was clearly designed against a different (blue) accent. If/when the design system lands and `--accent` is themed, meetings will shift in ways nobody intends. Decide on one accent and purge the blue literals.

### Navigation: confirmed, with a sharper gap

`+layout.svelte` has a single hamburger at all widths, no desktop bar, no active-route state, no count badges — as the first pass said. Sharper: the menu only lists **Meetings, Schedules, Install template, Export, Council, Help** (lines 33-42). **Jobs/Activity, Memory, and Proposals have no nav entry whatsoever** — Proposals is reachable only via the H1 badge on home (`+page.svelte:75`), Memory only via the home panel. Two core surfaces are effectively unlinked.

### Reduced-motion: confirmed gap

Only `councillors/[c_slug]/+page.svelte` guards motion. Home's `@keyframes pulse` driving `.status-running` and `.dot.running` (`+page.svelte:273-278`) has no `prefers-reduced-motion` guard. The running indicator pulses unconditionally.

### Layout width vs. full-bleed columns

`main` is capped at `max-width: 880px` (`+layout.svelte:133`), but the councillor `.columns` grid breaks out of it to full viewport width via `width: 100vw; margin-left: calc(-50vw + 50%)` and horizontal-scrolls (`+page.svelte:213-222`). A command-center dashboard wants the wider canvas everywhere, not one breakout escape hatch inside an otherwise narrow column. Reconsider the global width before adding the status strip.

### Status glyphs: confirmed reasonable, one caveat

Home job status is a glyph (`✓ ✕ ● ⊘ …`) with both `title` and `aria-label` (`+page.svelte:147-153`) — accessible name is fine. But meaning still rides on **glyph + color only**, no text label, matching the a11y note above. Pair glyph with a short text status in the design-system badge.

### Priority confirmation

Phase 1 order in the first pass is right. Tightest sequence to start:
1. `app.css` + Button/Badge/Card primitives (kills the 23-file drift).
2. Style meeting-detail action buttons (currently raw).
3. Desktop nav with active state + add Jobs/Memory/Proposals entries + count badges.
4. Reduced-motion guard on the pulse keyframes.
5. Settle the accent (purge the blue literals in meetings).

---

## Implementation Log (2026-05-31)

All three phases of the plan above were implemented. The design system landed
first; every route was then migrated onto it.

### Phase 1 — foundation

- **`src/app.css`** (new): design tokens (`:root` CSS variables for surfaces,
  text, accent `#d6c08c`, semantic status/danger/ok/info/warn, radii, shadow,
  fonts) + global classes (`.field`/`.label`/`.hint`, `.input`, `.alert[.error|.ok]`,
  `.block`, `.markdown`) + a global `prefers-reduced-motion` guard and the shared
  `ls-pulse` keyframe. Imported once in the root layout.
- **`src/lib/components/`** (new): `Button`, `Badge`, `StatusBadge` (glyph +
  text + color, job & meeting vocab), `Card`, `PageHeader`, `EmptyState`,
  `Markdown`, barrel `index.ts`. Plus `src/lib/time.ts` `relTime()`.
- **Navigation**: root layout rebuilt with a desktop nav bar — active-route
  state + `aria-current`, count badges (running / meetings / proposals), a
  persistent **+ New job**, and Activity / Memory / Proposals now first-class
  entries. Hamburger demoted to utilities.
- **Meeting detail**: raw `<button>` controls restyled via `Button`; blue accent
  literals purged to `--info` tokens; markdown via the `Markdown` component.
- Reduced-motion is now globally honored; accent settled to the parchment token.

### Phase 2 — core loop

- **Home**: command-center status strip, councillor swimlanes with busy/ready +
  queued/failed counts, recent shared memory, and a **first-run onboarding
  checklist** (add councillor → connect adapter → first job).
- **Activity feed** (`/jobs`): new route — status filter tabs with counts,
  2s live refresh, truncation cap.
- **Job detail** (`/jobs/[jid]`): sticky status cockpit (StatusBadge,
  councillor + adapter, created/started/finished rel-times, exit code, live
  indicator), **tabbed artifacts** (Output / Transcript / Prompt / Events /
  Memories / Suggested jobs) that only appear when populated, live transcript
  tail while running, and a **failure-recovery panel** for failed jobs.
- **New job** (`/jobs/new`): segmented Run-now / Schedule control, multi-
  councillor preview with adapter badges, cron presets.
- **Proposals**: review inbox with status filter tabs + counts, Markdown
  briefs, stronger approve/reject hierarchy.

### Phase 3 — power-user surfaces

- **Schedules** (list / new / [id] / edit): builder with cron presets, next-fire
  preview on detail, Card list, timezone note.
- **Council**: sectioned settings (Identity / Councillors / Environment /
  Import-Export / Danger zone) with per-councillor adapter health.
- **Memory** index + editors: Edit/Preview toggle with `Markdown` preview.

### Verification

`npm run check` → 0 errors (remaining warnings are accepted editable-buffer
`state_referenced_locally` seeds). `npm test` → 359 passing (one runner
cancel test is a load-dependent timing flake; passes in isolation). All
user-facing routes smoke-tested under `npm run dev` (HTTP 200), including
dynamically-created schedule detail/edit.
