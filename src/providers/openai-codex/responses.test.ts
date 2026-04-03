import { describe, expect, mock, test } from 'bun:test'

import { queryOpenAICodexResponses } from './responses.js'

function createSseResponse(events: Record<string, unknown>[]): Response {
  const payload = events
    .map(event => `data: ${JSON.stringify(event)}\r\n\r\n`)
    .join('')

  return new Response(payload, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'x-request-id': 'req_codex_123',
    },
  })
}

describe('queryOpenAICodexResponses', () => {
  test('targets the ChatGPT Codex backend and parses the streamed response', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://chatgpt.com/backend-api/codex/responses')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toBeDefined()

      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer codex-access')
      expect(headers.get('chatgpt-account-id')).toBe('acct_123')
      expect(headers.get('originator')).toBe('pi')
      expect(headers.get('openai-beta')).toBe('responses=experimental')
      expect(headers.get('accept')).toBe('text/event-stream')

      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.model).toBe('gpt-5')
      expect(body.stream).toBe(true)
      expect(body.store).toBe(false)
      expect(body.include).toEqual(['reasoning.encrypted_content'])

      return createSseResponse([
        { type: 'response.created' },
        {
          type: 'response.output_text.delta',
          output_index: 0,
          content_index: 0,
          delta: 'O',
        },
        {
          type: 'response.output_text.delta',
          output_index: 0,
          content_index: 0,
          delta: 'K',
        },
        {
          type: 'response.completed',
          response: {
            model: 'gpt-5',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'OK' }],
              },
            ],
            usage: {
              input_tokens: 5,
              output_tokens: 1,
            },
          },
        },
      ])
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch

    try {
      const result = await Array.fromAsync(
        queryOpenAICodexResponses(
          {
            model: 'gpt-5',
            messages: [{ type: 'user', message: { content: 'Reply with exactly OK' } }],
          },
          {
            accessToken: 'codex-access',
            accountId: 'acct_123',
            baseUrl: 'https://chatgpt.com/backend-api',
          },
        ),
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result.length).toBeGreaterThan(1)

      expect((result[0] as Record<string, unknown>).type).toBe('stream_event')

      const assistant = result.at(-1) as Record<string, unknown>
      expect(assistant.requestId).toBe('req_codex_123')
      expect((assistant.message as Record<string, unknown>).model).toBe('gpt-5')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
