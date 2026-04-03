import { useCallback, useEffect, useState } from 'react'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import { useMainLoopModel } from '../hooks/useMainLoopModel.js'
import { getProviderIdForModel } from '../providers/models.js'
import { resolveOpenAICodexAuth } from '../providers/openai-codex/auth.js'
import { hasStoredOpenAICodexOAuth } from '../providers/openai-codex/storage.js'
import { verifyApiKey } from '../services/api/claude.js'
import {
  getAnthropicApiKeyWithSource,
  getApiKeyFromApiKeyHelper,
  isAnthropicAuthEnabled,
  isClaudeAISubscriber,
} from '../utils/auth.js'

export type VerificationStatus =
  | 'loading'
  | 'valid'
  | 'invalid'
  | 'missing'
  | 'error'

export type ApiKeyVerificationResult = {
  status: VerificationStatus
  reverify: () => Promise<void>
  error: Error | null
  message: string | null
}

function getInitialStatusForProvider(
  providerId: ReturnType<typeof getProviderIdForModel>,
): VerificationStatus {
  switch (providerId) {
    case 'openai-codex':
      return hasStoredOpenAICodexOAuth() || !!process.env.OPENAI_CODEX_ACCESS_TOKEN
        ? 'loading'
        : 'missing'
    case 'openai':
      return process.env.OPENAI_API_KEY ? 'valid' : 'missing'
    case 'gemini':
      return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
        ? 'valid'
        : 'missing'
    case 'ollama':
      return 'valid'
    default: {
      if (!isAnthropicAuthEnabled() || isClaudeAISubscriber()) {
        return 'valid'
      }
      const { key, source } = getAnthropicApiKeyWithSource({
        skipRetrievingKeyFromApiKeyHelper: true,
      })
      if (key || source === 'apiKeyHelper') {
        return 'loading'
      }
      return 'missing'
    }
  }
}

function getStatusMessage(
  providerId: ReturnType<typeof getProviderIdForModel>,
  status: VerificationStatus,
): string | null {
  if (!['missing', 'invalid', 'error'].includes(status)) {
    return null
  }

  switch (providerId) {
    case 'openai-codex':
      return 'OpenAI Codex login required · Run /login openai-codex'
    case 'openai':
      return 'OpenAI API key missing · Set OPENAI_API_KEY'
    case 'gemini':
      return 'Gemini API key missing · Set GEMINI_API_KEY or GOOGLE_API_KEY'
    case 'ollama':
      return 'Ollama unavailable · Start Ollama and select an installed model'
    default:
      return 'Anthropic authentication missing · Run /login anthropic'
  }
}

export function useApiKeyVerification(): ApiKeyVerificationResult {
  const mainLoopModel = useMainLoopModel()
  const providerId = getProviderIdForModel(mainLoopModel)
  const [status, setStatus] = useState<VerificationStatus>(() =>
    getInitialStatusForProvider(providerId),
  )
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setError(null)
    setStatus(getInitialStatusForProvider(providerId))
  }, [providerId])

  const verify = useCallback(async (): Promise<void> => {
    setError(null)

    if (providerId === 'openai-codex') {
      try {
        await resolveOpenAICodexAuth()
        setStatus('valid')
      } catch (error) {
        setError(error as Error)
        setStatus('missing')
      }
      return
    }

    if (providerId === 'openai') {
      setStatus(process.env.OPENAI_API_KEY ? 'valid' : 'missing')
      return
    }

    if (providerId === 'gemini') {
      setStatus(
        process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
          ? 'valid'
          : 'missing',
      )
      return
    }

    if (providerId === 'ollama') {
      setStatus('valid')
      return
    }

    if (!isAnthropicAuthEnabled() || isClaudeAISubscriber()) {
      setStatus('valid')
      return
    }

    await getApiKeyFromApiKeyHelper(getIsNonInteractiveSession())
    const { key: apiKey, source } = getAnthropicApiKeyWithSource()
    if (!apiKey) {
      if (source === 'apiKeyHelper') {
        setStatus('error')
        setError(new Error('API key helper did not return a valid key'))
        return
      }
      setStatus('missing')
      return
    }

    try {
      const isValid = await verifyApiKey(apiKey, false)
      setStatus(isValid ? 'valid' : 'invalid')
    } catch (error) {
      setError(error as Error)
      setStatus('error')
    }
  }, [providerId])

  return {
    status,
    reverify: verify,
    error,
    message: getStatusMessage(providerId, status),
  }
}
