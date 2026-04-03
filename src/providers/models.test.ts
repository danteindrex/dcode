import { describe, expect, test } from 'bun:test'

import { getProviderIdForModel, parseProviderModelRef } from './models.js'

describe('parseProviderModelRef', () => {
  test('parses a provider/model ref', () => {
    expect(parseProviderModelRef('anthropic/claude-sonnet-4-6')).toEqual({
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
    })
  })

  test('rejects malformed refs', () => {
    for (const value of [
      undefined,
      null,
      '',
      'anthropic',
      'anthropic/',
      '/claude',
      'unknown/claude',
      'anthropic/claude/extra',
      ' anthropic/claude',
      'anthropic/claude ',
    ]) {
      expect(parseProviderModelRef(value)).toBeNull()
    }
  })
})

describe('getProviderIdForModel', () => {
  test('defaults unprefixed models to anthropic', () => {
    expect(getProviderIdForModel('claude-sonnet-4-6')).toBe('anthropic')
    expect(getProviderIdForModel(undefined)).toBe('anthropic')
  })

  test('returns explicit provider prefixes', () => {
    expect(getProviderIdForModel('openai-codex/gpt-5')).toBe('openai-codex')
    expect(getProviderIdForModel('gemini/gemini-2.5-pro')).toBe('gemini')
  })
})
