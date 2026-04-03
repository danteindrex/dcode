import { afterEach, describe, expect, test } from 'bun:test'

import {
  CLAUDE_AI_HOSTNAME,
  CLAUDE_IN_CHROME_BETA_TITLE,
  CLAUDE_IN_CHROME_BUG_REPORT_URL,
  CLAUDE_IN_CHROME_DOCS_URL,
  CLAUDE_IN_CHROME_NATIVE_HOST_DESCRIPTION,
  CLAUDE_IN_CHROME_NATIVE_HOST_IDENTIFIER,
  CLAUDE_IN_CHROME_PRODUCT_NAME,
  getClaudeInChromeExtensionIds,
  getClaudeInChromeExtensionOrigins,
} from './common.js'

const ORIGINAL_USER_TYPE = process.env.USER_TYPE

afterEach(() => {
  if (ORIGINAL_USER_TYPE === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = ORIGINAL_USER_TYPE
  }
})

describe('claude in chrome common helpers', () => {
  test('exports the shared chrome constants', () => {
    expect(CLAUDE_IN_CHROME_PRODUCT_NAME).toBe('Claude in Chrome')
    expect(CLAUDE_IN_CHROME_BETA_TITLE).toBe('Claude in Chrome (Beta)')
    expect(CLAUDE_IN_CHROME_DOCS_URL).toBe(
      'https://code.claude.com/docs/en/chrome',
    )
    expect(CLAUDE_IN_CHROME_BUG_REPORT_URL).toContain(
      'claude-code/issues/new',
    )
    expect(CLAUDE_IN_CHROME_NATIVE_HOST_DESCRIPTION).toBe(
      'Claude Code Browser Extension Native Host',
    )
    expect(CLAUDE_IN_CHROME_NATIVE_HOST_IDENTIFIER).toBe(
      'com.anthropic.claude_code_browser_extension',
    )
    expect(CLAUDE_AI_HOSTNAME).toBe('claude.ai')
  })

  test('returns the correct extension ids and origins for ant users', () => {
    process.env.USER_TYPE = 'ant'

    expect(getClaudeInChromeExtensionIds()).toEqual([
      'fcoeoabgfenejglbffodgkkbkcdhcgfn',
      'dihbgbndebgnbjfmelmegjepbnkhlgni',
      'dngcpimnedloihjnnfngkgjoidhnaolf',
    ])
    expect(getClaudeInChromeExtensionOrigins()).toEqual([
      'chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/',
      'chrome-extension://dihbgbndebgnbjfmelmegjepbnkhlgni/',
      'chrome-extension://dngcpimnedloihjnnfngkgjoidhnaolf/',
    ])
  })
})
