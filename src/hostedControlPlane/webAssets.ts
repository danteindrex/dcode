export function renderHostedControlPlaneHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Hosted Control Plane</title>
    <link rel="stylesheet" href="/app.css">
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Hosted Remote Response Channel</p>
        <h1>Hosted Control Plane</h1>
        <p class="summary">
          Pick a connected session, send a command, and watch the assistant response
          stream back for that session in real time. The browser talks to
          <code>/api/sessions/:sessionId/commands</code> and
          <code>/api/sessions/:sessionId/commands/:commandId</code>.
        </p>
      </section>

      <section class="grid">
        <section class="panel">
          <div class="panel-header">
            <div>
              <h2>My Sessions</h2>
              <p class="panel-note">Authenticated sessions owned by the current user.</p>
            </div>
            <button id="refresh-sessions" type="button">Refresh</button>
          </div>
          <label class="field" for="session-select">
            <span>Active session</span>
            <select id="session-select"></select>
          </label>
          <div id="sessions" class="session-list">Loading /api/sessions...</div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <h2>Send Command</h2>
              <p class="panel-note">The selected session must be connected and claimed by the CLI.</p>
            </div>
          </div>
          <form id="command-form" class="command-form">
            <label class="field" for="command-input">
              <span>Message</span>
              <textarea id="command-input" name="command" rows="5" placeholder="Reply with exactly OK"></textarea>
            </label>
            <div class="command-actions">
              <button type="submit">Queue command</button>
              <span id="command-status" class="status">No command sent yet.</span>
            </div>
          </form>
        </section>

        <section class="panel panel-wide">
          <div class="panel-header">
            <div>
              <h2>Response Stream</h2>
              <p class="panel-note">Latest command and assistant output for the selected session.</p>
            </div>
            <button id="refresh-command" type="button">Refresh</button>
          </div>
          <pre id="command-output">Select a session and send a command.</pre>
        </section>
      </section>
    </main>
    <script src="/app.js" type="module"></script>
  </body>
</html>`
}

export function renderHostedControlPlaneCss(): string {
  return `:root {
  color-scheme: light;
  --bg: #f4efe7;
  --panel: rgba(255, 252, 246, 0.9);
  --panel-strong: rgba(255, 249, 240, 0.98);
  --ink: #1f1b18;
  --muted: #675a4f;
  --line: rgba(31, 27, 24, 0.14);
  --accent: #b9572d;
  --accent-strong: #8f421f;
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: Georgia, "Times New Roman", serif;
  color: var(--ink);
  background:
    radial-gradient(circle at top left, rgba(185, 87, 45, 0.18), transparent 28rem),
    radial-gradient(circle at top right, rgba(125, 90, 200, 0.08), transparent 22rem),
    linear-gradient(180deg, #fbf6ee 0%, var(--bg) 100%);
}

.shell {
  width: min(72rem, calc(100vw - 2rem));
  margin: 0 auto;
  padding: 2.5rem 0 4rem;
}

.hero {
  margin-bottom: 1.75rem;
}

.eyebrow {
  margin: 0 0 0.6rem;
  font-size: 0.78rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: clamp(2.6rem, 6vw, 4.8rem);
  line-height: 0.92;
  max-width: 12ch;
}

.summary {
  max-width: 46rem;
  margin-top: 1rem;
  color: var(--muted);
  font-size: 1.05rem;
  line-height: 1.7;
}

.grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.panel {
  border: 1px solid var(--line);
  border-radius: 1.25rem;
  background: var(--panel);
  box-shadow: 0 1.2rem 3rem rgba(49, 35, 24, 0.08);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.panel-wide {
  grid-column: 1 / -1;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.2rem 1.2rem 0;
}

.panel-note {
  margin-top: 0.35rem;
  font-size: 0.92rem;
  color: var(--muted);
  line-height: 1.45;
}

button {
  border: 0;
  border-radius: 999px;
  padding: 0.68rem 1rem;
  font: inherit;
  color: #fff8f2;
  background: linear-gradient(180deg, var(--accent), var(--accent-strong));
  cursor: pointer;
  box-shadow: 0 0.6rem 1.4rem rgba(185, 87, 45, 0.24);
}

button:hover {
  filter: brightness(1.03);
}

.field {
  display: grid;
  gap: 0.45rem;
  padding: 1rem 1.2rem 0;
}

.field span {
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

select,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 0.95rem;
  background: var(--panel-strong);
  color: var(--ink);
  font: inherit;
}

select {
  padding: 0.8rem 0.9rem;
}

textarea {
  min-height: 8rem;
  padding: 0.9rem;
  resize: vertical;
}

.command-form {
  padding-bottom: 1.2rem;
}

.command-actions {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  justify-content: space-between;
  padding: 1rem 1.2rem 0;
  flex-wrap: wrap;
}

.status {
  color: var(--muted);
  font-size: 0.92rem;
}

.session-list {
  padding: 1rem 1.2rem 1.2rem;
  display: grid;
  gap: 0.8rem;
}

.session-card {
  border: 1px solid var(--line);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.5);
  padding: 0.9rem 1rem;
}

.session-card.active {
  border-color: rgba(185, 87, 45, 0.35);
  background: rgba(255, 248, 241, 0.9);
}

.session-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}

