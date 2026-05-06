import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_DASHBOARD_HOST = '127.0.0.1'
export const DEFAULT_DASHBOARD_PORT = '4173'
export const DEFAULT_UI_PORT = '5173'
export const DEFAULT_COUNCIL_ROOT = '../.dogfood-council'

export function appRootFrom(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), '..')
}

export function readDashboardConfig(env = process.env, appRoot = appRootFrom(import.meta.url)) {
  const host = env.LANDSRAAD_DASHBOARD_HOST || DEFAULT_DASHBOARD_HOST
  const dashboardPort = env.LANDSRAAD_DASHBOARD_PORT || DEFAULT_DASHBOARD_PORT
  const uiPort = env.LANDSRAAD_UI_PORT || DEFAULT_UI_PORT

  return {
    appRoot,
    host,
    dashboardPort,
    uiPort,
    councilRoot: resolve(appRoot, env.LANDSRAAD_COUNCIL || DEFAULT_COUNCIL_ROOT),
    apiTarget: env.LANDSRAAD_API_TARGET || `http://${host}:${dashboardPort}`,
    staticDir: env.LANDSRAAD_STATIC_DIR ? resolve(appRoot, env.LANDSRAAD_STATIC_DIR) : null,
  }
}

export function dashboardCommandArgs(config, extraArgs = [], { includeNetworkArgs = false } = {}) {
  const args = ['bin/landsraad.js', '--council', config.councilRoot, 'dashboard']
  if (includeNetworkArgs) args.push('--host', config.host, '--port', config.dashboardPort)
  if (config.staticDir) args.push('--static-dir', config.staticDir)
  return args.concat(extraArgs)
}

export function viteCommandArgs(config) {
  return [
    join(config.appRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host',
    config.host,
    '--port',
    config.uiPort,
    '--strictPort',
  ]
}
