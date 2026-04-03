import { randomUUID } from 'crypto'
import type { Tool } from '../../Tool.js'
import { ProviderStreamAccumulator } from '../streaming.js'

export type OpenAIResponsesAuth = {
  baseUrl: string
  authorizationToken: string
}

type ProviderLikeInput = Record<string, unknown>

type OpenAIResponsesRequest = {
  model: string
  input: unknown[]
  instructions?: string
  tools?: unknown[]
  tool_choice?: 'auto'
  parallel_tool_calls?: boolean
}

type OpenAIContentBlock = {
  type: string
  [key: string]: unknown
}

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

function collectText(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value] : []
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => collectText(item))
  }

  const record = asRecord(value)
  if (!record) {
    return []
  }

  if (record.type === 'text' && typeof record.text === 'string') {
    return record.text.trim() ? [record.text] : []
  }

  if (typeof record.text === 'string' && record.text.trim()) {
    return [record.text]
  }

  if ('content' in record) {
    return collectText(record.content)
  }

  return []
}

function serializeToolOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(value)
    return asRecord(parsed) ?? {}
  } catch {
    return {}
  }
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value }
}

function makeSchemaNullable(schema: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(schema.type)) {
    return schema.type.includes('null')
      ? schema
      : { ...schema, type: [...schema.type, 'null'] }
  }

  if (typeof schema.type === 'string') {
    return schema.type === 'null'
      ? schema
      : { ...schema, type: [schema.type, 'null'] }
  }

  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : []
  if (anyOf.some(option => asRecord(option)?.type === 'null')) {
    return schema
  }

  return {
    ...schema,
    anyOf: [...anyOf, { type: 'null' }],
  }
}

function normalizeToolParametersSchema(schema: unknown): Record<string, unknown> {
  const record = asRecord(schema)
  if (!record) {
    return {}
  }

  const normalized = cloneRecord(record)

  if (Array.isArray(record.anyOf)) {
    normalized.anyOf = record.anyOf.map(option =>
      normalizeToolParametersSchema(option),
    )
  }

  if (Array.isArray(record.oneOf)) {
    normalized.oneOf = record.oneOf.map(option =>
      normalizeToolParametersSchema(option),
    )
  }

  if (Array.isArray(record.allOf)) {
    normalized.allOf = record.allOf.map(option =>
      normalizeToolParametersSchema(option),
    )
  }

  if (record.items) {
    normalized.items = Array.isArray(record.items)
      ? record.items.map(item => normalizeToolParametersSchema(item))
      : normalizeToolParametersSchema(record.items)
  }

  if (record.type === 'object' && asRecord(record.properties)) {
    const properties = record.properties as Record<string, unknown>
    const normalizedProperties: Record<string, unknown> = {}
    const originallyRequired = new Set(
      Array.isArray(record.required)
        ? record.required.filter((value): value is string => typeof value === 'string')
        : [],
    )

    for (const [key, value] of Object.entries(properties)) {
      const propertySchema = normalizeToolParametersSchema(value)
      normalizedProperties[key] = originallyRequired.has(key)
        ? propertySchema
        : makeSchemaNullable(propertySchema)
    }

    normalized.properties = normalizedProperties
    normalized.required = Object.keys(normalizedProperties)
  }

  return normalized
}

function flushMessage(
  items: unknown[],
  role: 'assistant' | 'developer' | 'user',
  parts: string[],
): void {
  const text = parts.join('\n\n').trim()
  if (!text) {
    return
  }

  items.push({
    type: 'message',
    role,
    content: text,
  })
  parts.length = 0
}

function buildInputItems(messages: unknown): unknown[] {
  const items: unknown[] = []

  for (const message of asArray(messages)) {
    const record = asRecord(message)
    if (!record) {
      continue
    }

    const kind = record.type
    const payload = asRecord(record.message)
    const content = payload?.content

    if (kind === 'user') {
      if (typeof content === 'string') {
        const text = content.trim()
        if (text) {
          items.push({ type: 'message', role: 'user', content: text })
        }
        continue
      }

      const textParts: string[] = []
      for (const block of asArray(content)) {
        const blockRecord = asRecord(block)
        if (
          blockRecord?.type === 'tool_result' &&
          typeof blockRecord.tool_use_id === 'string'
        ) {
          flushMessage(items, 'user', textParts)
          items.push({
            type: 'function_call_output',
            call_id: blockRecord.tool_use_id,
            output: serializeToolOutput(blockRecord.content),
          })
          continue
        }

        textParts.push(...collectText(block))
      }
      flushMessage(items, 'user', textParts)
      continue
    }

    if (kind === 'assistant') {
      const textParts: string[] = []
      for (const block of asArray(content)) {
        const blockRecord = asRecord(block)
        if (
          blockRecord?.type === 'tool_use' &&
          typeof blockRecord.name === 'string' &&
          typeof blockRecord.id === 'string'
        ) {
          flushMessage(items, 'assistant', textParts)
          items.push({
            type: 'function_call',
            call_id: blockRecord.id,
            name: blockRecord.name,
            arguments: JSON.stringify(blockRecord.input ?? {}),
          })
          continue
        }

        textParts.push(...collectText(block))
      }
      flushMessage(items, 'assistant', textParts)
      continue
    }

    if (kind === 'system') {
      const text = collectText(content)
      flushMessage(items, 'developer', text)
    }
  }

  return items
}

