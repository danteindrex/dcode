import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import {
  authenticateHostedBrowserRequest,
  createHostedBrowserAuthSession,
} from './auth.js'
import {
  renderHostedControlPlaneCss,
  renderHostedControlPlaneHtml,
  renderHostedControlPlaneJs,
} from './webAssets.js'
import {
  createHostedControlPlaneStore,
  type HostedControlPlaneStore,
} from './store.js'
import type {
  HostedAgentSessionInput,
  HostedBrowserAuthSession,
  HostedCommandEvent,
  HostedControlPlaneCommandDetailResponse,
  HostedControlPlaneCommandResponse,
  HostedControlPlaneCommandsResponse,
  HostedControlPlaneErrorResponse,
  HostedControlPlaneHealthResponse,
  HostedControlPlaneSessionResponse,
  HostedControlPlaneSessionsResponse,
} from './types.js'

export type HostedControlPlaneServerOptions = {
  host?: string
  port?: number
  store?: HostedControlPlaneStore
  authSession?: HostedBrowserAuthSession
  now?: () => Date
}

export type HostedControlPlaneServerHandle = {
  url: string
  store: HostedControlPlaneStore
  authSession: HostedBrowserAuthSession
  getTelemetry: (sessionId?: string) => ReturnType<HostedControlPlaneStore['getTelemetry']>
  close: () => Promise<void>
}

function json(
  res: ServerResponse,
  statusCode: number,
  body:
    | HostedControlPlaneHealthResponse
    | HostedControlPlaneSessionsResponse
    | HostedControlPlaneSessionResponse
    | HostedControlPlaneCommandsResponse
    | HostedControlPlaneCommandResponse
    | HostedControlPlaneCommandDetailResponse
    | HostedControlPlaneErrorResponse,
): void {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

function text(
  res: ServerResponse,
  statusCode: number,
  body: string,
  contentType: string,
): void {
  res.writeHead(statusCode, {
    'content-type': `${contentType}; charset=utf-8`,
  })
  res.end(body)
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw) as unknown)
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function requestToAuthHeaders(req: IncomingMessage): Headers {
  const headers = new Headers()
  const authorization = req.headers.authorization
  if (typeof authorization === 'string') {
    headers.set('authorization', authorization)
  }
  const cookie = req.headers.cookie
  if (typeof cookie === 'string') {
    headers.set('cookie', cookie)
  }
  return headers
}

function getPathname(req: IncomingMessage): string {
  return new URL(req.url || '/', 'http://localhost').pathname.replace(/\/+$/, '') || '/'
}

function parseCommandRoute(
  pathname: string,
): { sessionId: string; commandId?: string } | null {
  const detail = pathname.match(
    /^\/api\/sessions\/([^/]+)\/commands\/([^/]+)$/,
  )
  if (detail) {
    return {
      sessionId: decodeURIComponent(detail[1]!),
      commandId: decodeURIComponent(detail[2]!),
    }
  }

  const list = pathname.match(/^\/api\/sessions\/([^/]+)\/commands$/)
  if (list) {
    return {
      sessionId: decodeURIComponent(list[1]!),
    }
  }

  return null
}

function parseCliSessionClaimRoute(pathname: string): { sessionId: string } | null {
  const match = pathname.match(/^\/api\/cli\/sessions\/([^/]+)\/commands\/claim$/)
  if (!match) {
    return null
  }

  return {
    sessionId: decodeURIComponent(match[1]!),
  }
}

function parseCliCommandActionRoute(
  pathname: string,
): { commandId: string; action: 'events' | 'complete' | 'running' | 'failed' } | null {
  const match = pathname.match(/^\/api\/cli\/commands\/([^/]+)\/(events|complete|running|failed)$/)
  if (!match) {
    return null
  }

  return {
    commandId: decodeURIComponent(match[1]!),
    action: match[2] as 'events' | 'complete' | 'running' | 'failed',
  }
}

function isSessionInput(value: unknown): value is Omit<
  HostedAgentSessionInput,
  'ownerUserId'
> & {
  ownerUserId?: string
} {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    (typeof candidate.id === 'undefined' || typeof candidate.id === 'string') &&
    (typeof candidate.ownerUserId === 'undefined' ||
      typeof candidate.ownerUserId === 'string') &&
    typeof candidate.machineId === 'string' &&
    typeof candidate.connected === 'boolean' &&
    Array.isArray(candidate.providers) &&
    candidate.providers.every(provider => typeof provider === 'string')
  )
}

function isHostedCommandEventInput(value: unknown): value is {
  kind: HostedCommandEvent['kind']
  payload?: Record<string, unknown>
} {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    (candidate.kind === 'assistant_text' ||
      candidate.kind === 'tool_use' ||
      candidate.kind === 'status') &&
    (typeof candidate.payload === 'undefined' ||
      (!!candidate.payload &&
        typeof candidate.payload === 'object' &&
        !Array.isArray(candidate.payload)))
  )
}

function authenticateBrowserRequest(
  req: IncomingMessage,
  authSession: HostedBrowserAuthSession,
  now: () => Date,
): boolean {
  return authenticateHostedBrowserRequest(
    new Request('http://localhost', {
      headers: requestToAuthHeaders(req),
    }),
    authSession,
    { now },
  )
}

