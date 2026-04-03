export function renderControlPlaneHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Claude Code Control Plane</title>
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">Local Control Plane</p>
          <h1>CLI, providers, telemetry, and remote commands</h1>
          <p class="lede">
            This local web app surfaces the runtime state of the CLI without
            replacing the existing terminal workflow.
          </p>
        </div>
        <form id="command-form" class="command-form">
          <label for="command-input">Queue a command for the CLI</label>
          <div class="command-row">
            <input id="command-input" name="command" placeholder="Explain the last failure" />
            <button type="submit">Queue</button>
          </div>
        </form>
      </header>

      <section class="grid">
        <article class="panel">
          <h2>Backend Targets</h2>
          <pre id="targets" class="code"></pre>
        </article>
        <article class="panel">
          <h2>Auth Readiness</h2>
          <ul id="auth-status" class="list"></ul>
        </article>
        <article class="panel">
          <h2>Telemetry</h2>
          <div id="telemetry-summary" class="metric"></div>
          <pre id="telemetry" class="code"></pre>
        </article>
        <article class="panel">
          <h2>Remote Commands</h2>
          <ul id="commands" class="list"></ul>
        </article>
      </section>
    </main>
    <script src="/app.js" type="module"></script>
  </body>
</html>`
}

export function renderControlPlaneCss(): string {
  return `:root {
  color-scheme: dark;
  --bg: #08111f;
  --bg-accent: radial-gradient(circle at top left, #1d4ed8 0%, transparent 35%),
    radial-gradient(circle at bottom right, #0f766e 0%, transparent 30%),
    #08111f;
  --panel: rgba(15, 23, 42, 0.86);
  --border: rgba(148, 163, 184, 0.24);
  --text: #e2e8f0;
  --muted: #94a3b8;
  --accent: #38bdf8;
  --success: #22c55e;
  --warning: #f59e0b;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", ui-sans-serif, sans-serif;
  background: var(--bg-accent);
  color: var(--text);
}
.shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 20px 48px;
}
.hero {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
  align-items: start;
  margin-bottom: 24px;
}
.eyebrow {
  margin: 0 0 8px;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 12px;
}
h1, h2 { margin: 0 0 12px; }
.lede, label { color: var(--muted); }
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.panel, .command-form {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 18px;
  backdrop-filter: blur(14px);
}
.command-row {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
input, button {
  border-radius: 12px;
  border: 1px solid var(--border);
  font: inherit;
}
input {
  flex: 1;
  background: rgba(15, 23, 42, 0.9);
  color: var(--text);
  padding: 12px 14px;
}
button {
  background: linear-gradient(135deg, #0ea5e9, #14b8a6);
  color: white;
  padding: 12px 16px;
  cursor: pointer;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}
.list li {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
}
.code {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #bfdbfe;
}
.metric {
  font-size: 28px;
  font-weight: 700;
  color: var(--success);
  margin-bottom: 12px;
}
@media (max-width: 900px) {
  .hero, .grid { grid-template-columns: 1fr; }
}`
}

export function renderControlPlaneJs(): string {
  return `async function getJson(path, init) {
  const response = await fetch(path, init)
  if (!response.ok) {
    throw new Error(\`\${path} failed: \${response.status}\`)
  }
  return response.json()
}

function renderList(target, items, formatter) {
  target.innerHTML = ''
  for (const item of items) {
    const li = document.createElement('li')
    li.innerHTML = formatter(item)
    target.appendChild(li)
  }
}

async function refresh() {
  const [status, telemetry, commands] = await Promise.all([
    getJson('/api/status'),
    getJson('/api/telemetry'),
    getJson('/api/commands'),
  ])

  document.getElementById('targets').textContent = JSON.stringify(status.backendTargets, null, 2)
  document.getElementById('telemetry-summary').textContent =
    \`\${status.telemetry.count} events\`
  document.getElementById('telemetry').textContent = JSON.stringify(telemetry, null, 2)

  renderList(
    document.getElementById('auth-status'),
    Object.entries(status.auth),
    ([provider, ready]) => \`<strong>\${provider}</strong><br /><span>\${ready ? 'ready' : 'missing credentials/runtime'}</span>\`,
  )

  renderList(
    document.getElementById('commands'),
    commands.commands,
    command => \`<strong>\${command.text}</strong><br /><span>\${command.status} · \${command.createdAt}</span>\`,
  )
}

document.getElementById('command-form').addEventListener('submit', async event => {
  event.preventDefault()
  const input = document.getElementById('command-input')
  const text = input.value.trim()
  if (!text) return
  await getJson('/api/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  input.value = ''
  await refresh()
})

await refresh()
setInterval(refresh, 3000)
`
}
