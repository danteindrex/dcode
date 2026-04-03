import { afterEach, describe, expect, test } from 'bun:test'

import {
  getBridgeBaseUrl,
  getBridgeSessionIngressUrl,
} from './bridgeConfig.js'

const KEYS = [
  'USER_TYPE',
  'CLAUDE_BRIDGE_BASE_URL',
  'CLAUDE_BRIDGE_SESSION_INGRESS_URL',
  'CLAUDE_CODE_APP_BACKEND_URL',
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

describe('bridgeConfig', () => {
  test('uses backend target overrides by default', () => {
    process.env.CLAUDE_CODE_APP_BACKEND_URL = 'https://backend.example.test/'
    process.env.CLAUDE_CODE_SESSION_INGRESS_URL =
      'https://ingress.example.test/'

    expect(getBridgeBaseUrl()).toBe('https://backend.example.test')
    expect(getBridgeSessionIngressUrl()).toBe('https://ingress.example.test')
  })

  test('preserves ant-only bridge overrides', () => {
    process.env.USER_TYPE = 'ant'
    process.env.CLAUDE_BRIDGE_BASE_URL = 'https://bridge.ant.dev/'
    process.env.CLAUDE_BRIDGE_SESSION_INGRESS_URL =
      'https://bridge-ingress.ant.dev/'

    expect(getBridgeBaseUrl()).toBe('https://bridge.ant.dev/')
    expect(getBridgeSessionIngressUrl()).toBe(
      'https://bridge-ingress.ant.dev/',
    )
  })
})
