import { describe, expect, mock, test } from 'bun:test'

import {
  buildGeminiGenerateContentRequest,
  parseGeminiGenerateContentResponse,
  queryGeminiGenerateContent,
} from './generateContent.js'

describe('buildGeminiGenerateContentRequest', () => {
  test('converts provider input into a Gemini generateContent payload', async () => {
    const request = await buildGeminiGenerateContentRequest({
      model: 'gemini-2.5-pro',
      systemPrompt: [{ type: 'text', text: 'Use tools when needed.' }],
      messages: [
        {
          type: 'user',
          message: {
            content: [{ type: 'text', text: 'Read the main file.' }],
          },
        },
        {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'call_1',
                name: 'Read',
                input: { file_path: 'src/main.tsx' },
              },
            ],
          },
        },
        {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'call_1',
                content: 'main file contents',
              },
            ],
          },
        },
      ],
    })

    expect(request).toEqual({
      systemInstruction: {
        parts: [{ text: 'Use tools when needed.' }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Read the main file.' }],
        },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'Read',
                args: { file_path: 'src/main.tsx' },
              },
            },
          ],
        },
        {
          role: 'tool',
          parts: [
            {
              functionResponse: {
                name: 'call_1',
                response: { result: 'main file contents' },
              },
            },
          ],
        },
      ],
    })
  })
})

describe('parseGeminiGenerateContentResponse', () => {
  test('extracts text and tool calls from Gemini candidates', () => {
    const parsed = parseGeminiGenerateContentResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: 'I need to inspect the entrypoint.' },
              {
                functionCall: {
                  name: 'Read',
                  args: { file_path: 'src/entrypoints/cli.tsx' },
                },
              },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 77,
        candidatesTokenCount: 12,
      },
    })

    expect(parsed).toEqual({
      content: [
        {
          type: 'text',
          text: 'I need to inspect the entrypoint.',
        },
        {
          type: 'tool_use',
          id: 'gemini_Read_1',
          name: 'Read',
          input: { file_path: 'src/entrypoints/cli.tsx' },
        },
      ],
      usage: {
        input_tokens: 77,
        output_tokens: 12,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
        service_tier: null,
        cache_creation: {
          ephemeral_1h_input_tokens: 0,
          ephemeral_5m_input_tokens: 0,
        },
        inference_geo: null,
        iterations: null,
        speed: null,
      },
    })
  })
})

function createSseResponse(events: Record<string, unknown>[]): Response {
  const payload = events
    .map(event => `data: ${JSON.stringify(event)}\r\n\r\n`)
    .join('')

  return new Response(payload, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
    },
  })
}

describe('queryGeminiGenerateContent', () => {
  test('emits stream events before the final assistant message', async () => {
    const fetchMock = mock(async () =>
      createSseResponse([
        {
          candidates: [
            {
              content: {
                parts: [{ text: 'Hel' }],
              },
            },
          ],
        },
        {
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Hello' },
                  {
                    functionCall: {
                      name: 'Read',
                      args: { file_path: 'src/main.tsx' },
                    },
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 2,
          },
        },
      ]))

    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch

    try {
      const result = await Array.fromAsync(
        queryGeminiGenerateContent(
          {
            model: 'gemini-2.5-pro',
            messages: [{ type: 'user', message: { content: 'hello' } }],
          },
          {
            apiKey: 'gemini-key',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          },
        ),
      )

      expect(result.length).toBeGreaterThan(1)
      expect((result[0] as Record<string, unknown>).type).toBe('stream_event')
      expect((result.at(-1) as Record<string, unknown>).type).toBe('assistant')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
