export const BUILT_IN_TEMPLATES = {
  'business-operations': {
    version: 1,
    id: 'business-operations',
    name: 'Business Operations Council',
    description: 'A C-Suite-style operating council for a business.',
    shareable: true,
    councillors: [
      {
        id: 'ceo',
        name: 'CEO',
        description: 'Owns company strategy, priorities, operating cadence, and executive tradeoffs.',
        capabilities: ['strategy', 'prioritization', 'executive-communication'],
        persona:
          '# CEO Councillor Persona\n\nYou own business strategy, priorities, operating cadence, and executive tradeoffs. Keep recommendations direct, decision-oriented, and explicit about risks and assumptions.\n',
      },
      {
        id: 'cfo',
        name: 'CFO',
        description: 'Owns financial analysis, reporting, forecasting, and budget review.',
        capabilities: ['financial-reporting', 'forecasting', 'budget-review'],
        persona:
          '# CFO Councillor Persona\n\nYou own financial analysis, reporting, forecasting, and budget review. Surface runway, cash flow, risk, and decision implications clearly.\n',
      },
      {
        id: 'cto',
        name: 'CTO',
        description: 'Owns technical strategy, delivery risk, architecture, and engineering execution.',
        capabilities: ['technical-strategy', 'architecture', 'delivery-risk'],
        persona:
          '# CTO Councillor Persona\n\nYou own technical strategy, architecture, delivery risk, and engineering execution. Tie technical recommendations to user impact, cost, and operational risk.\n',
      },
      {
        id: 'cmo',
        name: 'CMO',
        description: 'Owns marketing strategy, positioning, acquisition, and campaign performance.',
        capabilities: ['marketing-strategy', 'positioning', 'campaign-performance'],
        persona:
          '# CMO Councillor Persona\n\nYou own marketing strategy, positioning, acquisition, and campaign performance. Keep analysis tied to audience, channel, message, and measurable outcomes.\n',
      },
      {
        id: 'operations',
        name: 'Operations',
        description: 'Owns operating processes, vendor coordination, risk follow-through, and execution hygiene.',
        capabilities: ['operations', 'process-design', 'vendor-management'],
        persona:
          '# Operations Councillor Persona\n\nYou own operating processes, vendor coordination, risk follow-through, and execution hygiene. Prefer concrete next actions, owners, dates, and visible blockers.\n',
      },
    ],
    jobs: [
      {
        id: 'weekly-financial-report',
        title: 'Weekly Financial Report',
        description: 'Summarize current financial status, risks, and recommended actions.',
        type: 'recurring',
        assignedAgents: ['cfo'],
        schedule: { type: 'cron', expression: '0 9 * * 5', timezone: 'local' },
        brief:
          '# Weekly Financial Report\n\nSummarize the current financial position, key risks, cash-flow questions, and recommended director actions. Use shared memory and project files as context.\n',
      },
      {
        id: 'technical-progress-report',
        title: 'Technical Progress Report',
        description: 'Summarize engineering progress, delivery risks, and technical decisions needing director input.',
        type: 'recurring',
        assignedAgents: ['cto'],
        schedule: { type: 'cron', expression: '0 10 * * 5', timezone: 'local' },
        brief:
          '# Technical Progress Report\n\nSummarize engineering progress, delivery risks, technical decisions, and recommended next actions. Keep the report grounded in project notes and run history.\n',
      },
      {
        id: 'marketing-performance-review',
        title: 'Marketing Performance Review',
        description: 'Review marketing performance, positioning risks, and campaign follow-up.',
        type: 'recurring',
        assignedAgents: ['cmo'],
        schedule: { type: 'cron', expression: '0 11 * * 5', timezone: 'local' },
        brief:
          '# Marketing Performance Review\n\nReview marketing performance, positioning risks, campaign follow-up, and decisions that need director input. Use project context and shared memory where available.\n',
      },
    ],
  },
  'product-development': {
    version: 1,
    id: 'product-development',
    name: 'Product Development Council',
    description: 'A council for building and evaluating Landsraad itself.',
    shareable: false,
    councillors: [
      {
        id: 'product',
        name: 'Product',
        description: 'Owns product specification, user workflows, MVP scope, and acceptance criteria.',
        capabilities: ['product-specification', 'workflow-design', 'acceptance-criteria'],
        persona:
          '# Product Councillor Persona\n\nYou own product specification, user workflows, MVP scope, and acceptance criteria. Keep scope tight and make acceptance criteria testable.\n',
      },
      {
        id: 'engineering',
        name: 'Engineering',
        description: 'Owns implementation design, tests, CLI behavior, and UI evaluation strategy.',
        capabilities: ['implementation', 'testing', 'cli-evaluation', 'ui-evaluation'],
        persona:
          '# Engineering Councillor Persona\n\nYou own the implementation path for Landsraad.\n\nUse the development loop: check or update the spec, implement with tests, then verify through actual CLI and UI evaluation where relevant. Keep changes narrow and observable.\n',
      },
    ],
    jobs: [
      {
        id: 'mvp-vertical-slice',
        title: 'MVP Vertical Slice',
        description: 'Define and implement the smallest end-to-end Landsraad flow.',
        type: 'one-off',
        assignedAgents: ['product', 'engineering'],
        brief:
          '# MVP Vertical Slice\n\nProduce the first useful implementation path for Landsraad:\n\n1. initialize a council\n2. define one Secretary and one councillor\n3. run one job through a CLI adapter\n4. write durable run artifacts\n5. record permission and audit events\n6. verify with real CLI execution\n',
      },
    ],
  },
}

export function getTemplate(id = 'business-operations') {
  const template = BUILT_IN_TEMPLATES[id]
  if (!template) {
    const available = Object.keys(BUILT_IN_TEMPLATES).sort().join(', ')
    throw new Error(`Unknown template "${id}". Available templates: ${available}`)
  }
  return template
}

export function templateJsonFor(template) {
  return {
    version: template.version,
    id: template.id,
    name: template.name,
    description: template.description,
    shareable: template.shareable,
    privacy: {
      containsPii: false,
      containsSecrets: false,
      containsOperationalHistory: false,
    },
    secretary: {
      path: 'council/secretary',
      required: true,
    },
    councillors: template.councillors.map((agent) => agent.id),
    presetJobs: template.jobs.map((job) => job.id),
    secretaryRoutines: ['inbox-triage', 'memory-hygiene-review', 'weekly-council-brief', 'job-run-summarization'],
    memoryScaffold: ['council/memory/index.md', 'council/memory/facts.json', 'council/memory/sources'],
  }
}
