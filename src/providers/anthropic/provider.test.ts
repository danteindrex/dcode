import { describe, expect, test } from 'bun:test'

import { createAnthropicProvider } from './provider.js'

describe('createAnthropicProvider', () => {
  test('exposes the anthropic provider id', () => {
    expect(createAnthropicProvider().id).toBe('anthropic')
  })

  test('delegates to the existing Anthropic query path', async () => {
    const calls: unknown[] = []
    const provider = createAnthropicProvider(async input => {
      calls.push(input)
      return { data: 'ok' } as never
    })

    const signal = new AbortController().signal
    const result = await provider.call({
      model: 'claude-sonnet-4-6',
      signal,
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(result).toEqual({ data: 'ok' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: [],
      thinkingConfig: { type: 'disabled' },
      tools: [],
      signal,
      options: expect.objectContaining({
        model: 'claude-sonnet-4-6',
        isNonInteractiveSession: true,
        agents: [],
        hasAppendSystemPrompt: false,
        mcpTools: [],
      }),
    })
  })
})
