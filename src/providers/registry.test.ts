import { describe, expect, test } from 'bun:test'

import { createProviderRegistry } from './registry.js'

describe('createProviderRegistry', () => {
  test('lists and retrieves providers by id', () => {
    const anthropic = {
      id: 'anthropic' as const,
      call: async () => ({ data: 'anthropic' }),
    }
    const openai = {
      id: 'openai' as const,
      call: async () => ({ data: 'openai' }),
    }

    const registry = createProviderRegistry([anthropic, openai])

    expect(registry.list()).toEqual([anthropic, openai])
    expect(registry.get('anthropic')).toBe(anthropic)
    expect(registry.get('openai')).toBe(openai)
    expect(registry.get('gemini')).toBeUndefined()
  })

  test('rejects duplicate provider ids', () => {
    const provider = {
      id: 'ollama' as const,
      call: async () => ({ data: 'ollama' }),
    }

    expect(() => createProviderRegistry([provider, provider])).toThrow(
      /Duplicate provider id: ollama/,
    )
  })
})
