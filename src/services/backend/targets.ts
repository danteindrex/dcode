import { getOauthConfig } from '../../constants/oauth.js'
import { readActiveControlPlaneRuntime } from '../../controlPlane/runtime.js'

type BackendTargets = {
  apiBaseUrl: string
  webAppOrigin: string
  mcpProxyUrl: string
  mcpProxyPath: string
  telemetryBaseUrl: string
  growthbookBaseUrl: string
  sessionIngressUrl: string
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

export function getHostedControlPlaneUrl(): string | null {
  const hostedUrl =
    process.env.CLAUDE_CODE_WEB_APP_URL ||
    process.env.CLAUDE_CODE_APP_BACKEND_URL
  return hostedUrl ? normalizeUrl(hostedUrl) : null
}

export function getBackendTargets(): BackendTargets {
  const oauthConfig = getOauthConfig()
  const localControlPlaneUrl = readActiveControlPlaneRuntime()?.url
  const apiBaseUrl = normalizeUrl(
    process.env.CLAUDE_CODE_APP_BACKEND_URL ||
      localControlPlaneUrl ||
      oauthConfig.BASE_API_URL,
  )
  const webAppOrigin = normalizeUrl(
    process.env.CLAUDE_CODE_WEB_APP_URL ||
      localControlPlaneUrl ||
      oauthConfig.CLAUDE_AI_ORIGIN,
  )
  const mcpProxyUrl = normalizeUrl(
    process.env.CLAUDE_CODE_MCP_PROXY_URL || oauthConfig.MCP_PROXY_URL,
  )
  const telemetryBaseUrl = normalizeUrl(
    process.env.CLAUDE_CODE_TELEMETRY_BASE_URL ||
      localControlPlaneUrl ||
      apiBaseUrl,
  )
  const growthbookBaseUrl = normalizeUrl(
    process.env.CLAUDE_CODE_GROWTHBOOK_BASE_URL ||
      localControlPlaneUrl ||
      apiBaseUrl,
  )
  const sessionIngressUrl = normalizeUrl(
    process.env.CLAUDE_CODE_SESSION_INGRESS_URL ||
      localControlPlaneUrl ||
      apiBaseUrl,
  )

  return {
    apiBaseUrl,
    webAppOrigin,
    mcpProxyUrl,
    mcpProxyPath:
      process.env.CLAUDE_CODE_MCP_PROXY_PATH || oauthConfig.MCP_PROXY_PATH,
    telemetryBaseUrl,
    growthbookBaseUrl,
    sessionIngressUrl,
  }
}

export function getAppBackendBaseUrl(): string {
  return getBackendTargets().apiBaseUrl
}

export function getWebAppOrigin(): string {
  return getBackendTargets().webAppOrigin
}

export function getMcpProxyBaseUrl(): string {
  return getBackendTargets().mcpProxyUrl
}

export function getMcpProxyPath(): string {
  return getBackendTargets().mcpProxyPath
}

export function getTelemetryBaseUrl(): string {
  return getBackendTargets().telemetryBaseUrl
}

export function getGrowthbookBaseUrl(): string {
  return getBackendTargets().growthbookBaseUrl
}

export function getSessionIngressBaseUrl(): string {
  return getBackendTargets().sessionIngressUrl
}
