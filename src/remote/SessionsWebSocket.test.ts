import { describe, expect, test } from 'bun:test'

import { toSessionsWebSocketBaseUrl } from './SessionsWebSocket.js'

describe('toSessionsWebSocketBaseUrl', () => {
  test('converts secure http base URLs to secure websocket base URLs', () => {
    expect(toSessionsWebSocketBaseUrl('https://backend.example.test')).toBe(
      'wss://backend.example.test',
    )
  })

  test('converts insecure http base URLs to insecure websocket base URLs', () => {
    expect(toSessionsWebSocketBaseUrl('http://localhost:4000')).toBe(
      'ws://localhost:4000',
    )
  })
})
