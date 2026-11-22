import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import './App.css'
import CommandRoom from './CommandRoom'
import Icon from './Icon'
const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  : '/api'

/* ---------- API types (unchanged: same backend, same endpoints) ---------- */

type Health = {
  status: string
  model_loaded: boolean
  model_version: string
}

type EarthquakeEvent = {
  event_id: string
  magnitude: number | null
  place: string
  time_utc: string
  source_url: string
}

type EarthquakeFeed = {
  event_count: number
  events: EarthquakeEvent[]
}

type EarthquakeSummary = {
  event_count: number
  max_magnitude: number | null
  latest_event: EarthquakeEvent | null
}

type Prediction = {
  classification: string
  prediction: number
  decision_score: number
  threshold: number
  model_version: string
}

/* ---------- Small helpers (frontend only, derived from the feed) ---------- */

// Edit these to change the signed-in operator shown in the header.
const OPERATOR = { name: 'Anish Tiwari', role: 'AI Systems Engineer' }
const REFRESH_MS = 60_000

// "12 km NE of Ridgecrest, CA" -> "CA"; "Kuril Islands" -> "Kuril Islands"
function regionOf(place: string) {
  const m = place.match(/,\s*([^,]+)$/)
  if (m) return m[1].trim()
  return place.replace(/^\d+\s*km\s+\w+\s+of\s+/i, '').trim() || 'Unknown'
}

// Display heuristic from magnitude only. This is not a risk model.
function levelFor(mag: number | null): 'high' | 'moderate' | 'low' {
  if (mag != null && mag >= 6) return 'high'
  if (mag != null && mag >= 4.5) return 'moderate'
  return 'low'
}

const LEVEL_LABEL = { high: 'High', moderate: 'Moderate', low: 'Low' } as const

const BANDS = [
  { key: 'minor', label: 'Minor (< 2.5)', color: '#4f8dff', test: (m: number) => m < 2.5 },
  { key: 'light', label: 'Light (2.5–4.4)', color: '#19e6c1', test: (m: number) => m >= 2.5 && m < 4.5 },
  { key: 'moderate', label: 'Moderate (4.5–5.9)', color: '#ffb84d', test: (m: number) => m >= 4.5 && m < 6 },
  { key: 'strong', label: 'Strong (6+)', color: '#ff4d6d', test: (m: number) => m >= 6 },
]

