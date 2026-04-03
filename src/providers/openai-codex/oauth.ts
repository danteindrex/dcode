import { createHash, randomBytes } from 'crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { openBrowser } from '../../utils/browser.js'
import {
  saveStoredOpenAICodexOAuth,
  type OpenAICodexStoredOAuth,
} from './storage.js'

const DEFAULT_OPENAI_CODEX_OAUTH_ORIGIN = 'https://auth.openai.com'
const DEFAULT_OPENAI_CODEX_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_OPENAI_CODEX_CLIENT_ID =
  process.env.OPENAI_CODEX_OAUTH_CLIENT_ID ||
  'app_EMoamEEZ73f0CkXaXp7hrann'
const DEFAULT_OPENAI_CODEX_CALLBACK_PORT = 1455
const DEFAULT_OPENAI_CODEX_CALLBACK_PATH = '/auth/callback'
const DEFAULT_OPENAI_CODEX_LOGIN_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_OPENAI_CODEX_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'api.responses.write',
]

type FetchLike = typeof fetch

type OpenAICodexTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
  api_base_url?: string
}

export type OpenAICodexOAuthConfig = {
  authOrigin?: string
  clientId?: string
  callbackPort?: number
  callbackPath?: string
  scopes?: readonly string[]
  baseUrl?: string
}

export type OpenAICodexOAuthResult = OpenAICodexStoredOAuth & {
  authorizeUrl: string
}

export type OpenAICodexLoginOptions = OpenAICodexOAuthConfig & {
  openUrl?: (url: string) => Promise<boolean> | boolean
  fetchImpl?: FetchLike
  manualCodeInput?: () => Promise<string>
  skipBrowserOpen?: boolean
  onAuthorizeUrl?: (url: string) => Promise<void> | void
  onBrowserOpenResult?: (opened: boolean) => Promise<void> | void
  signal?: AbortSignal
  timeoutMs?: number
}

class OpenAICodexCallbackListener {
  private readonly server = createServer()
  private port = 0
  private expectedState: string | null = null
  private resolver: ((code: string) => void) | null = null
  private rejecter: ((error: Error) => void) | null = null
  private pendingResponse: ServerResponse | null = null

  constructor(
    private readonly callbackPath: string = DEFAULT_OPENAI_CODEX_CALLBACK_PATH,
  ) {}

  async start(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const handleError = (err: Error) => {
        this.server.removeListener('listening', handleListening)
        reject(err)
      }
      const handleListening = () => {
        this.server.removeListener('error', handleError)
        const address = this.server.address() as AddressInfo
        this.port = address.port
        resolve(this.port)
      }

      this.server.once('error', handleError)
      this.server.once('listening', handleListening)
      this.server.listen(port, 'localhost', () => {
        // Intentionally handled via the listening event so the error handler
        // can be detached correctly on both success and failure.
      })
    })
  }

  waitForAuthorization(
    expectedState: string,
    onReady: () => Promise<void>,
  ): Promise<string> {
    this.expectedState = expectedState
    this.server.on('request', this.handleRequest)
    this.server.on('error', this.handleError)
    return new Promise<string>((resolve, reject) => {
      this.resolver = resolve
      this.rejecter = reject
      void onReady()
    })
  }

  respond(statusCode: number, html: string): void {
    if (!this.pendingResponse) {
      return
    }

    this.pendingResponse.writeHead(statusCode, {
      'content-type': 'text/html; charset=utf-8',
    })
    this.pendingResponse.end(html)
    this.pendingResponse = null
  }

  close(): void {
    this.pendingResponse = null
    this.server.removeListener('request', this.handleRequest)
    this.server.removeListener('error', this.handleError)
    this.server.close()
  }

  private readonly handleRequest = (
    req: IncomingMessage,
    res: ServerResponse,
  ): void => {
    const parsedUrl = new URL(
      req.url || '',
      `http://${req.headers.host || 'localhost'}`,
    )

    if (parsedUrl.pathname !== this.callbackPath) {
      res.writeHead(404)
      res.end()
      return
    }

    const code = parsedUrl.searchParams.get('code')
    const state = parsedUrl.searchParams.get('state')

    if (!code) {
      res.writeHead(400)
      res.end('Authorization code not found')
      this.reject(new Error('No authorization code received'))
      return
    }

    if (state !== this.expectedState) {
      res.writeHead(400)
      res.end('Invalid state parameter')
      this.reject(new Error('Invalid state parameter'))
      return
    }

    this.pendingResponse = res
    this.resolve(code)
  }

  private readonly handleError = (error: Error): void => {
    this.reject(error)
  }

  private resolve(code: string): void {
    this.resolver?.(code)
    this.resolver = null
    this.rejecter = null
  }

  private reject(error: Error): void {
    this.rejecter?.(error)
    this.resolver = null
    this.rejecter = null
  }
}

