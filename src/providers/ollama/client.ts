export type OllamaClientConfig = {
  baseUrl: string
}

export function resolveOllamaClientConfig(): OllamaClientConfig {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  }
}
