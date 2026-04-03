import type { ProviderCallInput, ProviderDefinition } from '../types.js'
import { resolveOpenAIClientConfig } from './client.js'

type OpenAIQuery = (
  input: Record<string, unknown>,
  client: { apiKey: string; baseUrl: string },
) => Promise<unknown> | AsyncGenerator<unknown, void, void>

function defaultOpenAIQuery(
  input: Record<string, unknown>,
  client: { apiKey: string; baseUrl: string },
): AsyncGenerator<unknown, void, void> {
  return (async function* () {
    const { queryOpenAIResponses } = await import('./responses.js')
    yield* queryOpenAIResponses(input, {
      authorizationToken: client.apiKey,
      baseUrl: client.baseUrl,
    })
  })()
}

export function createOpenAIProvider(
  query: OpenAIQuery = defaultOpenAIQuery,
): ProviderDefinition {
  return {
    id: 'openai',
    call(input: ProviderCallInput) {
      const client = resolveOpenAIClientConfig()
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