function base64UrlEncode(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function decodeJwtClaims(token: string | undefined): Record<string, unknown> {
  if (!token) {
    return {}
  }

  const parts = token.split('.')
  if (parts.length < 2) {
    return {}
  }

  try {
    const payload = parts[1]!
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1]!.length / 4) * 4, '=')
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Record<
      string,
      unknown
    >
  } catch {
    return {}
  }
}

export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32))
}

export function generateCodeChallenge(codeVerifier: string): string {
  return base64UrlEncode(createHash('sha256').update(codeVerifier).digest())
}

export function generateOAuthState(): string {
  return base64UrlEncode(randomBytes(32))
}

export function buildOpenAICodexAuthorizeUrl(params: {
  codeChallenge: string
  state: string
  callbackPort?: number
  callbackPath?: string
  authOrigin?: string
  clientId?: string
  scopes?: readonly string[]
}): string {
  const callbackPort =
    params.callbackPort ?? DEFAULT_OPENAI_CODEX_CALLBACK_PORT
  const callbackPath =
    params.callbackPath ?? DEFAULT_OPENAI_CODEX_CALLBACK_PATH
  const authOrigin = params.authOrigin ?? DEFAULT_OPENAI_CODEX_OAUTH_ORIGIN
  const clientId = params.clientId ?? DEFAULT_OPENAI_CODEX_CLIENT_ID
  const scopes = params.scopes ?? DEFAULT_OPENAI_CODEX_SCOPES

  const url = new URL('/oauth/authorize', authOrigin)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set(
    'redirect_uri',
    `http://localhost:${callbackPort}${callbackPath}`,
  )
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', params.state)
  url.searchParams.set('id_token_add_organizations', 'true')
  url.searchParams.set('codex_cli_simplified_flow', 'true')
  return url.toString()
}

export function parseOpenAICodexManualInput(input: string): {
  code: string
  state?: string
} {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Authorization code input is empty')
  }

  try {
    const url = new URL(trimmed)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state') ?? undefined
    if (code) {
      return { code, state }
    }
  } catch {
    // Raw code input is handled below.
  }

  const hashIndex = trimmed.indexOf('#')
  if (hashIndex > 0) {
    const code = trimmed.slice(0, hashIndex).trim()
    const state = trimmed.slice(hashIndex + 1).trim() || undefined
    if (code) {
      return { code, state }
    }
  }

  return { code: trimmed }
}

async function parseTokenResponse(response: Response): Promise<OpenAICodexTokenResponse> {
  const text = await response.text()
  let body: unknown

  try {
    body = text ? (JSON.parse(text) as unknown) : {}
  } catch {
    body = text
  }

  if (!response.ok) {
    throw new Error(
      `OpenAI Codex token request failed (${response.status}): ${
        typeof body === 'string' ? body : JSON.stringify(body)
      }`,
    )
  }

  if (!body || typeof body !== 'object') {
    throw new Error('OpenAI Codex token response was not valid JSON')
  }

  return body as OpenAICodexTokenResponse
}

