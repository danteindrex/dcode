import { describe, expect, test } from 'bun:test'

import {
  clearStoredOpenAICodexOAuth,
  getStoredOpenAICodexOAuth,
  saveStoredOpenAICodexOAuth,
} from './storage.js'

function createMemoryBackend(initial: Record<string, unknown> = {}) {
  const state = { ...initial }

  return {
    backend: {
      read() {
        return { ...state }
      },
      update(next: Record<string, unknown>) {
        for (const key of Object.keys(state)) {
          delete state[key]
        }
        Object.assign(state, next)
        return { success: true }
      },
    },
    state,
  }
}

describe('openai-codex storage', () => {
  test('persists and reloads oauth credentials', () => {
    const { backend } = createMemoryBackend()

    saveStoredOpenAICodexOAuth(
      {
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: '2030-01-01T00:00:00.000Z',
        baseUrl: 'https://api.openai.com/v1',
        email: 'user@example.com',
        accountId: 'acct_123',
      },
      backend,
    )

    expect(getStoredOpenAICodexOAuth(backend)).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2030-01-01T00:00:00.000Z',
      baseUrl: 'https://api.openai.com/v1',
      email: 'user@example.com',
      accountId: 'acct_123',
    })
  })

  test('clears stored oauth credentials', () => {
    const { backend } = createMemoryBackend({
      openAICodexOauth: {
        accessToken: 'access-1',
        expiresAt: '2030-01-01T00:00:00.000Z',
        baseUrl: 'https://api.openai.com/v1',
      },
    })

    clearStoredOpenAICodexOAuth(backend)

    expect(getStoredOpenAICodexOAuth(backend)).toBeUndefined()
  })
})
