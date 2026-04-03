import type { ProviderId } from './types.js'

export interface NormalizedProviderEvent {
  readonly providerId: ProviderId
  readonly type: string
  readonly data: unknown
}
