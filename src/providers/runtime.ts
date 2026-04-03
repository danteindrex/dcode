import {
  createProviderRegistry,
  type ProviderRegistry,
} from './registry.js'
import type { ProviderCallInput, ProviderDefinition } from './types.js'
import { createAnthropicProvider } from './anthropic/provider.js'
import { createGeminiProvider } from './gemini/provider.js'
import { createOpenAIProvider } from './openai/provider.js'
import { createOpenAICodexProvider } from './openai-codex/provider.js'
import { createOllamaProvider } from './ollama/provider.js'
import { parseProviderModelRef } from './models.js'

export interface ProviderRuntime {
  readonly registry: ProviderRegistry
  callModel(input: ProviderCallInput): ReturnType<ProviderDefinition['call']>
}

export function createProviderRuntime(
  providers: readonly ProviderDefinition[] = [],
): ProviderRuntime {
  const registry = createProviderRegistry(providers)

  return {
    registry,
    callModel(input) {
      const parsed = parseProviderModelRef(input.model)
      const providerId = parsed?.providerId ?? 'anthropic'
      const resolvedModel = parsed?.model ?? input.model
      const provider = registry.get(providerId)

      if (!provider) {
        throw new Error(`Unknown provider: ${providerId}`)
      }

      return provider.call({
        ...input,
        model: resolvedModel,
        options: input.options
          ? {
              ...input.options,
              model: resolvedModel,
            }
          : input.options,
      })
    },
  }
}

export const defaultProviderRuntime = createProviderRuntime([
  createAnthropicProvider(),
  createOpenAIProvider(),
  createOpenAICodexProvider(),
  createGeminiProvider(),
  createOllamaProvider(),
])
