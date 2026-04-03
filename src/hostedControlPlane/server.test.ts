import { describe, expect, test } from 'bun:test'
import { startHostedControlPlaneServer } from './server.js'

describe('hosted control-plane server', () => {
  test('serves health and manages sessions behind browser auth', async () => {
    const server = await startHostedControlPlaneServer({
      now: () => new Date('2026-04-02T00:00:00.000Z'),
    })

    try {
      const healthResponse = await fetch(`${server.url}/health`)
      expect(healthResponse.status).toBe(200)
      expect(await healthResponse.json()).toEqual({ ok: true })

      const unauthorizedResponse = await fetch(`${server.url}/api/sessions`)
      expect(unauthorizedResponse.status).toBe(401)

      const authHeaders = {
        authorization: `Bearer ${server.authSession.token}`,
      }

      const createResponse = await fetch(`${server.url}/api/sessions`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: 'session_123',
          machineId: 'machine_123',
          connected: true,
          providers: ['anthropic', 'openai-codex'],
        }),
      })

      expect(createResponse.status).toBe(201)
      const created = (await createResponse.json()) as {
        session: {
          id: string
          ownerUserId: string
          providers: string[]
        }
      }
      expect(created.session.id).toBe('session_123')
      expect(created.session.ownerUserId).toBe('local-user')
      expect(created.session.providers).toEqual(['anthropic', 'openai-codex'])

      const sessionsResponse = await fetch(`${server.url}/api/sessions`, {
        headers: authHeaders,
      })
      expect(sessionsResponse.status).toBe(200)
      const sessions = (await sessionsResponse.json()) as {
        sessions: Array<{ id: string }>
      }
      expect(sessions.sessions).toHaveLength(1)
      expect(sessions.sessions[0]?.id).toBe('session_123')
    } finally {
      await server.close()
    }
  })

  test('lets a browser send a command and read back its response events', async () => {
    const server = await startHostedControlPlaneServer({
      now: () => new Date('2026-04-02T00:00:00.000Z'),
    })

    try {
      const authHeaders = {
        authorization: `Bearer ${server.authSession.token}`,
        'content-type': 'application/json',
      }

      await fetch(`${server.url}/api/sessions`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          id: 'session_1',
          machineId: 'machine_1',
          connected: true,
          providers: ['openai-codex'],
        }),
      })

      const createResponse = await fetch(
        `${server.url}/api/sessions/session_1/commands`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ text: 'Reply with exactly OK' }),
        },
      )
      expect(createResponse.status).toBe(201)
      const created = (await createResponse.json()) as {
        command: { id: string }
      }

      const claimResponse = await fetch(
        `${server.url}/api/cli/sessions/session_1/commands/claim`,
        {
          method: 'POST',
        },
      )
      expect(claimResponse.status).toBe(200)
      const claimed = (await claimResponse.json()) as {
        commands: Array<{ id: string; status: string }>
      }
      expect(claimed.commands[0]?.id).toBe(created.command.id)
      expect(claimed.commands[0]?.status).toBe('claimed')

      const runningResponse = await fetch(
        `${server.url}/api/cli/commands/${created.command.id}/running`,
        {
          method: 'POST',
        },
      )
      expect(runningResponse.status).toBe(200)

      const eventResponse = await fetch(
        `${server.url}/api/cli/commands/${created.command.id}/events`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'assistant_text',
            payload: { text: 'OK' },
          }),
        },
      )
      expect(eventResponse.status).toBe(201)

      const completeResponse = await fetch(
        `${server.url}/api/cli/commands/${created.command.id}/complete`,
        {
          method: 'POST',
        },
      )
      expect(completeResponse.status).toBe(200)

      const commandResponse = await fetch(
        `${server.url}/api/sessions/session_1/commands/${created.command.id}`,
        {
          headers: { authorization: `Bearer ${server.authSession.token}` },
        },
      )
      expect(commandResponse.status).toBe(200)
      const payload = (await commandResponse.json()) as {
        command: { status: string; ownerUserId: string; sessionId: string }
        events: Array<{ kind: string; payload: { text?: string } }>
      }
      expect(payload.command.sessionId).toBe('session_1')
      expect(payload.command.ownerUserId).toBe('local-user')
      expect(payload.command.status).toBe('completed')
      expect(payload.events[0]?.payload.text).toBe('OK')
    } finally {
      await server.close()
    }
  })
})
