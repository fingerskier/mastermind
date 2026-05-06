import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const VIEWS = ['Overview', 'Agents', 'Jobs', 'Runs', 'Projects', 'Memory', 'Search']

function App() {
  const [view, setView] = useState('Overview')
  const [overview, setOverview] = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  const [runDetail, setRunDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api('/api/overview')
      .then((data) => {
        if (cancelled) return
        setOverview(data)
        setSelectedRun(data.runs?.[0] || null)
        setError('')
      })
      .catch((caught) => {
        if (!cancelled) setError(caught.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedRun) {
      setRunDetail(null)
      return
    }
    let cancelled = false
    api(`/api/runs/${encodeURIComponent(selectedRun.jobId)}/${encodeURIComponent(selectedRun.runId)}`)
      .then((data) => {
        if (!cancelled) setRunDetail(data)
      })
      .catch((caught) => {
        if (!cancelled) setError(caught.message)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRun])

  if (loading) return <Shell view={view} setView={setView} loading />
  if (error) return <Shell view={view} setView={setView} error={error} />
  if (!overview) return <Shell view={view} setView={setView} error="No dashboard data was returned." />

  return (
    <Shell view={view} setView={setView} council={overview.council}>
      {view === 'Overview' && <Overview data={overview} selectedRun={selectedRun} setView={setView} />}
      {view === 'Agents' && <Agents agents={overview.agents} secretary={overview.secretary} />}
      {view === 'Jobs' && <Jobs jobs={overview.jobs} setSelectedRun={setSelectedRun} setView={setView} />}
      {view === 'Runs' && (
        <Runs
          runs={overview.runs}
          selectedRun={selectedRun}
          setSelectedRun={setSelectedRun}
          detail={runDetail}
        />
      )}
      {view === 'Projects' && <Projects projects={overview.projects} />}
      {view === 'Memory' && <Memory memory={overview.memory} />}
      {view === 'Search' && <Search />}
    </Shell>
  )
}

function Shell({ children, view, setView, council, loading, error }) {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">L</div>
          <div>
            <div className="brand-title">Landsraad</div>
            <div className="brand-subtitle">Council Dashboard</div>
          </div>
        </div>
        <nav className="nav-list" aria-label="Dashboard views">
          {VIEWS.map((item) => (
            <button
              className={item === view ? 'nav-item active' : 'nav-item'}
              key={item}
              type="button"
              onClick={() => setView(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <h1>{council?.config?.name || 'Council'}</h1>
            <p>{council?.config?.description || 'Project-scoped local dashboard.'}</p>
          </div>
          <div className="root-path" title={council?.root || ''}>
            {council?.root || 'Loading council'}
          </div>
        </header>
        {loading && <StateMessage title="Loading dashboard" />}
        {error && <StateMessage title="Dashboard error" message={error} />}
        {!loading && !error && children}
      </main>
    </div>
  )
}

function Overview({ data, selectedRun, setView }) {
  const latestRun = data.runs?.[0]
  return (
    <div className="stack">
      <section className="metric-grid" aria-label="Council counts">
        <Metric label="Councillors" value={data.counts.councillors} />
        <Metric label="Jobs" value={data.counts.jobs} />
        <Metric label="Projects" value={data.counts.projects} />
        <Metric label="Runs" value={data.counts.runs} />
      </section>
      <section className="split">
        <div className="panel">
          <PanelHeader title="Secretary" />
          <h2>{data.secretary.name}</h2>
          <p>{data.secretary.description}</p>
          <pre className="text-preview">{data.secretary.persona}</pre>
        </div>
        <div className="panel">
          <PanelHeader title="Latest Run" />
          {latestRun ? (
            <>
              <StatusLine status={latestRun.status} label={`${latestRun.jobTitle} / ${latestRun.runId}`} />
              <dl className="facts">
                <div>
                  <dt>Agents</dt>
                  <dd>{latestRun.assignedAgents.join(', ') || 'None recorded'}</dd>
                </div>
                <div>
                  <dt>Finished</dt>
                  <dd>{formatDate(latestRun.finishedAt || latestRun.startedAt)}</dd>
                </div>
              </dl>
              <button className="primary-action" type="button" onClick={() => setView('Runs')}>
                Inspect run
              </button>
            </>
          ) : (
            <p>No runs have been recorded yet.</p>
          )}
          {selectedRun && selectedRun.runId !== latestRun?.runId && <p>Selected run: {selectedRun.runId}</p>}
        </div>
      </section>
      <section className="panel">
        <PanelHeader title="Active Jobs" />
        <div className="row-list">
          {data.jobs.map((job) => (
            <div className="row" key={job.id}>
              <div>
                <strong>{job.title}</strong>
                <span>{job.id}</span>
              </div>
              <StatusPill status={job.status} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Agents({ agents }) {
  return (
    <div className="stack">
      <section className="panel">
        <PanelHeader title="Agents" />
        <div className="entity-grid">
          {agents.map((agent) => (
            <article className="entity" key={agent.id}>
              <div className="entity-head">
                <div>
                  <h2>{agent.name}</h2>
                  <span>{agent.kind}</span>
                </div>
                <StatusPill status={agent.kind === 'secretary' ? 'attention' : 'ok'} />
              </div>
              <p>{agent.description}</p>
              {agent.capabilities?.length > 0 && <TagList values={agent.capabilities} />}
              <pre className="text-preview compact">{agent.persona}</pre>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function Jobs({ jobs, setSelectedRun, setView }) {
  return (
    <div className="stack">
      {jobs.map((job) => (
        <section className="panel" key={job.id}>
          <PanelHeader title={job.title} right={<StatusPill status={job.status} />} />
          <dl className="facts inline">
            <div>
              <dt>ID</dt>
              <dd>{job.id}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{job.type}</dd>
            </div>
            <div>
              <dt>Agents</dt>
              <dd>{job.assignedAgents.join(', ')}</dd>
            </div>
            <div>
              <dt>Schedule</dt>
              <dd>{job.schedule ? `${job.schedule.expression} (${job.schedule.timezone})` : 'None'}</dd>
            </div>
          </dl>
          <pre className="text-preview">{job.brief}</pre>
          <div className="row-list">
            {job.runs.map((run) => (
              <button
                className="row button-row"
                key={run.runId}
                type="button"
                onClick={() => {
                  setSelectedRun(run)
                  setView('Runs')
                }}
              >
                <div>
                  <strong>{run.runId}</strong>
                  <span>{formatDate(run.finishedAt || run.startedAt)}</span>
                </div>
                <StatusPill status={run.status} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Runs({ runs, selectedRun, setSelectedRun, detail }) {
  return (
    <div className="runs-layout">
      <section className="panel run-list">
        <PanelHeader title="Runs" />
        <div className="row-list">
          {runs.map((run) => (
            <button
              className={selectedRun?.runId === run.runId ? 'row button-row selected' : 'row button-row'}
              key={`${run.jobId}-${run.runId}`}
              type="button"
              onClick={() => setSelectedRun(run)}
            >
              <div>
                <strong>{run.jobTitle}</strong>
                <span>{run.runId}</span>
              </div>
              <StatusPill status={run.status} />
            </button>
          ))}
        </div>
      </section>
      <section className="panel run-detail">
        <PanelHeader title="Run Detail" />
        {detail ? <RunDetail detail={detail} /> : <p>Select a run to inspect its artifacts.</p>}
      </section>
    </div>
  )
}

function RunDetail({ detail }) {
  const [tab, setTab] = useState('outputMd')
  const tabs = [
    ['outputMd', 'Output'],
    ['inputMd', 'Input'],
    ['transcriptMd', 'Transcript'],
    ['eventsJsonl', 'Events'],
    ['runJson', 'Run JSON'],
  ]
  const text = detail.files?.[tab] || ''

  return (
    <div className="stack compact-gap">
      <StatusLine status={detail.run.status} label={`${detail.run.jobId} / ${detail.run.runId}`} />
      {detail.structuredObjects?.length > 0 && (
        <div className="object-strip">
          {detail.structuredObjects.map((entry) => (
            <DashboardObject entry={entry} key={`${entry.sourcePath}-${entry.index}`} />
          ))}
        </div>
      )}
      <div className="tabs" role="tablist" aria-label="Run artifact files">
        {tabs.map(([id, label]) => (
          <button className={tab === id ? 'tab active' : 'tab'} key={id} type="button" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <pre className="artifact">{text || 'File not present for this run.'}</pre>
    </div>
  )
}

function Projects({ projects }) {
  return (
    <div className="stack">
      {projects.map((project) => (
        <section className="panel" key={project.id}>
          <PanelHeader title={project.id} />
          <pre className="text-preview">{project.brief || project.notes || 'No project notes yet.'}</pre>
          <FileList files={project.files} />
        </section>
      ))}
    </div>
  )
}

function Memory({ memory }) {
  return (
    <div className="stack">
      <section className="panel">
        <PanelHeader title="Shared Memory Index" />
        <pre className="text-preview">{memory.index || 'No shared memory index content yet.'}</pre>
      </section>
      <section className="panel">
        <PanelHeader title="Facts" />
        <pre className="artifact small">{JSON.stringify(memory.facts, null, 2)}</pre>
      </section>
      <section className="panel">
        <PanelHeader title="Memory Files" />
        <FileList files={memory.files} />
      </section>
    </div>
  )
}

function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const data = await api(`/api/retrieval/search?query=${encodeURIComponent(query)}&limit=8`)
      setResults(data.results)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <PanelHeader title="Retrieval Search" />
        <form className="search-form" onSubmit={submit}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search council files" />
          <button className="primary-action" type="submit" disabled={!query.trim() || busy}>
            Search
          </button>
        </form>
      </section>
      <section className="panel">
        <PanelHeader title="Results" />
        <div className="row-list">
          {results.map((result) => (
            <div className="search-result" key={`${result.filePath}-${result.chunkIndex}`}>
              <div className="search-meta">
                <strong>{result.filePath}</strong>
                <span>score {result.score.toFixed(3)}</span>
              </div>
              <p>{result.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function DashboardObject({ entry }) {
  if (!entry.valid) {
    return (
      <div className="dashboard-object fallback">
        <h3>Invalid dashboard object</h3>
        <p>{entry.errors.join(' ')}</p>
        <pre>{JSON.stringify(entry.object, null, 2)}</pre>
      </div>
    )
  }

  const object = entry.object
  if (object.type === 'form') return <FormObject object={object} />
  if (object.type === 'table') return <TableObject object={object} />
  if (object.type === 'chart') return <ChartObject object={object} />
  if (object.type === 'status-card') return <StatusCardObject object={object} />
  return null
}

function FormObject({ object }) {
  return (
    <div className="dashboard-object">
      <h3>{object.title}</h3>
      <div className="form-preview">
        {object.fields.map((field) => (
          <label key={field.id}>
            <span>{field.label}</span>
            <input type={field.kind === 'number' || field.kind === 'currency' ? 'number' : 'text'} disabled />
          </label>
        ))}
      </div>
    </div>
  )
}

function TableObject({ object }) {
  return (
    <div className="dashboard-object">
      <h3>{object.title}</h3>
      <table>
        <thead>
          <tr>
            {object.columns.map((column) => (
              <th key={column.id}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {object.rows.map((row, index) => (
            <tr key={index}>
              {object.columns.map((column) => (
                <td key={column.id}>{String(row[column.id] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChartObject({ object }) {
  const values = object.data.map((row) => row[object.y])
  const max = Math.max(...values, 1)

  return (
    <div className="dashboard-object">
      <h3>{object.title}</h3>
      <div className={object.chartType === 'bar' ? 'bar-chart' : 'line-chart'}>
        {object.data.map((row) => (
          <div className="bar" key={row[object.x]} style={{ height: `${Math.max(4, (row[object.y] / max) * 90)}%` }}>
            <span>{row[object.x]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusCardObject({ object }) {
  return (
    <div className="dashboard-object">
      <StatusLine status={object.status} label={object.title} />
      {object.summary && <p>{object.summary}</p>}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PanelHeader({ title, right }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      {right}
    </div>
  )
}

function StatusLine({ status, label }) {
  return (
    <div className="status-line">
      <StatusPill status={status} />
      <strong>{label}</strong>
    </div>
  )
}

function StatusPill({ status }) {
  return <span className={`status status-${normalizeStatus(status)}`}>{status || 'unknown'}</span>
}

function TagList({ values }) {
  return (
    <div className="tags">
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </div>
  )
}

function FileList({ files }) {
  return (
    <div className="row-list">
      {files.map((file) => (
        <div className="row" key={file.path}>
          <div>
            <strong>{file.name}</strong>
            <span>{file.path}</span>
          </div>
          <span>{file.kind}</span>
        </div>
      ))}
    </div>
  )
}

function StateMessage({ title, message }) {
  return (
    <section className="panel">
      <PanelHeader title={title} />
      {message && <p>{message}</p>}
    </section>
  )
}

function normalizeStatus(status) {
  if (['succeeded', 'done', 'ok'].includes(status)) return 'ok'
  if (['queued', 'running', 'attention'].includes(status)) return 'attention'
  if (['blocked'].includes(status)) return 'blocked'
  if (['failed', 'timed-out', 'canceled'].includes(status)) return 'failed'
  return 'unknown'
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleString()
}

async function api(path) {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

createRoot(document.getElementById('root')).render(<App />)
