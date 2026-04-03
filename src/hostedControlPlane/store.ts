import { randomUUID } from 'crypto'
import type {
  HostedAgentSession,
  HostedAgentSessionInput,
  HostedCommandEvent,
  HostedProviderId,
  HostedQueuedCommand,
  HostedTelemetryBatch,
} from './types.js'

export type HostedControlPlaneStore = ReturnType<
  typeof createHostedControlPlaneStore
>

function normalizeProviders(providers: HostedProviderId[]): HostedProviderId[] {
  return [...providers]
}

function normalizeSession(
  input: HostedAgentSessionInput,
  now: () => string,
): HostedAgentSession {
  return {
    id: input.id ?? randomUUID(),
    ownerUserId: input.ownerUserId,
    machineId: input.machineId,
    connected: input.connected,
    lastSeenAt: input.lastSeenAt ?? now(),
    providers: normalizeProviders(input.providers),
  }
}

export function createHostedControlPlaneStore(options: {
  now?: () => Date
  initialSessions?: HostedAgentSession[]
} = {}) {
  const now = options.now ?? (() => new Date())
  const sessions = new Map<string, HostedAgentSession>()
  const telemetry = new Map<string, HostedTelemetryBatch[]>()
  const commands = new Map<string, HostedQueuedCommand>()
  const commandEvents = new Map<string, HostedCommandEvent[]>()

  for (const session of options.initialSessions ?? []) {
    sessions.set(session.id, { ...session, providers: [...session.providers] })
  }

  return {
    upsertSession(session: HostedAgentSession): HostedAgentSession {
      const stored = {
        ...session,
        providers: normalizeProviders(session.providers),
      }
      sessions.set(stored.id, stored)
      return stored
    },
    createSession(input: HostedAgentSessionInput): HostedAgentSession {
      const session = normalizeSession(input, () => now().toISOString())
      sessions.set(session.id, session)
      return session
    },
    getSession(id: string): HostedAgentSession | undefined {
      const session = sessions.get(id)
      return session ? { ...session, providers: [...session.providers] } : undefined
    },
    listSessions(ownerUserId?: string): HostedAgentSession[] {
      return [...sessions.values()]
        .filter(session => !ownerUserId || session.ownerUserId === ownerUserId)
        .map(session => ({ ...session, providers: [...session.providers] }))
        .sort((a, b) => a.lastSeenAt.localeCompare(b.lastSeenAt) || a.id.localeCompare(b.id))
    },
    enqueueCommand(input: {
      sessionId: string
      ownerUserId: string
      text: string
    }): HostedQueuedCommand {
      const command: HostedQueuedCommand = {
        id: randomUUID(),
        sessionId: input.sessionId,
        ownerUserId: input.ownerUserId,
        text: input.text,
        status: 'queued',
        createdAt: now().toISOString(),
        source: 'web',
      }
      commands.set(command.id, command)
      return { ...command }
    },
    getCommand(id: string): HostedQueuedCommand | undefined {
      const command = commands.get(id)
      return command ? { ...command } : undefined
    },
    listQueuedCommands(sessionId: string): HostedQueuedCommand[] {
      return [...commands.values()]
        .filter(command => command.sessionId === sessionId)
        .map(command => ({ ...command }))
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        )
    },
    claimQueuedCommands(
      sessionId: string,
      limit: number = 10,
    ): HostedQueuedCommand[] {
      const claimed: HostedQueuedCommand[] = []
      const claimedAt = now().toISOString()
      for (const command of commands.values()) {
        if (command.sessionId !== sessionId || command.status !== 'queued') {
          continue
        }
        command.status = 'claimed'
        command.claimedAt = claimedAt
        claimed.push({ ...command })
        if (claimed.length >= limit) {
          break
        }
      }
      return claimed
    },
    markCommandRunning(id: string): HostedQueuedCommand | undefined {
      const command = commands.get(id)
      if (!command) {
        return undefined
      }
      command.status = 'running'
      command.claimedAt ??= now().toISOString()
      return { ...command }
    },
    completeCommand(id: string): HostedQueuedCommand | undefined {
      const command = commands.get(id)
      if (!command) {
        return undefined
      }
      command.status = 'completed'
      command.completedAt = now().toISOString()
      return { ...command }
    },
    failCommand(id: string): HostedQueuedCommand | undefined {
      const command = commands.get(id)
      if (!command) {
        return undefined
      }
      command.status = 'failed'
      command.completedAt = now().toISOString()
      return { ...command }
    },
    appendCommandEvent(input: Omit<HostedCommandEvent, 'id' | 'createdAt'>): HostedCommandEvent {
      const event: HostedCommandEvent = {
        ...input,
        id: randomUUID(),
        createdAt: now().toISOString(),
      }
      const events = commandEvents.get(input.commandId) ?? []
      events.push(event)
      commandEvents.set(input.commandId, events)
      return {
        ...event,
        payload: { ...event.payload },
      } as HostedCommandEvent
    },
    getCommandEvents(commandId: string): HostedCommandEvent[] {
      return (commandEvents.get(commandId) ?? []).map(event => ({
        ...event,
        payload: { ...event.payload },
      })) as HostedCommandEvent[]
    },
    addTelemetry(batch: HostedTelemetryBatch): HostedTelemetryBatch {
      const existing = telemetry.get(batch.sessionId) ?? []
      existing.push({
        ...batch,
        events: [...batch.events],
      })
      telemetry.set(batch.sessionId, existing)
      return batch
    },
    getTelemetry(sessionId?: string): HostedTelemetryBatch[] {
      if (sessionId) {
        return (telemetry.get(sessionId) ?? []).map(batch => ({
          ...batch,
          events: [...batch.events],
        }))
      }

      return [...telemetry.values()]
        .flat()
        .map(batch => ({
          ...batch,
          events: [...batch.events],
        }))
        .sort(
          (a, b) =>
            a.receivedAt.localeCompare(b.receivedAt) ||
            a.sessionId.localeCompare(b.sessionId),
        )
    },
  }
}
