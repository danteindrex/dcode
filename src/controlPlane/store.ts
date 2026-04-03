import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getBackendTargets } from '../services/backend/targets.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

export type ControlPlaneTelemetryBatch = {
  receivedAt: string
  events: unknown[]
}

export type ControlPlaneCommand = {
  id: string
  text: string
  source: 'web'
  status: 'queued' | 'claimed' | 'completed'
  createdAt: string
  claimedAt?: string
  completedAt?: string
}

export type ControlPlaneSnapshot = {
  backendTargets: ReturnType<typeof getBackendTargets>
  auth: {
    anthropic: boolean
    openai: boolean
    openaiCodex: boolean
    gemini: boolean
    ollama: boolean
  }
  telemetry: {
    count: number
    lastReceivedAt?: string
  }
  commands: {
    queued: number
    claimed: number
    completed: number
  }
}

type PersistedTelemetryState = {
  batches: ControlPlaneTelemetryBatch[]
}

function getControlPlaneDir(): string {
  return join(getClaudeConfigHomeDir(), 'control-plane')
}

function getTelemetryFilePath(): string {
  return join(getControlPlaneDir(), 'telemetry.json')
}

async function loadPersistedTelemetry(): Promise<PersistedTelemetryState> {
  try {
    const raw = await readFile(getTelemetryFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as PersistedTelemetryState
    if (!parsed || !Array.isArray(parsed.batches)) {
      return { batches: [] }
    }
    return parsed
  } catch {
    return { batches: [] }
  }
}

async function savePersistedTelemetry(
  state: PersistedTelemetryState,
): Promise<void> {
  await mkdir(getControlPlaneDir(), { recursive: true })
  await writeFile(getTelemetryFilePath(), JSON.stringify(state, null, 2), 'utf8')
}

export class ControlPlaneStore {
  private telemetryBatches: ControlPlaneTelemetryBatch[] = []
  private commands = new Map<string, ControlPlaneCommand>()
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    const persisted = await loadPersistedTelemetry()
    this.telemetryBatches = persisted.batches
    this.initialized = true
  }

  getSnapshot(): ControlPlaneSnapshot {
    const commands = [...this.commands.values()]
    return {
      backendTargets: getBackendTargets(),
      auth: {
        anthropic: Boolean(
          process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN,
        ),
        openai: Boolean(process.env.OPENAI_API_KEY),
        openaiCodex: Boolean(
          process.env.OPENAI_CODEX_ACCESS_TOKEN ||
            process.env.OPENAI_ACCESS_TOKEN,
        ),
        gemini: Boolean(process.env.GEMINI_API_KEY),
        ollama: true,
      },
      telemetry: {
        count: this.telemetryBatches.reduce(
          (sum, batch) => sum + batch.events.length,
          0,
        ),
        lastReceivedAt: this.telemetryBatches.at(-1)?.receivedAt,
      },
      commands: {
        queued: commands.filter(command => command.status === 'queued').length,
        claimed: commands.filter(command => command.status === 'claimed').length,
        completed: commands.filter(command => command.status === 'completed')
          .length,
      },
    }
  }

  getRecentTelemetry(limit: number = 10): ControlPlaneTelemetryBatch[] {
    return this.telemetryBatches.slice(-limit)
  }

  async ingestTelemetry(events: unknown[]): Promise<{ accepted: number }> {
    const batch: ControlPlaneTelemetryBatch = {
      receivedAt: new Date().toISOString(),
      events,
    }
    this.telemetryBatches.push(batch)
    this.telemetryBatches = this.telemetryBatches.slice(-50)
    await savePersistedTelemetry({ batches: this.telemetryBatches })
    return { accepted: events.length }
  }

  enqueueCommand(text: string): ControlPlaneCommand {
    const command: ControlPlaneCommand = {
      id: crypto.randomUUID(),
      text,
      source: 'web',
      status: 'queued',
      createdAt: new Date().toISOString(),
    }
    this.commands.set(command.id, command)
    return command
  }

  claimQueuedCommands(limit: number = 10): ControlPlaneCommand[] {
    const now = new Date().toISOString()
    const claimed: ControlPlaneCommand[] = []
    for (const command of this.commands.values()) {
      if (command.status !== 'queued') {
        continue
      }
      command.status = 'claimed'
      command.claimedAt = now
      claimed.push(command)
      if (claimed.length >= limit) {
        break
      }
    }
    return claimed
  }

  completeCommand(id: string): ControlPlaneCommand | null {
    const command = this.commands.get(id)
    if (!command) {
      return null
    }
    command.status = 'completed'
    command.completedAt = new Date().toISOString()
    return command
  }

  listCommands(): ControlPlaneCommand[] {
    return [...this.commands.values()].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )
  }
}
