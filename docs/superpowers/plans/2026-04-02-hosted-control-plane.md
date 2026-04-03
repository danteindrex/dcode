# Hosted Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current local-only control-plane with a hosted-ready web app and backend that can authenticate users, register CLI instances, deliver remote commands securely, ingest telemetry, and keep the existing CLI working.

**Architecture:** Keep the current CLI runtime and provider system intact, but insert a hosted control-plane backend between the browser and CLI. Reuse the new local control-plane concepts as the reference contract, then split them into a deployable backend API, a hosted web app client, and a persistent CLI agent channel. Do not break existing local CLI behavior while adding hosted functionality.

**Tech Stack:** Bun, TypeScript, existing CLI/TUI runtime, HTTP server, WebSocket or SSE channel, existing OAuth/runtime helpers, existing provider runtime, Bun test.

---

## File Structure

### New backend area

- `src/hostedControlPlane/types.ts`
  Shared types for hosted sessions, agents, telemetry batches, queued commands, auth session shape, and API responses.
- `src/hostedControlPlane/store.ts`
  In-memory store first, shaped so it can later swap to persistent storage.
- `src/hostedControlPlane/auth.ts`
  Hosted browser auth/session cookie or token helpers.
- `src/hostedControlPlane/server.ts`
  HTTP API server for browser and CLI registration.
- `src/hostedControlPlane/channel.ts`
  Long-lived CLI connection management for remote command delivery.
- `src/hostedControlPlane/webAssets.ts`
  Hosted web app HTML/CSS/JS shell.
- `src/hostedControlPlane/runtime.ts`
  Shared runtime bootstrap helpers for hosted mode.

### CLI integration

- `src/controlPlane/*`
  Keep as local companion mode. Do not delete yet.
- `src/services/backend/targets.ts`
  Add hosted/local target selection logic.
- `src/main.tsx`
  Register hosted server and CLI agent commands.
- `src/commands/webapp-control/*`
  Evolve from local-only control-plane management into local/hosted aware management.
- `src/hooks/useControlPlaneBridge.ts`
  Extend to consume hosted queued commands from the CLI agent channel, not only local queue state.

### OAuth and provider integration

- `src/providers/openai-codex/oauth.ts`
  Keep native OAuth flow, but let hosted web UI surface account state cleanly.
- `src/services/oauth/*`
  Reuse where compatible, but separate Anthropic-specific assumptions from generic hosted app auth.

### Tests

- `src/hostedControlPlane/*.test.ts`
- Existing tests under:
  - `src/services/backend/targets.test.ts`
  - `src/providers/openai-codex/oauth.test.ts`
  - `src/controlPlane/*.test.ts`
  - `src/commands/webapp-control/index.test.ts`

---

### Task 1: Define the hosted control-plane contract

**Files:**
- Create: `src/hostedControlPlane/types.ts`
- Create: `src/hostedControlPlane/types.test.ts`
- Modify: `src/controlPlane/store.ts`
- Test: `src/hostedControlPlane/types.test.ts`

- [ ] **Step 1: Write the failing type-contract test**

```ts
// src/hostedControlPlane/types.test.ts
import { describe, expect, test } from 'bun:test'
import type {
  HostedAgentSession,
  HostedQueuedCommand,
  HostedTelemetryBatch,
} from './types.js'

describe('hosted control-plane types', () => {
  test('session and command shapes remain stable', () => {
    const session: HostedAgentSession = {
      id: 'session_123',
      ownerUserId: 'user_123',
      machineId: 'machine_123',
      connected: true,
      lastSeenAt: '2026-04-02T00:00:00.000Z',
      providers: ['anthropic', 'openai-codex'],
    }

    const command: HostedQueuedCommand = {
      id: 'cmd_123',
      sessionId: 'session_123',
      text: 'Explain the latest error',
      status: 'queued',
      createdAt: '2026-04-02T00:00:00.000Z',
      source: 'web',
    }

    const telemetry: HostedTelemetryBatch = {
      sessionId: 'session_123',
      receivedAt: '2026-04-02T00:00:00.000Z',
      events: [{ type: 'event' }],
    }

    expect(session.connected).toBe(true)
    expect(command.status).toBe('queued')
    expect(telemetry.events).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/hostedControlPlane/types.test.ts`

Expected: FAIL because `src/hostedControlPlane/types.ts` does not exist.

- [ ] **Step 3: Add the shared hosted types**