export async function startHostedControlPlaneServer(
  options: HostedControlPlaneServerOptions = {},
): Promise<HostedControlPlaneServerHandle> {
  const now = options.now ?? (() => new Date())
  const store = options.store ?? createHostedControlPlaneStore({ now })
  const authSession =
    options.authSession ?? createHostedBrowserAuthSession('local-user', { now })

  const server = createServer(async (req, res) => {
    const pathname = getPathname(req)

    if (req.method === 'GET' && pathname === '/') {
      text(res, 200, renderHostedControlPlaneHtml(), 'text/html')
      return
    }

    if (req.method === 'GET' && pathname === '/app.css') {
      text(res, 200, renderHostedControlPlaneCss(), 'text/css')
      return
    }

    if (req.method === 'GET' && pathname === '/app.js') {
      text(res, 200, renderHostedControlPlaneJs(), 'application/javascript')
      return
    }

    if (req.method === 'GET' && pathname === '/health') {
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && pathname === '/api/event_logging/batch') {
      try {
        const body = (await readJsonBody(req)) as {
          events?: unknown[]
          sessionId?: unknown
        }
        const events = Array.isArray(body.events) ? body.events : []
        store.addTelemetry({
          sessionId:
            typeof body.sessionId === 'string' ? body.sessionId : 'unknown',
          receivedAt: now().toISOString(),
          events,
        })
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
        })
        res.end(JSON.stringify({ accepted: events.length }))
      } catch (error) {
        json(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }

    if (pathname === '/api/sessions') {
      const authorized = authenticateBrowserRequest(req, authSession, now)

      if (!authorized) {
        json(res, 401, { ok: false, error: 'unauthorized' })
        return
      }

      if (req.method === 'GET') {
        json(res, 200, { sessions: store.listSessions(authSession.userId) })
        return
      }

      if (req.method === 'POST') {
        try {
          const body = await readJsonBody(req)
          if (!isSessionInput(body)) {
            json(res, 400, { ok: false, error: 'invalid session payload' })
            return
          }

          const session = store.createSession({
            ...body,
            ownerUserId: authSession.userId,
          })
          json(res, 201, { session })
        } catch (error) {
          json(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        return
      }
    }

    const browserCommandRoute = parseCommandRoute(pathname)
    if (browserCommandRoute) {
      const authorized = authenticateBrowserRequest(req, authSession, now)
      if (!authorized) {
        json(res, 401, { ok: false, error: 'unauthorized' })
        return
      }

      const session = store.getSession(browserCommandRoute.sessionId)
      if (!session || session.ownerUserId !== authSession.userId) {
        json(res, 404, { ok: false, error: 'session not found' })
        return
      }

      if (!browserCommandRoute.commandId && req.method === 'POST') {
        try {
          const body = (await readJsonBody(req)) as { text?: unknown }
          if (typeof body.text !== 'string' || !body.text.trim()) {
            json(res, 400, { ok: false, error: 'text is required' })
            return
          }

          const command = store.enqueueCommand({
            sessionId: browserCommandRoute.sessionId,
            ownerUserId: authSession.userId,
            text: body.text.trim(),
          })
          json(res, 201, { command })
        } catch (error) {
          json(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        return
      }

      if (browserCommandRoute.commandId && req.method === 'GET') {
        const command = store.getCommand(browserCommandRoute.commandId)
        if (
          !command ||
          command.sessionId !== browserCommandRoute.sessionId ||
          command.ownerUserId !== authSession.userId
        ) {
          json(res, 404, { ok: false, error: 'command not found' })
          return
        }

        json(res, 200, {
          command,
          events: store.getCommandEvents(command.id),
        })
        return
      }
    }

    const cliClaimRoute = parseCliSessionClaimRoute(pathname)
    if (cliClaimRoute && req.method === 'POST') {
      json(res, 200, { commands: store.claimQueuedCommands(cliClaimRoute.sessionId, 10) })
      return
    }

    const cliCommandRoute = parseCliCommandActionRoute(pathname)
    if (cliCommandRoute && req.method === 'POST') {
      const command = store.getCommand(cliCommandRoute.commandId)
      if (!command) {
        json(res, 404, { ok: false, error: 'command not found' })
        return
      }

      if (cliCommandRoute.action === 'running') {
        json(res, 200, {
          command: store.markCommandRunning(cliCommandRoute.commandId) ?? command,
        })
        return
      }

      if (cliCommandRoute.action === 'complete') {
        json(res, 200, {
          command: store.completeCommand(cliCommandRoute.commandId) ?? command,
        })
        return
      }

      if (cliCommandRoute.action === 'failed') {
        json(res, 200, {
          command: store.failCommand(cliCommandRoute.commandId) ?? command,
        })
        return
      }

      try {
        const body = await readJsonBody(req)
        if (!isHostedCommandEventInput(body)) {
          json(res, 400, { ok: false, error: 'invalid command event payload' })
          return
        }

        const event = store.appendCommandEvent({
          commandId: cliCommandRoute.commandId,
          sessionId: command.sessionId,
          kind: body.kind,
          payload: body.payload ?? {},
        } as Omit<HostedCommandEvent, 'id' | 'createdAt'>)
        json(res, 201, { event })
      } catch (error) {
        json(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }

    json(res, 404, { ok: false, error: 'not found' })
  })

  const port = options.port ?? 0
  const host = options.host ?? '127.0.0.1'

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve())
    server.once('error', reject)
  })

  const address = server.address() as AddressInfo
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`

  return {
    url,
    store,
    authSession,
    getTelemetry: sessionId => store.getTelemetry(sessionId),
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}
