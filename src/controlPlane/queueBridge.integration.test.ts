import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ControlPlaneStore } from './store.js'
import { drainStoreControlPlaneCommands } from './queueBridge.js'

let originalConfigDir: string | undefined

beforeEach(() => {
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = mkdtempSync(
    join(tmpdir(), 'claude-control-plane-queue-'),
  )
})

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
})

describe('control-plane queue bridge integration', () => {
  test('drains queued web commands into the repl submit path', async () => {
    const store = new ControlPlaneStore()
    await store.initialize()
    store.enqueueCommand('Run this from the web app')

    const submitted: string[] = []
    const count = drainStoreControlPlaneCommands(
      store,
      text => {
        submitted.push(text)
        return true
      },
      () => {},
    )

    expect(count).toBe(1)
    expect(submitted).toEqual(['Run this from the web app'])
    expect(store.listCommands()[0]?.status).toBe('completed')
  })
})
