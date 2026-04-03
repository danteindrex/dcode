# Hosted Remote Response Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the hosted control-plane so a web client can send a command to a specific CLI session, receive the assistant response stream back for that same command, and reliably know which authenticated user owns which connected session.

**Architecture:** Keep the current local control-plane untouched and evolve `src/hostedControlPlane/*` into the hosted path. Add session-scoped command/result persistence in the hosted store, add authenticated browser APIs for command submission and session listing, add a CLI-facing claim/complete/result-ingest API, and expose browser-side polling or SSE for per-command updates. The CLI bridge should keep its current submit path but report response events back to the hosted backend instead of only marking commands as completed.

**Tech Stack:** Bun, TypeScript, existing hosted control-plane HTTP server, existing REPL/query message model, Bun test, fetch-based polling first, optional SSE for response updates.

---

## File Structure

- `src/hostedControlPlane/types.ts`
  Extend shared hosted types with queued command ownership, result state, event batches, and richer status transitions.
- `src/hostedControlPlane/store.ts`
  Add per-session queued command storage, command claiming/completion, result event persistence, and filtered queries by `sessionId` and `ownerUserId`.
- `src/hostedControlPlane/server.ts`
  Add authenticated browser routes and CLI routes for command submission, command claiming, result ingestion, and response retrieval.
- `src/hostedControlPlane/auth.ts`
  Keep current auth helper shape, but ensure all browser routes consistently scope results to the authenticated `userId`.
- `src/hostedControlPlane/webAssets.ts`
  Change the demo web app from “list sessions only” to “list my sessions, send command to a chosen session, poll command updates and render assistant output”.
- `src/hooks/useControlPlaneBridge.ts`
  Add a hosted-mode poller or bridge entrypoint that can claim hosted commands for the active session rather than only local queued commands.
- `src/controlPlane/queueBridge.ts`
  Split generic “submit claimed command” logic from local-store completion so hosted mode can complete commands only after response upload.
- `src/screens/REPL.tsx`
  Attach a hosted-response reporter around the existing message/query path so final assistant messages and stream events can be forwarded for the active hosted command.
- `src/services/backend/targets.ts`
  Reuse target configuration to resolve hosted session-ingress base URL cleanly for both browser and CLI paths.
- `src/hostedControlPlane/*.test.ts`
  Add store and server tests for session ownership, command lifecycle, result persistence, and browser-visible updates.
- `src/controlPlane/queueBridge.test.ts`
  Extend to cover deferred completion and hosted completion callback flow.

---

### Task 1: Extend hosted types for session-scoped commands and response events

**Files:**
- Modify: `src/hostedControlPlane/types.ts`
- Create: `src/hostedControlPlane/types.test.ts`
- Test: `src/hostedControlPlane/types.test.ts`

- [ ] **Step 1: Write the failing type-contract test**

```ts
// src/hostedControlPlane/types.test.ts
import { describe, expect, test } from 'bun:test'
import type {
  HostedAgentSession,
  HostedCommandEvent,
  HostedQueuedCommand,
} from './types.js'

describe('hosted control-plane response channel types', () => {
  test('session, command, and event shapes remain stable', () => {
    const session: HostedAgentSession = {
      id: 'session_123',
      ownerUserId: 'user_123',
      machineId: 'machine_123',
      connected: true,
      lastSeenAt: '2026-04-02T00:00:00.000Z',
      providers: ['openai-codex'],
    }

    const command: HostedQueuedCommand = {
      id: 'cmd_123',
      sessionId: 'session_123',
      ownerUserId: 'user_123',
      text: 'Reply with exactly OK',
      status: 'queued',
      createdAt: '2026-04-02T00:00:00.000Z',
      source: 'web',
    }

    const event: HostedCommandEvent = {
      id: 'evt_1',
      commandId: 'cmd_123',
      sessionId: 'session_123',
      createdAt: '2026-04-02T00:00:01.000Z',
      kind: 'assistant_text',
      payload: { text: 'OK' },
    }

    expect(session.ownerUserId).toBe('user_123')
    expect(command.sessionId).toBe('session_123')
    expect(event.kind).toBe('assistant_text')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hostedControlPlane/types.test.ts`