async function buildToolDefinitions(input: ProviderLikeInput): Promise<unknown[]> {
  const tools = asArray<Tool>(input.tools)
  if (tools.length === 0) {
    return []
  }
  let zodToJsonSchema:
    | ((schema: Tool['inputSchema']) => Record<string, unknown>)
    | undefined

  const options = asRecord(input.options)
  const getToolPermissionContext =
    typeof options?.getToolPermissionContext === 'function'
      ? (options.getToolPermissionContext as () => Promise<unknown>)
      : async () => ({ mode: 'default' })

  const agents = Array.isArray(options?.agents) ? options.agents : []
  const allowedAgentTypes = Array.isArray(options?.allowedAgentTypes)
    ? (options.allowedAgentTypes as string[])
    : undefined
  const model = typeof input.model === 'string' ? input.model : undefined

  const result: unknown[] = []
  for (const tool of tools) {
    if (!tool.inputJSONSchema && !zodToJsonSchema) {
      ;({ zodToJsonSchema } = await import('../../utils/zodToJsonSchema.js'))
    }

    const parameters = normalizeToolParametersSchema(
      tool.inputJSONSchema ?? zodToJsonSchema!(tool.inputSchema),
    )
    result.push({
      type: 'function',
      name: tool.name,
      description: await tool.prompt({
        getToolPermissionContext: async () => {
          const context = await getToolPermissionContext()
          return context as never
        },
        tools,
        agents,
        allowedAgentTypes,
      }),
      parameters,
      ...(tool.strict === true && model ? { strict: true } : {}),
    })
  }

  return result
}

function buildInstructions(systemPrompt: unknown): string | undefined {
  const text = collectText(systemPrompt).join('\n\n').trim()
  return text || undefined
}

export async function buildOpenAIResponsesRequest(
  input: ProviderLikeInput,
): Promise<OpenAIResponsesRequest> {
  const request: OpenAIResponsesRequest = {
    model: String(input.model),
    input: buildInputItems(input.messages),
    instructions: buildInstructions(input.systemPrompt),
  }

  const tools = await buildToolDefinitions(input)
  if (tools.length > 0) {
    request.tools = tools
    request.tool_choice = 'auto'
    request.parallel_tool_calls = true
  }

  return request
}

