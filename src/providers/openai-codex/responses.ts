import {
  buildOpenAIResponsesRequest,
  parseOpenAIResponsesOutput,
  streamOpenAIResponsesEvents,
} from '../openai/responses.js'

type ProviderLikeInput = Record<string, unknown>

type CodexAuth = {
  baseUrl: string
  accessToken: string
  accountId?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  if (normalized.endsWith('/codex/responses')) return normalized
  if (normalized.endsWith('/codex')) return `${normalized}/responses`
  return `${normalized}/codex/responses`
}

function extractAccountIdFromJwt(token: string): string | undefined {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return undefined
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>
    const auth = asRecord(payload['https://api.openai.com/auth'])
    const flatAccountId = payload['https://api.openai.com/auth.chatgpt_account_id']
    const accountId =
      typeof flatAccountId === 'string' && flatAccountId.trim()
        ? flatAccountId
        : auth?.chatgpt_account_id
    return typeof accountId === 'string' && accountId.trim()
      ? accountId
      : undefined
  } catch {
    return undefined
  }
}

function buildCodexHeaders(auth: CodexAuth): Headers {
  const accountId = auth.accountId ?? extractAccountIdFromJwt(auth.accessToken)
  if (!accountId) {
    throw new Error('Failed to extract accountId from token')
  }

  const headers = new Headers()
  headers.set('Authorization', `Bearer ${auth.accessToken}`)
  headers.set('chatgpt-account-id', accountId)
  headers.set('originator', 'pi')
  headers.set('User-Agent', 'pi (windows test)')
  headers.set('OpenAI-Beta', 'responses=experimental')
  headers.set('accept', 'text/event-stream')
  headers.set('content-type', 'application/json')
  return headers
}

export async function* queryOpenAICodexResponses(
  input: ProviderLikeInput,
  auth: CodexAuth,
): AsyncGenerator<unknown, void, void> {
  const { createAssistantAPIErrorMessage, createAssistantMessage } =
    await import('../../utils/messages.js')

  try {
    const request = await buildOpenAIResponsesRequest(input)
    const response = await fetch(normalizeBaseUrl(auth.baseUrl), {
      method: 'POST',
      headers: buildCodexHeaders(auth),
      body: JSON.stringify({
        ...request,
        store: false,
        stream: true,
        text: { verbosity: 'medium' },
        include: ['reasoning.encrypted_content'],
      }),
      signal: input.signal as AbortSignal | undefined,
    })

    const requestId = response.headers.get('x-request-id') ?? undefined

    if (!response.ok) {
      const payloadText = await response.text()
      const payload = (() => {
        try {
          return JSON.parse(payloadText) as Record<string, unknown>
        } catch {
          return null
        }
      })()
      const message =
        asRecord(payload?.detail)?.message ??
        payload?.detail ??
        asRecord(payload?.error)?.message ??
        `OpenAI Codex request failed with status ${response.status}`
      const assistant = createAssistantAPIErrorMessage({
        content: typeof message === 'string' ? message : JSON.stringify(message),
      })
      assistant.message.model = String(input.model)
      assistant.requestId = requestId
      yield assistant
      return
    }

    const completed = yield* streamOpenAIResponsesEvents(response)
    if (!completed) {
      const assistant = createAssistantAPIErrorMessage({
        content: 'OpenAI Codex request completed without a response payload',
      })
      assistant.message.model = String(input.model)
      assistant.requestId = requestId
      yield assistant
      return
    }

    const parsed = parseOpenAIResponsesOutput(completed)
    const assistant = createAssistantMessage({
      content: parsed.content.length > 0 ? parsed.content : '',
      usage: parsed.usage as never,
    })
    assistant.message.model = parsed.model ?? String(input.model)
    assistant.requestId = requestId
    yield assistant
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      throw error
    }

    const assistant = createAssistantAPIErrorMessage({
      content:
        error instanceof Error
          ? error.message
          : 'OpenAI Codex request failed unexpectedly',
    })
    assistant.message.model = String(input.model)
    yield assistant
  }
}