```ts
// src/hostedControlPlane/types.ts
export type HostedProviderId =
  | 'anthropic'
  | 'openai'
  | 'openai-codex'
  | 'gemini'
  | 'ollama'

export type HostedAgentSession = {
  id: string
  ownerUserId: string
  machineId: string
  connected: boolean
  lastSeenAt: string
  providers: HostedProviderId[]
}

export type HostedQueuedCommand = {
  id: string
  sessionId: string
  text: string
  status: 'queued' | 'claimed' | 'completed'
  createdAt: string
  source: 'web'
}

export type HostedTelemetryBatch = {
  sessionId: string
  receivedAt: string
  events: unknown[]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/hostedControlPlane/types.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/types.ts src/hostedControlPlane/types.test.ts
git commit -m "feat: define hosted control-plane contracts"
```

### Task 2: Build the hosted backend store and session registry

**Files:**
- Create: `src/hostedControlPlane/store.ts`
- Create: `src/hostedControlPlane/store.test.ts`
- Modify: `src/hostedControlPlane/types.ts`
- Test: `src/hostedControlPlane/store.test.ts`

- [ ] **Step 1: Write the failing store test**

```ts
// src/hostedControlPlane/store.test.ts
import { describe, expect, test } from 'bun:test'
import { createHostedControlPlaneStore } from './store.js'

describe('hosted control-plane store', () => {
  test('registers sessions and queues commands by session', () => {
    const store = createHostedControlPlaneStore()
    store.upsertSession({
      id: 'session_1',
      ownerUserId: 'user_1',
      machineId: 'machine_1',
      connected: true,
      lastSeenAt: '2026-04-02T00:00:00.000Z',
      providers: ['anthropic'],
    })
    const command = store.enqueueCommand('session_1', 'Run diagnostics')

    expect(store.getSession('session_1')?.machineId).toBe('machine_1')
    expect(command.sessionId).toBe('session_1')
    expect(store.listQueuedCommands('session_1')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/hostedControlPlane/store.test.ts`

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement the minimal hosted store**

```ts
// src/hostedControlPlane/store.ts
import { randomUUID } from 'crypto'
import type {
  HostedAgentSession,
  HostedQueuedCommand,
  HostedTelemetryBatch,
} from './types.js'

export function createHostedControlPlaneStore() {
  const sessions = new Map<string, HostedAgentSession>()
  const commands = new Map<string, HostedQueuedCommand[]>()
  const telemetry = new Map<string, HostedTelemetryBatch[]>()

  return {
    upsertSession(session: HostedAgentSession) {
      sessions.set(session.id, session)
    },
    getSession(id: string) {
      return sessions.get(id)
    },
    listSessions() {
      return [...sessions.values()]
    },
    enqueueCommand(sessionId: string, text: string): HostedQueuedCommand {
      const command: HostedQueuedCommand = {
        id: randomUUID(),
        sessionId,
        text,
        status: 'queued',
        createdAt: new Date().toISOString(),
        source: 'web',
      }
      const queue = commands.get(sessionId) ?? []
      queue.push(command)
      commands.set(sessionId, queue)
      return command
    },
    listQueuedCommands(sessionId: string) {
      return (commands.get(sessionId) ?? []).filter(c => c.status === 'queued')
    },
    addTelemetry(batch: HostedTelemetryBatch) {
      const batches = telemetry.get(batch.sessionId) ?? []
      batches.push(batch)
      telemetry.set(batch.sessionId, batches)
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/hostedControlPlane/store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/store.ts src/hostedControlPlane/store.test.ts
git commit -m "feat: add hosted control-plane session store"
```

### Task 3: Expose the hosted backend HTTP API

**Files:**
- Create: `src/hostedControlPlane/server.ts`
- Create: `src/hostedControlPlane/server.test.ts`
- Modify: `src/hostedControlPlane/store.ts`
- Test: `src/hostedControlPlane/server.test.ts`

- [ ] **Step 1: Write the failing server test**

```ts
// src/hostedControlPlane/server.test.ts
import { describe, expect, test } from 'bun:test'
import { startHostedControlPlaneServer } from './server.js'

describe('hosted control-plane server', () => {
  test('serves status and session APIs', async () => {
    const server = await startHostedControlPlaneServer()
    try {
      const health = await fetch(`${server.url}/health`)
      expect(health.status).toBe(200)

      const sessions = await fetch(`${server.url}/api/sessions`)
      expect(sessions.status).toBe(200)
    } finally {
      await server.close()
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/hostedControlPlane/server.test.ts`

Expected: FAIL because the server does not exist.

- [ ] **Step 3: Implement the HTTP API**

