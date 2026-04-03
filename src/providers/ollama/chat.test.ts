import { describe, expect, mock, test } from 'bun:test'

import {
  buildOllamaChatRequest,
  parseOllamaChatResponse,
  queryOllamaChat,
} from './chat.js'

describe('buildOllamaChatRequest', () => {
  test('converts provider input into an Ollama chat payload', async () => {
    const request = await buildOllamaChatRequest({
      model: 'qwen2.5-coder',
      systemPrompt: [{ type: 'text', text: 'Be precise.' }],
      messages: [
        {
          type: 'user',
          message: {
            content: [{ type: 'text', text: 'Inspect the repo.' }],
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
                input: { file_path: 'README.md' },
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
                content: 'README contents',
              },
            ],
          },
        },
      ],
      thinkingConfig: { type: 'enabled', budget_tokens: 2048 },
    })

    expect(request).toEqual({
      model: 'qwen2.5-coder',
      messages: [
        { role: 'user', content: 'Inspect the repo.' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              function: {
                name: 'Read',
                arguments: { file_path: 'README.md' },
              },
            },
          ],
        },
        { role: 'tool', content: 'README contents' },
      ],
      think: 'high',
      stream: false,
    })
  })
})

describe('parseOllamaChatResponse', () => {
  test('extracts assistant text and tool calls from the chat response', () => {
    const parsed = parseOllamaChatResponse({
      model: 'qwen2.5-coder',
      prompt_eval_count: 111,
      eval_count: 22,
      message: {
        content: 'I should read the main file.',
        tool_calls: [
          {
            function: {
              name: 'Read',
              arguments: {
                file_path: 'src/main.tsx',
              },
            },
          },
        ],
      },
    })

    expect(parsed).toEqual({
      model: 'qwen2.5-coder',
      content: [
        {
          type: 'text',
          text: 'I should read the main file.',
        },
        {
          type: 'tool_use',
          id: 'ollama_Read_1',
          name: 'Read',
          input: {
            file_path: 'src/main.tsx',
          },
        },
      ],
      usage: {
        input_tokens: 111,
        output_tokens: 22,
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

function createJsonLineResponse(events: Record<string, unknown>[]): Response {
  return new Response(
    events.map(event => `${JSON.stringify(event)}\n`).join(''),
    {
      status: 200,
      headers: {
        'content-type': 'application/x-ndjson',
      },
    },
  )
}

describe('queryOllamaChat', () => {
  test('emits stream events before the final assistant message', async () => {
    const fetchMock = mock(async () =>
      createJsonLineResponse([
        {
          message: {
            content: 'Hel',
          },
          done: false,
        },
        {
          model: 'qwen2.5-coder',
          message: {
            content: 'lo',
            tool_calls: [
              {
                function: {
                  name: 'Read',
                  arguments: {
                    file_path: 'README.md',
                  },
                },
              },
            ],
          },
          prompt_eval_count: 11,
          eval_count: 3,
          done: true,
        },
      ]))

    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch

    try {
      const result = await Array.fromAsync(
        queryOllamaChat(
          {
            model: 'qwen2.5-coder',
            messages: [{ type: 'user', message: { content: 'hello' } }],
          },
          {
            baseUrl: 'http://127.0.0.1:11434',
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
