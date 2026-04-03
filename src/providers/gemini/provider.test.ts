import { describe, expect, mock, test } from 'bun:test'

import { createGeminiProvider } from './provider.js'

describe('createGeminiProvider', () => {
  test('exposes the gemini provider id', () => {
    expect(createGeminiProvider().id).toBe('gemini')
  })

  test('resolves client config and delegates to the query function', async () => {
    const originalGeminiKey = process.env.GEMINI_API_KEY
    const originalGoogleKey = process.env.GOOGLE_API_KEY
    const originalBaseUrl = process.env.GEMINI_BASE_URL
    process.env.GEMINI_API_KEY = 'gemini-key'
    delete process.env.GOOGLE_API_KEY
    process.env.GEMINI_BASE_URL = 'https://gemini.example.test/v1beta'

    const query = mock(async (input, client) => ({ input, client }))
    const provider = createGeminiProvider(query)

    const result = await provider.call({
      model: 'gemini-2.5-pro',
      messages: [{ role: 'user', content: 'hello' }] as never,
    })

    expect(query).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      input: {
        model: 'gemini-2.5-pro',
        messages: [{ role: 'user', content: 'hello' }],
        systemPrompt: [],
        tools: [],
        thinkingConfig: undefined,
        signal: undefined,
        options: undefined,
      },
      client: {
        apiKey: 'gemini-key',
        baseUrl: 'https://gemini.example.test/v1beta',
      },
    })

    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey
    }

    if (originalGoogleKey === undefined) {
      delete process.env.GOOGLE_API_KEY
    } else {
      process.env.GOOGLE_API_KEY = originalGoogleKey
    }

    if (originalBaseUrl === undefined) {
      delete process.env.GEMINI_BASE_URL
    } else {
      process.env.GEMINI_BASE_URL = originalBaseUrl
    }
  })
})
