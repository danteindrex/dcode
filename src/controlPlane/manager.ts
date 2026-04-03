import { spawn } from 'child_process'
import { isInBundledMode } from '../utils/bundledMode.js'
import { openBrowser } from '../utils/browser.js'
import {
  clearPersistedControlPlaneRuntime,
  readActiveControlPlaneRuntime,
  type ControlPlaneRuntime,
} from './runtime.js'

const CONTROL_PLANE_HOST = '127.0.0.1'
const CONTROL_PLANE_START_TIMEOUT_MS = 5_000
const CONTROL_PLANE_POLL_INTERVAL_MS = 50

type ControlPlaneManagerDeps = {
  openBrowser: (url: string) => Promise<boolean>
  sleep: (ms: number) => Promise<void>
  spawnDetached: () => number | undefined
  terminateProcess: (pid: number) => void
}

function getSpawnScriptArgs(): string[] {
  if (isInBundledMode() || !process.argv[1]) {
    return []
  }
  return [process.argv[1]]
}

const defaultDeps: ControlPlaneManagerDeps = {
  openBrowser,
  sleep: async (ms: number) =>
    await new Promise(resolve => setTimeout(resolve, ms)),
  spawnDetached: () => {
    const child = spawn(
      process.execPath,
      [
        ...getSpawnScriptArgs(),
        'webapp-control-server',
        '--host',
        CONTROL_PLANE_HOST,
        '--port',
        '0',
      ],
      {
        detached: true,
        env: process.env,
        stdio: 'ignore',
      },
    )
    child.unref()
    return child.pid
  },
  terminateProcess: (pid: number) => {
    process.kill(pid)
  },
}

let deps: ControlPlaneManagerDeps = defaultDeps

async function waitForRuntime(): Promise<ControlPlaneRuntime> {
  const deadline = Date.now() + CONTROL_PLANE_START_TIMEOUT_MS
  while (Date.now() < deadline) {
    const runtime = readActiveControlPlaneRuntime()
    if (runtime) {
      return runtime
    }
    await deps.sleep(CONTROL_PLANE_POLL_INTERVAL_MS)
  }
  throw new Error('Timed out waiting for local control-plane web app to start')
}

async function waitForStop(pid: number): Promise<void> {
  const deadline = Date.now() + CONTROL_PLANE_START_TIMEOUT_MS
  while (Date.now() < deadline) {
    const runtime = readActiveControlPlaneRuntime()
    if (!runtime || runtime.pid !== pid) {
      return
    }
    await deps.sleep(CONTROL_PLANE_POLL_INTERVAL_MS)
  }
  clearPersistedControlPlaneRuntime()
}

export async function ensureControlPlaneServer(options: {
  openOnStart?: boolean
} = {}): Promise<ControlPlaneRuntime> {
  const activeRuntime = readActiveControlPlaneRuntime()
  if (activeRuntime) {
    if (options.openOnStart) {
      await deps.openBrowser(activeRuntime.url)
    }
    return activeRuntime
  }

  const pid = deps.spawnDetached()
  if (!pid) {
    throw new Error('Failed to start local control-plane web app')
  }

  const runtime = await waitForRuntime()
  if (options.openOnStart) {
    await deps.openBrowser(runtime.url)
  }
  return runtime
}

export function getActiveControlPlaneServer():
  | ControlPlaneRuntime
  | null {
  return readActiveControlPlaneRuntime()
}

export async function stopControlPlaneServer(): Promise<boolean> {
  const runtime = readActiveControlPlaneRuntime()
  if (!runtime) {
    return false
  }

  deps.terminateProcess(runtime.pid)
  await waitForStop(runtime.pid)
  return true
}

export function _setControlPlaneManagerDepsForTesting(
  overrides: Partial<ControlPlaneManagerDeps> | null,
): void {
  deps = overrides ? { ...defaultDeps, ...overrides } : defaultDeps
}
