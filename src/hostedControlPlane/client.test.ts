import { afterEach, describe, expect, mock, test } from 'bun:test'
import {
  completeHostedCommand,
  reportHostedCommandEvent,
} from './client.js'

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

describe('hosted control-plane client', () => {
  test('posts command events and completion to the backend', async () => {
    const requests: Array<{ url: string; method: string; body?: unknown }> = []
    global.fetch = mock(async (input: string | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    await reportHostedCommandEvent('https://hosted.example.test/', 'cmd_1', {
      kind: 'assistant_text',
      payload: { text: 'OK' },
    })
    await completeHostedCommand('https://hosted.example.test/', 'cmd_1')

    expect(requests).toEqual([
      {
        url: 'https://hosted.example.test/api/cli/commands/cmd_1/events',
        method: 'POST',
        body: {
          kind: 'assistant_text',
          payload: { text: 'OK' },
        },
      },
      {
        url: 'https://hosted.example.test/api/cli/commands/cmd_1/complete',
        method: 'POST',
      },
    ])
  })
})
