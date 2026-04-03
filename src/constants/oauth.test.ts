import { afterEach, describe, expect, test } from 'bun:test'

import {
  getOauthConfig,
  getProdOauthApiBaseUrl,
  getProdOauthClaudeAiOrigin,
  getProdOauthConsoleOrigin,
  getProdOauthMcpProxyUrl,
  getStagingOauthApiBaseUrl,
  getStagingOauthClaudeAiOrigin,
  getStagingOauthConsoleOrigin,
  getStagingOauthMcpProxyUrl,
  fileSuffixForOauthConfig,
} from './oauth.js'

const ORIGINALS = {
  USER_TYPE: process.env.USER_TYPE,
  USE_LOCAL_OAUTH: process.env.USE_LOCAL_OAUTH,
  USE_STAGING_OAUTH: process.env.USE_STAGING_OAUTH,
  CLAUDE_CODE_CUSTOM_OAUTH_URL: process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL,
  CLAUDE_CODE_OAUTH_CLIENT_ID: process.env.CLAUDE_CODE_OAUTH_CLIENT_ID,
}

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINALS)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe('oauth helpers', () => {
  test('exposes the prod and staging origins used by runtime config', () => {
    expect(getProdOauthApiBaseUrl()).toBe('https://api.anthropic.com')
    expect(getProdOauthConsoleOrigin()).toBe('https://platform.claude.com')
    expect(getProdOauthClaudeAiOrigin()).toBe('https://claude.ai')
    expect(getProdOauthMcpProxyUrl()).toBe(
      'https://mcp-proxy.anthropic.com',
    )
    expect(getStagingOauthApiBaseUrl()).toBe(
      'https://api-staging.anthropic.com',
    )
    expect(getStagingOauthConsoleOrigin()).toBe(
      'https://platform.staging.ant.dev',
    )
    expect(getStagingOauthClaudeAiOrigin()).toBe(
      'https://claude-ai.staging.ant.dev',
    )
    expect(getStagingOauthMcpProxyUrl()).toBe(
      'https://mcp-proxy-staging.anthropic.com',
    )
  })

  test('keeps the production oauth config stable by default', () => {
    const config = getOauthConfig()

    expect(config).toMatchObject({
      BASE_API_URL: 'https://api.anthropic.com',
      CONSOLE_AUTHORIZE_URL: 'https://platform.claude.com/oauth/authorize',
      CLAUDE_AI_AUTHORIZE_URL: 'https://claude.com/cai/oauth/authorize',
      CLAUDE_AI_ORIGIN: 'https://claude.ai',
      TOKEN_URL: 'https://platform.claude.com/v1/oauth/token',
      API_KEY_URL:
        'https://api.anthropic.com/api/oauth/claude_cli/create_api_key',
      ROLES_URL: 'https://api.anthropic.com/api/oauth/claude_cli/roles',
      OAUTH_FILE_SUFFIX: '',
      MCP_PROXY_URL: 'https://mcp-proxy.anthropic.com',
      MCP_PROXY_PATH: '/v1/mcp/{server_id}',
    })
  })

  test('supports a custom oauth base url without changing the rest of the shape', () => {
    process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL = 'https://claude.fedstart.com/'

    expect(fileSuffixForOauthConfig()).toBe('-custom-oauth')
    expect(getOauthConfig()).toMatchObject({
      BASE_API_URL: 'https://claude.fedstart.com',
      CONSOLE_AUTHORIZE_URL: 'https://claude.fedstart.com/oauth/authorize',
      CLAUDE_AI_AUTHORIZE_URL: 'https://claude.fedstart.com/oauth/authorize',
      CLAUDE_AI_ORIGIN: 'https://claude.fedstart.com',
      TOKEN_URL: 'https://claude.fedstart.com/v1/oauth/token',
      API_KEY_URL:
        'https://claude.fedstart.com/api/oauth/claude_cli/create_api_key',
      ROLES_URL: 'https://claude.fedstart.com/api/oauth/claude_cli/roles',
      CONSOLE_SUCCESS_URL:
        'https://claude.fedstart.com/oauth/code/success?app=claude-code',
      CLAUDEAI_SUCCESS_URL:
        'https://claude.fedstart.com/oauth/code/success?app=claude-code',
      MANUAL_REDIRECT_URL:
        'https://claude.fedstart.com/oauth/code/callback',
      OAUTH_FILE_SUFFIX: '-custom-oauth',
    })
  })
})
