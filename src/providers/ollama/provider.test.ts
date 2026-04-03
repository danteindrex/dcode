import { describe, expect, mock, test } from 'bun:test'

import { createOllamaProvider } from './provider.js'

describe('createOllamaProvider', () => {
  test('exposes the ollama provider id', () => {
    expect(createOllamaProvider().id).toBe('ollama')
  })

  test('resolves client config and delegates to the query function', async () => {
    const originalBaseUrl = process.env.OLLAMA_BASE_URL
    process.env.OLLAMA_BASE_URL = 'http://ollama.example.test:11434'

    const query = mock(async (input, client) => ({ input, client }))
    const provider = createOllamaProvider(query)

    const result = await provider.call({
      model: 'llama3.2:3b',
      messages: [{ role: 'user', content: 'hello' }] as never,
    })

    expect(query).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      input: {
        model: 'llama3.2:3b',
        messages: [{ role: 'user', content: 'hello' }],
        systemPrompt: [],
        tools: [],
        thinkingConfig: undefined,
        signal: undefined,
        options: undefined,
      },
      client: {
        baseUrl: 'http://ollama.example.test:11434',
      },
    })

    if (originalBaseUrl === undefined) {
      delete process.env.OLLAMA_BASE_URL
    } else {
      process.env.OLLAMA_BASE_URL = originalBaseUrl
    }
  })
})
