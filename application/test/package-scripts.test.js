import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

import {
  dashboardCommandArgs,
  readDashboardConfig,
  viteCommandArgs,
} from '../scripts/dashboard-config.js'
import viteConfig from '../vite.config.js'

const appRoot = join(import.meta.dirname, '..')

test('package exposes built start and hot-reload dev scripts', async () => {
  const packageJson = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'))

  assert.equal(packageJson.scripts.start, 'node scripts/start-dashboard.js')
  assert.equal(packageJson.scripts.dev, 'node scripts/dev-dashboard.js')
})

test('dashboard script config scopes start and dev to dogfood defaults with env overrides', () => {
  const config = readDashboardConfig(
    {
      LANDSRAAD_COUNCIL: '../custom-council',
      LANDSRAAD_DASHBOARD_HOST: '127.0.0.2',
      LANDSRAAD_DASHBOARD_PORT: '4999',
      LANDSRAAD_UI_PORT: '5999',
    },
    appRoot,
  )

  assert.equal(config.councilRoot, resolve(appRoot, '../custom-council'))
  assert.equal(config.apiTarget, 'http://127.0.0.2:4999')
  assert.deepEqual(dashboardCommandArgs(config, ['--json'], { includeNetworkArgs: true }), [
    'bin/landsraad.js',
    '--council',
    config.councilRoot,
    'dashboard',
    '--host',
    '127.0.0.2',
    '--port',
    '4999',
    '--json',
  ])

  const viteArgs = viteCommandArgs(config)
  assert.ok(viteArgs[0].endsWith(join('node_modules', 'vite', 'bin', 'vite.js')))
  assert.deepEqual(viteArgs.slice(1), ['--host', '127.0.0.2', '--port', '5999', '--strictPort'])
})

test('vite dev server proxies API calls to the dashboard server', () => {
  assert.equal(viteConfig.server.host, '127.0.0.1')
  assert.equal(viteConfig.server.port, 5173)
  assert.equal(viteConfig.server.strictPort, true)
  assert.equal(viteConfig.server.proxy['/api'].target, 'http://127.0.0.1:4173')
})