```ts
// src/hostedControlPlane/server.ts
import { createServer } from 'http'
import { createHostedControlPlaneStore } from './store.js'

export async function startHostedControlPlaneServer() {
  const store = createHostedControlPlaneStore()
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }
    if (req.url === '/api/sessions') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ sessions: store.listSessions() }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve server address')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    store,
    close: async () =>
      await new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve())),
      ),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/hostedControlPlane/server.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/server.ts src/hostedControlPlane/server.test.ts
git commit -m "feat: add hosted control-plane http api"
```

### Task 4: Add browser auth and session ownership

**Files:**
- Create: `src/hostedControlPlane/auth.ts`
- Create: `src/hostedControlPlane/auth.test.ts`
- Modify: `src/hostedControlPlane/server.ts`
- Test: `src/hostedControlPlane/auth.test.ts`
- Test: `src/hostedControlPlane/server.test.ts`

- [ ] **Step 1: Write the failing auth test**

```ts
// src/hostedControlPlane/auth.test.ts
import { describe, expect, test } from 'bun:test'
import { createHostedAuthSession } from './auth.js'

describe('hosted control-plane auth', () => {
  test('creates a stable browser auth session shape', () => {
    const session = createHostedAuthSession('user_1')
    expect(session.userId).toBe('user_1')
    expect(typeof session.sessionToken).toBe('string')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/hostedControlPlane/auth.test.ts`

Expected: FAIL because the auth helper does not exist.

- [ ] **Step 3: Add minimal hosted auth helpers**

```ts
// src/hostedControlPlane/auth.ts
import { randomUUID } from 'crypto'

export type HostedBrowserSession = {
  userId: string
  sessionToken: string
  createdAt: string
}

export function createHostedAuthSession(userId: string): HostedBrowserSession {
  return {
    userId,
    sessionToken: randomUUID(),
    createdAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 4: Run the auth test**

Run: `bun test src/hostedControlPlane/auth.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/auth.ts src/hostedControlPlane/auth.test.ts
git commit -m "feat: add hosted browser auth session helpers"
```

### Task 5: Add persistent CLI registration and heartbeat channel

**Files:**
- Create: `src/hostedControlPlane/channel.ts`
- Create: `src/hostedControlPlane/channel.test.ts`
- Modify: `src/hostedControlPlane/server.ts`
- Modify: `src/main.tsx`
- Test: `src/hostedControlPlane/channel.test.ts`

- [ ] **Step 1: Write the failing channel test**

```ts
// src/hostedControlPlane/channel.test.ts
import { describe, expect, test } from 'bun:test'
import { createHostedChannelRegistry } from './channel.js'

