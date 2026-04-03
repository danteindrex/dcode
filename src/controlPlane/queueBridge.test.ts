import { afterEach, describe, expect, mock, test } from 'bun:test'
import {
  drainClaimedControlPlaneCommands,
  drainRemoteControlPlaneCommands,
} from './queueBridge.js'

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

describe('control-plane queue bridge', () => {
  test('submits commands immediately when the REPL is idle', () => {
    const submitted: string[] = []
    const completed: string[] = []

    const drained = drainClaimedControlPlaneCommands({
      commands: [
        {
          id: 'cmd-1',
          text: 'Summarize the workspace',
          source: 'web',
          status: 'claimed',
          createdAt: '2026-04-02T00:00:00.000Z',
        },
      ],
      onSubmitMessage(content) {
        submitted.push(content)
        return true
      },
      enqueuePrompt() {
        throw new Error('should not enqueue when submit succeeds')
      },
      completeCommand(id) {
        completed.push(id)
      },
    })

    expect(drained).toBe(1)
    expect(submitted).toEqual(['Summarize the workspace'])
    expect(completed).toEqual(['cmd-1'])
  })

  test('falls back to enqueue when the REPL is busy', () => {
    const enqueued: string[] = []
    const completed: string[] = []

    const drained = drainClaimedControlPlaneCommands({
      commands: [
        {
          id: 'cmd-2',
          text: 'Run after the current turn',
          source: 'web',
          status: 'claimed',
          createdAt: '2026-04-02T00:00:00.000Z',
        },
      ],
      onSubmitMessage() {
        return false
      },
      enqueuePrompt(content) {
        enqueued.push(content)
      },
      completeCommand(id) {
        completed.push(id)
      },
    })

    expect(drained).toBe(1)
    expect(enqueued).toEqual(['Run after the current turn'])
    expect(completed).toEqual(['cmd-2'])
  })

  test('drains commands from a remote control-plane runtime url', async () => {
    const requests: Array<{ url: string; method: string }> = []
    global.fetch = mock(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'
      requests.push({ url, method })

      if (url.endsWith('/api/commands/claim')) {
        return new Response(
          JSON.stringify({
            commands: [
              {
                id: 'cmd-3',
                text: 'Explain remote queue status',
                source: 'web',
                status: 'claimed',
                createdAt: '2026-04-02T00:00:00.000Z',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      if (url.endsWith('/api/commands/cmd-3/complete')) {
        return new Response('{}', { status: 200 })
      }

      return new Response('{}', { status: 404 })
    }) as typeof fetch

    const submitted: string[] = []

    const drained = await drainRemoteControlPlaneCommands(
      'http://127.0.0.1:4319',
      content => {
        submitted.push(content)
        return true
      },
      () => {},
    )

    expect(drained).toBe(1)
    expect(submitted).toEqual(['Explain remote queue status'])
    expect(requests).toEqual([
      {
        url: 'http://127.0.0.1:4319/api/commands/claim',
        method: 'POST',
      },
      {
        url: 'http://127.0.0.1:4319/api/commands/cmd-3/complete',
        method: 'POST',
      },
    ])
  })

  test('can defer completion for hosted reporting flows', () => {
    const submitted: string[] = []
    const completed: string[] = []

    const drained = drainClaimedControlPlaneCommands({
      commands: [
        {
          id: 'cmd-4',
          text: 'Reply with exactly OK',
          source: 'web',
          status: 'claimed',
          createdAt: '2026-04-02T00:00:00.000Z',
        },
      ],
      onSubmitMessage(content) {
        submitted.push(content)
        return true
      },
      enqueuePrompt() {
        throw new Error('should not enqueue when submit succeeds')
      },
      completeCommand(id) {
        completed.push(id)
      },
      autoComplete: false,
    })

    expect(drained).toBe(1)
    expect(submitted).toEqual(['Reply with exactly OK'])
    expect(completed).toEqual([])
  })
})
