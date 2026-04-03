import { describe, expect, mock, test } from 'bun:test'

import {
  resetOpenAICodexRefreshImplForTesting,
  setOpenAICodexRefreshImplForTesting,
} from './auth.js'
import {
  clearStoredOpenAICodexOAuth,
  saveStoredOpenAICodexOAuth,
  setOpenAICodexStorageBackendForTesting,
} from './storage.js'
import { createOpenAICodexProvider } from './provider.js'

function createMemoryBackend(initial: Record<string, unknown> = {}) {
  const state = { ...initial }

  return {
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
  }
}

describe('createOpenAICodexProvider', () => {
  test('exposes the openai-codex provider id', () => {
    expect(createOpenAICodexProvider().id).toBe('openai-codex')
  })

  test('resolves auth and delegates to the query function', async () => {
    setOpenAICodexStorageBackendForTesting(createMemoryBackend())
    const originalAccess = process.env.OPENAI_CODEX_ACCESS_TOKEN
    const originalRefresh = process.env.OPENAI_CODEX_REFRESH_TOKEN
    const originalBaseUrl = process.env.OPENAI_CODEX_BASE_URL
    process.env.OPENAI_CODEX_ACCESS_TOKEN = 'codex-access'
    process.env.OPENAI_CODEX_REFRESH_TOKEN = 'codex-refresh'
    process.env.OPENAI_CODEX_BASE_URL = 'https://codex.example.test/v1'

    const query = mock(async (input, auth) => ({ input, auth }))
    const provider = createOpenAICodexProvider(query)

    const result = await Array.fromAsync(
      provider.call({
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'hello' }] as never,
      }),
    )

    expect(query).toHaveBeenCalledTimes(1)
    expect(result).toEqual([
      {
        input: {
          model: 'gpt-5.4',
          messages: [{ role: 'user', content: 'hello' }],
          systemPrompt: [],
          tools: [],
          thinkingConfig: undefined,
          signal: undefined,
          options: undefined,
        },
        auth: {
          accessToken: 'codex-access',
          refreshToken: 'codex-refresh',
          baseUrl: 'https://codex.example.test/v1',
          source: 'env',
        },
      },
    ])

    if (originalAccess === undefined) {
      delete process.env.OPENAI_CODEX_ACCESS_TOKEN
    } else {
      process.env.OPENAI_CODEX_ACCESS_TOKEN = originalAccess
    }

    if (originalRefresh === undefined) {
      delete process.env.OPENAI_CODEX_REFRESH_TOKEN
    } else {
      process.env.OPENAI_CODEX_REFRESH_TOKEN = originalRefresh
    }

    if (originalBaseUrl === undefined) {
      delete process.env.OPENAI_CODEX_BASE_URL
    } else {
      process.env.OPENAI_CODEX_BASE_URL = originalBaseUrl
    }

    setOpenAICodexStorageBackendForTesting(undefined)
  })

  test('prefers stored oauth credentials over env fallback', async () => {
    setOpenAICodexStorageBackendForTesting(createMemoryBackend())
    const originalAccess = process.env.OPENAI_CODEX_ACCESS_TOKEN
    const originalRefresh = process.env.OPENAI_CODEX_REFRESH_TOKEN
    const originalBaseUrl = process.env.OPENAI_CODEX_BASE_URL

    process.env.OPENAI_CODEX_ACCESS_TOKEN = 'env-access'
    process.env.OPENAI_CODEX_REFRESH_TOKEN = 'env-refresh'
    process.env.OPENAI_CODEX_BASE_URL = 'https://env.example.test/v1'

    saveStoredOpenAICodexOAuth({
      accessToken: 'stored-access',
      refreshToken: 'stored-refresh',
      expiresAt: '2030-01-01T00:00:00.000Z',
      baseUrl: 'https://api.openai.com/v1',
      email: 'user@example.com',
      accountId: 'acct_123',
    })

    const provider = createOpenAICodexProvider((_input, auth) =>
      Promise.resolve(auth),
    )

    try {
      const result = await Array.fromAsync(
        provider.call({
          model: 'gpt-5.4',
        }),
      )

      expect(result).toEqual([
        {
          accessToken: 'stored-access',
          refreshToken: 'stored-refresh',
          expiresAt: '2030-01-01T00:00:00.000Z',
          baseUrl: 'https://chatgpt.com/backend-api',
          source: 'stored-oauth',
          email: 'user@example.com',
          accountId: 'acct_123',
        },
      ])
    } finally {
      clearStoredOpenAICodexOAuth()

      if (originalAccess === undefined) {
        delete process.env.OPENAI_CODEX_ACCESS_TOKEN
      } else {
        process.env.OPENAI_CODEX_ACCESS_TOKEN = originalAccess
      }

      if (originalRefresh === undefined) {
        delete process.env.OPENAI_CODEX_REFRESH_TOKEN
      } else {
        process.env.OPENAI_CODEX_REFRESH_TOKEN = originalRefresh
      }

      if (originalBaseUrl === undefined) {
        delete process.env.OPENAI_CODEX_BASE_URL
      } else {
        process.env.OPENAI_CODEX_BASE_URL = originalBaseUrl
      }

      setOpenAICodexStorageBackendForTesting(undefined)
    }
  })

  test('refreshes expired stored oauth credentials before querying', async () => {
    setOpenAICodexStorageBackendForTesting(createMemoryBackend())
    const refreshSpy = mock(async () => ({
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
      expiresAt: '2030-01-01T00:00:00.000Z',
      baseUrl: 'https://api.openai.com/v1',
      email: 'fresh@example.com',
      accountId: 'acct_fresh',
    }))
    setOpenAICodexRefreshImplForTesting(refreshSpy as never)

    saveStoredOpenAICodexOAuth({
      accessToken: 'expired-access',
      refreshToken: 'expired-refresh',
      expiresAt: '2000-01-01T00:00:00.000Z',
      baseUrl: 'https://api.openai.com/v1',
      email: 'stale@example.com',
      accountId: 'acct_stale',
    })

    const provider = createOpenAICodexProvider((_input, auth) =>
      Promise.resolve(auth),
    )

    try {
      const result = await Array.fromAsync(
        provider.call({
          model: 'gpt-5.4',
        }),
      )

      expect(refreshSpy).toHaveBeenCalledTimes(1)
      expect(result).toEqual([
        {
          accessToken: 'fresh-access',
          refreshToken: 'fresh-refresh',
          expiresAt: '2030-01-01T00:00:00.000Z',
          baseUrl: 'https://chatgpt.com/backend-api',
          source: 'stored-oauth',
          email: 'fresh@example.com',
          accountId: 'acct_fresh',
        },
      ])
    } finally {
      resetOpenAICodexRefreshImplForTesting()
      clearStoredOpenAICodexOAuth()
      setOpenAICodexStorageBackendForTesting(undefined)
    }
  })
})
