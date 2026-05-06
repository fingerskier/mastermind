import Fastify from 'fastify'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { extname, join, resolve, sep } from 'node:path'
import { readFile } from 'node:fs/promises'

import { pathExists, readCouncilConfig } from '../council.js'
import {
  listProjects,
  listRuns,
  readDashboardAgents,
  readDashboardCouncil,
  readDashboardJobs,
  readDashboardOverview,
  readMemoryOverview,
  readRunDetail,
  readSecretary,
  searchDashboardRetrieval,
} from './data.js'
import { normalizeDashboardObjects } from './objects.js'

const DEFAULT_STATIC_DIR = fileURLToPath(new URL('../../dist/dashboard', import.meta.url))

export async function createDashboardServer({
  councilRoot = process.cwd(),
  staticDir = DEFAULT_STATIC_DIR,
  logger = false,
  serveStatic = true,
} = {}) {
  const { root } = await readCouncilConfig(councilRoot)
  const app = Fastify({ logger })

  app.get('/api/health', async () => ({
    ok: true,
    councilRoot: root,
    startedAt: app.dashboardStartedAt,
  }))

  app.get('/api/overview', async () => readDashboardOverview({ councilRoot: root }))
  app.get('/api/council', async () => readDashboardCouncil({ councilRoot: root }))
  app.get('/api/secretary', async () => readSecretary({ councilRoot: root }))
  app.get('/api/agents', async () => ({ agents: await readDashboardAgents({ councilRoot: root }) }))
  app.get('/api/jobs', async () => ({ jobs: await readDashboardJobs({ councilRoot: root }) }))
  app.get('/api/projects', async () => ({ projects: await listProjects({ councilRoot: root }) }))
  app.get('/api/memory', async () => readMemoryOverview({ councilRoot: root }))
  app.get('/api/runs', async (request) => ({
    runs: await listRuns({
      councilRoot: root,
      limit: request.query.limit || 100,
    }),
  }))
  app.get('/api/runs/:jobId/:runId', async (request) =>
    readRunDetail({
      councilRoot: root,
      jobId: request.params.jobId,
      runId: request.params.runId,
    }),
  )
  app.get('/api/retrieval/search', async (request) => ({
    results: await searchDashboardRetrieval({
      councilRoot: root,
      query: request.query.query,
      limit: request.query.limit,
      mode: request.query.mode,
    }),
  }))
  app.get('/api/search', async (request) => ({
    results: await searchDashboardRetrieval({
      councilRoot: root,
      query: request.query.query,
      limit: request.query.limit,
      mode: request.query.mode,
    }),
  }))
  app.post('/api/dashboard-objects/validate', async (request) => ({
    objects: normalizeDashboardObjects(request.body?.objects ?? request.body),
  }))

  app.dashboardStartedAt = new Date().toISOString()

  if (serveStatic) await registerStaticUi(app, staticDir)

  return app
}

export async function startDashboardServer({
  councilRoot = process.cwd(),
  host = '127.0.0.1',
  port = 4173,
  staticDir = DEFAULT_STATIC_DIR,
  logger = false,
} = {}) {
  const app = await createDashboardServer({ councilRoot, staticDir, logger })
  const url = await app.listen({ host, port: Number(port) })
  const { root } = await readCouncilConfig(councilRoot)
  return {
    app,
    url,
    root,
    staticDir,
  }
}

export function defaultStaticDir() {
  return DEFAULT_STATIC_DIR
}

async function registerStaticUi(app, staticDir) {
  const indexPath = join(staticDir, 'index.html')

  if (!(await pathExists(indexPath))) {
    app.get('/', async (_request, reply) => reply.type('text/html').send(missingBuildHtml(staticDir)))
    return
  }

  app.get('/', async (_request, reply) => sendStaticFile(reply, staticDir, 'index.html'))
  app.get('/assets/*', async (request, reply) => {
    const assetPath = request.params['*']
    return sendStaticFile(reply, staticDir, `assets/${assetPath}`)
  })

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'Not found' })
      return
    }
    sendStaticFile(reply, staticDir, 'index.html').catch((error) => {
      reply.code(500).send({ error: error.message })
    })
  })
}

async function sendStaticFile(reply, staticDir, relativePath) {
  const filePath = resolveStaticPath(staticDir, relativePath)
  if (!(await pathExists(filePath))) {
    reply.code(404).send({ error: 'Not found' })
    return
  }

  const buffer = await readFile(filePath)
  reply.type(contentTypeFor(filePath)).send(buffer)
}

function resolveStaticPath(staticDir, relativePath) {
  const root = resolve(staticDir)
  const target = resolve(root, String(relativePath || '').replace(/^[/\\]+/, ''))
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`
  if (target !== root && !target.startsWith(prefix)) {
    throw new Error('Refusing to serve files outside the dashboard bundle.')
  }
  return target
}

function contentTypeFor(path) {
  const ext = extname(path)
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js') return 'text/javascript; charset=utf-8'
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.png') return 'image/png'
  if (ext === '.ico') return 'image/x-icon'
  return 'application/octet-stream'
}

function missingBuildHtml(staticDir) {
  const staticUrl = pathToFileURL(staticDir).href
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Landsraad Dashboard</title>',
    '<style>body{font-family:system-ui,sans-serif;margin:2rem;line-height:1.45;color:#172026}code{background:#eef2f5;padding:.15rem .3rem;border-radius:4px}</style>',
    '</head>',
    '<body>',
    '<h1>Landsraad Dashboard</h1>',
    '<p>The dashboard API is running, but the bundled UI has not been built yet.</p>',
    `<p>Run <code>npm run build</code> from <code>${staticUrl}</code>'s package root, then restart <code>landsraad dashboard</code>.</p>`,
    '</body>',
    '</html>',
  ].join('')
}
