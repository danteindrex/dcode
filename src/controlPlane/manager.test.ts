import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _setControlPlaneManagerDepsForTesting,
  ensureControlPlaneServer,
  getActiveControlPlaneServer,
  stopControlPlaneServer,
} from './manager.js'
import {
  clearPersistedControlPlaneRuntime,
  writePersistedControlPlaneRuntime,
} from './runtime.js'

afterEach(async () => {
  _setControlPlaneManagerDepsForTesting({
    sleep: async () => {},
    terminateProcess: () => {
      clearPersistedControlPlaneRuntime()
    },
  })
  await stopControlPlaneServer()
  clearPersistedControlPlaneRuntime()
  _setControlPlaneManagerDepsForTesting(null)
  delete process.env.CLAUDE_CONFIG_DIR
})

describe('control plane manager', () => {
  test('starts a singleton runtime and reuses persisted status', async () => {
    process.env.CLAUDE_CONFIG_DIR = mkdtempSync(
      join(tmpdir(), 'claude-control-plane-manager-'),
    )
    let spawnCount = 0
    let openedUrl: string | undefined

    _setControlPlaneManagerDepsForTesting({
      spawnDetached: () => {
        spawnCount += 1
        writePersistedControlPlaneRuntime({
          pid: process.pid,
          url: 'http://127.0.0.1:4319',
          startedAt: '2026-04-02T00:00:00.000Z',
        })
        return process.pid
      },
      openBrowser: async url => {
        openedUrl = url
        return true
      },
    })

    const server = await ensureControlPlaneServer({ openOnStart: true })
    const again = await ensureControlPlaneServer()

    expect(server.url).toBe(again.url)
    expect(getActiveControlPlaneServer()?.url).toBe(server.url)
    expect(spawnCount).toBe(1)
    expect(openedUrl).toBe(server.url)
  })

  test('terminates the persisted runtime on stop', async () => {
    process.env.CLAUDE_CONFIG_DIR = mkdtempSync(
      join(tmpdir(), 'claude-control-plane-manager-'),
    )
    let terminatedPid: number | undefined

    writePersistedControlPlaneRuntime({
      pid: process.pid,
      url: 'http://127.0.0.1:4319',
      startedAt: '2026-04-02T00:00:00.000Z',
    })

    _setControlPlaneManagerDepsForTesting({
      sleep: async () => {},
      terminateProcess: pid => {
        terminatedPid = pid
        clearPersistedControlPlaneRuntime()
      },
    })

    await stopControlPlaneServer()

    expect(terminatedPid).toBe(process.pid)
    expect(getActiveControlPlaneServer()).toBeNull()
  })
})
