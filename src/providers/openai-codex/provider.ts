import type { ProviderCallInput, ProviderDefinition } from '../types.js'
import { resolveOpenAICodexAuth } from './auth.js'

type OpenAICodexQuery = (
  input: Record<string, unknown>,
  auth: { accessToken: string; refreshToken?: string; baseUrl: string },
) => Promise<unknown> | AsyncGenerator<unknown, void, void>

function isAsyncGenerator(
  value: Promise<unknown> | AsyncGenerator<unknown, void, void>,
): value is AsyncGenerator<unknown, void, void> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value
  )
}

function defaultOpenAICodexQuery(
  input: Record<string, unknown>,
  auth: { accessToken: string; refreshToken?: string; baseUrl: string },
): AsyncGenerator<unknown, void, void> {
  return (async function* () {
    const { queryOpenAICodexResponses } = await import('./responses.js')
    yield* queryOpenAICodexResponses(input, auth)
  })()
}

export function createOpenAICodexProvider(
  query: OpenAICodexQuery = defaultOpenAICodexQuery,
): ProviderDefinition {
  return {
    id: 'openai-codex',
    call(input: ProviderCallInput) {
      return (async function* () {
        const auth = await resolveOpenAICodexAuth()
        const result = query(
          {
            model: input.model,
            messages: input.messages ?? [],
            systemPrompt: input.systemPrompt ?? [],
            tools: input.tools ?? [],
            thinkingConfig: input.thinkingConfig,
            signal: input.signal,
            options: input.options,
          },
          auth,
        )

        if (isAsyncGenerator(result)) {
          yield* result
          return
        }

        yield await result
      })()
    },
  }
}