.session-title strong {
  font-size: 1rem;
}

.session-meta {
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  background: rgba(185, 87, 45, 0.12);
  color: var(--accent-strong);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

pre {
  margin: 0;
  padding: 1.2rem;
  overflow: auto;
  color: var(--muted);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.92rem;
  line-height: 1.55;
  background: rgba(255, 255, 255, 0.4);
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .panel-wide {
    grid-column: auto;
  }
}

@media (max-width: 640px) {
  .shell {
    width: min(100vw - 1rem, 72rem);
    padding-top: 1.2rem;
  }

  h1 {
    max-width: 10ch;
  }

  .panel-header,
  .command-actions {
    flex-direction: column;
    align-items: stretch;
  }

  button {
    width: 100%;
  }
}`
}

export function renderHostedControlPlaneJs(): string {
  return `const sessionsNode = document.getElementById('sessions')
const sessionsSelect = document.getElementById('session-select')
const refreshSessionsButton = document.getElementById('refresh-sessions')
const refreshCommandButton = document.getElementById('refresh-command')
const commandForm = document.getElementById('command-form')
const commandInput = document.getElementById('command-input')
const commandStatus = document.getElementById('command-status')
const commandOutput = document.getElementById('command-output')

let sessions = []
let activeSessionId = null
let activeCommandId = null

function getSessionById(sessionId) {
  return sessions.find(session => session.id === sessionId) ?? null
}

function setCommandStatus(text) {
  if (commandStatus) {
    commandStatus.textContent = text
  }
}

function renderSessionOptions() {
  if (!sessionsSelect) {
    return
  }

  sessionsSelect.innerHTML = ''

  if (sessions.length === 0) {
    const option = document.createElement('option')
    option.value = ''
    option.textContent = 'No connected sessions'
    sessionsSelect.appendChild(option)
    sessionsSelect.disabled = true
    activeSessionId = null
    return
  }

  sessionsSelect.disabled = false
  for (const session of sessions) {
    const option = document.createElement('option')
    option.value = session.id
    option.textContent = session.id + ' - ' + session.machineId
    sessionsSelect.appendChild(option)
  }

  if (!activeSessionId || !sessions.some(session => session.id === activeSessionId)) {
    activeSessionId = sessions[0].id
  }

  sessionsSelect.value = activeSessionId
}

function renderSessions() {
  if (!sessionsNode) {
    return
  }

  if (sessions.length === 0) {
    sessionsNode.innerHTML = '<div class="session-card">No connected sessions yet.</div>'
    return
  }

  sessionsNode.innerHTML = sessions
    .map(session => {
      const providerList = session.providers.join(', ')
      const activeClass = session.id === activeSessionId ? ' active' : ''
      return '<article class="session-card' + activeClass + '">' +
        '<div class="session-title">' +
          '<strong>' + session.id + '</strong>' +
          '<span class="badge">' + (session.connected ? 'connected' : 'offline') + '</span>' +
        '</div>' +
        '<div class="session-meta">' +
          'Owner: ' + session.ownerUserId + '<br />' +
          'Machine: ' + session.machineId + '<br />' +
          'Providers: ' + providerList + '<br />' +
          'Last seen: ' + session.lastSeenAt +
        '</div>' +
      '</article>'
    })
    .join('')
}

async function getJson(path, init) {
  const response = await fetch(path, init)
  if (!response.ok) {
    throw new Error(path + ' failed: ' + response.status)
  }
  return response.json()
}

async function loadSessions() {
  try {
    const payload = await getJson('/api/sessions')
    sessions = Array.isArray(payload.sessions) ? payload.sessions : []
    renderSessionOptions()
    renderSessions()
    if (sessions.length > 0) {
      await loadCommand()
    } else if (commandOutput) {
      commandOutput.textContent = 'No connected sessions yet.'
    }
  } catch (error) {
    if (sessionsNode) {
      sessionsNode.textContent = String(error)
    }
    setCommandStatus('Failed to load sessions.')
  }
}

async function submitCommand(sessionId, text) {
  const payload = await getJson('/api/sessions/' + encodeURIComponent(sessionId) + '/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  activeCommandId = payload.command?.id ?? null
  setCommandStatus(activeCommandId ? 'Queued command ' + activeCommandId : 'Command queued.')
  await loadCommand()
}

function normalizeCommandPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { command: null, events: [] }
  }

  const command = payload.command && typeof payload.command === 'object' ? payload.command : null
  const events = Array.isArray(payload.events) ? payload.events : []
  return { command, events }
}

