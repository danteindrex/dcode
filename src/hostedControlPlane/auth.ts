import { randomUUID } from 'crypto'
import type { HostedBrowserAuthSession } from './types.js'

const AUTH_COOKIE_NAME = 'hosted_control_plane_auth'
const DEFAULT_AUTH_TTL_MS = 24 * 60 * 60 * 1000

export function createHostedBrowserAuthSession(
  userId: string,
  options: {
    now?: () => Date
    ttlMs?: number
  } = {},
): HostedBrowserAuthSession {
  const now = options.now ?? (() => new Date())
  const createdAt = now().toISOString()
  const expiresAt = new Date(
    now().getTime() + (options.ttlMs ?? DEFAULT_AUTH_TTL_MS),
  ).toISOString()

  return {
    id: randomUUID(),
    userId,
    token: randomUUID(),
    createdAt,
    expiresAt,
  }
}

export function isHostedBrowserAuthSessionExpired(
  session: HostedBrowserAuthSession,
  now: () => Date = () => new Date(),
): boolean {
  return now().getTime() >= new Date(session.expiresAt).getTime()
}

export function serializeHostedBrowserAuthCookie(
  session: HostedBrowserAuthSession,
): string {
  return [
    `${AUTH_COOKIE_NAME}=${session.token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${new Date(session.expiresAt).toUTCString()}`,
  ].join('; ')
}

export function parseHostedBrowserAuthToken(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) {
    return null
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = part.trim().split('=')
    if (!rawName || rawValueParts.length === 0) {
      continue
    }
    if (rawName === AUTH_COOKIE_NAME) {
      return rawValueParts.join('=')
    }
  }

  return null
}

export function authenticateHostedBrowserRequest(
  request: Request,
  session: HostedBrowserAuthSession,
  options: {
    now?: () => Date
  } = {},
): boolean {
  if (isHostedBrowserAuthSessionExpired(session, options.now)) {
    return false
  }

  const authorization = request.headers.get('authorization')
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice('bearer '.length).trim()
    if (token === session.token) {
      return true
    }
  }

  const cookieToken = parseHostedBrowserAuthToken(
    request.headers.get('cookie'),
  )
  return cookieToken === session.token
}
