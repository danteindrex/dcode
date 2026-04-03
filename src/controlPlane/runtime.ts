import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { isProcessRunning } from '../utils/genericProcessUtils.js'

export type ControlPlaneRuntime = {
  pid: number
  url: string
  startedAt: string
}

function getControlPlaneDir(): string {
  return join(getClaudeConfigHomeDir(), 'control-plane')
}

export function getControlPlaneRuntimeFilePath(): string {
  return join(getControlPlaneDir(), 'runtime.json')
}

export function writePersistedControlPlaneRuntime(
  runtime: ControlPlaneRuntime,
): void {
  mkdirSync(getControlPlaneDir(), { recursive: true })
  writeFileSync(
    getControlPlaneRuntimeFilePath(),
    JSON.stringify(runtime, null, 2),
    'utf8',
  )
}

export function clearPersistedControlPlaneRuntime(): void {
  try {
    unlinkSync(getControlPlaneRuntimeFilePath())
  } catch {
    // Ignore missing or already-removed runtime state.
  }
}

export function clearPersistedControlPlaneRuntimeIfOwned(pid: number): void {
  const runtime = readPersistedControlPlaneRuntime()
  if (!runtime || runtime.pid !== pid) {
    return
  }
  clearPersistedControlPlaneRuntime()
}

function readPersistedControlPlaneRuntime():
  | ControlPlaneRuntime
  | null {
  try {
    const raw = readFileSync(getControlPlaneRuntimeFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ControlPlaneRuntime>
    if (
      typeof parsed.pid !== 'number' ||
      !Number.isFinite(parsed.pid) ||
      typeof parsed.url !== 'string' ||
      !parsed.url ||
      typeof parsed.startedAt !== 'string' ||
      !parsed.startedAt
    ) {
      return null
    }
    return {
      pid: parsed.pid,
      url: parsed.url,
      startedAt: parsed.startedAt,
    }
  } catch {
    return null
  }
}

export function readActiveControlPlaneRuntime():
  | ControlPlaneRuntime
  | null {
  const runtime = readPersistedControlPlaneRuntime()
  if (!runtime) {
    return null
  }
  if (!isProcessRunning(runtime.pid)) {
    clearPersistedControlPlaneRuntime()
    return null
  }
  return runtime
}
