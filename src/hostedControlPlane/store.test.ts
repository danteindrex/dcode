import { describe, expect, test } from 'bun:test'
import { createHostedControlPlaneStore } from './store.js'

describe('hosted control-plane store', () => {
  test('registers sessions and preserves them by id', () => {
    const store = createHostedControlPlaneStore({
      now: () => new Date('2026-04-02T00:00:00.000Z'),
    })

    store.upsertSession({
      id: 'session_1',
      ownerUserId: 'user_1',
      machineId: 'machine_1',
      connected: true,
      lastSeenAt: '2026-04-02T00:00:00.000Z',
      providers: ['anthropic'],
    })

    const created = store.createSession({
      ownerUserId: 'user_2',
      machineId: 'machine_2',
      connected: false,
      providers: ['openai-codex'],
    })

    expect(store.getSession('session_1')?.machineId).toBe('machine_1')
    expect(created.ownerUserId).toBe('user_2')
    expect(created.lastSeenAt).toBe('2026-04-02T00:00:00.000Z')
    expect(store.listSessions()).toHaveLength(2)
  })

  test('queues commands per session and stores response events', () => {
    const store = createHostedControlPlaneStore({
      now: () => new Date('2026-04-02T00:00:00.000Z'),
    })

    store.createSession({
      id: 'session_1',
      ownerUserId: 'user_1',
      machineId: 'machine_1',
      connected: true,
      providers: ['openai-codex'],
    })

    const command = store.enqueueCommand({
      sessionId: 'session_1',
      ownerUserId: 'user_1',
      text: 'Reply with exactly OK',
    })

    expect(store.claimQueuedCommands('session_1', 10)).toHaveLength(1)
    store.markCommandRunning(command.id)
    store.appendCommandEvent({
      commandId: command.id,
      sessionId: 'session_1',
      kind: 'assistant_text',
      payload: { text: 'OK' },
    })
    store.completeCommand(command.id)

    expect(store.listQueuedCommands('session_1')).toHaveLength(1)
    expect(store.getCommandEvents(command.id)).toEqual([
      expect.objectContaining({
        kind: 'assistant_text',
        payload: { text: 'OK' },
      }),
    ])
    expect(store.getCommand(command.id)?.status).toBe('completed')
  })
})
