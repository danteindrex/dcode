export type HostedCommandEventInput = {
  kind: string
  payload: Record<string, unknown>
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

export async function reportHostedCommandEvent(
  baseUrl: string,
  commandId: string,
  event: HostedCommandEventInput,
): Promise<void> {
  await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/cli/commands/${commandId}/events`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  )
}

export async function completeHostedCommand(
  baseUrl: string,
  commandId: string,
): Promise<void> {
  await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/cli/commands/${commandId}/complete`,
    {
      method: 'POST',
    },
  )
}
