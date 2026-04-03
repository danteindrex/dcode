import { describe, expect, test } from 'bun:test'
import type {
  HostedAgentSession,
  HostedCommandEvent,
  HostedQueuedCommand,
  HostedTelemetryBatch,
} from './types.js'

describe('hosted control-plane types', () => {
  test('session and command shapes remain stable', () => {
    const session: HostedAgentSession = {
      id: 'session_123',
      ownerUserId: 'user_123',
      machineId: 'machine_123',
      connected: true,
      lastSeenAt: '2026-04-02T00:00:00.000Z',
      providers: ['anthropic', 'openai-codex'],
    }

    const command: HostedQueuedCommand = {
      id: 'cmd_123',
      sessionId: 'session_123',
      ownerUserId: 'user_123',
      text: 'Explain the latest error',
      status: 'queued',
      createdAt: '2026-04-02T00:00:00.000Z',
      source: 'web',
    }

    const event: HostedCommandEvent = {
      id: 'evt_1',
      commandId: 'cmd_123',
      sessionId: 'session_123',
      createdAt: '2026-04-02T00:00:01.000Z',
      kind: 'assistant_text',
      payload: { text: 'OK' },
    }

    const telemetry: HostedTelemetryBatch = {
      sessionId: 'session_123',
      receivedAt: '2026-04-02T00:00:00.000Z',
      events: [{ type: 'event' }],
    }

    expect(session.connected).toBe(true)
    expect(command.status).toBe('queued')
    expect(event.kind).toBe('assistant_text')
    expect(telemetry.events).toHaveLength(1)
  })
})
