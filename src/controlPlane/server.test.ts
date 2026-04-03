import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { startControlPlaneServer } from './server.js'

let configDir: string

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'claude-control-plane-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
})

afterEach(() => {
  delete process.env.CLAUDE_CONFIG_DIR
})

describe('control plane server', () => {
  test('serves status and accepts telemetry batches', async () => {
    const server = await startControlPlaneServer()

    try {
      const statusResponse = await fetch(`${server.url}/api/status`)
      expect(statusResponse.status).toBe(200)
      const status = (await statusResponse.json()) as {
        telemetry: { count: number }
      }
      expect(status.telemetry.count).toBe(0)

      const ingestResponse = await fetch(
        `${server.url}/api/event_logging/batch`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ events: [{ event: 'one' }, { event: 'two' }] }),
        },
      )
      expect(ingestResponse.status).toBe(200)
      expect(await ingestResponse.json()).toEqual({ accepted: 2 })

      const telemetryResponse = await fetch(`${server.url}/api/telemetry`)
      expect(telemetryResponse.status).toBe(200)
      const telemetry = (await telemetryResponse.json()) as {
        batches: Array<{ events: unknown[] }>
      }
      expect(telemetry.batches).toHaveLength(1)
      expect(telemetry.batches[0]?.events).toHaveLength(2)
    } finally {
      await server.close()
    }
  })

  test('queues and claims commands', async () => {
    const server = await startControlPlaneServer()

    try {
      const createResponse = await fetch(`${server.url}/api/commands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Summarize the workspace state' }),
      })
      expect(createResponse.status).toBe(201)

      const claimResponse = await fetch(`${server.url}/api/commands/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 1 }),
      })
      expect(claimResponse.status).toBe(200)
      const claimed = (await claimResponse.json()) as {
        commands: Array<{ id: string; status: string }>
      }
      expect(claimed.commands).toHaveLength(1)
      expect(claimed.commands[0]?.status).toBe('claimed')

      const completeResponse = await fetch(
        `${server.url}/api/commands/${claimed.commands[0]!.id}/complete`,
        {
          method: 'POST',
        },
      )
      expect(completeResponse.status).toBe(200)
      const completed = (await completeResponse.json()) as {
        command: { status: string }
      }
      expect(completed.command.status).toBe('completed')
    } finally {
      await server.close()
    }
  })
})
