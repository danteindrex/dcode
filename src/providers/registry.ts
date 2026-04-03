import {
  isProviderId,
  type ProviderDefinition,
  type ProviderId,
} from './types.js'

export interface ProviderRegistry {
  list(): readonly ProviderDefinition[]
  get(id: ProviderId): ProviderDefinition | undefined
}

export function createProviderRegistry(
  providers: readonly ProviderDefinition[] = [],
): ProviderRegistry {
  const registry = new Map<ProviderId, ProviderDefinition>()

  for (const provider of providers) {
    if (!isProviderId(provider.id)) {
      throw new Error(`Unknown provider id: ${provider.id}`)
    }
    if (registry.has(provider.id)) {
      throw new Error(`Duplicate provider id: ${provider.id}`)
    }
    registry.set(provider.id, provider)
  }

  return {
    list(): readonly ProviderDefinition[] {
      return [...registry.values()]
    },
    get(id: ProviderId): ProviderDefinition | undefined {
      return registry.get(id)
    },
  }
}

export const builtInProviderRegistry = createProviderRegistry()