async function loadCommand() {
  if (!activeSessionId || !activeCommandId) {
    if (commandOutput) {
      commandOutput.textContent = 'Select a session and send a command.'
    }
    return
  }

  try {
    const payload = await getJson(
      '/api/sessions/' + encodeURIComponent(activeSessionId) + '/commands/' + encodeURIComponent(activeCommandId),
    )
    const normalized = normalizeCommandPayload(payload)
    if (commandOutput) {
      commandOutput.textContent = JSON.stringify(
        {
          session: getSessionById(activeSessionId),
          command: normalized.command,
          events: normalized.events,
        },
        null,
        2,
      )
    }

    const status = normalized.command?.status
    if (typeof status === 'string') {
      setCommandStatus('Command ' + activeCommandId + ' is ' + status + '.')
    }
  } catch (error) {
    if (commandOutput) {
      commandOutput.textContent = String(error)
    }
    setCommandStatus('Failed to load command state.')
  }
}

sessionsSelect?.addEventListener('change', event => {
  const target = event.currentTarget
  activeSessionId = target && 'value' in target ? target.value : null
  activeCommandId = null
  renderSessions()
  if (commandOutput) {
    commandOutput.textContent = 'Select a session and send a command.'
  }
})

refreshSessionsButton?.addEventListener('click', () => {
  void loadSessions()
})

refreshCommandButton?.addEventListener('click', () => {
  void loadCommand()
})

commandForm?.addEventListener('submit', async event => {
  event.preventDefault()
  if (!activeSessionId) {
    setCommandStatus('Select a session first.')
    return
  }

  const value = typeof commandInput?.value === 'string' ? commandInput.value.trim() : ''
  if (!value) {
    setCommandStatus('Type a command before sending.')
    return
  }

  setCommandStatus('Queuing command...')
  try {
    await submitCommand(activeSessionId, value)
    if (commandInput) {
      commandInput.value = ''
    }
  } catch (error) {
    setCommandStatus(String(error))
  }
})

setInterval(() => {
  void loadSessions()
}, 5000)

setInterval(() => {
  void loadCommand()
}, 1500)

void loadSessions()`
}
