import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  clearPersistedControlPlaneRuntime,
  writePersistedControlPlaneRuntime,
} from '../../controlPlane/runtime.js'

import {
  getAppBackendBaseUrl,
  getBackendTargets,
  getGrowthbookBaseUrl,
  getMcpProxyBaseUrl,
  getMcpProxyPath,
  getSessionIngressBaseUrl,
  getTelemetryBaseUrl,
  getHostedControlPlaneUrl,
  getWebAppOrigin,
} from './targets.js'

const KEYS = [
  'CLAUDE_CODE_APP_BACKEND_URL',
  'CLAUDE_CODE_WEB_APP_URL',
  'CLAUDE_CODE_MCP_PROXY_URL',
  'CLAUDE_CODE_MCP_PROXY_PATH',
  'CLAUDE_CODE_TELEMETRY_BASE_URL',
  'CLAUDE_CODE_GROWTHBOOK_BASE_URL',
  'CLAUDE_CODE_SESSION_INGRESS_URL',
  'CLAUDE_CONFIG_DIR',
] as const

const ORIGINALS = new Map<string, string | undefined>(
  KEYS.map(key => [key, process.env[key]]),
)

let configDir: string

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'claude-backend-targets-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
})

afterEach(() => {
  clearPersistedControlPlaneRuntime()
  for (const key of KEYS) {
    const original = ORIGINALS.get(key)
    if (original === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = original
    }
  }
})

describe('backend targets', () => {
  test('falls back to existing oauth configuration by default', () => {
    const targets = getBackendTargets()

    expect(getAppBackendBaseUrl()).toBe(targets.apiBaseUrl)
    expect(getWebAppOrigin()).toBe(targets.webAppOrigin)
    expect(getMcpProxyBaseUrl()).toBe(targets.mcpProxyUrl)
    expect(getMcpProxyPath()).toBe(targets.mcpProxyPath)
    expect(getTelemetryBaseUrl()).toBe(targets.telemetryBaseUrl)
    expect(getGrowthbookBaseUrl()).toBe(targets.growthbookBaseUrl)
    expect(getSessionIngressBaseUrl()).toBe(targets.sessionIngressUrl)
    expect(targets.apiBaseUrl).toBe('https://api.anthropic.com')
    expect(targets.webAppOrigin).toBe('https://claude.ai')
    expect(targets.mcpProxyUrl).toBe('https://mcp-proxy.anthropic.com')
    expect(targets.mcpProxyPath).toBe('/v1/mcp/{server_id}')
    expect(targets.telemetryBaseUrl).toBe('https://api.anthropic.com')
    expect(targets.growthbookBaseUrl).toBe('https://api.anthropic.com')
    expect(targets.sessionIngressUrl).toBe('https://api.anthropic.com')
  })

  test('allows backend endpoints to be overridden independently', () => {
    process.env.CLAUDE_CODE_APP_BACKEND_URL = 'https://backend.example.test/'
    process.env.CLAUDE_CODE_WEB_APP_URL = 'https://web.example.test/'
    process.env.CLAUDE_CODE_MCP_PROXY_URL = 'https://mcp.example.test/'
    process.env.CLAUDE_CODE_MCP_PROXY_PATH = '/proxy/{server_id}'
    process.env.CLAUDE_CODE_TELEMETRY_BASE_URL =
      'https://telemetry.example.test/'
    process.env.CLAUDE_CODE_GROWTHBOOK_BASE_URL =
      'https://growthbook.example.test/'
    process.env.CLAUDE_CODE_SESSION_INGRESS_URL =
      'https://ingress.example.test/'

    expect(getBackendTargets()).toEqual({
      apiBaseUrl: 'https://backend.example.test',
      webAppOrigin: 'https://web.example.test',
      mcpProxyUrl: 'https://mcp.example.test',
      mcpProxyPath: '/proxy/{server_id}',
      telemetryBaseUrl: 'https://telemetry.example.test',
      growthbookBaseUrl: 'https://growthbook.example.test',
      sessionIngressUrl: 'https://ingress.example.test',
    })
  })

  test('prefers the local control plane for runtime-facing targets when active', () => {
    writePersistedControlPlaneRuntime({
      pid: process.pid,
      url: 'http://127.0.0.1:4319',
      startedAt: '2026-04-02T00:00:00.000Z',
    })

    expect(getBackendTargets()).toEqual({
      apiBaseUrl: 'http://127.0.0.1:4319',
      webAppOrigin: 'http://127.0.0.1:4319',
      mcpProxyUrl: 'https://mcp-proxy.anthropic.com',
      mcpProxyPath: '/v1/mcp/{server_id}',
      telemetryBaseUrl: 'http://127.0.0.1:4319',
      growthbookBaseUrl: 'http://127.0.0.1:4319',
      sessionIngressUrl: 'http://127.0.0.1:4319',
    })
  })

  test('keeps explicit env overrides ahead of the local control plane', () => {
    writePersistedControlPlaneRuntime({
      pid: process.pid,
      url: 'http://127.0.0.1:4319',
      startedAt: '2026-04-02T00:00:00.000Z',
    })
    process.env.CLAUDE_CODE_APP_BACKEND_URL = 'https://backend.example.test/'
    process.env.CLAUDE_CODE_TELEMETRY_BASE_URL =
      'https://telemetry.example.test/'

    const targets = getBackendTargets()

    expect(targets.apiBaseUrl).toBe('https://backend.example.test')
    expect(targets.telemetryBaseUrl).toBe('https://telemetry.example.test')
    expect(targets.webAppOrigin).toBe('http://127.0.0.1:4319')
  })

  test('detects hosted control-plane URLs independently of local runtime', () => {
    writePersistedControlPlaneRuntime({
      pid: process.pid,
      url: 'http://127.0.0.1:4319',
      startedAt: '2026-04-02T00:00:00.000Z',
    })
    process.env.CLAUDE_CODE_WEB_APP_URL = 'https://hosted.example.test/'

    expect(getHostedControlPlaneUrl()).toBe('https://hosted.example.test')
    expect(getWebAppOrigin()).toBe('https://hosted.example.test')
    expect(getBackendTargets().apiBaseUrl).toBe('http://127.0.0.1:4319')
  })
})
