import { describe, expect, mock, test } from 'bun:test'

import { createOpenAIProvider } from './provider.js'

describe('createOpenAIProvider', () => {
  test('exposes the openai provider id', () => {
    expect(createOpenAIProvider().id).toBe('openai')
  })

  test('resolves client config and delegates to the query function', async () => {
    const originalApiKey = process.env.OPENAI_API_KEY
    const originalBaseUrl = process.env.OPENAI_BASE_URL
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.OPENAI_BASE_URL = 'https://example.test/v1'

    const query = mock(async (input, client) => ({ input, client }))
    const provider = createOpenAIProvider(query)

    const result = await provider.call({
      model: 'gpt-5.4',
      messages: [{ role: 'user', content: 'hello' }] as never,
    })

    expect(query).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      input: {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }],
        systemPrompt: [],
        tools: [],
        thinkingConfig: undefined,
        signal: undefined,
        options: undefined,
      },
      client: {
        apiKey: 'test-openai-key',
        baseUrl: 'https://example.test/v1',
      },
    })

    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = originalApiKey
    }

    if (originalBaseUrl === undefined) {
      delete process.env.OPENAI_BASE_URL
    } else {
      process.env.OPENAI_BASE_URL = originalBaseUrl
    }
  })
})
