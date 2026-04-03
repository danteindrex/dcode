import { afterEach, describe, expect, test } from 'bun:test'

import {
  getBillingSettingsUrl,
  getClaudeAiBaseUrl,
  getClaudeAiOrigin,
  getChromeExtensionUrl,
  getChromeFocusTabUrl,
  getChromePermissionsUrl,
  getChromeReconnectUrl,
  getConsoleApiKeysUrl,
  getDesktopDownloadPageUrl,
  getMaxUpgradeUrl,
  getPrivacySettingsUrl,
  getUsageSettingsUrl,
  getWebAppRemoteControlUrl,
} from './product.js'

const ORIGINAL_WEB_APP_URL = process.env.CLAUDE_CODE_WEB_APP_URL

afterEach(() => {
  if (ORIGINAL_WEB_APP_URL === undefined) {
    delete process.env.CLAUDE_CODE_WEB_APP_URL
  } else {
    process.env.CLAUDE_CODE_WEB_APP_URL = ORIGINAL_WEB_APP_URL
  }
})

describe('getClaudeAiBaseUrl', () => {
  test('uses the configured web app origin as the shared claude.ai origin', () => {
    process.env.CLAUDE_CODE_WEB_APP_URL = 'https://app.example.test/'

    expect(getClaudeAiOrigin()).toBe('https://app.example.test')
  })

  test('uses the configured web app origin for production-style sessions', () => {
    process.env.CLAUDE_CODE_WEB_APP_URL = 'https://app.example.test/'

    expect(getClaudeAiBaseUrl('session_prod_123')).toBe(
      'https://app.example.test',
    )
  })

  test('preserves local and staging routing behavior', () => {
    process.env.CLAUDE_CODE_WEB_APP_URL = 'https://app.example.test/'

    expect(getClaudeAiBaseUrl('session_local_123')).toBe('http://localhost:4000')
    expect(getClaudeAiBaseUrl('session_staging_123')).toBe(
      'https://claude-ai.staging.ant.dev',
    )
  })

  test('derives web app urls from the configured origin', () => {
    process.env.CLAUDE_CODE_WEB_APP_URL = 'https://app.example.test/'

    expect(getWebAppRemoteControlUrl()).toBe('https://app.example.test/code')
    expect(getPrivacySettingsUrl()).toBe(
      'https://app.example.test/settings/data-privacy-controls',
    )
    expect(getBillingSettingsUrl()).toBe(
      'https://app.example.test/settings/billing',
    )
    expect(getUsageSettingsUrl()).toBe(
      'https://app.example.test/settings/usage',
    )
    expect(getUsageSettingsUrl(true)).toBe(
      'https://app.example.test/admin-settings/usage',
    )
    expect(getMaxUpgradeUrl()).toBe('https://app.example.test/upgrade/max')
    expect(getDesktopDownloadPageUrl()).toBe(
      'https://app.example.test/download',
    )
    expect(getChromeExtensionUrl()).toBe('https://app.example.test/chrome')
    expect(getChromePermissionsUrl()).toBe(
      'https://app.example.test/chrome/permissions',
    )
    expect(getChromeReconnectUrl()).toBe(
      'https://app.example.test/chrome/reconnect',
    )
    expect(getChromeFocusTabUrl('123')).toBe(
      'https://app.example.test/chrome/tab/123',
    )
    expect(getConsoleApiKeysUrl()).toBe(
      'https://app.example.test/settings/keys',
    )
  })
})