export async function exchangeOpenAICodexAuthorizationCode(params: {
  code: string
  codeVerifier: string
  callbackPort?: number
  callbackPath?: string
  authOrigin?: string
  clientId?: string
  fetchImpl?: FetchLike
  baseUrl?: string
}): Promise<OpenAICodexStoredOAuth> {
  const fetchImpl = params.fetchImpl ?? fetch
  const callbackPort =
    params.callbackPort ?? DEFAULT_OPENAI_CODEX_CALLBACK_PORT
  const callbackPath =
    params.callbackPath ?? DEFAULT_OPENAI_CODEX_CALLBACK_PATH
  const authOrigin = params.authOrigin ?? DEFAULT_OPENAI_CODEX_OAUTH_ORIGIN
  const clientId = params.clientId ?? DEFAULT_OPENAI_CODEX_CLIENT_ID
  const response = await fetchImpl(new URL('/oauth/token', authOrigin), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: params.code,
      client_id: clientId,
      code_verifier: params.codeVerifier,
      redirect_uri: `http://localhost:${callbackPort}${callbackPath}`,
    }),
  })

  const tokenResponse = await parseTokenResponse(response)
  const claims = decodeJwtClaims(tokenResponse.id_token)
  const expiresAt = new Date(
    Date.now() + (tokenResponse.expires_in ?? 3600) * 1000,
  ).toISOString()

  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt,
    baseUrl: tokenResponse.api_base_url || params.baseUrl || DEFAULT_OPENAI_CODEX_BASE_URL,
    email:
      typeof claims.email === 'string' ? claims.email : undefined,
    accountId:
      typeof claims.sub === 'string' ? claims.sub : undefined,
  }
}

export async function refreshOpenAICodexOAuthToken(
  stored: Pick<
    OpenAICodexStoredOAuth,
    'refreshToken' | 'baseUrl' | 'email' | 'accountId'
  >,
  options: OpenAICodexOAuthConfig & { fetchImpl?: FetchLike } = {},
): Promise<OpenAICodexStoredOAuth> {
  if (!stored.refreshToken) {
    throw new Error('OpenAI Codex refresh token is missing')
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const authOrigin = options.authOrigin ?? DEFAULT_OPENAI_CODEX_OAUTH_ORIGIN
  const clientId = options.clientId ?? DEFAULT_OPENAI_CODEX_CLIENT_ID
  const response = await fetchImpl(new URL('/oauth/token', authOrigin), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
      client_id: clientId,
    }),
  })

  const tokenResponse = await parseTokenResponse(response)
  const claims = decodeJwtClaims(tokenResponse.id_token)

  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token || stored.refreshToken,
    expiresAt: new Date(
      Date.now() + (tokenResponse.expires_in ?? 3600) * 1000,
    ).toISOString(),
    baseUrl:
      tokenResponse.api_base_url || stored.baseUrl || DEFAULT_OPENAI_CODEX_BASE_URL,
    email:
      (typeof claims.email === 'string' ? claims.email : undefined) ||
      stored.email,
    accountId:
      (typeof claims.sub === 'string' ? claims.sub : undefined) ||
      stored.accountId,
  }
}

export function isOpenAICodexTokenExpired(
  expiresAt: string | undefined,
  skewMs: number = 60_000,
): boolean {
  if (!expiresAt) {
    return false
  }

  const parsed = Date.parse(expiresAt)
  if (Number.isNaN(parsed)) {
    return false
  }

  return parsed <= Date.now() + skewMs
}

function renderCallbackPage(
  title: string,
  body: string,
  color: '#166534' | '#991b1b',
): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family: sans-serif; background:#0b1020; color:#e5e7eb; display:flex; min-height:100vh; align-items:center; justify-content:center"><div style="max-width:560px; padding:24px; border:1px solid #334155; border-radius:16px; background:#111827"><h1 style="margin:0 0 12px; color:${color}">${title}</h1><p style="margin:0; line-height:1.5">${body}</p></div></body></html>`
}

