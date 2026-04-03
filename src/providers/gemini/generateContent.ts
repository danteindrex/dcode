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

function toGeminiPart(item: Record<string, unknown>): Record<string, unknown>[] {
  if (
    item.type === 'function_call' &&
    typeof item.name === 'string'
  ) {
    return [
      {
        functionCall: {
          name: item.name,
          args: parseArguments(item.arguments),
        },
      },
    ]
  }

  if (
    item.type === 'function_call_output' &&
    typeof item.call_id === 'string'
  ) {
    return [
      {
        functionResponse: {
          name: item.call_id,
          response: {
            result: toText(item.output),
          },
        },
      },
    ]
  }

  if (
    item.type === 'message' &&
    typeof item.content === 'string' &&
    item.content.trim()
  ) {
    return [{ text: item.content }]
  }

  return []
}

export function toGeminiContents(inputItems: unknown): unknown[] {
  const contents: unknown[] = []

  for (const item of asArray(inputItems)) {
    const record = asRecord(item)
    if (!record) {
      continue
    }

    const parts = toGeminiPart(record)
    if (parts.length === 0) {
      continue
    }

    if (record.type === 'message') {
      contents.push({
        role: record.role === 'assistant' ? 'model' : 'user',
        parts,
      })
      continue
    }

    if (record.type === 'function_call') {
      contents.push({
        role: 'model',
        parts,
      })
      continue
    }

    if (record.type === 'function_call_output') {
      contents.push({
        role: 'tool',
        parts,
      })
    }
  }

  return contents
}

function toGeminiTools(tools: unknown): unknown[] {
  const functionDeclarations = asArray(tools).flatMap(tool => {
    const record = asRecord(tool)
    if (!record || record.type !== 'function') {
      return []
    }

    return [
      {
        name: record.name,
        description: record.description,
        parameters: record.parameters,
      },
    ]
  })

  return functionDeclarations.length > 0
    ? [{ functionDeclarations }]
    : []
}

export async function buildGeminiGenerateContentRequest(
  input: ProviderLikeInput,
): Promise<Record<string, unknown>> {
  const request = await buildOpenAIResponsesRequest(input)
  return {
    contents: toGeminiContents(request.input),
    ...(typeof request.instructions === 'string'
      ? {
          systemInstruction: {
            parts: [{ text: request.instructions }],
          },
        }
      : {}),
    ...(Array.isArray(request.tools) && request.tools.length > 0
      ? { tools: toGeminiTools(request.tools) }
      : {}),
  }
}

function createUsage(response: Record<string, unknown>): Record<string, unknown> {
  const usageMetadata = asRecord(response.usageMetadata)

  return {
    input_tokens:
      typeof usageMetadata?.promptTokenCount === 'number'
        ? usageMetadata.promptTokenCount
        : 0,
    output_tokens:
      typeof usageMetadata?.candidatesTokenCount === 'number'
        ? usageMetadata.candidatesTokenCount
        : 0,
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

export function parseGeminiGenerateContentResponse(
  response: Record<string, unknown>,
): {
  content: Record<string, unknown>[]
  usage: Record<string, unknown>
} {
  const candidate = asRecord(asArray(response.candidates)[0])
  const contentRecord = asRecord(candidate?.content)
  const content: Record<string, unknown>[] = []

  for (const part of asArray(contentRecord?.parts)) {
    const record = asRecord(part)
    if (!record) {
      continue
    }

    if (typeof record.text === 'string' && record.text.trim()) {
      content.push({
        type: 'text',
        text: record.text,
      })
    }

    const functionCall = asRecord(record.functionCall)
    if (functionCall && typeof functionCall.name === 'string') {
      content.push({
        type: 'tool_use',
        id: `gemini_${functionCall.name}_${content.length}`,
        name: functionCall.name,
        input: asRecord(functionCall.args) ?? {},
      })
    }
  }

  return {
    content,
    usage: createUsage(response),
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

async function* readGeminiSseEvents(
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

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let separator = buffer.indexOf('\n\n')

      while (separator !== -1) {
        const chunk = buffer.slice(0, separator)
        buffer = buffer.slice(separator + 2)

        const data = chunk
          .split('\n')
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trim())
          .join('\n')
          .trim()

        if (data) {
          try {
            yield JSON.parse(data) as Record<string, unknown>
          } catch {}
        }

        separator = buffer.indexOf('\n\n')
      }
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

export async function* queryGeminiGenerateContent(
  input: ProviderLikeInput,
  client: { apiKey: string; baseUrl: string },
): AsyncGenerator<unknown, void, void> {
  const { createAssistantAPIErrorMessage, createAssistantMessage } =
    await import('../../utils/messages.js')

  try {
    const request = await buildGeminiGenerateContentRequest(input)
    const response = await fetch(
      `${normalizeBaseUrl(client.baseUrl)}/models/${encodeURIComponent(String(input.model))}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': client.apiKey,
        },
        body: JSON.stringify(request),
        signal: input.signal as AbortSignal | undefined,
      },
    )

    if (!response.ok) {
      const payload = (await response.json()) as Record<string, unknown>
      const assistant = createAssistantAPIErrorMessage({
        content:
          toText(asRecord(payload.error)?.message) ||
          `Gemini request failed with status ${response.status}`,
      })
      assistant.message.model = String(input.model)
      yield assistant
      return
    }

    const accumulator = new ProviderStreamAccumulator()
    const startedAt = Date.now()
    let latestPayload: Record<string, unknown> | null = null
    let firstChunkMs: number | undefined
    const emittedTextByIndex = new Map<number, string>()
    const emittedTools = new Set<string>()

    for await (const payload of readGeminiSseEvents(response)) {
      latestPayload = payload
      if (firstChunkMs === undefined) {
        firstChunkMs = Date.now() - startedAt
      }

      const parsed = parseGeminiGenerateContentResponse(payload)
      for (const [index, block] of parsed.content.entries()) {
        if (block.type === 'text' && typeof block.text === 'string') {
          const previousText = emittedTextByIndex.get(index) ?? ''
          const deltaText = block.text.startsWith(previousText)
            ? block.text.slice(previousText.length)
            : block.text
          emittedTextByIndex.set(index, previousText + deltaText)
          yield* accumulator.addTextDelta(
            `text:${index}`,
            deltaText,
            firstChunkMs,
          )
          continue
        }

        if (block.type === 'tool_use') {
          const toolKey = `tool:${index}:${String(block.id ?? '')}`
          if (emittedTools.has(toolKey)) {
            continue
          }
          emittedTools.add(toolKey)
          yield* accumulator.ensureToolUse(
            toolKey,
            {
              id: String(block.id ?? `gemini_tool_${index}`),
              name: String(block.name ?? ''),
              input: asRecord(block.input) ?? {},
            },
            firstChunkMs,
          )
        }
      }
    }

    yield* accumulator.finish()
    const parsed = {
      content: accumulator.buildContent(),
      usage: latestPayload ? createUsage(latestPayload) : createUsage({}),
    }
    const assistant = createAssistantMessage({
      content: parsed.content.length > 0 ? parsed.content : '',
      usage: parsed.usage as never,
    })
    assistant.message.model = String(input.model)
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
          : 'Gemini request failed unexpectedly',
    })
    assistant.message.model = String(input.model)
    yield assistant
  }
}
