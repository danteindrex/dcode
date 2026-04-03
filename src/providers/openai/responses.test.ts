import { describe, expect, mock, test } from 'bun:test'
import { z } from 'zod/v4'

import {
  buildOpenAIResponsesRequest,
  parseOpenAIResponsesOutput,
  queryOpenAIResponses,
} from './responses.js'

describe('buildOpenAIResponsesRequest', () => {
  test('converts internal messages and tools to an OpenAI responses payload', async () => {
    const tool = {
      name: 'Read',
      inputSchema: z.object({
        file_path: z.string(),
      }),
      inputJSONSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file_path: {
            type: 'string',
          },
        },
        required: ['file_path'],
      },
      prompt: async () => 'Read a file from disk',
      isEnabled: () => true,
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      checkPermissions: async () => ({ behavior: 'allow' }),
      description: async () => 'Read a file from disk',
      call: async () => ({ ok: true }),
      userFacingName: () => 'Read',
      toAutoClassifierInput: () => '',
      mapToolResultToToolResultBlockParam: () =>
        ({
          type: 'tool_result',
          tool_use_id: 'call_123',
          content: 'ok',
        }) as never,
      renderToolUseMessage: () => null,
      maxResultSizeChars: 1000,
      strict: true,
    } as const

    const request = await buildOpenAIResponsesRequest({
      model: 'gpt-5.4',
      systemPrompt: [{ type: 'text', text: 'System guidance' }],
      messages: [
        {
          type: 'user',
          message: {
            content: [
              { type: 'text', text: 'Find config' },
              {
                type: 'tool_result',
                tool_use_id: 'call_123',
                content: 'contents of config',
              },
            ],
          },
        },
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'I will read the file.' },
              {
                type: 'tool_use',
                id: 'call_123',
                name: 'Read',
                input: { file_path: 'package.json' },
              },
            ],
          },
        },
      ],
      tools: [tool],
      options: {
        getToolPermissionContext: async () => ({ mode: 'default' }),
        agents: [],
      },
    })

    expect(request).toEqual({
      model: 'gpt-5.4',
      instructions: 'System guidance',
      input: [
        {
          type: 'message',
          role: 'user',
          content: 'Find config',
        },
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: 'contents of config',
        },
        {
          type: 'message',
          role: 'assistant',
          content: 'I will read the file.',
        },
        {
          type: 'function_call',
          call_id: 'call_123',
          name: 'Read',
          arguments: '{"file_path":"package.json"}',
        },
      ],
      tools: [
        {
          type: 'function',
          name: 'Read',
          description: 'Read a file from disk',
          parameters: {
            additionalProperties: false,
            properties: {
              file_path: {
                type: 'string',
              },
            },
            required: ['file_path'],
            type: 'object',
          },
          strict: true,
        },
      ],
      tool_choice: 'auto',
      parallel_tool_calls: true,
    })
  })

  test('normalizes optional tool fields into required nullable properties', async () => {
    const tool = {
      name: 'Bash',
      inputSchema: z.object({
        command: z.string(),
        timeout: z.number().optional(),
      }),
      inputJSONSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          command: {
            type: 'string',
          },
          timeout: {
            type: 'number',
          },
        },
        required: ['command'],
      },
      prompt: async () => 'Run a shell command',
      isEnabled: () => true,
      isConcurrencySafe: () => true,
      isReadOnly: () => false,
      checkPermissions: async () => ({ behavior: 'allow' }),
      description: async () => 'Run a shell command',
      call: async () => ({ ok: true }),
      userFacingName: () => 'Bash',
      toAutoClassifierInput: () => '',
      mapToolResultToToolResultBlockParam: () =>
        ({
          type: 'tool_result',
          tool_use_id: 'call_123',
          content: 'ok',
        }) as never,
      renderToolUseMessage: () => null,
      maxResultSizeChars: 1000,
      strict: true,
    } as const

    const request = await buildOpenAIResponsesRequest({
      model: 'gpt-5.4',
      messages: [],
      tools: [tool],
      options: {
        getToolPermissionContext: async () => ({ mode: 'default' }),
        agents: [],
      },
    })

    expect(request.tools).toEqual([
      {
        type: 'function',
        name: 'Bash',
        description: 'Run a shell command',
        parameters: {
          additionalProperties: false,
          properties: {
            command: {
              type: 'string',
            },
            timeout: {
              type: ['number', 'null'],
            },
          },
          required: ['command', 'timeout'],
          type: 'object',
        },
        strict: true,
      },
    ])
  })
})

describe('parseOpenAIResponsesOutput', () => {
  test('extracts assistant text and tool calls from the response payload', () => {
    const parsed = parseOpenAIResponsesOutput({
      model: 'gpt-5.4',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Need to inspect a file.' }],
        },
        {
          type: 'function_call',
          call_id: 'call_456',
          name: 'Read',
          arguments: '{"file_path":"src/main.tsx"}',
        },
      ],
      usage: {
        input_tokens: 123,
        output_tokens: 45,
      },
    })

    expect(parsed).toEqual({
      model: 'gpt-5.4',
      content: [
        {
          type: 'text',
          text: 'Need to inspect a file.',
        },
        {
          type: 'tool_use',
          id: 'call_456',
          name: 'Read',
          input: {
            file_path: 'src/main.tsx',
          },
        },
      ],
      usage: {
        input_tokens: 123,
        output_tokens: 45,
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
      'x-request-id': 'req_openai_stream_123',
    },
  })
}

describe('queryOpenAIResponses', () => {
  test('emits stream events before the final assistant message', async () => {
    const fetchMock = mock(async () =>
      createSseResponse([
        {
          type: 'response.output_text.delta',
          output_index: 0,
          content_index: 0,
          delta: 'Hel',
        },
        {
          type: 'response.output_text.delta',
          output_index: 0,
          content_index: 0,
          delta: 'lo',
        },
        {
          type: 'response.output_item.added',
          item: {
            type: 'function_call',
            id: 'fc_1',
            call_id: 'call_1',
            name: 'Read',
            arguments: '{"file_path":"README.md"}',
          },
        },
        {
          type: 'response.completed',
          response: {
            model: 'gpt-5.4',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Hello' }],
              },
              {
                type: 'function_call',
                call_id: 'call_1',
                name: 'Read',
                arguments: '{"file_path":"README.md"}',
              },
            ],
            usage: {
              input_tokens: 10,
              output_tokens: 4,
            },
          },
        },
      ]))

    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch

    try {
      const result = await Array.fromAsync(
        queryOpenAIResponses(
          {
            model: 'gpt-5.4',
            messages: [{ type: 'user', message: { content: 'hello' } }],
          },
          {
            authorizationToken: 'openai-token',
            baseUrl: 'https://api.openai.com/v1',
          },
        ),
      )

      expect(result.length).toBeGreaterThan(1)
      expect((result[0] as Record<string, unknown>).type).toBe('stream_event')
      expect((result.at(-1) as Record<string, unknown>).type).toBe('assistant')
      expect(
        ((result.at(-1) as Record<string, unknown>).message as Record<string, unknown>)
          .content,
      ).toEqual([
        { type: 'text', text: 'Hello' },
        {
          type: 'tool_use',
          id: 'call_1',
          name: 'Read',
          input: { file_path: 'README.md' },
        },
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