function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [feed, setFeed] = useState<EarthquakeFeed | null>(null)
  const [summary, setSummary] = useState<EarthquakeSummary | null>(null)
  const [apiError, setApiError] = useState('')
  const [loadedAt, setLoadedAt] = useState(0)
  const [tweet, setTweet] = useState('')
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [submittedTweet, setSubmittedTweet] = useState('')
  const [predicting, setPredicting] = useState(false)
  const [predictError, setPredictError] = useState('')

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      try {
        const responses = await Promise.all([
          fetch(`${API_BASE}/health`),
          fetch(`${API_BASE}/earthquakes?period=day`),
          fetch(`${API_BASE}/earthquakes/summary?period=day`),
        ])

        if (responses.some((response) => !response.ok)) {
          throw new Error('API request failed')
        }

        const [healthData, feedData, summaryData] = await Promise.all(
          responses.map((response) => response.json()),
        )

        if (active) {
          setHealth(healthData)
          setFeed(feedData)
          setSummary(summaryData)
          setLoadedAt(Date.now())
          setApiError('')
        }
      } catch {
        if (active) {
          setApiError('Live API data unavailable. Check that the backend is running.')
        }
      }
    }

    loadDashboard()
    const timer = window.setInterval(loadDashboard, REFRESH_MS)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  async function handlePredict(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPrediction(null)
    setPredictError('')

    if (!tweet.trim()) {
      setPredictError('Enter a message first.')
      return
    }

    setPredicting(true)

    try {
      const response = await fetch(`${API_BASE}/predict`,  {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweet: tweet.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Prediction request failed')
      }
      setSubmittedTweet(tweet.trim())
      setPrediction(data)
    } catch (error) {
      setPredictError(error instanceof Error ? error.message : 'Prediction failed')
    } finally {
      setPredicting(false)
    }
  }

  const latest = summary?.latest_event
  const apiLive = health?.status === 'healthy'
  const feedLive = feed != null && !apiError
  const modelReady = !!health?.model_loaded
  const eventCount = summary?.event_count
  const maxMagnitude = summary?.max_magnitude
  const events = useMemo(() => feed?.events ?? [], [feed])
  const strongCount = events.filter((e) => (e.magnitude ?? 0) >= 5).length

  /* Everything below is computed from the events the API already returns. */
  const regions = useMemo(() => {
    const map = new Map<string, { name: string; count: number; max: number | null }>()
    for (const e of events) {
      const name = regionOf(e.place)
      const cur = map.get(name) ?? { name, count: 0, max: null }
      cur.count += 1
      if (e.magnitude != null && (cur.max == null || e.magnitude > cur.max)) cur.max = e.magnitude
      map.set(name, cur)
    }
    return [...map.values()].sort((a, b) => b.count - a.count || (b.max ?? 0) - (a.max ?? 0))
  }, [events])

  const trend = useMemo(() => {
    const buckets = new Array<number>(24).fill(0)
    if (!loadedAt) return buckets
    for (const e of events) {
      const ago = Math.floor((loadedAt - new Date(e.time_utc).getTime()) / 3_600_000)
      if (ago >= 0 && ago < 24) buckets[23 - ago] += 1
    }
    return buckets
  }, [events, loadedAt])

  const bandCounts = useMemo(
    () => BANDS.map((b) => events.filter((e) => e.magnitude != null && b.test(e.magnitude)).length),
    [events],
  )

  const topRegions = regions.slice(0, 5)
  const allOk = apiLive && feedLive && modelReady
  const bandTotal = bandCounts.reduce((a, b) => a + b, 0)

  // Event trend chart geometry
  const CW = 300
  const CH = 120
  const tMax = Math.max(4, ...trend)
  const px = (i: number) => 28 + (i / 23) * (CW - 38)
  const py = (v: number) => CH - 18 - (v / tMax) * (CH - 30)
  const line = trend.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ')

  // Donut geometry
  const DR = 40
  const DC = 2 * Math.PI * DR
  let dOff = 0

  return (
    <main className="cp" id="top">
      {/* Top bar */}
      <header className="cp-top">
        <a className="cp-brand" href="#top" aria-label="CrisisProof home">
          <svg viewBox="0 0 48 44" width="44" height="40" aria-hidden="true">
            <defs>
              <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#2fd8ff" />
                <stop offset="1" stopColor="#9a5bff" />
              </linearGradient>
            </defs>
            <path d="M24 3 45 40H3z" fill="none" stroke="url(#lg)" strokeWidth="4" strokeLinejoin="round" />
            <path d="M24 17 34 36H14z" fill="url(#lg)" opacity=".85" />
          </svg>
          <span>
            <strong>CrisisProof AI</strong>
            <small>Global Risk Intelligence</small>
          </span>
        </a>

        <nav className="cp-nav" aria-label="Main navigation">
          <a className="on" href="#top">
            <Icon name="home" /> Command Center
          </a>
          <a href="#live-feed">
            <Icon name="pulse" /> Live Feed
          </a>
          <a href="#ai-analysis">
            <Icon name="flask" /> AI Analysis
          </a>
          <span className="off" title="Not connected yet">
            <Icon name="layers" /> Simulations
          </span>
          <span className="off" title="Not connected yet">
            <Icon name="report" /> Reports
          </span>
        </nav>

        <div className="cp-user">
          <a
            className="cp-bell"
            href="#live-feed"
            aria-label={`${strongCount} earthquakes of magnitude 5 or higher in the loaded feed`}
            title={`${strongCount} events M5+ in loaded feed`}
          >
            <Icon name="bell" size={22} />
            {strongCount > 0 && <i />}
          </a>
          <div className="cp-avatar" aria-hidden="true">
            {OPERATOR.name.charAt(0)}
          </div>
          <div className="cp-who">
            <strong>{OPERATOR.name}</strong>
            <small>{OPERATOR.role}</small>
          </div>
          <Icon name="chevron" size={16} />
        </div>
      </header>

      {apiError && (
        <div className="cp-error" role="alert">
          {apiError}
        </div>
      )}

      <div className="cp-grid">
        {/* Left column */}
        <aside className="cp-col">
          <section className="cp-panel" id="system-status">
            <h2>System Status</h2>
            <p className={allOk ? 'cp-ok' : 'cp-warn'}>
              <i /> {allOk ? 'All Systems Operational' : apiError ? 'Backend Unreachable' : 'Checking Systems…'}
            </p>
            <ul className="cp-status">
              <li>
                <Icon name="db" />
                <span>Data Ingestion</span>
                <b className={feedLive ? 'live' : 'down'}>{feedLive ? 'Live' : 'Offline'}</b>
              </li>
              <li>
                <Icon name="gear" />
                <span>API Service</span>
                <b className={apiLive ? 'live' : 'down'}>{apiLive ? 'Live' : 'Offline'}</b>
              </li>
              <li>
                <Icon name="cpu" />
                <span>Model Inference</span>
                <b className={modelReady ? 'live' : 'down'}>{modelReady ? 'Ready' : 'Offline'}</b>
              </li>
              <li>
                <Icon name="alert" />
                <span>Alerts &amp; Response</span>
                <b className="demo">Not connected</b>
              </li>
            </ul>
          </section>

          <section className="cp-panel cp-grow" id="ai-analysis">
            <div className="cp-head">
              <h2>Message Classifier</h2>
              <span className="cp-tag">MODEL v{health?.model_version ?? '—'}</span>
            </div>
            <form onSubmit={handlePredict}>
              <label htmlFor="mission-message">Message / tweet</label>
              <textarea
                id="mission-message"
                value={tweet}
                onChange={(event) => setTweet(event.target.value)}
                placeholder="Paste a crisis-related message for analysis…"
                rows={4}
                maxLength={5000}
              />
              <div className="cp-form-row">
                <small>{tweet.length} / 5000</small>
                <button type="submit" disabled={predicting}>
                  {predicting ? 'Analyzing…' : 'Run analysis'} <Icon name="link" size={14} />
                </button>
              </div>
            </form>

            {predictError && (
              <p className="cp-form-error" role="alert">
                {predictError}
              </p>
            )}

            {prediction ? (
              <div className="cp-result">
                <p><strong>Message:</strong> {submittedTweet}</p>
                <small>Model output · class {prediction.prediction}</small>
                <strong>{prediction.classification}</strong>
                <span>
                  Decision score {prediction.decision_score.toFixed(3)} · threshold {prediction.threshold}
                </span>
                <p>Decision score is not a probability. Treat it as a signal for human review.</p>
              </div>
            ) : (
              <p className="cp-note">
                Uses the trained historical dataset model. It does not confirm an active emergency.
              </p>
            )}
          </section>
        </aside>

        {/* Center column */}
        <section className="cp-center">
          <div className="cp-kpis" aria-label="System metrics">
            <article className="cp-kpi">
              <span className="ico c1">
                <Icon name="pulse" size={26} />
              </span>
              <div>
                <small>Live Events</small>
                <b>{eventCount != null ? eventCount.toLocaleString() : '—'}</b>
                <em>USGS · 24h</em>
              </div>
            </article>
            <article className="cp-kpi">
              <span className="ico c2">
                <Icon name="alert" size={26} />
              </span>
              <div>
                <small>Max Magnitude</small>
                <b>{maxMagnitude != null ? maxMagnitude.toFixed(1) : '—'}</b>
                <em>Current feed</em>
              </div>
            </article>
            <article className="cp-kpi">
              <span className="ico c3">
                <Icon name="layers" size={26} />
              </span>
              <div>
                <small>Loaded Records</small>
                <b>{feed ? feed.events.length.toLocaleString() : '—'}</b>
                <em>From API</em>
              </div>
            </article>
            <article className="cp-kpi">
              <span className="ico c4">
                <Icon name="target" size={26} />
              </span>
              <div>
                <small>Classifier</small>
                <b>{modelReady ? 'Ready' : '—'}</b>
                <em>v{health?.model_version ?? '—'}</em>
              </div>
            </article>
          </div>

          <div className="cp-stage">
            <CommandRoom />
            {topRegions.map((r, i) => {
              const lvl = levelFor(r.max)
              return (
                <div className={`cp-region s${i + 1} ${lvl}`} key={r.name}>
                  <span className="ri">
                    <Icon name="target" size={20} />
                  </span>
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {LEVEL_LABEL[lvl]} · {r.count} {r.count === 1 ? 'event' : 'events'}
                      {r.max != null ? ` · M${r.max.toFixed(1)}` : ''}
                    </small>
                  </span>
                </div>
              )
            })}
            {feed && topRegions.length === 0 && <p className="cp-stage-empty">No events returned for this period.</p>}
          </div>
          <p className="cp-note cp-stage-note">
            Region cards are the most active areas in the loaded feed, grouped from each event&apos;s place name. Activity level
            comes from the largest magnitude only and is not a risk model. Globe markers are illustrative, not geographic
            plotting.
          </p>

          <div className="cp-tiles">
            <a className="cp-tile t1" href="#live-feed">
              <Icon name="target" size={30} />
              <strong>Detect</strong>
              <small>USGS live signals</small>
            </a>
            <a className="cp-tile t2" href="#ai-analysis">
              <Icon name="bars" size={30} />
              <strong>Analyze</strong>
              <small>Message classifier</small>
            </a>
             <a className="cp-tile t3" href="#ai-analysis">
                <Icon name="trend" size={30} />
                <strong>Predict</strong>
                <small>Open message classifier</small>
              </a>
              <a className="cp-tile t3" href="#ai-analysis">
                <Icon name="trend" size={30} />
                <strong>respond</strong>
                <small>Open message classifier</small>
             </a>
          </div>
        </section>

        {/* Right column */}
        <aside className="cp-col">
          <section className="cp-panel">
            <div className="cp-head">
              <h2>Region Activity</h2>
              <span className="cp-tag">24H</span>
            </div>
            {regions.length === 0 ? (
              <p className="cp-empty">{feed ? 'No events returned for this period.' : 'Loading live USGS feed…'}</p>
            ) : (
              <ul className="cp-bars">
                {regions.slice(0, 6).map((r) => (
                  <li key={r.name}>
                    <span>{r.name}</span>
                    <i>
                      <u className={levelFor(r.max)} style={{ width: `${(r.count / regions[0].count) * 100}%` }} />
                    </i>
                    <b>{r.count}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cp-panel">
            <div className="cp-head">
              <h2>Event Trend (24h)</h2>
              <span className="cp-tag">{events.length} LOADED</span>
            </div>
            <svg className="cp-trend" viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="Events per hour over the last 24 hours">
              <defs>
                <linearGradient id="tfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#9a5bff" stopOpacity=".5" />
                  <stop offset="1" stopColor="#9a5bff" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 0.5, 1].map((f) => (
                <g key={f}>
                  <line x1="28" x2={CW - 10} y1={py(tMax * f)} y2={py(tMax * f)} />
                  <text x="22" y={py(tMax * f) + 3} textAnchor="end">
                    {Math.round(tMax * f)}
                  </text>
                </g>
              ))}
              <path d={`${line} L${px(23)} ${py(0)} L${px(0)} ${py(0)}Z`} fill="url(#tfill)" />
              <path d={line} className="tl" />
              <circle cx={px(23)} cy={py(trend[23])} r="3.5" />
              {[0, 6, 12, 18, 23].map((i) => (
                <text key={i} x={px(i)} y={CH - 3} textAnchor="middle">
                  {i === 23 ? 'Now' : `-${23 - i}h`}
                </text>
              ))}
            </svg>
          </section>

          <section className="cp-panel">
            <div className="cp-head">
              <h2>Magnitude Bands</h2>
              <span className="cp-tag">LOADED FEED</span>
            </div>
            <div className="cp-donut-row">
              <div className="cp-donut">
                <svg viewBox="0 0 100 100" role="img" aria-label="Events by magnitude band">
                  <circle cx="50" cy="50" r={DR} className="trk" />
                  {BANDS.map((b, i) => {
                    const len = bandTotal ? (bandCounts[i] / bandTotal) * DC : 0
                    const el = (
                      <circle
                        key={b.key}
                        cx="50"
                        cy="50"
                        r={DR}
                        stroke={b.color}
                        strokeDasharray={`${Math.max(0, len - 1.5)} ${DC}`}
                        strokeDashoffset={-dOff}
                      />
                    )
                    dOff += len
                    return el
                  })}
                </svg>
                <div>
                  <b>{eventCount ?? '—'}</b>
                  <small>Events</small>
                </div>
              </div>
              <ul className="cp-legend">
                {BANDS.map((b, i) => (
                  <li key={b.key} style={{ '--c': b.color } as CSSProperties}>
                    <i />
                    {b.label}
                    <b>{bandTotal ? Math.round((bandCounts[i] / bandTotal) * 100) : 0}%</b>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </aside>
      </div>

      {/* Live feed */}
      <section className="cp-panel cp-feed" id="live-feed">
        <div className="cp-head">
          <h2>Recent Earthquakes</h2>
          <span className="cp-tag">
            {latest?.magnitude != null ? `LATEST M${latest.magnitude.toFixed(1)} · ` : ''}USGS · PAST 24 HOURS
          </span>
        </div>
        <div className="cp-events">
          {events.slice(0, 6).map((event) => (
            <a className="cp-event" href={event.source_url} target="_blank" rel="noreferrer" key={event.event_id}>
              <strong className={levelFor(event.magnitude)}>
                {event.magnitude != null ? event.magnitude.toFixed(1) : '—'}
              </strong>
              <span>
                {event.place}
                <small>{new Date(event.time_utc).toLocaleString()}</small>
              </span>
              <Icon name="link" size={16} />
            </a>
          ))}
          {!feed && <p className="cp-empty">Loading live USGS feed…</p>}
          {feed && events.length === 0 && <p className="cp-empty">No events returned for this period.</p>}
        </div>
      </section>

      <footer className="cp-foot">
        <span>CRISISPROOF AI · COMMAND INTERFACE PROTOTYPE</span>
        <span>USGS LIVE FEED + HISTORICAL TEXT MODEL · NOT FOR EMERGENCY DISPATCH · HUMAN REVIEW REQUIRED</span>
      </footer>
    </main>
  )
}

export default App
