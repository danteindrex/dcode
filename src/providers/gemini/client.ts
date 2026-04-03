export type GeminiClientConfig = {
  apiKey: string
  baseUrl: string
}

export function resolveGeminiClientConfig(): GeminiClientConfig {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY or GOOGLE_API_KEY is required for provider gemini',
    )
  }

  return {
    apiKey,
    baseUrl:
      process.env.GEMINI_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta',
  }
}