describe('hosted control-plane channel', () => {
  test('tracks registered cli agents by session id', () => {
    const registry = createHostedChannelRegistry()
    registry.register('session_1', { machineId: 'machine_1' })
    expect(registry.get('session_1')?.machineId).toBe('machine_1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/hostedControlPlane/channel.test.ts`

Expected: FAIL because the channel registry does not exist.

- [ ] **Step 3: Implement the channel registry**

```ts
// src/hostedControlPlane/channel.ts
export function createHostedChannelRegistry() {
  const sessions = new Map<string, { machineId: string }>()
  return {
    register(sessionId: string, payload: { machineId: string }) {
      sessions.set(sessionId, payload)
    },
    unregister(sessionId: string) {
      sessions.delete(sessionId)
    },
    get(sessionId: string) {
      return sessions.get(sessionId)
    },
  }
}
```

- [ ] **Step 4: Run the test**

Run: `bun test src/hostedControlPlane/channel.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/channel.ts src/hostedControlPlane/channel.test.ts
git commit -m "feat: add hosted cli registration channel"
```

### Task 6: Move the web app from local shell to hosted client

**Files:**
- Create: `src/hostedControlPlane/webAssets.ts`
- Create: `src/hostedControlPlane/webAssets.test.ts`
- Modify: `src/controlPlane/assets.ts`
- Modify: `src/commands/webapp-control/webapp-control.tsx`
- Test: `src/hostedControlPlane/webAssets.test.ts`

- [ ] **Step 1: Write the failing web-assets test**

```ts
// src/hostedControlPlane/webAssets.test.ts
import { describe, expect, test } from 'bun:test'
import { renderHostedControlPlaneHtml } from './webAssets.js'

describe('hosted control-plane web assets', () => {
  test('renders the hosted app shell', () => {
    const html = renderHostedControlPlaneHtml()
    expect(html).toContain('Hosted Control Plane')
    expect(html).toContain('/api/sessions')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/hostedControlPlane/webAssets.test.ts`

Expected: FAIL because the hosted web asset renderer does not exist.

- [ ] **Step 3: Implement the hosted web app shell**

```ts
// src/hostedControlPlane/webAssets.ts
export function renderHostedControlPlaneHtml(): string {
  return `<!doctype html>
  <html>
    <head><meta charset="utf-8"><title>Hosted Control Plane</title></head>
    <body>
      <main>
        <h1>Hosted Control Plane</h1>
        <p>Sessions are loaded from /api/sessions.</p>
      </main>
    </body>
  </html>`
}
```

- [ ] **Step 4: Run the test**

Run: `bun test src/hostedControlPlane/webAssets.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/webAssets.ts src/hostedControlPlane/webAssets.test.ts
git commit -m "feat: add hosted web app shell"
```

### Task 7: Route the CLI to hosted or local control-plane targets safely

**Files:**
- Modify: `src/services/backend/targets.ts`
- Modify: `src/services/backend/targets.test.ts`
- Modify: `src/commands/webapp-control/webapp-control.tsx`
- Modify: `src/controlPlane/manager.ts`
- Test: `src/services/backend/targets.test.ts`

- [ ] **Step 1: Write the failing target-selection test**

```ts
// add to src/services/backend/targets.test.ts
test('prefers explicit hosted backend over local runtime when configured', () => {
  process.env.CLAUDE_CODE_APP_BACKEND_URL = 'https://hosted.example.test'
  expect(getBackendTargets().apiBaseUrl).toBe('https://hosted.example.test')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/services/backend/targets.test.ts`

Expected: FAIL if hosted/local precedence is not correct.

- [ ] **Step 3: Implement explicit hosted/local precedence**

```ts
// src/services/backend/targets.ts
const hostedBackendUrl = process.env.CLAUDE_CODE_APP_BACKEND_URL
const localControlPlaneUrl = readActiveControlPlaneRuntime()?.url
const apiBaseUrl = normalizeUrl(
  hostedBackendUrl || localControlPlaneUrl || oauthConfig.BASE_API_URL,
)
```

- [ ] **Step 4: Run the target tests**

Run: `bun test src/services/backend/targets.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/backend/targets.ts src/services/backend/targets.test.ts src/commands/webapp-control/webapp-control.tsx src/controlPlane/manager.ts
git commit -m "refactor: support hosted and local control-plane target selection"
```

### Task 8: Deliver remote browser commands to real CLI sessions

**Files:**
- Modify: `src/hooks/useControlPlaneBridge.ts`
- Modify: `src/controlPlane/queueBridge.ts`
- Modify: `src/controlPlane/server.ts`
- Create: `src/controlPlane/queueBridge.integration.test.ts`
- Test: `src/controlPlane/queueBridge.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// src/controlPlane/queueBridge.integration.test.ts
import { describe, expect, test } from 'bun:test'
import { ControlPlaneStore } from './store.js'
import { drainStoreControlPlaneCommands } from './queueBridge.js'

describe('control-plane queue bridge integration', () => {
  test('drains queued web commands into the repl submit path', async () => {
    const store = new ControlPlaneStore()
    await store.initialize()
    store.enqueueCommand('Run this from the web app')

    const submitted: string[] = []
    const count = drainStoreControlPlaneCommands(
      store,
      text => {
        submitted.push(text)
        return true
      },
      () => {},
    )

    expect(count).toBe(1)
    expect(submitted).toEqual(['Run this from the web app'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/controlPlane/queueBridge.integration.test.ts`

Expected: FAIL if the queue bridge does not correctly drain the stored commands.

- [ ] **Step 3: Implement the queue bridge integration**

```ts
// src/hooks/useControlPlaneBridge.ts
useEffect(() => {
  const interval = setInterval(() => {
    if (isLoading) return
    drainControlPlaneCommands(onSubmitMessage)
  }, 1500)
  return () => clearInterval(interval)
}, [isLoading, onSubmitMessage])
```

- [ ] **Step 4: Run the integration test**

Run: `bun test src/controlPlane/queueBridge.integration.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useControlPlaneBridge.ts src/controlPlane/queueBridge.ts src/controlPlane/server.ts src/controlPlane/queueBridge.integration.test.ts
git commit -m "feat: deliver web commands into live cli sessions"
```

### Task 9: Make hosted telemetry deployable

**Files:**
- Modify: `src/services/analytics/firstPartyEventLoggingExporter.ts`
- Modify: `src/hostedControlPlane/server.ts`
- Create: `src/hostedControlPlane/telemetry.test.ts`
- Test: `src/hostedControlPlane/telemetry.test.ts`

- [ ] **Step 1: Write the failing telemetry test**

```ts
// src/hostedControlPlane/telemetry.test.ts
import { describe, expect, test } from 'bun:test'
import { startHostedControlPlaneServer } from './server.js'

describe('hosted telemetry ingest', () => {
  test('accepts event batches on the hosted endpoint', async () => {
    const server = await startHostedControlPlaneServer()
    try {
      const response = await fetch(`${server.url}/api/event_logging/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [{ type: 'metric' }] }),
      })
      expect(response.status).toBe(200)
    } finally {
      await server.close()
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/hostedControlPlane/telemetry.test.ts`

Expected: FAIL because the hosted server does not yet accept telemetry batches.

- [ ] **Step 3: Implement hosted telemetry ingest**

```ts
// add route in src/hostedControlPlane/server.ts
if (req.method === 'POST' && url.pathname === '/api/event_logging/batch') {
  const body = await readJsonBody(req)
  store.addTelemetry({
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : 'unknown',
    receivedAt: new Date().toISOString(),
    events: Array.isArray(body.events) ? body.events : [],
  })
  json(res, 200, { accepted: Array.isArray(body.events) ? body.events.length : 0 })
  return
}
```

- [ ] **Step 4: Run the telemetry test**

Run: `bun test src/hostedControlPlane/telemetry.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/analytics/firstPartyEventLoggingExporter.ts src/hostedControlPlane/server.ts src/hostedControlPlane/telemetry.test.ts
git commit -m "feat: add hosted telemetry ingest path"
```

### Task 10: End-to-end verification and deployment readiness

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-01-multi-provider-core-design.md`
- Create: `docs/hosted-control-plane.md`
- Test: existing consolidated suites

- [ ] **Step 1: Run the hosted backend and web tests**

Run:

```bash
bun test \
  src/hostedControlPlane/types.test.ts \
  src/hostedControlPlane/store.test.ts \
  src/hostedControlPlane/server.test.ts \
  src/hostedControlPlane/auth.test.ts \
  src/hostedControlPlane/channel.test.ts \
  src/hostedControlPlane/webAssets.test.ts \
  src/hostedControlPlane/telemetry.test.ts
```

Expected: PASS

- [ ] **Step 2: Run the broader regression batch**

Run:

```bash
bun test \
  src/services/backend/targets.test.ts \
  src/providers/runtime.test.ts \
  src/providers/openai-codex/oauth.test.ts \
  src/controlPlane/server.test.ts \
  src/controlPlane/manager.test.ts \
  src/controlPlane/queueBridge.test.ts \
  src/commands/webapp-control/index.test.ts
```

Expected: PASS

- [ ] **Step 3: Run the compiled artifact smoke**

Run:

```bash
bun build.ts
bun dist/cli.js webapp-control status
bun dist/cli.js webapp-control start
bun dist/cli.js webapp-control status
```

Expected:
- Build succeeds
- Status prints a non-running message first
- Start prints the hosted or local control-plane URL
- Status prints the running URL

- [ ] **Step 4: Document deployment**

```md
<!-- docs/hosted-control-plane.md -->
# Hosted Control Plane

- Required env vars
- Browser auth model
- CLI registration flow
- Telemetry ingest path
- Remote command delivery path
- Security considerations
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/hosted-control-plane.md
git commit -m "docs: add hosted control-plane deployment guide"
```

---

## Self-Review

### Spec coverage

- Hosted browser auth: covered by Task 4.
- Hosted backend API: covered by Tasks 2, 3, and 9.
- CLI registration and persistent channel: covered by Task 5.
- Hosted web app shell: covered by Task 6.
- Remote command delivery: covered by Task 8.
- Telemetry ingestion: covered by Task 9.
- Safe target selection between hosted and local: covered by Task 7.
- Deployment readiness verification: covered by Task 10.

### Placeholder scan

- No `TBD` or `TODO` placeholders remain.
- Every task lists exact files and exact verification commands.
- Every task includes concrete code or command examples.

### Type consistency

- `HostedAgentSession`, `HostedQueuedCommand`, and `HostedTelemetryBatch` are introduced in Task 1 and reused consistently in later tasks.
- Hosted/local target-selection naming uses `getBackendTargets()` throughout.
- Remote command delivery uses the existing queue bridge concept rather than introducing a second incompatible queue abstraction.