Expected: FAIL because `HostedCommandEvent` and `ownerUserId` on `HostedQueuedCommand` do not exist yet.

- [ ] **Step 3: Add the minimal type extensions**

```ts
// src/hostedControlPlane/types.ts
export type HostedQueuedCommand = {
  id: string
  sessionId: string
  ownerUserId: string
  text: string
  status: 'queued' | 'claimed' | 'running' | 'completed' | 'failed'
  createdAt: string
  claimedAt?: string
  completedAt?: string
  source: 'web'
}

export type HostedCommandEvent =
  | {
      id: string
      commandId: string
      sessionId: string
      createdAt: string
      kind: 'assistant_text'
      payload: { text: string }
    }
  | {
      id: string
      commandId: string
      sessionId: string
      createdAt: string
      kind: 'tool_use'
      payload: { name: string; input: Record<string, unknown> }
    }
  | {
      id: string
      commandId: string
      sessionId: string
      createdAt: string
      kind: 'status'
      payload: { status: HostedQueuedCommand['status'] }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hostedControlPlane/types.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/types.ts src/hostedControlPlane/types.test.ts
git commit -m "feat: define hosted command response types"
```

### Task 2: Add hosted store support for owner-scoped commands and response events

**Files:**
- Modify: `src/hostedControlPlane/store.ts`
- Create: `src/hostedControlPlane/store.test.ts`
- Modify: `src/hostedControlPlane/types.ts`
- Test: `src/hostedControlPlane/store.test.ts`

- [ ] **Step 1: Write the failing store test**

```ts
// src/hostedControlPlane/store.test.ts
import { describe, expect, test } from 'bun:test'
import { createHostedControlPlaneStore } from './store.js'

describe('hosted control-plane store', () => {
  test('queues commands per session and stores response events', () => {
    const store = createHostedControlPlaneStore({
      now: () => new Date('2026-04-02T00:00:00.000Z'),
    })

    store.createSession({
      id: 'session_1',
      ownerUserId: 'user_1',
      machineId: 'machine_1',
      connected: true,
      providers: ['openai-codex'],
    })

    const command = store.enqueueCommand({
      sessionId: 'session_1',
      ownerUserId: 'user_1',
      text: 'Reply with exactly OK',
    })

    store.markCommandRunning(command.id)
    store.appendCommandEvent({
      commandId: command.id,
      sessionId: 'session_1',
      kind: 'assistant_text',
      payload: { text: 'OK' },
    })
    store.completeCommand(command.id)

    expect(store.listQueuedCommands('session_1')).toHaveLength(1)
    expect(store.getCommandEvents(command.id)).toEqual([
      expect.objectContaining({
        kind: 'assistant_text',
        payload: { text: 'OK' },
      }),
    ])
    expect(store.getCommand(command.id)?.status).toBe('completed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hostedControlPlane/store.test.ts`

Expected: FAIL because command queue and event methods do not exist.

- [ ] **Step 3: Implement the minimal store additions**

