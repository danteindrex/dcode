import { describe, expect, test } from 'bun:test'
import { startHostedControlPlaneServer } from './server.js'

describe('hosted telemetry ingest', () => {
  test('accepts event batches on the hosted endpoint', async () => {
    const server = await startHostedControlPlaneServer()
    try {
      const response = await fetch(`${server.url}/api/event_logging/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: [{ type: 'metric' }] }),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ accepted: 1 })
      expect(server.getTelemetry()).toHaveLength(1)
      expect(server.getTelemetry()[0]?.sessionId).toBe('unknown')
    } finally {
      await server.close()
    }
  })
})
