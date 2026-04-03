import { describe, expect, test } from 'bun:test'
import { createHostedChannelRegistry } from './channel.js'

describe('hosted control-plane channel', () => {
  test('tracks registered cli agents by session id', () => {
    const registry = createHostedChannelRegistry()
    registry.register('session_1', { machineId: 'machine_1' })

    expect(registry.get('session_1')?.machineId).toBe('machine_1')
    expect(registry.list()).toEqual([
      { sessionId: 'session_1', machineId: 'machine_1' },
    ])

    registry.unregister('session_1')
    expect(registry.get('session_1')).toBeUndefined()
  })
})