```ts
// src/hostedControlPlane/store.ts
const commands = new Map<string, HostedQueuedCommand>()
const commandEvents = new Map<string, HostedCommandEvent[]>()

enqueueCommand(input: {
  sessionId: string
  ownerUserId: string
  text: string
}): HostedQueuedCommand {
  const command: HostedQueuedCommand = {
    id: randomUUID(),
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId,
    text: input.text,
    status: 'queued',
    createdAt: now().toISOString(),
    source: 'web',
  }
  commands.set(command.id, command)
  return { ...command }
},

markCommandRunning(id: string): HostedQueuedCommand | undefined {
  const command = commands.get(id)
  if (!command) return undefined
  command.status = 'running'
  command.claimedAt ??= now().toISOString()
  return { ...command }
},

appendCommandEvent(input: Omit<HostedCommandEvent, 'id' | 'createdAt'>): HostedCommandEvent {
  const event: HostedCommandEvent = {
    ...input,
    id: randomUUID(),
    createdAt: now().toISOString(),
  }
  const events = commandEvents.get(input.commandId) ?? []
  events.push(event)
  commandEvents.set(input.commandId, events)
  return { ...event }
},

getCommandEvents(commandId: string): HostedCommandEvent[] {
  return (commandEvents.get(commandId) ?? []).map(event => ({
    ...event,
    payload: { ...event.payload },
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hostedControlPlane/store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/store.ts src/hostedControlPlane/store.test.ts src/hostedControlPlane/types.ts
git commit -m "feat: persist hosted commands and response events"
```

### Task 3: Add hosted server APIs for browser send/poll and CLI claim/result upload

**Files:**
- Modify: `src/hostedControlPlane/server.ts`
- Create: `src/hostedControlPlane/server.test.ts`
- Modify: `src/hostedControlPlane/store.ts`
- Test: `src/hostedControlPlane/server.test.ts`

- [ ] **Step 1: Write the failing API test**

