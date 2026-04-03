import type { ProviderCallInput, ProviderDefinition } from '../types.js'
import { resolveGeminiClientConfig } from './client.js'

type GeminiQuery = (
  input: Record<string, unknown>,
  client: { apiKey: string; baseUrl: string },
) => Promise<unknown> | AsyncGenerator<unknown, void, void>

function defaultGeminiQuery(
  input: Record<string, unknown>,
  client: { apiKey: string; baseUrl: string },
): AsyncGenerator<unknown, void, void> {
  return (async function* () {
    const { queryGeminiGenerateContent } = await import('./generateContent.js')
    yield* queryGeminiGenerateContent(input, client)
  })()
}

export function createGeminiProvider(
  query: GeminiQuery = defaultGeminiQuery,
): ProviderDefinition {
  return {
    id: 'gemini',
    call(input: ProviderCallInput) {
      const client = resolveGeminiClientConfig()
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
