import { randomUUID } from 'crypto'
import { createServer, type IncomingMessage, type Server } from 'http'
import { getBridgeStatus } from '../bridge/bridgeStatusUtil.js'
import { getBackendTargets } from '../services/backend/targets.js'
import {
  PRODUCT_NAME,
  PRODUCT_URL,
  getClaudeAiOrigin,
  getWebAppRemoteControlUrl,
} from '../constants/product.js'

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type WebappTelemetryEvent = {
  id: string
  receivedAt: string
  path: string
  method: string
  contentType: string | null
  body: JsonValue | string | null
}

export type RemoteControlStatusState = {
  connected: boolean
  sessionActive: boolean
  reconnecting: boolean
  error: string | null
  sessionId: string | null
  sessionUrl: string | null
}

export type WebappBackendOptions = {
  now?: () => Date
  initialRemoteControlStatus?: Partial<RemoteControlStatusState>
}

export type WebappBackendSnapshot = {
  startedAt: string
  uptimeMs: number
  config: ReturnType<typeof buildWebappBackendConfig>
  remoteControlStatus: ReturnType<typeof buildRemoteControlStatus>
  telemetryEvents: WebappTelemetryEvent[]
}

function normalizePath(pathname: string): string {
  if (pathname === '/') {
    return pathname
  }
  return pathname.replace(/\/+$/, '')
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue)
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        toJsonValue(entry),
      ]),
    )
  }
  return String(value)
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function buildWebappBackendConfig() {
  const targets = getBackendTargets()
  return {
    productName: PRODUCT_NAME,
    productUrl: PRODUCT_URL,
    claudeAiOrigin: getClaudeAiOrigin(),
    webAppRemoteControlUrl: getWebAppRemoteControlUrl(),
    targets,
  }
}

function buildRemoteControlStatus(
  state: RemoteControlStatusState,
  updatedAt: string,
) {
  return {
    ...state,
    updatedAt,
    bridge: getBridgeStatus({
      error: state.error ?? undefined,
      connected: state.connected,
      sessionActive: state.sessionActive,
      reconnecting: state.reconnecting,
    }),
  }
}

async function readBody(request: Request): Promise<{
  rawBody: string | null
  parsedBody: JsonValue | string | null
}> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return { rawBody: null, parsedBody: null }
  }

  const rawBody = await request.text()
  if (!rawBody) {
    return { rawBody: null, parsedBody: null }
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      return {
        rawBody,
        parsedBody: toJsonValue(JSON.parse(rawBody) as unknown),
      }
    } catch {
      return { rawBody, parsedBody: rawBody }
    }
  }

  return { rawBody, parsedBody: rawBody }
}

export function createWebappBackend(options: WebappBackendOptions = {}) {
  const now = options.now ?? (() => new Date())
  const startedAt = now().toISOString()
  const telemetryEvents: WebappTelemetryEvent[] = []
  let remoteControlState: RemoteControlStatusState = {
    connected: false,
    sessionActive: false,
    reconnecting: false,
    error: null,
    sessionId: null,
    sessionUrl: null,
    ...options.initialRemoteControlStatus,
  }
  let remoteControlUpdatedAt = startedAt

  function snapshot(): WebappBackendSnapshot {
    return {
      startedAt,
      uptimeMs: Math.max(0, now().getTime() - new Date(startedAt).getTime()),
      config: buildWebappBackendConfig(),
      remoteControlStatus: buildRemoteControlStatus(
        remoteControlState,
        remoteControlUpdatedAt,
      ),
      telemetryEvents: telemetryEvents.slice(),
    }
  }

  async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const pathname = normalizePath(url.pathname)

    if (pathname === '/health') {
      return jsonResponse(200, {
        ok: true,
        status: 'healthy',
        startedAt,
        uptimeMs: snapshot().uptimeMs,
      })
    }

    if (pathname === '/config') {
      return jsonResponse(200, buildWebappBackendConfig())
    }

    if (pathname === '/telemetry/ingest') {
      if (request.method !== 'POST') {
        return jsonResponse(405, {
          ok: false,
          error: 'Method not allowed',
        })
      }

      const { rawBody, parsedBody } = await readBody(request)
      telemetryEvents.push({
        id: randomUUID(),
        receivedAt: now().toISOString(),
        path: pathname,
        method: request.method,
        contentType: request.headers.get('content-type'),
        body: parsedBody ?? rawBody,
      })

      return jsonResponse(202, {
        ok: true,
        accepted: 1,
        telemetryEvents: telemetryEvents.length,
      })
    }

    if (pathname === '/remote-control/status') {
      return jsonResponse(200, buildRemoteControlStatus(remoteControlState, remoteControlUpdatedAt))
    }

    return jsonResponse(404, {
      ok: false,
      error: 'Not found',
    })
  }

  function setRemoteControlStatus(update: Partial<RemoteControlStatusState>): void {
    remoteControlState = {
      ...remoteControlState,
      ...update,
    }
    remoteControlUpdatedAt = now().toISOString()
  }

  return {
    handleRequest,
    setRemoteControlStatus,
    getSnapshot: snapshot,
    getTelemetryEvents: () => telemetryEvents.slice(),
  }
}

async function readIncomingMessageBody(
  req: IncomingMessage,
): Promise<Uint8Array | undefined> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) {
    return undefined
  }

  return Buffer.concat(chunks)
}

function toRequest(req: IncomingMessage, body?: Uint8Array): Request {
  const protocol = req.socket.encrypted ? 'https:' : 'http:'
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `${protocol}//${host}`)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item)
      }
    } else if (value !== undefined) {
      headers.set(key, value)
    }
  }

  return new Request(url, {
    method: req.method,
    headers,
    body,
  })
}

export function createWebappBackendServer(
  backend = createWebappBackend(),
): Server {
  return createServer((req, res) => {
    void (async () => {
      const body = await readIncomingMessageBody(req)
      const request = toRequest(req, body)
      const response = await backend.handleRequest(request)

      res.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries()),
      )
      if (response.body) {
        const buffer = Buffer.from(await response.arrayBuffer())
        res.end(buffer)
      } else {
        res.end()
      }
    })().catch(error => {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      res.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    })
  })
}
