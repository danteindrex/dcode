import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  clearPersistedControlPlaneRuntime,
  readActiveControlPlaneRuntime,
  writePersistedControlPlaneRuntime,
} from './runtime.js'

let configDir: string | undefined

afterEach(() => {
  clearPersistedControlPlaneRuntime()
  if (configDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = configDir
  }
})

describe('control plane runtime', () => {
  test('returns persisted runtime for a live process', () => {
    configDir = mkdtempSync(join(tmpdir(), 'claude-control-plane-runtime-'))
    process.env.CLAUDE_CONFIG_DIR = configDir

    writePersistedControlPlaneRuntime({
      pid: process.pid,
      url: 'http://127.0.0.1:4319',
      startedAt: '2026-04-02T00:00:00.000Z',
    })

    expect(readActiveControlPlaneRuntime()).toEqual({
      pid: process.pid,
      url: 'http://127.0.0.1:4319',
      startedAt: '2026-04-02T00:00:00.000Z',
    })
  })

  test('cleans up stale runtime state', () => {
    configDir = mkdtempSync(join(tmpdir(), 'claude-control-plane-runtime-'))
    process.env.CLAUDE_CONFIG_DIR = configDir

    writePersistedControlPlaneRuntime({
      pid: 999999,
      url: 'http://127.0.0.1:4319',
      startedAt: '2026-04-02T00:00:00.000Z',
    })

    expect(readActiveControlPlaneRuntime()).toBeNull()
  })
})
