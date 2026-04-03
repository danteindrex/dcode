import { buildOpenAIResponsesRequest } from '../openai/responses.js'
import { ProviderStreamAccumulator } from '../streaming.js'

type ProviderLikeInput = Record<string, unknown>

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value === null || value === undefined) {
    return ''
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return asRecord(parsed) ?? {}
    } catch {
      return {}
    }
  }

  return asRecord(value) ?? {}
}

export function toOllamaMessages(inputItems: unknown): unknown[] {
  const messages: unknown[] = []

  for (const item of asArray(inputItems)) {
    const record = asRecord(item)
    if (!record) {
      continue
    }

    if (
      record.type === 'message' &&
      typeof record.role === 'string' &&
      typeof record.content === 'string'
    ) {
      messages.push({
        role: record.role === 'developer' ? 'system' : record.role,
        content: record.content,
      })
      continue
    }

    if (
      record.type === 'function_call_output' &&
      typeof record.call_id === 'string'
    ) {
      messages.push({
        role: 'tool',
        content: toText(record.output),
      })
      continue
    }

    if (
      record.type === 'function_call' &&
      typeof record.name === 'string'
    ) {
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: record.name,
              arguments: parseArguments(record.arguments),
            },
          },
        ],
      })
    }
  }

  return messages
}

function toOllamaTools(tools: unknown): unknown[] {
  return asArray(tools).flatMap(tool => {
    const record = asRecord(tool)
    if (!record || record.type !== 'function') {
      return []
    }

    return [
      {
        type: 'function',
        function: {
          name: record.name,
          description: record.description,
          parameters: record.parameters,
        },
      },
    ]
  })
}

function thinkingMode(thinkingConfig: unknown): boolean | string | undefined {
  const record = asRecord(thinkingConfig)
  if (!record || record.type === 'disabled') {
    return undefined
  }

  const budget = record.budget_tokens
  if (typeof budget === 'number' && budget > 0) {
    return 'high'
  }

  return true
}

export async function buildOllamaChatRequest(
  input: ProviderLikeInput,
): Promise<Record<string, unknown>> {
  const request = await buildOpenAIResponsesRequest(input)
  return {
    model: String(input.model),
    messages: toOllamaMessages(request.input),
    ...(Array.isArray(request.tools) && request.tools.length > 0
      ? { tools: toOllamaTools(request.tools) }
      : {}),
    ...(thinkingMode(input.thinkingConfig) !== undefined
      ? { think: thinkingMode(input.thinkingConfig) }
      : {}),
    stream: false,
  }
}

function createUsage(response: Record<string, unknown>): Record<string, unknown> {
  return {
    input_tokens:
      typeof response.prompt_eval_count === 'number'
        ? response.prompt_eval_count
        : 0,
    output_tokens:
      typeof response.eval_count === 'number' ? response.eval_count : 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
    service_tier: null,
    cache_creation: {
      ephemeral_1h_input_tokens: 0,
      ephemeral_5m_input_tokens: 0,
    },
    inference_geo: null,
    iterations: null,
    speed: null,
  }
}

export function parseOllamaChatResponse(response: Record<string, unknown>): {
  content: Record<string, unknown>[]
  model?: string
  usage: Record<string, unknown>
} {
  const message = asRecord(response.message)
  const content: Record<string, unknown>[] = []

  if (typeof message?.content === 'string' && message.content.trim()) {
    content.push({
      type: 'text',
      text: message.content,
    })
  }

  for (const toolCall of asArray(message?.tool_calls)) {
    const fn = asRecord(asRecord(toolCall)?.function)
    if (!fn || typeof fn.name !== 'string') {
      continue
    }

    content.push({
      type: 'tool_use',
      id: `ollama_${fn.name}_${content.length}`,
      name: fn.name,
      input: parseArguments(fn.arguments),
    })
  }

  return {
    content,
    model: typeof response.model === 'string' ? response.model : undefined,
    usage: createUsage(response),
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

async function* readJsonLines(
  response: Response,
): AsyncGenerator<Record<string, unknown>, void, void> {
  if (!response.body) {
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')

      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)

        if (line) {
          try {
            yield JSON.parse(line) as Record<string, unknown>
          } catch {}
        }

        newline = buffer.indexOf('\n')
      }
    }

    const tail = buffer.trim()
    if (tail) {
      try {
        yield JSON.parse(tail) as Record<string, unknown>
      } catch {}
    }
  } finally {
    try {
      await reader.cancel()
    } catch {}
    try {
      reader.releaseLock()
    } catch {}
  }
}

export async function* queryOllamaChat(
  input: ProviderLikeInput,
  client: { baseUrl: string },
): AsyncGenerator<unknown, void, void> {
  const { createAssistantAPIErrorMessage, createAssistantMessage } =
    await import('../../utils/messages.js')

  try {
    const request = await buildOllamaChatRequest(input)
    const response = await fetch(`${normalizeBaseUrl(client.baseUrl)}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...request,
        stream: true,
      }),
      signal: input.signal as AbortSignal | undefined,
    })

    if (!response.ok) {
      const payload = (await response.json()) as Record<string, unknown>
      const assistant = createAssistantAPIErrorMessage({
        content:
          typeof payload.error === 'string'
            ? payload.error
            : `Ollama request failed with status ${response.status}`,
      })
      assistant.message.model = String(input.model)
      yield assistant
      return
    }

    const accumulator = new ProviderStreamAccumulator()
    const startedAt = Date.now()
    let firstChunkMs: number | undefined
    let latestPayload: Record<string, unknown> | null = null

    for await (const payload of readJsonLines(response)) {
      latestPayload = payload
      if (firstChunkMs === undefined) {
        firstChunkMs = Date.now() - startedAt
      }

      const message = asRecord(payload.message)
      if (typeof message?.content === 'string' && message.content) {
        yield* accumulator.addTextDelta('text:0', message.content, firstChunkMs)
      }

      for (const [index, toolCall] of asArray(message?.tool_calls).entries()) {
        const fn = asRecord(asRecord(toolCall)?.function)
        if (!fn || typeof fn.name !== 'string') {
          continue
        }

        yield* accumulator.ensureToolUse(
          `tool:${index}`,
          {
            id: `ollama_${fn.name}_${index}`,
            name: fn.name,
            input: parseArguments(fn.arguments),
          },
          firstChunkMs,
        )
      }
    }

    yield* accumulator.finish()
    const parsed = {
      content: accumulator.buildContent(),
      model:
        (latestPayload && typeof latestPayload.model === 'string'
          ? latestPayload.model
          : String(input.model)) ?? String(input.model),
      usage: latestPayload ? createUsage(latestPayload) : createUsage({}),
    }
    const assistant = createAssistantMessage({
      content: parsed.content.length > 0 ? parsed.content : '',
      usage: parsed.usage as never,
    })
    assistant.message.model = parsed.model ?? String(input.model)
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
          : 'Ollama request failed unexpectedly',
    })
    assistant.message.model = String(input.model)
    yield assistant
  }
}