function createAbortError(message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

async function startCallbackListenerWithFallback(
  callbackPath: string,
  requestedPort: number | undefined,
): Promise<{
  listener: OpenAICodexCallbackListener
  callbackPort: number
}> {
  const preferredPort = requestedPort ?? DEFAULT_OPENAI_CODEX_CALLBACK_PORT
  const allowEphemeralFallback = requestedPort === undefined
  const attemptedPorts = allowEphemeralFallback ? [preferredPort, 0] : [preferredPort]
  let lastError: unknown

  for (const port of attemptedPorts) {
    const listener = new OpenAICodexCallbackListener(callbackPath)
    try {
      const callbackPort = await listener.start(port)
      return { listener, callbackPort }
    } catch (error) {
      lastError = error
      listener.close()
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: string }).code)
          : undefined
      if (
        !allowEphemeralFallback ||
        port === 0 ||
        (code !== 'EADDRINUSE' && code !== 'EACCES')
      ) {
        throw error
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to start OpenAI Codex OAuth callback listener')
}

export async function loginWithOpenAICodexOAuth(
  options: OpenAICodexLoginOptions = {},
): Promise<OpenAICodexOAuthResult> {
  const callbackPath =
    options.callbackPath ?? DEFAULT_OPENAI_CODEX_CALLBACK_PATH
  const timeoutMs = options.timeoutMs ?? DEFAULT_OPENAI_CODEX_LOGIN_TIMEOUT_MS
  const { listener, callbackPort } = await startCallbackListenerWithFallback(
    callbackPath,
    options.callbackPort,
  )
  const codeVerifier = generateCodeVerifier()
  const state = generateOAuthState()
  const authorizeUrl = buildOpenAICodexAuthorizeUrl({
    codeChallenge: generateCodeChallenge(codeVerifier),
    state,
    callbackPort,
    callbackPath,
    authOrigin: options.authOrigin,
    clientId: options.clientId,
    scopes: options.scopes,
  })

  const automaticCode = listener.waitForAuthorization(state, async () => {
    await options.onAuthorizeUrl?.(authorizeUrl)

    if (options.skipBrowserOpen) {
      return
    }

    const openUrl = options.openUrl ?? openBrowser
    const opened = await openUrl(authorizeUrl)
    await options.onBrowserOpenResult?.(opened)
  })

  const manualCode = options.manualCodeInput
    ? options.manualCodeInput().then(input => {
        const parsed = parseOpenAICodexManualInput(input)
        if (parsed.state && parsed.state !== state) {
          throw new Error('Invalid OpenAI Codex OAuth state parameter')
        }
        return parsed.code
      })
    : undefined

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutCode = new Promise<string>((_, reject) => {
    if (timeoutMs <= 0) {
      reject(
        new Error(
          'OpenAI Codex OAuth login timed out before it could be started.',
        ),
      )
      return
    }

    timeoutHandle = setTimeout(() => {
      reject(
        new Error(
          `OpenAI Codex OAuth login timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`,
        ),
      )
    }, timeoutMs)
  })

  let abortHandler: (() => void) | undefined
  const abortCode = options.signal
    ? new Promise<string>((_, reject) => {
        if (options.signal?.aborted) {
          reject(
            createAbortError(
              options.signal.reason instanceof Error
                ? options.signal.reason.message
                : 'OpenAI Codex OAuth login cancelled.',
            ),
          )
          return
        }

        abortHandler = () => {
          reject(
            createAbortError(
              options.signal?.reason instanceof Error
                ? options.signal.reason.message
                : 'OpenAI Codex OAuth login cancelled.',
            ),
          )
        }

        options.signal?.addEventListener('abort', abortHandler, { once: true })
      })
    : undefined

  try {
    const pendingCodes = [automaticCode, timeoutCode]
    if (manualCode) {
      pendingCodes.push(manualCode)
    }
    if (abortCode) {
      pendingCodes.push(abortCode)
    }

    const code = await Promise.race(pendingCodes)

    const stored = await exchangeOpenAICodexAuthorizationCode({
      code,
      codeVerifier,
      callbackPort,
      callbackPath,
      authOrigin: options.authOrigin,
      clientId: options.clientId,
      fetchImpl: options.fetchImpl,
      baseUrl: options.baseUrl,
    })

    saveStoredOpenAICodexOAuth(stored)
    listener.respond(
      200,
      renderCallbackPage(
        'OpenAI Codex connected',
        'You can close this browser window and return to the CLI.',
        '#166534',
      ),
    )

    return {
      ...stored,
      authorizeUrl,
    }
  } catch (error) {
    listener.respond(
      500,
      renderCallbackPage(
        'OpenAI Codex sign-in failed',
        error instanceof Error ? error.message : 'OAuth flow failed.',
        '#991b1b',
      ),
    )
    throw error
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
    if (abortHandler) {
      options.signal?.removeEventListener('abort', abortHandler)
    }
    listener.close()
  }
}
