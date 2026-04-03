import {
  saveStoredOpenAICodexOAuth,
  getStoredOpenAICodexOAuth,
  type OpenAICodexStoredOAuth,
} from './storage.js'
import {
  isOpenAICodexTokenExpired,
  refreshOpenAICodexOAuthToken,
} from './oauth.js'

export type OpenAICodexAuth = {
  accessToken: string
  refreshToken?: string
  baseUrl: string
  expiresAt?: string
  source: 'stored-oauth' | 'env'
  email?: string
  accountId?: string
}

const DEFAULT_OPENAI_CODEX_BASE_URL = 'https://chatgpt.com/backend-api'

function normalizeOpenAICodexBaseUrl(baseUrl: string | undefined): string {
  const trimmed = baseUrl?.trim()
  if (!trimmed || /^https:\/\/api\.openai\.com\/v1\/?$/i.test(trimmed)) {
    return DEFAULT_OPENAI_CODEX_BASE_URL
  }
  return trimmed
}

type RefreshImpl = typeof refreshOpenAICodexOAuthToken

let refreshImpl: RefreshImpl = refreshOpenAICodexOAuthToken

function fromStored(
  stored: OpenAICodexStoredOAuth | undefined,
): OpenAICodexAuth | undefined {
  if (!stored?.accessToken || !stored.baseUrl) {
    return undefined
  }

  return {
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    baseUrl: normalizeOpenAICodexBaseUrl(stored.baseUrl),
    expiresAt: stored.expiresAt,
    source: 'stored-oauth',
    email: stored.email,
    accountId: stored.accountId,
  }
}

export async function resolveOpenAICodexAuth(): Promise<OpenAICodexAuth> {
  const stored = fromStored(getStoredOpenAICodexOAuth())
  if (stored) {
    if (
      stored.source === 'stored-oauth' &&
      stored.refreshToken &&
      isOpenAICodexTokenExpired(stored.expiresAt)
    ) {
      const refreshed = await refreshImpl({
        refreshToken: stored.refreshToken,
        baseUrl: stored.baseUrl,
        email: stored.email,
        accountId: stored.accountId,
      })
      saveStoredOpenAICodexOAuth(refreshed)
      return fromStored(refreshed) as OpenAICodexAuth
    }

    return stored
  }

  const accessToken = process.env.OPENAI_CODEX_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error(
      'OpenAI Codex login required. Run the OpenAI Codex login flow or set OPENAI_CODEX_ACCESS_TOKEN.',
    )
  }

  return {
    accessToken,
    refreshToken: process.env.OPENAI_CODEX_REFRESH_TOKEN,
    baseUrl: normalizeOpenAICodexBaseUrl(process.env.OPENAI_CODEX_BASE_URL),
    source: 'env',
  }
}

export function setOpenAICodexRefreshImplForTesting(
  impl: RefreshImpl,
): void {
  refreshImpl = impl
}

export function resetOpenAICodexRefreshImplForTesting(): void {
  refreshImpl = refreshOpenAICodexOAuthToken
}
