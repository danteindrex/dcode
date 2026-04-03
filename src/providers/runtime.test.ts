import { describe, expect, test } from 'bun:test'

import { createProviderRuntime, defaultProviderRuntime } from './runtime.js'

describe('defaultProviderRuntime', () => {
  test('registers the anthropic provider', () => {
    expect(defaultProviderRuntime.registry.get('anthropic')?.id).toBe(
      'anthropic',
    )
  })

  test('registers the openai provider', () => {
    expect(defaultProviderRuntime.registry.get('openai')?.id).toBe('openai')
  })

  test('registers the openai-codex provider', () => {
    expect(defaultProviderRuntime.registry.get('openai-codex')?.id).toBe(
      'openai-codex',
    )
  })

  test('registers the gemini provider', () => {
    expect(defaultProviderRuntime.registry.get('gemini')?.id).toBe('gemini')
  })

  test('registers the ollama provider', () => {
    expect(defaultProviderRuntime.registry.get('ollama')?.id).toBe('ollama')
  })

  test('routes plain models to anthropic', async () => {
    const runtime = createProviderRuntime([
      {
        id: 'anthropic',
        call(input) {
          return Promise.resolve(input.model as unknown as never)
        },
      },
    ])

    const result = await runtime.callModel({
      model: 'claude-sonnet-4-6',
    })

    expect(result).toBe('claude-sonnet-4-6')
  })

  test('routes provider/model refs to the requested provider', async () => {
    const runtime = createProviderRuntime([
      {
        id: 'anthropic',
        call(input) {
          return Promise.resolve(`anthropic:${input.model}` as never)
        },
      },
      {
        id: 'openai',
        call(input) {
          return Promise.resolve(`openai:${input.model}` as never)
        },
      },
    ])

    const result = await runtime.callModel({
      model: 'openai/gpt-5.4',
      options: {
        model: 'openai/gpt-5.4',
      } as never,
    })

    expect(result).toBe('openai:gpt-5.4')
  })
})
