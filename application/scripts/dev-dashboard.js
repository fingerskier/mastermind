#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import { dashboardCommandArgs, readDashboardConfig, viteCommandArgs } from './dashboard-config.js'

const config = readDashboardConfig()
const env = {
  ...process.env,
  LANDSRAAD_DASHBOARD_HOST: config.host,
  LANDSRAAD_DASHBOARD_PORT: config.dashboardPort,
  LANDSRAAD_UI_PORT: config.uiPort,
  LANDSRAAD_API_TARGET: config.apiTarget,
}

const processes = []
let stopping = false

console.log(`Landsraad dev UI: http://${config.host}:${config.uiPort}`)
console.log(`Landsraad API: ${config.apiTarget}`)
console.log(`Council: ${config.councilRoot}`)

launch('server', process.execPath, dashboardCommandArgs(config, [], { includeNetworkArgs: true }))
launch('ui', process.execPath, viteCommandArgs(config))

process.once('SIGINT', () => stopAll('SIGINT'))
process.once('SIGTERM', () => stopAll('SIGTERM'))

function launch(label, command, args) {
  const child = spawn(command, args, {
    cwd: config.appRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const entry = { label, child, exited: false }
  processes.push(entry)
  pipeLines(label, child.stdout, process.stdout)
  pipeLines(label, child.stderr, process.stderr)

  child.once('error', (error) => {
    console.error(`[${label}] ${error.message}`)
    process.exitCode = 1
    stopAll('SIGTERM')
  })

  child.once('exit', (code, signal) => {
    entry.exited = true

    if (!stopping) {
      const status = code === null ? signal : `code ${code}`
      console.error(`[${label}] exited with ${status}`)
      process.exitCode = code || 1
      stopAll('SIGTERM')
    }

    if (processes.every((processEntry) => processEntry.exited)) {
      process.exit(process.exitCode ?? 0)
    }
  })
}

function pipeLines(label, stream, target) {
  const lines = createInterface({ input: stream })
  lines.on('line', (line) => {
    target.write(`[${label}] ${line}\n`)
  })
}

function stopAll(signal) {
  if (stopping) return
  stopping = true
  for (const { child } of processes) {
    if (child.exitCode === null && !child.killed) child.kill(signal)
  }
}