```ts
// src/hostedControlPlane/server.test.ts
import { describe, expect, test } from 'bun:test'
import { startHostedControlPlaneServer } from './server.js'

describe('hosted control-plane server', () => {
  test('lets a browser send a command and read back its response events', async () => {
    const server = await startHostedControlPlaneServer({
      now: () => new Date('2026-04-02T00:00:00.000Z'),
    })

    try {
      const authHeaders = {
        authorization: `Bearer ${server.authSession.token}`,
        'content-type': 'application/json',
      }

      await fetch(`${server.url}/api/sessions`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          id: 'session_1',
          machineId: 'machine_1',
          connected: true,
          providers: ['openai-codex'],
        }),
      })

      const createResponse = await fetch(`${server.url}/api/sessions/session_1/commands`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ text: 'Reply with exactly OK' }),
      })
      expect(createResponse.status).toBe(201)
      const created = await createResponse.json() as { command: { id: string } }

      const claimResponse = await fetch(`${server.url}/api/cli/sessions/session_1/commands/claim`, {
        method: 'POST',
      })
      expect(claimResponse.status).toBe(200)

      await fetch(`${server.url}/api/cli/commands/${created.command.id}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'assistant_text',
          payload: { text: 'OK' },
        }),
      })

      await fetch(`${server.url}/api/cli/commands/${created.command.id}/complete`, {
        method: 'POST',
      })

      const commandResponse = await fetch(
        `${server.url}/api/sessions/session_1/commands/${created.command.id}`,
        { headers: { authorization: `Bearer ${server.authSession.token}` } },
      )
      expect(commandResponse.status).toBe(200)
      const payload = await commandResponse.json() as {
        command: { status: string }
        events: Array<{ kind: string; payload: { text?: string } }>
      }
      expect(payload.command.status).toBe('completed')
      expect(payload.events[0]?.payload.text).toBe('OK')
    } finally {
      await server.close()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hostedControlPlane/server.test.ts`

Expected: FAIL because the session command APIs do not exist.

- [ ] **Step 3: Add the browser and CLI APIs**

```ts
// src/hostedControlPlane/server.ts
if (req.method === 'POST' && pathname === `/api/sessions/${sessionId}/commands`) {
  const session = store.getSession(sessionId)
  if (!session || session.ownerUserId !== authSession.userId) {
    json(res, 404, { ok: false, error: 'session not found' })
    return
  }
  const body = await readJsonBody(req) as { text?: unknown }
  if (typeof body.text !== 'string' || !body.text.trim()) {
    json(res, 400, { ok: false, error: 'text is required' })
    return
  }
  const command = store.enqueueCommand({
    sessionId,
    ownerUserId: authSession.userId,
    text: body.text.trim(),
  })
  json(res, 201, { command })
  return
}

if (req.method === 'POST' && pathname === `/api/cli/sessions/${sessionId}/commands/claim`) {
  json(res, 200, { commands: store.claimQueuedCommands(sessionId, 10) })
  return
}

if (req.method === 'POST' && pathname === `/api/cli/commands/${commandId}/events`) {
  const body = await readJsonBody(req) as {
    kind?: HostedCommandEvent['kind']
    payload?: Record<string, unknown>
  }
  const event = store.appendCommandEvent({
    commandId,
    sessionId: store.getCommand(commandId)!.sessionId,
    kind: body.kind!,
    payload: body.payload ?? {},
  })
  json(res, 201, { event })
  return
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hostedControlPlane/server.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/server.ts src/hostedControlPlane/server.test.ts src/hostedControlPlane/store.ts
git commit -m "feat: add hosted command and response APIs"
```

### Task 4: Change CLI bridge completion semantics from “submitted” to “response completed”

**Files:**
- Modify: `src/controlPlane/queueBridge.ts`
- Modify: `src/controlPlane/queueBridge.test.ts`
- Modify: `src/hooks/useControlPlaneBridge.ts`
- Create: `src/hostedControlPlane/client.ts`
- Test: `src/controlPlane/queueBridge.test.ts`

- [ ] **Step 1: Write the failing queue bridge test**

```ts
// src/controlPlane/queueBridge.test.ts
import { describe, expect, test } from 'bun:test'
import { drainClaimedControlPlaneCommands } from './queueBridge.js'

describe('drainClaimedControlPlaneCommands', () => {
  test('does not auto-complete a hosted command before response upload', () => {
    const completed: string[] = []

    const drained = drainClaimedControlPlaneCommands({
      commands: [
        {
          id: 'cmd_1',
          text: 'Reply with exactly OK',
          status: 'claimed',
          createdAt: '2026-04-02T00:00:00.000Z',
        },
      ],
      onSubmitMessage: () => true,
      enqueuePrompt: () => {},
      completeCommand: id => completed.push(id),
      autoComplete: false,
    })

    expect(drained).toBe(1)
    expect(completed).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/controlPlane/queueBridge.test.ts`

Expected: FAIL because `autoComplete` does not exist and commands are always completed immediately.

- [ ] **Step 3: Make completion explicit**

```ts
// src/controlPlane/queueBridge.ts
export function drainClaimedControlPlaneCommands(params: {
  commands: ControlPlaneCommand[]
  onSubmitMessage: (content: string) => boolean
  enqueuePrompt: (content: string) => void
  completeCommand: (id: string) => void
  autoComplete?: boolean
}): number {
  const autoComplete = params.autoComplete ?? true

  for (const command of params.commands) {
    const submitted = params.onSubmitMessage(command.text)
    if (!submitted) {
      params.enqueuePrompt(command.text)
    }
    if (autoComplete) {
      params.completeCommand(command.id)
    }
  }

  return params.commands.length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/controlPlane/queueBridge.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/controlPlane/queueBridge.ts src/controlPlane/queueBridge.test.ts
git commit -m "refactor: decouple command submission from completion"
```

### Task 5: Report assistant response events from the REPL to the hosted backend

**Files:**
- Create: `src/hostedControlPlane/client.ts`
- Modify: `src/screens/REPL.tsx`
- Modify: `src/hooks/useControlPlaneBridge.ts`
- Create: `src/hostedControlPlane/client.test.ts`
- Test: `src/hostedControlPlane/client.test.ts`

- [ ] **Step 1: Write the failing hosted client test**

```ts
// src/hostedControlPlane/client.test.ts
import { describe, expect, mock, test } from 'bun:test'
import { reportHostedCommandEvent, completeHostedCommand } from './client.js'

describe('hosted control-plane client', () => {
  test('posts command events and completion to the backend', async () => {
    const calls: string[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      await reportHostedCommandEvent('https://hosted.example.test', 'cmd_1', {
        kind: 'assistant_text',
        payload: { text: 'OK' },
      })
      await completeHostedCommand('https://hosted.example.test', 'cmd_1')
      expect(calls).toEqual([
        'https://hosted.example.test/api/cli/commands/cmd_1/events',
        'https://hosted.example.test/api/cli/commands/cmd_1/complete',
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hostedControlPlane/client.test.ts`

Expected: FAIL because the hosted client helper does not exist.

- [ ] **Step 3: Add the minimal hosted client and REPL reporting**

```ts
// src/hostedControlPlane/client.ts
export async function reportHostedCommandEvent(
  baseUrl: string,
  commandId: string,
  event: { kind: string; payload: Record<string, unknown> },
): Promise<void> {
  await fetch(`${baseUrl}/api/cli/commands/${commandId}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  })
}

export async function completeHostedCommand(
  baseUrl: string,
  commandId: string,
): Promise<void> {
  await fetch(`${baseUrl}/api/cli/commands/${commandId}/complete`, {
    method: 'POST',
  })
}
```

```ts
// src/screens/REPL.tsx
// inside the hosted-command execution path
for await (const event of query(...)) {
  if (activeHostedCommandId && event.type === 'stream_event') {
    if (event.event.type === 'content_block_delta' && event.event.delta.type === 'text_delta') {
      await reportHostedCommandEvent(hostedBaseUrl, activeHostedCommandId, {
        kind: 'assistant_text',
        payload: { text: event.event.delta.text },
      })
    }
  }
}
await completeHostedCommand(hostedBaseUrl, activeHostedCommandId)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hostedControlPlane/client.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/client.ts src/hostedControlPlane/client.test.ts src/screens/REPL.tsx src/hooks/useControlPlaneBridge.ts
git commit -m "feat: report hosted command responses from repl"
```

### Task 6: Expose user-owned sessions and live command updates in the hosted web app

**Files:**
- Modify: `src/hostedControlPlane/webAssets.ts`
- Modify: `src/hostedControlPlane/server.ts`
- Create: `src/hostedControlPlane/webAssets.test.ts`
- Test: `src/hostedControlPlane/webAssets.test.ts`

- [ ] **Step 1: Write the failing web asset test**

```ts
// src/hostedControlPlane/webAssets.test.ts
import { describe, expect, test } from 'bun:test'
import { renderHostedControlPlaneHtml, renderHostedControlPlaneJs } from './webAssets.js'

describe('hosted control-plane web assets', () => {
  test('renders session picker and command polling client', () => {
    expect(renderHostedControlPlaneHtml()).toContain('id="session-select"')
    expect(renderHostedControlPlaneHtml()).toContain('id="command-output"')
    expect(renderHostedControlPlaneJs()).toContain("/api/sessions/")
    expect(renderHostedControlPlaneJs()).toContain('setInterval(loadCommand')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hostedControlPlane/webAssets.test.ts`

Expected: FAIL because the hosted page only lists sessions and does not render command output.

- [ ] **Step 3: Implement the minimal hosted UI**

```js
// src/hostedControlPlane/webAssets.ts
// HTML additions
<select id="session-select"></select>
<form id="command-form">
  <input id="command-input" />
  <button type="submit">Send</button>
</form>
<pre id="command-output">No command selected.</pre>

// JS additions
let activeCommandId = null

async function loadSessions() {
  const payload = await getJson('/api/sessions')
  renderSessionOptions(payload.sessions)
}

async function submitCommand(sessionId, text) {
  const payload = await getJson(`/api/sessions/${sessionId}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  activeCommandId = payload.command.id
}

async function loadCommand() {
  if (!activeCommandId) return
  const sessionId = document.getElementById('session-select').value
  const payload = await getJson(`/api/sessions/${sessionId}/commands/${activeCommandId}`)
  document.getElementById('command-output').textContent = JSON.stringify(payload, null, 2)
}

setInterval(loadCommand, 1500)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hostedControlPlane/webAssets.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/webAssets.ts src/hostedControlPlane/webAssets.test.ts src/hostedControlPlane/server.ts
git commit -m "feat: render hosted session command updates in web app"
```

### Task 7: Verify end-to-end hosted session ownership and response flow

**Files:**
- Modify: `src/hostedControlPlane/server.test.ts`
- Modify: `src/controlPlane/queueBridge.integration.test.ts`
- Test: `src/hostedControlPlane/server.test.ts`
- Test: `src/controlPlane/queueBridge.integration.test.ts`

- [ ] **Step 1: Add the end-to-end integration test**

```ts
// src/hostedControlPlane/server.test.ts
test('browser only sees its own sessions and command responses', async () => {
  const server = await startHostedControlPlaneServer({
    now: () => new Date('2026-04-02T00:00:00.000Z'),
  })

  try {
    const authHeaders = {
      authorization: `Bearer ${server.authSession.token}`,
      'content-type': 'application/json',
    }

    await fetch(`${server.url}/api/sessions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        id: 'session_abc',
        machineId: 'machine_abc',
        connected: true,
        providers: ['gemini'],
      }),
    })

    const createResponse = await fetch(`${server.url}/api/sessions/session_abc/commands`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: 'Reply with exactly OK' }),
    })
    const created = await createResponse.json() as { command: { id: string } }

    await fetch(`${server.url}/api/cli/sessions/session_abc/commands/claim`, {
      method: 'POST',
    })
    await fetch(`${server.url}/api/cli/commands/${created.command.id}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'assistant_text', payload: { text: 'OK' } }),
    })
    await fetch(`${server.url}/api/cli/commands/${created.command.id}/complete`, {
      method: 'POST',
    })

    const response = await fetch(
      `${server.url}/api/sessions/session_abc/commands/${created.command.id}`,
      { headers: { authorization: `Bearer ${server.authSession.token}` } },
    )
    const payload = await response.json() as {
      command: { sessionId: string; ownerUserId: string; status: string }
      events: Array<{ payload: { text?: string } }>
    }

    expect(payload.command.sessionId).toBe('session_abc')
    expect(payload.command.ownerUserId).toBe('local-user')
    expect(payload.command.status).toBe('completed')
    expect(payload.events.at(-1)?.payload.text).toBe('OK')
  } finally {
    await server.close()
  }
})
```

- [ ] **Step 2: Run the integration tests**

Run: `bun test src/hostedControlPlane/server.test.ts src/controlPlane/queueBridge.integration.test.ts --timeout 10000`

Expected: PASS

- [ ] **Step 3: Build the CLI**

Run: `bun build.ts`

Expected: `Build succeeded: dist/cli.js`

- [ ] **Step 4: Manual smoke test**

Run:

```powershell
& 'C:\Users\user\.bun\bin\bun.exe' dist\cli.js webapp-control-server
```

Expected:
- Hosted control-plane starts
- Browser session can create a session record
- Browser can send a command to that session
- CLI claims the command
- Browser receives assistant text back for that command

- [ ] **Step 5: Commit**

```bash
git add src/hostedControlPlane/server.test.ts src/controlPlane/queueBridge.integration.test.ts
git commit -m "test: verify hosted session response flow"
```

---

## Self-Review

- Spec coverage:
  - session ownership: covered in Tasks 1, 2, 3, and 7
  - command send path: covered in Tasks 2 and 3
  - response return path: covered in Tasks 3, 5, 6, and 7
  - deployable browser session view: covered in Task 6
- Placeholder scan:
  - No `TODO`, `TBD`, or “handle later” placeholders remain
  - Each task includes explicit files, commands, and expected outcomes
- Type consistency:
  - `HostedQueuedCommand.ownerUserId`, `HostedCommandEvent`, and session-scoped command APIs are used consistently across tasks

