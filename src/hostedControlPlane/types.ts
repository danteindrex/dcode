export type HostedProviderId =
  | 'anthropic'
  | 'openai'
  | 'openai-codex'
  | 'gemini'
  | 'ollama'

export type HostedAgentSession = {
  id: string
  ownerUserId: string
  machineId: string
  connected: boolean
  lastSeenAt: string
  providers: HostedProviderId[]
}

export type HostedAgentSessionInput = {
  id?: string
  ownerUserId: string
  machineId: string
  connected: boolean
  lastSeenAt?: string
  providers: HostedProviderId[]
}

export type HostedQueuedCommand = {
  id: string
  sessionId: string
  ownerUserId: string
  text: string
  status: 'queued' | 'claimed' | 'running' | 'completed' | 'failed'
  createdAt: string
  claimedAt?: string
  completedAt?: string
  source: 'web'
}

export type HostedCommandEvent =
  | {
      id: string
      commandId: string
      sessionId: string
      createdAt: string
      kind: 'assistant_text'
      payload: { text: string }
    }
  | {
      id: string
      commandId: string
      sessionId: string
      createdAt: string
      kind: 'tool_use'
      payload: { name: string; input: Record<string, unknown> }
    }
  | {
      id: string
      commandId: string
      sessionId: string
      createdAt: string
      kind: 'status'
      payload: { status: HostedQueuedCommand['status'] }
    }

export type HostedTelemetryBatch = {
  sessionId: string
  receivedAt: string
  events: unknown[]
}

export type HostedBrowserAuthSession = {
  id: string
  userId: string
  token: string
  createdAt: string
  expiresAt: string
}

export type HostedControlPlaneHealthResponse = {
  ok: true
}

export type HostedControlPlaneSessionsResponse = {
  sessions: HostedAgentSession[]
}

export type HostedControlPlaneSessionResponse = {
  session: HostedAgentSession
}

export type HostedControlPlaneCommandResponse = {
  command: HostedQueuedCommand
}

export type HostedControlPlaneCommandDetailResponse = {
  command: HostedQueuedCommand
  events: HostedCommandEvent[]
}

export type HostedControlPlaneCommandsResponse = {
  commands: HostedQueuedCommand[]
}

export type HostedControlPlaneErrorResponse = {
  ok: false
  error: string
}
