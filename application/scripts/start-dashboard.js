#!/usr/bin/env node

import { spawn } from 'node:child_process'

import { dashboardCommandArgs, readDashboardConfig } from './dashboard-config.js'

const config = readDashboardConfig()
const extraArgs = process.argv.slice(2)
const scriptArgs = []

if (process.env.LANDSRAAD_DASHBOARD_HOST && !extraArgs.includes('--host')) {
  scriptArgs.push('--host', config.host)
}

if (process.env.LANDSRAAD_DASHBOARD_PORT && !extraArgs.includes('--port')) {
  scriptArgs.push('--port', config.dashboardPort)
}

const child = spawn(process.execPath, dashboardCommandArgs(config, scriptArgs.concat(extraArgs)), {
  cwd: config.appRoot,
  stdio: 'inherit',
  windowsHide: true,
})

child.once('error', (error) => {
  console.error(error.message)
  process.exit(1)
})

child.once('exit', (code) => {
  process.exit(code ?? 0)
})
