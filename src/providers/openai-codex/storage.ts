import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export type OpenAICodexStoredOAuth = {
  accessToken: string
  refreshToken?: string
  expiresAt: string
  baseUrl: string
  email?: string
  accountId?: string
}

type SecureStorageShape = {
  openAICodexOauth?: OpenAICodexStoredOAuth
  [key: string]: unknown
}

type StorageBackend = {
  read(): SecureStorageShape | null
  update(data: SecureStorageShape): { success: boolean; warning?: string }
}

let testBackendOverride: StorageBackend | undefined

function getStoragePath(): string {
  return join(homedir(), '.claude', '.openai-codex-oauth.json')
}

function createFileBackend(): StorageBackend {
  return {
    read() {
      const path = getStoragePath()
      if (!existsSync(path)) {
        return {}
      }

      try {
        return JSON.parse(readFileSync(path, 'utf8')) as SecureStorageShape
      } catch {
        return {}
      }
    },
    update(data: SecureStorageShape) {
      const path = getStoragePath()
      mkdirSync(join(homedir(), '.claude'), { recursive: true })
      writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
      return { success: true }
    },
  }
}

function getBackend(): StorageBackend {
  if (testBackendOverride) {
    return testBackendOverride
  }
  return createFileBackend()
}

export function setOpenAICodexStorageBackendForTesting(
  backend: StorageBackend | undefined,
): void {
  testBackendOverride = backend
}

export function getStoredOpenAICodexOAuth(
  backend: StorageBackend = getBackend(),
): OpenAICodexStoredOAuth | undefined {
  const data = backend.read() || {}
  return data.openAICodexOauth
}

export function saveStoredOpenAICodexOAuth(
  value: OpenAICodexStoredOAuth,
  backend: StorageBackend = getBackend(),
): { success: boolean; warning?: string } {
  const data = backend.read() || {}
  return backend.update({
    ...data,
    openAICodexOauth: value,
  })
}

export function clearStoredOpenAICodexOAuth(
  backend: StorageBackend = getBackend(),
): { success: boolean; warning?: string } {
  const data = backend.read() || {}
  const next = { ...data }
  delete next.openAICodexOauth
  return backend.update(next)
}

export function hasStoredOpenAICodexOAuth(): boolean {
  return !!getStoredOpenAICodexOAuth()?.accessToken
}
