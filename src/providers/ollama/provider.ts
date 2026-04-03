import type { ProviderCallInput, ProviderDefinition } from '../types.js'
import { resolveOllamaClientConfig } from './client.js'

type OllamaQuery = (
  input: Record<string, unknown>,
  client: { baseUrl: string },
) => Promise<unknown> | AsyncGenerator<unknown, void, void>

function defaultOllamaQuery(
  input: Record<string, unknown>,
  client: { baseUrl: string },
): AsyncGenerator<unknown, void, void> {
  return (async function* () {
    const { queryOllamaChat } = await import('./chat.js')
    yield* queryOllamaChat(input, client)
  })()
}

export function createOllamaProvider(
  query: OllamaQuery = defaultOllamaQuery,
): ProviderDefinition {
  return {
    id: 'ollama',
    call(input: ProviderCallInput) {
      const client = resolveOllamaClientConfig()
      return query(
        {
          model: input.model,
          messages: input.messages ?? [],
          systemPrompt: input.systemPrompt ?? [],
          tools: input.tools ?? [],
          thinkingConfig: input.thinkingConfig,
          signal: input.signal,
          options: input.options,
        },
        client,
      )
    },
  }
}
