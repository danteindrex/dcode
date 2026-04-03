import { describe, expect, test } from 'bun:test'
import {
  authenticateHostedBrowserRequest,
  createHostedBrowserAuthSession,
  isHostedBrowserAuthSessionExpired,
  parseHostedBrowserAuthToken,
  serializeHostedBrowserAuthCookie,
} from './auth.js'

describe('hosted control-plane auth', () => {
  test('creates a browser session and serializes it as a cookie', () => {
    const session = createHostedBrowserAuthSession('user_123', {
      now: () => new Date('2026-04-02T00:00:00.000Z'),
      ttlMs: 60_000,
    })

    expect(session.userId).toBe('user_123')
    expect(session.createdAt).toBe('2026-04-02T00:00:00.000Z')
    expect(isHostedBrowserAuthSessionExpired(session, () => new Date('2026-04-02T00:00:30.000Z'))).toBe(false)
    expect(serializeHostedBrowserAuthCookie(session)).toContain(session.token)
    expect(parseHostedBrowserAuthToken(`foo=bar; hosted_control_plane_auth=${session.token}; baz=qux`)).toBe(session.token)
  })

  test('authenticates bearer and cookie requests', () => {
    const session = createHostedBrowserAuthSession('user_123', {
      now: () => new Date('2026-04-02T00:00:00.000Z'),
      ttlMs: 60_000,
    })

    expect(
      authenticateHostedBrowserRequest(
        new Request('http://localhost/api/sessions', {
          headers: { authorization: `Bearer ${session.token}` },
        }),
        session,
        { now: () => new Date('2026-04-02T00:00:30.000Z') },
      ),
    ).toBe(true)

    expect(
      authenticateHostedBrowserRequest(
        new Request('http://localhost/api/sessions', {
          headers: { cookie: serializeHostedBrowserAuthCookie(session) },
        }),
        session,
        { now: () => new Date('2026-04-02T00:00:30.000Z') },
      ),
    ).toBe(true)
  })
})
