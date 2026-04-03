import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { createServer } from 'http'

import {
  buildOpenAICodexAuthorizeUrl,
  exchangeOpenAICodexAuthorizationCode,
  isOpenAICodexTokenExpired,
  loginWithOpenAICodexOAuth,
  parseOpenAICodexManualInput,
  refreshOpenAICodexOAuthToken,
} from './oauth.js'
import {
  getStoredOpenAICodexOAuth,
  setOpenAICodexStorageBackendForTesting,
} from './storage.js'

const storageState: { openAICodexOauth?: ReturnType<typeof getStoredOpenAICodexOAuth> } = {}

function createStorageBackend() {
  return {
    read() {
      return { ...storageState }
    },
    update(data: Record<string, unknown>) {
      Object.assign(storageState, data)
      return { success: true }
    },
  }
}

describe('openai-codex oauth', () => {
  beforeEach(() => {
    storageState.openAICodexOauth = undefined
    setOpenAICodexStorageBackendForTesting(createStorageBackend())
  })

  afterEach(() => {
    setOpenAICodexStorageBackendForTesting(undefined)
  })

  test('builds the expected authorize url', () => {
    const url = new URL(
      buildOpenAICodexAuthorizeUrl({
        codeChallenge: 'challenge-value',
        state: 'state-value',
      }),
    )

    expect(url.origin).toBe('https://auth.openai.com')
    expect(url.pathname).toBe('/oauth/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:1455/auth/callback',
    )
    expect(url.searchParams.get('scope')).toBe(
      'openid profile email offline_access api.responses.write',
    )
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe('state-value')
    expect(url.searchParams.get('id_token_add_organizations')).toBe('true')
    expect(url.searchParams.get('codex_cli_simplified_flow')).toBe('true')
  })

  test('parses manual input from full callback urls and raw codes', () => {
    expect(
      parseOpenAICodexManualInput(
        'http://localhost:1455/auth/callback?code=abc123&state=xyz789',
      ),
    ).toEqual({
      code: 'abc123',
      state: 'xyz789',
    })

    expect(parseOpenAICodexManualInput('raw-code-value')).toEqual({
      code: 'raw-code-value',
    })
  })

  test('exchanges an authorization code for stored oauth credentials', async () => {
    const fetchImpl = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://auth.openai.com/oauth/token')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeDefined()

      return new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          api_base_url: 'https://api.openai.com/v1',
          id_token:
            'header.eyJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJzdWIiOiJhY2N0XzEyMyJ9.signature',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    })

    const stored = await exchangeOpenAICodexAuthorizationCode({
      code: 'auth-code',
      codeVerifier: 'verifier',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(stored.accessToken).toBe('access-token')
    expect(stored.refreshToken).toBe('refresh-token')
    expect(stored.baseUrl).toBe('https://api.openai.com/v1')
    expect(stored.email).toBe('user@example.com')
    expect(stored.accountId).toBe('acct_123')
    expect(isOpenAICodexTokenExpired(stored.expiresAt)).toBe(false)
  })

  test('refreshes stored oauth credentials', async () => {
    const fetchImpl = mock(async () => {
      return new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 1800,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    })

    const refreshed = await refreshOpenAICodexOAuthToken(
      {
        refreshToken: 'old-refresh',
        baseUrl: 'https://api.openai.com/v1',
        email: 'user@example.com',
        accountId: 'acct_123',
      },
      { fetchImpl },
    )

    expect(refreshed.accessToken).toBe('new-access')
    expect(refreshed.refreshToken).toBe('new-refresh')
    expect(refreshed.baseUrl).toBe('https://api.openai.com/v1')
    expect(refreshed.email).toBe('user@example.com')
    expect(refreshed.accountId).toBe('acct_123')
  })

  test('completes the manual fallback login flow and stores oauth credentials', async () => {
    const result = await loginWithOpenAICodexOAuth({
      skipBrowserOpen: true,
      callbackPort: 1456,
      manualCodeInput: async () => 'manual-code',
      onAuthorizeUrl: () => undefined,
      fetchImpl: mock(async () => {
        return new Response(
          JSON.stringify({
            access_token: 'manual-access',
            refresh_token: 'manual-refresh',
            expires_in: 1200,
            api_base_url: 'https://api.openai.com/v1',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }),
    })

    expect(result.accessToken).toBe('manual-access')
    expect(getStoredOpenAICodexOAuth()?.accessToken).toBe('manual-access')
  })

  test('completes the automatic callback login flow', async () => {
    let authorizeUrl = ''
    const flowPromise = loginWithOpenAICodexOAuth({
      callbackPort: 1457,
      openUrl: async () => true,
      onAuthorizeUrl: url => {
        authorizeUrl = url
      },
      fetchImpl: mock(async () => {
        return new Response(
          JSON.stringify({
            access_token: 'auto-access',
            refresh_token: 'auto-refresh',
            expires_in: 1200,
            api_base_url: 'https://api.openai.com/v1',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }),
    })

    await new Promise(resolve => setTimeout(resolve, 25))
    const state = new URL(authorizeUrl).searchParams.get('state')
    expect(state).toBeTruthy()

    const callbackResponse = await fetch(
      `http://localhost:1457/auth/callback?code=auto-code&state=${state}`,
    )
    expect(callbackResponse.status).toBe(200)
    expect(await callbackResponse.text()).toContain('OpenAI Codex connected')

    const result = await flowPromise
    expect(result.accessToken).toBe('auto-access')
    expect(getStoredOpenAICodexOAuth()?.accessToken).toBe('auto-access')
  })

  test('falls back to an ephemeral callback port when the default port is unavailable', async () => {
    const occupiedServer = createServer()
    await new Promise<void>((resolve, reject) => {
      occupiedServer.once('error', reject)
      occupiedServer.listen(1455, () => resolve())
    })

    let authorizeUrl = ''
    const fetchImpl = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { redirect_uri: string }
      expect(body.redirect_uri).not.toContain('1455')

      return new Response(
        JSON.stringify({
          access_token: 'fallback-access',
          refresh_token: 'fallback-refresh',
          expires_in: 1200,
          api_base_url: 'https://api.openai.com/v1',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    })

    try {
      const result = await loginWithOpenAICodexOAuth({
        skipBrowserOpen: true,
        manualCodeInput: async () => 'manual-code',
        onAuthorizeUrl: url => {
          authorizeUrl = url
        },
        fetchImpl,
      })

      const redirectUri = new URL(authorizeUrl).searchParams.get('redirect_uri')
      expect(redirectUri).toBeTruthy()
      expect(redirectUri).not.toContain('1455')
      expect(result.accessToken).toBe('fallback-access')
    } finally {
      await new Promise<void>((resolve, reject) => {
        occupiedServer.close(error => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  })

  test('times out while waiting for the login to complete', async () => {
    await expect(
      loginWithOpenAICodexOAuth({
        callbackPort: 0,
        skipBrowserOpen: true,
        timeoutMs: 25,
        manualCodeInput: () => new Promise<string>(() => {}),
      }),
    ).rejects.toThrow(/timed out/i)
  })

  test('aborts an in-flight login when the signal is cancelled', async () => {
    const controller = new AbortController()
    const loginPromise = loginWithOpenAICodexOAuth({
      callbackPort: 0,
      skipBrowserOpen: true,
      signal: controller.signal,
      manualCodeInput: () => new Promise<string>(() => {}),
      onAuthorizeUrl: () => {
        controller.abort(new Error('user cancelled'))
      },
    })

    await expect(loginPromise).rejects.toMatchObject({
      name: 'AbortError',
      message: 'user cancelled',
    })
  })

  test('reports whether the browser opened automatically', async () => {
    const openUrl = mock(async () => false)
    const onBrowserOpenResult = mock(() => {})

    await loginWithOpenAICodexOAuth({
      callbackPort: 0,
      openUrl,
      onBrowserOpenResult,
      onAuthorizeUrl: () => undefined,
      manualCodeInput: async () => 'manual-code',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            access_token: 'manual-access',
            refresh_token: 'manual-refresh',
            expires_in: 1200,
            api_base_url: 'https://api.openai.com/v1',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    })

    expect(openUrl).toHaveBeenCalledTimes(1)
    expect(onBrowserOpenResult).toHaveBeenCalledWith(false)
  })
})
