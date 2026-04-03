import { getWebAppOrigin } from '../services/backend/targets.js'

export const PRODUCT_URL = 'https://claude.com/claude-code'
export const PRODUCT_NAME = 'Claude Code'
export const PRODUCT_DESCRIPTION = 'Agentic coding tool'

// Claude Code Remote session URLs
export const CLAUDE_AI_BASE_URL = 'https://claude.ai'
export const CLAUDE_AI_STAGING_BASE_URL = 'https://claude-ai.staging.ant.dev'
export const CLAUDE_AI_LOCAL_BASE_URL = 'http://localhost:4000'

export function getClaudeAiOrigin(): string {
  return getWebAppOrigin()
}

export function getWebAppRemoteControlUrl(): string {
  return `${getWebAppOrigin()}/code`
}

export function getPrivacySettingsUrl(): string {
  return `${getWebAppOrigin()}/settings/data-privacy-controls`
}

export function getBillingSettingsUrl(): string {
  return `${getWebAppOrigin()}/settings/billing`
}

export function getUsageSettingsUrl(isAdmin = false): string {
  return `${getWebAppOrigin()}${
    isAdmin ? '/admin-settings/usage' : '/settings/usage'
  }`
}

export function getMaxUpgradeUrl(): string {
  return `${getWebAppOrigin()}/upgrade/max`
}

export function getDesktopDownloadPageUrl(): string {
  return `${getWebAppOrigin()}/download`
}

export function getChromeExtensionUrl(): string {
  return `${getWebAppOrigin()}/chrome`
}

export function getChromePermissionsUrl(): string {
  return `${getWebAppOrigin()}/chrome/permissions`
}

export function getChromeReconnectUrl(): string {
  return `${getWebAppOrigin()}/chrome/reconnect`
}

export function getChromeFocusTabUrl(tabId: string): string {
  return `${getWebAppOrigin()}/chrome/tab/${tabId}`
}

export function getConsoleApiKeysUrl(): string {
  return `${getWebAppOrigin()}/settings/keys`
}

export function getWebAppHostLabel(): string {
  return new URL(getWebAppOrigin()).host
}

export function getWebAppAuthLabel(): string {
  return `${getWebAppHostLabel()} authentication`
}

export function getWebAppProxyLabel(): string {
  return `${getWebAppHostLabel()} proxy`
}

/**
 * Determine if we're in a staging environment for remote sessions.
 * Checks session ID format and ingress URL.
 */
export function isRemoteSessionStaging(
  sessionId?: string,
  ingressUrl?: string,
): boolean {
  return (
    sessionId?.includes('_staging_') === true ||
    ingressUrl?.includes('staging') === true
  )
}

/**
 * Determine if we're in a local-dev environment for remote sessions.
 * Checks session ID format (e.g. `session_local_...`) and ingress URL.
 */
export function isRemoteSessionLocal(
  sessionId?: string,
  ingressUrl?: string,
): boolean {
  return (
    sessionId?.includes('_local_') === true ||
    ingressUrl?.includes('localhost') === true
  )
}

/**
 * Get the base URL for Claude AI based on environment.
 */
export function getClaudeAiBaseUrl(
  sessionId?: string,
  ingressUrl?: string,
): string {
  if (isRemoteSessionLocal(sessionId, ingressUrl)) {
    return CLAUDE_AI_LOCAL_BASE_URL
  }
  if (isRemoteSessionStaging(sessionId, ingressUrl)) {
    return CLAUDE_AI_STAGING_BASE_URL
  }
  return getClaudeAiOrigin()
}

/**
 * Get the full session URL for a remote session.
 *
 * The cse_→session_ translation is a temporary shim gated by
 * tengu_bridge_repl_v2_cse_shim_enabled (see isCseShimEnabled). Worker
 * endpoints (/v1/code/sessions/{id}/worker/*) want `cse_*` but the claude.ai
 * frontend currently routes on `session_*` (compat/convert.go:27 validates
 * TagSession). Same UUID body, different tag prefix. Once the server tags by
 * environment_kind and the frontend accepts `cse_*` directly, flip the gate
 * off. No-op for IDs already in `session_*` form. See toCompatSessionId in
 * src/bridge/sessionIdCompat.ts for the canonical helper (lazy-required here
 * to keep constants/ leaf-of-DAG at module-load time).
 */
export function getRemoteSessionUrl(
  sessionId: string,
  ingressUrl?: string,
): string {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { toCompatSessionId } =
    require('../bridge/sessionIdCompat.js') as typeof import('../bridge/sessionIdCompat.js')
  /* eslint-enable @typescript-eslint/no-require-imports */
  const compatId = toCompatSessionId(sessionId)
  const baseUrl = getClaudeAiBaseUrl(compatId, ingressUrl)
  return `${baseUrl}/code/${compatId}`
}
