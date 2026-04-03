import type { ControlPlaneCommand, ControlPlaneStore } from './store.js'

export function drainClaimedControlPlaneCommands(params: {
  commands: ControlPlaneCommand[]
  onSubmitMessage: (content: string) => boolean
  enqueuePrompt: (content: string) => void
  completeCommand: (id: string) => void
  autoComplete?: boolean
}): number {
  const autoComplete = params.autoComplete ?? true
  for (const command of params.commands) {
    const submitted = params.onSubmitMessage(command.text)
    if (!submitted) {
      params.enqueuePrompt(command.text)
    }
    if (autoComplete) {
      params.completeCommand(command.id)
    }
  }

  return params.commands.length
}

export function drainStoreControlPlaneCommands(
  store: ControlPlaneStore,
  onSubmitMessage: (content: string) => boolean,
  enqueuePrompt: (content: string) => void,
  limit: number = 10,
): number {
  return drainClaimedControlPlaneCommands({
    commands: store.claimQueuedCommands(limit),
    onSubmitMessage,
    enqueuePrompt,
    completeCommand: id => {
      store.completeCommand(id)
    },
    autoComplete: true,
  })
}

export async function drainRemoteControlPlaneCommands(
  baseUrl: string,
  onSubmitMessage: (content: string) => boolean,
  enqueuePrompt: (content: string) => void,
  limit: number = 10,
  options: {
    autoComplete?: boolean
  } = {},
): Promise<number> {
  const claimResponse = await fetch(`${baseUrl}/api/commands/claim`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ limit }),
  })

  if (!claimResponse.ok) {
    throw new Error(
      `Failed to claim control-plane commands: ${claimResponse.status}`,
    )
  }

  const payload = (await claimResponse.json()) as {
    commands?: ControlPlaneCommand[]
  }
  const commands = Array.isArray(payload.commands) ? payload.commands : []

  return drainClaimedControlPlaneCommands({
    commands,
    onSubmitMessage,
    enqueuePrompt,
    completeCommand: id => {
      void fetch(`${baseUrl}/api/commands/${id}/complete`, {
        method: 'POST',
      })
    },
    autoComplete: options.autoComplete ?? true,
  })
}
