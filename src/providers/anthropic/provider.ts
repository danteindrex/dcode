import type { ProviderCallInput, ProviderDefinition } from '../types.js'

export type AnthropicProviderCallInput = ProviderCallInput

type AnthropicQuery = (
  input: Record<string, unknown>,
) => Promise<unknown> | AsyncGenerator<unknown, void, void>

async function* defaultAnthropicQuery(input: Record<string, unknown>) {
  const { queryModelWithStreaming } = await import(
    '../../services/api/claude.js'
  )

  yield* queryModelWithStreaming(input as never)
}

export function createAnthropicProvider(
  query: AnthropicQuery = defaultAnthropicQuery,
): ProviderDefinition {
  return {
    id: 'anthropic',
    call(input: AnthropicProviderCallInput) {
      return query({
        messages: input.messages ?? [],
        systemPrompt: input.systemPrompt ?? [],
        thinkingConfig: input.thinkingConfig ?? { type: 'disabled' },
        tools: input.tools ?? [],
        signal: input.signal ?? new AbortController().signal,
        options:
          input.options ?? {
            model: input.model,
            querySource: 'provider',
            getToolPermissionContext: async () => ({
              mode: 'default',
              ask: undefined,
              additionalDirectories: [],
            }),
            isNonInteractiveSession: true,
            agents: [],
            hasAppendSystemPrompt: false,
            mcpTools: [],
          },
      })
    },
  }
}
