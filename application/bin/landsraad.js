#!/usr/bin/env node

import {
  approveJobProposal,
  createCouncil,
  defaultStaticDir,
  createRetrievalService,
  listAgents,
  listJobProposals,
  listJobs,
  rejectJobProposal,
  runJob,
  runSchedulerOnce,
  startScheduler,
  startDashboardServer,
} from '../src/index.js'

const args = process.argv.slice(2)

function takeFlag(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  const value = args[index + 1]
  args.splice(index, value && !value.startsWith('--') ? 2 : 1)
  return value && !value.startsWith('--') ? value : fallback
}

function hasFlag(name) {
  const index = args.indexOf(name)
  if (index === -1) return false
  args.splice(index, 1)
  return true
}

const explicitCouncilRoot = args.includes('--council')
const councilRoot = takeFlag('--council', process.cwd())
const json = hasFlag('--json')
const command = args.shift()

try {
  if (command === 'init') {
    const templateId = takeFlag('--template', 'business-operations')
    const name = takeFlag('--name')
    const id = takeFlag('--id')
    const result = await createCouncil({ councilRoot, templateId, name, id })
    print(json, result, () => {
      return [
        `Initialized ${result.config.name} at ${result.root}.`,
        `Template: ${result.template.id}`,
        `Created ${result.createdPaths.length} files.`,
      ].join('\n')
    })
    process.exit(0)
  }

  if (command === 'dashboard') {
    const host = takeFlag('--host', '127.0.0.1')
    const port = Number(takeFlag('--port', process.env.LANDSRAAD_DASHBOARD_PORT || '4173'))
    const staticDir = takeFlag('--static-dir', defaultStaticDir())
    const result = await startDashboardServer({ councilRoot, host, port, staticDir })
    const payload = {
      url: result.url,
      councilRoot: result.root,
      staticDir: result.staticDir,
    }

    if (json) {
      console.log(JSON.stringify(payload))
    } else {
      console.log(`Landsraad dashboard listening at ${result.url}`)
      console.log(`Council: ${result.root}`)
      console.log(`API overview: ${result.url}/api/overview`)
    }

    const shutdown = async () => {
      await result.app.close()
      process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    await new Promise(() => {})
  }

  if (command === 'agent') {
    const subcommand = args.shift()
    if (subcommand === 'list') {
      const agents = await listAgents({ councilRoot })
      print(json, { agents }, () => {
        if (agents.length === 0) return 'No agents found.'
        return agents.map((agent) => `${agent.id}\t${agent.kind}\t${agent.name}`).join('\n')
      })
      process.exit(0)
    }
  }

  if (command === 'job') {
    const subcommand = args.shift()

    if (subcommand === 'list') {
      const jobs = await listJobs({ councilRoot })
      print(json, { jobs }, () => {
        if (jobs.length === 0) return 'No jobs found.'
        return jobs.map((job) => `${job.id}\t${job.status}\t${job.title}`).join('\n')
      })
      process.exit(0)
    }

    if (subcommand === 'run') {
      const jobId = args.shift()
      const adapterOverride = takeFlag('--adapter')
      const result = await runJob({ councilRoot, jobId, adapterOverride })
      print(json, result, () => {
        return [
          `Run ${result.run.runId} ${result.run.status}.`,
          `Run directory: ${result.runDir}`,
        ].join('\n')
      })
      process.exit(0)
    }

    if (subcommand === 'proposal') {
      const action = args.shift()

      if (action === 'list') {
        const proposals = await listJobProposals({ councilRoot })
        print(json, { proposals }, () => {
          if (proposals.length === 0) return 'No job proposals found.'
          return proposals.map((proposal) => `${proposal.id}\t${proposal.status}\t${proposal.title}`).join('\n')
        })
        process.exit(0)
      }

      if (action === 'approve') {
        const proposalId = args.shift()
        const result = await approveJobProposal({ councilRoot, proposalId })
        print(json, result, () => {
          return `Approved ${result.proposal.id}; created ${result.jobPath}.`
        })
        process.exit(0)
      }

      if (action === 'reject') {
        const proposalId = args.shift()
        const result = await rejectJobProposal({ councilRoot, proposalId })
        print(json, result, () => {
          return `Rejected ${result.proposal.id}.`
        })
        process.exit(0)
      }
    }
  }

  if (command === 'memory') {
    const subcommand = args.shift()

    if (subcommand === 'search') {
      const limit = Number(takeFlag('--limit', takeFlag('-n', '10')))
      const mode = takeFlag('--mode', 'hybrid')
      const query = args.join(' ').trim()
      if (!query) throw new Error('Usage: landsraad memory search <query> [--limit n] [--mode hybrid|vector|keyword] [--json]')

      const service = createRetrievalService({ councilRoot })
      const results = await service.search(query, { limit, mode })
      print(json, { results }, () => {
        if (results.length === 0) return 'No results.'
        return results
          .map((result, index) => [
            `${index + 1}. ${result.filePath}#${result.chunkIndex} score=${result.score.toFixed(3)}`,
            result.text,
          ].join('\n'))
          .join('\n\n')
      })
      process.exit(0)
    }

    if (subcommand === 'index') {
      const action = args.shift()
      const service = createRetrievalService({ councilRoot })
      if (action === 'sync') {
        const stats = await service.sync()
        print(json, stats, () => `Indexed ${stats.totalChunks} chunks from ${stats.totalFiles} files.`)
        process.exit(0)
      }
      if (action === 'stats') {
        const stats = await service.stats()
        print(json, stats, () => `Index has ${stats.totalChunks} chunks from ${stats.totalFiles} files.`)
        process.exit(0)
      }
    }
  }

  if (command === 'scheduler') {
    const subcommand = args.shift()

    if (subcommand === 'start') {
      if (!explicitCouncilRoot) {
        throw new Error('landsraad scheduler start requires --council <path> so scheduled jobs run against an explicit council root.')
      }

      const adapterOverride = takeFlag('--adapter')
      const pollIntervalMs = Number(takeFlag('--poll-interval-ms', '30000'))
      const once = hasFlag('--once')

      if (once) {
        const result = await runSchedulerOnce({ councilRoot, adapterOverride })
        print(json, result, () => {
          return [
            `Scheduler checked ${result.registered} recurring jobs.`,
            `Executed ${result.executed.length} due jobs.`,
            `State: ${result.statePath}`,
            `Log: ${result.logPath}`,
          ].join('\n')
        })
        process.exit(0)
      }

      const scheduler = await startScheduler({ councilRoot, adapterOverride, pollIntervalMs })
      const payload = {
        councilRoot: scheduler.councilRoot,
        statePath: scheduler.statePath,
        logPath: scheduler.logPath,
        pollIntervalMs: scheduler.pollIntervalMs,
      }

      if (json) {
        console.log(JSON.stringify(payload))
      } else {
        console.log(`Landsraad scheduler running for ${scheduler.councilRoot}`)
        console.log(`State: ${scheduler.statePath}`)
        console.log(`Log: ${scheduler.logPath}`)
      }

      const shutdown = async () => {
        await scheduler.stop()
        process.exit(0)
      }
      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
      await new Promise(() => {})
    }
  }

  console.log(usage())
} catch (error) {
  if (json) {
    console.error(JSON.stringify({ error: error.message }, null, 2))
  } else {
    console.error(error.message)
  }
  process.exit(1)
}

function print(asJson, value, textFn) {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2))
    return
  }
  console.log(textFn())
}

function usage() {
  return `landsraad

Usage:
  landsraad --council <path> init [--template business-operations] [--json]
  landsraad --council <path> dashboard [--host 127.0.0.1] [--port 4173] [--json]
  landsraad --council <path> agent list [--json]
  landsraad --council <path> job list [--json]
  landsraad --council <path> job run <job-id> [--adapter local|claude|codex|gemini] [--json]
  landsraad --council <path> job proposal list [--json]
  landsraad --council <path> job proposal approve <proposal-id> [--json]
  landsraad --council <path> job proposal reject <proposal-id> [--json]
  landsraad --council <path> scheduler start [--adapter local|claude|codex|gemini] [--poll-interval-ms 30000] [--once] [--json]
  landsraad --council <path> memory index sync [--json]
  landsraad --council <path> memory index stats [--json]
  landsraad --council <path> memory search <query> [--limit n] [--mode hybrid|vector|keyword] [--json]
`
}
