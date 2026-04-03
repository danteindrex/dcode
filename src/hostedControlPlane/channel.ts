export type HostedChannelRegistration = {
  machineId: string
}

export function createHostedChannelRegistry() {
  const sessions = new Map<string, HostedChannelRegistration>()

  return {
    register(sessionId: string, payload: HostedChannelRegistration) {
      sessions.set(sessionId, payload)
    },
    unregister(sessionId: string) {
      sessions.delete(sessionId)
    },
    get(sessionId: string) {
      return sessions.get(sessionId)
    },
    list() {
      return [...sessions.entries()].map(([sessionId, payload]) => ({
        sessionId,
        ...payload,
      }))
    },
  }
}

export const hostedChannelRegistry = createHostedChannelRegistry()