function createUsage(response: Record<string, unknown>): Record<string, unknown> | undefined {
  const usage = asRecord(response.usage)
  if (!usage) {
    return undefined
  }

  return {
    input_tokens:
      typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
    output_tokens:
      typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
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

export function parseOpenAIResponsesOutput(response: Record<string, unknown>): {
  content: OpenAIContentBlock[]
  model?: string
  usage?: Record<string, unknown>
} {
  const content: OpenAIContentBlock[] = []

  for (const item of asArray(response.output)) {
    const record = asRecord(item)
    if (!record) {
      continue
    }

    if (record.type === 'function_call') {
      content.push({
        type: 'tool_use',
        id:
          typeof record.call_id === 'string'
            ? record.call_id
            : String(record.id ?? randomUUID()),
        name: String(record.name ?? ''),
        input: parseJsonObject(record.arguments),
      })
      continue
    }

    if (record.type === 'message' && record.role === 'assistant') {
      for (const block of asArray(record.content)) {
        const blockRecord = asRecord(block)
        if (!blockRecord) {
          continue
        }

        if (
          (blockRecord.type === 'output_text' || blockRecord.type === 'text') &&
          typeof blockRecord.text === 'string'
        ) {
          content.push({
            type: 'text',
            text: blockRecord.text,
          })
        }
      }
    }
  }

  if (
    content.length === 0 &&
    typeof response.output_text === 'string' &&
    response.output_text.trim()
  ) {
    content.push({
      type: 'text',
      text: response.output_text,
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

async function* readJsonSseEvents(
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

        if (data && data !== '[DONE]') {
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

function extractOpenAIStreamTextDelta(event: Record<string, unknown>): string {
  const delta = asRecord(event.delta)
  if (typeof delta?.text === 'string') {
    return delta.text
  }

  if (typeof event.delta === 'string') {
    return event.delta
  }

  if (typeof event.text === 'string') {
    return event.text
  }

  return ''
}

function extractOpenAIFunctionCallDescriptor(
  event: Record<string, unknown>,
): { key: string; id: string; name: string; argumentsDelta: string } | null {
  const item = asRecord(event.item)
  const delta = asRecord(event.delta)
  const itemId =
    typeof event.item_id === 'string'
      ? event.item_id
      : typeof item?.id === 'string'
        ? item.id
        : undefined
  const callId =
    typeof event.call_id === 'string'
      ? event.call_id
      : typeof item?.call_id === 'string'
        ? item.call_id
        : itemId
  const name =
    typeof event.name === 'string'
      ? event.name
      : typeof item?.name === 'string'
        ? item.name
        : typeof delta?.name === 'string'
          ? delta.name
          : undefined
  const argumentsDelta =
    typeof event.arguments === 'string'
      ? event.arguments
      : typeof event.delta === 'string'
        ? event.delta
        : typeof delta?.arguments === 'string'
          ? delta.arguments
          : typeof delta?.partial_json === 'string'
            ? delta.partial_json
            : ''

  if (!callId || !name) {
    return null
  }

  return {
    key: itemId ?? callId,
    id: callId,
    name,
    argumentsDelta,
  }
}

export async function* streamOpenAIResponsesEvents(
  response: Response,
): AsyncGenerator<unknown, Record<string, unknown> | null, void> {
  const accumulator = new ProviderStreamAccumulator()
  const startedAt = Date.now()
  let firstEventAt: number | undefined
  let completed: Record<string, unknown> | null = null

  for await (const event of readJsonSseEvents(response)) {
    if (firstEventAt === undefined) {
      firstEventAt = Date.now() - startedAt
    }

    switch (event.type) {
      case 'response.output_text.delta': {
        yield* accumulator.addTextDelta(
          `${event.output_index ?? 0}:${event.content_index ?? 0}`,
          extractOpenAIStreamTextDelta(event),
          firstEventAt,
        )
        break
      }
      case 'response.content_part.added': {
        const part = asRecord(event.part)
        if (
          (part?.type === 'output_text' || part?.type === 'text') &&
          typeof part.text === 'string'
        ) {
          yield* accumulator.addTextDelta(
            `${event.output_index ?? 0}:${event.content_index ?? 0}`,
            part.text,
            firstEventAt,
          )
        }
        break
      }
      case 'response.output_item.added':
      case 'response.output_item.done':
      case 'response.function_call_arguments.delta':
      case 'response.function_call_arguments.done': {
        const descriptor = extractOpenAIFunctionCallDescriptor(event)
        if (descriptor) {
          yield* accumulator.addToolJsonDelta(
            descriptor.key,
            { id: descriptor.id, name: descriptor.name },
            descriptor.argumentsDelta,
            firstEventAt,
          )
        }
        break
      }
      case 'response.completed': {
        completed = asRecord(event.response)
        break
      }
      default:
        break
    }
  }

  yield* accumulator.finish()
  return completed
}

export async function* queryOpenAIResponses(
  input: ProviderLikeInput,
  auth: OpenAIResponsesAuth,
): AsyncGenerator<unknown, void, void> {
  const { createAssistantAPIErrorMessage, createAssistantMessage } =
    await import('../../utils/messages.js')

  try {
    const request = await buildOpenAIResponsesRequest(input)
    const response = await fetch(`${normalizeBaseUrl(auth.baseUrl)}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.authorizationToken}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        ...request,
        stream: true,
      }),
      signal: input.signal as AbortSignal | undefined,
    })

    const requestId = response.headers.get('x-request-id') ?? undefined
    if (!response.ok) {
      const payload = (await response.json()) as Record<string, unknown>
      const message =
        asRecord(payload.error)?.message ??
        `OpenAI request failed with status ${response.status}`
      const assistant = createAssistantAPIErrorMessage({
        content: toText(message),
      })
      assistant.message.model = String(input.model)
      assistant.requestId = requestId
      yield assistant
      return
    }

    const completed = yield* streamOpenAIResponsesEvents(response)
    const parsed = completed
      ? parseOpenAIResponsesOutput(completed)
      : {
          content: [],
          model: undefined,
          usage: undefined,
        }
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
          : 'OpenAI request failed unexpectedly',
    })
    assistant.message.model = String(input.model)
    yield assistant
  }
}
