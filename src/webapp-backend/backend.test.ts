import { afterEach, describe, expect, test } from 'bun:test'

import { createWebappBackend } from './backend.js'

const KEYS = [
  'CLAUDE_CODE_APP_BACKEND_URL',
  'CLAUDE_CODE_WEB_APP_URL',
  'CLAUDE_CODE_MCP_PROXY_URL',
  'CLAUDE_CODE_MCP_PROXY_PATH',
  'CLAUDE_CODE_TELEMETRY_BASE_URL',
  'CLAUDE_CODE_GROWTHBOOK_BASE_URL',
  'CLAUDE_CODE_SESSION_INGRESS_URL',
] as const

const ORIGINALS = new Map<string, string | undefined>(
  KEYS.map(key => [key, process.env[key]]),
)

afterEach(() => {
  for (const key of KEYS) {
    const original = ORIGINALS.get(key)
    if (original === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = original
    }
  }
})

describe('webapp backend', () => {
  test('serves health and config snapshots', async () => {
    process.env.CLAUDE_CODE_APP_BACKEND_URL = 'https://api.example.test/'
    process.env.CLAUDE_CODE_WEB_APP_URL = 'https://ui.example.test/'
    process.env.CLAUDE_CODE_MCP_PROXY_URL = 'https://mcp.example.test/'
    process.env.CLAUDE_CODE_TELEMETRY_BASE_URL =
      'https://telemetry.example.test/'
    process.env.CLAUDE_CODE_GROWTHBOOK_BASE_URL =
      'https://growthbook.example.test/'
    process.env.CLAUDE_CODE_SESSION_INGRESS_URL =
      'https://ingress.example.test/'

    const backend = createWebappBackend({
      now: () => new Date('2026-04-02T00:00:00.000Z'),
    })

    const healthResponse = await backend.handleRequest(
      new Request('http://localhost/health'),
    )
    expect(healthResponse.status).toBe(200)
    expect(await healthResponse.json()).toEqual({
      ok: true,
      status: 'healthy',
      startedAt: '2026-04-02T00:00:00.000Z',
      uptimeMs: 0,
    })

    const configResponse = await backend.handleRequest(
      new Request('http://localhost/config'),
    )
    expect(configResponse.status).toBe(200)
    expect(await configResponse.json()).toEqual({
      productName: 'Claude Code',
      productUrl: 'https://claude.com/claude-code',
      claudeAiOrigin: 'https://ui.example.test',
      webAppRemoteControlUrl: 'https://ui.example.test/code',
      targets: {
        apiBaseUrl: 'https://api.example.test',
        webAppOrigin: 'https://ui.example.test',
        mcpProxyUrl: 'https://mcp.example.test',
        mcpProxyPath: '/v1/mcp/{server_id}',
        telemetryBaseUrl: 'https://telemetry.example.test',
        growthbookBaseUrl: 'https://growthbook.example.test',
        sessionIngressUrl: 'https://ingress.example.test',
      },
    })
  })

  test('ingests telemetry and reports remote-control status', async () => {
    const backend = createWebappBackend({
      now: () => new Date('2026-04-02T12:34:56.000Z'),
    })

    const ingestResponse = await backend.handleRequest(
      new Request('http://localhost/telemetry/ingest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          event: 'webapp_loaded',
          source: 'local-ui',
        }),
      }),
    )
    expect(ingestResponse.status).toBe(202)
    expect(await ingestResponse.json()).toEqual({
      ok: true,
      accepted: 1,
      telemetryEvents: 1,
    })
    expect(backend.getTelemetryEvents()).toHaveLength(1)
    expect(backend.getTelemetryEvents()[0]).toMatchObject({
      method: 'POST',
      path: '/telemetry/ingest',
      contentType: 'application/json',
      body: {
        event: 'webapp_loaded',
        source: 'local-ui',
      },
    })

    backend.setRemoteControlStatus({
      connected: true,
      sessionActive: true,
      reconnecting: false,
      error: null,
      sessionId: 'session_123',
      sessionUrl: 'https://claude.ai/code/session_123',
    })

    const statusResponse = await backend.handleRequest(
      new Request('http://localhost/remote-control/status'),
    )
    expect(statusResponse.status).toBe(200)
    expect(await statusResponse.json()).toEqual({
      connected: true,
      sessionActive: true,
      reconnecting: false,
      error: null,
      sessionId: 'session_123',
      sessionUrl: 'https://claude.ai/code/session_123',
      updatedAt: '2026-04-02T12:34:56.000Z',
      bridge: {
        label: 'Remote Control active',
        color: 'success',
      },
    })
  })
})
