import { isProviderId, type ProviderId } from './types.js'

export interface ProviderModelRef {
  readonly providerId: ProviderId
  readonly model: string
}

export function getProviderIdForModel(
  value: string | null | undefined,
): ProviderId {
  return parseProviderModelRef(value)?.providerId ?? 'anthropic'
}

export function parseProviderModelRef(
  value: string | null | undefined,
): ProviderModelRef | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed !== value) {
    return null
  }

  const separatorIndex = value.indexOf('/')
  if (separatorIndex <= 0 || separatorIndex !== value.lastIndexOf('/')) {
    return null
  }

  const providerId = value.slice(0, separatorIndex)
  const model = value.slice(separatorIndex + 1)

  if (!isProviderId(providerId) || model.length === 0) {
    return null
  }

  if (model.includes('/')) {
    return null
  }

  return {
    providerId,
    model,
  }
}
