import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { openBrowser } from '../utils/browser.js'
import {
  renderControlPlaneCss,
  renderControlPlaneHtml,
  renderControlPlaneJs,
} from './assets.js'
import { ControlPlaneStore } from './store.js'

type ControlPlaneServerOptions = {
  port?: number
  host?: string
  openOnStart?: boolean
}

export type ControlPlaneServerHandle = {
  url: string
  store: ControlPlaneStore
  close: () => Promise<void>
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

function json(res: ServerResponse, statusCode: number, body: unknown): void {
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

export async function startControlPlaneServer(
  options: ControlPlaneServerOptions = {},
): Promise<ControlPlaneServerHandle> {
  const store = new ControlPlaneStore()
  await store.initialize()

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')

    if (req.method === 'GET' && url.pathname === '/') {
      text(res, 200, renderControlPlaneHtml(), 'text/html')
      return
    }

    if (req.method === 'GET' && url.pathname === '/app.css') {
      text(res, 200, renderControlPlaneCss(), 'text/css')
      return
    }

    if (req.method === 'GET' && url.pathname === '/app.js') {
      text(res, 200, renderControlPlaneJs(), 'application/javascript')
      return
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      json(res, 200, store.getSnapshot())
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/telemetry') {
      json(res, 200, { batches: store.getRecentTelemetry() })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/event_logging/batch') {
      try {
        const body = (await readJsonBody(req)) as { events?: unknown[] }
        const events = Array.isArray(body.events) ? body.events : []
        json(res, 200, await store.ingestTelemetry(events))
      } catch (error) {
        json(res, 400, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/commands') {
      json(res, 200, { commands: store.listCommands() })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/commands') {
      try {
        const body = (await readJsonBody(req)) as { text?: unknown }
        if (typeof body.text !== 'string' || !body.text.trim()) {
          json(res, 400, { error: 'text is required' })
          return
        }
        json(res, 201, { command: store.enqueueCommand(body.text.trim()) })
      } catch (error) {
        json(res, 400, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/commands/claim') {
      try {
        const body = (await readJsonBody(req)) as { limit?: number }
        json(res, 200, {
          commands: store.claimQueuedCommands(
            typeof body.limit === 'number' ? body.limit : 10,
          ),
        })
      } catch (error) {
        json(res, 400, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return
    }

    if (
      req.method === 'POST' &&
      url.pathname.startsWith('/api/commands/') &&
      url.pathname.endsWith('/complete')
    ) {
      const id = url.pathname
        .replace('/api/commands/', '')
        .replace('/complete', '')
        .replace(/\/+/g, '')
      const command = store.completeCommand(id)
      if (!command) {
        json(res, 404, { error: 'command not found' })
        return
      }
      json(res, 200, { command })
      return
    }

    json(res, 404, { error: 'not found' })
  })

  const port = options.port ?? 0
  const host = options.host ?? '127.0.0.1'

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve())
    server.once('error', reject)
  })

  const address = server.address() as AddressInfo
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`

  if (options.openOnStart) {
    await openBrowser(url)
  }

  return {
    url,
    store,
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
