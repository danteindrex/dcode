export const PROVIDER_IDS = [
  'anthropic',
  'openai',
  'openai-codex',
  'gemini',
  'ollama',
] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value)
}

export interface ProviderCallInput {
  readonly model: string
  readonly signal?: AbortSignal
  readonly messages?: readonly unknown[]
  readonly systemPrompt?: unknown
  readonly tools?: unknown
  readonly thinkingConfig?: unknown
  readonly options?: Record<string, unknown>
}

export type ProviderCallResult =
  | Promise<unknown>
  | AsyncGenerator<unknown, void, void>

export interface ProviderDefinition<
  TInput extends ProviderCallInput = ProviderCallInput,
> {
  readonly id: ProviderId
  readonly call: (input: TInput) => ProviderCallResult
}
