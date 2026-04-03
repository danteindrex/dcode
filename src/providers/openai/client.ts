export type OpenAIClientConfig = {
  apiKey: string
  baseUrl: string
}

export function resolveOpenAIClientConfig(): OpenAIClientConfig {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for provider openai')
  }

  return {
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  }
}
