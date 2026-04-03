import * as React from 'react'
import { Text } from '../ink.js'
import { getChromeExtensionUrl } from '../constants/product.js'
import { isClaudeAISubscriber } from '../utils/auth.js'
import {
  CLAUDE_IN_CHROME_PRODUCT_NAME,
} from '../utils/claudeInChrome/common.js'
import {
  isChromeExtensionInstalled,
  shouldEnableClaudeInChrome,
} from '../utils/claudeInChrome/setup.js'
import { isRunningOnHomespace } from '../utils/envUtils.js'
import { useStartupNotification } from './notifs/useStartupNotification.js'

function getChromeFlag(): boolean | undefined {
  if (process.argv.includes('--chrome')) {
    return true
  }
  if (process.argv.includes('--no-chrome')) {
    return false
  }
  return undefined
}

export function useChromeExtensionNotification(): void {
  useStartupNotification(async () => {
    const chromeFlag = getChromeFlag()
    if (!shouldEnableClaudeInChrome(chromeFlag)) return null

    if (true && !isClaudeAISubscriber()) {
      return {
        key: 'chrome-requires-subscription',
        jsx: (
          <Text color="error">
            {CLAUDE_IN_CHROME_PRODUCT_NAME} requires a supported web-app subscription
          </Text>
        ),
        priority: 'immediate' as const,
        timeoutMs: 5000,
      }
    }

    const installed = await isChromeExtensionInstalled()
    if (!installed && !isRunningOnHomespace()) {
      return {
        key: 'chrome-extension-not-detected',
        jsx: (
          <Text color="warning">
            Chrome extension not detected {'\u00b7'} {getChromeExtensionUrl()}
            {' '}to install
          </Text>
        ),
        priority: 'immediate' as const,
        timeoutMs: 3000,
      }
    }

    if (chromeFlag === undefined) {
      return {
        key: 'claude-in-chrome-default-enabled',
        text: `${CLAUDE_IN_CHROME_PRODUCT_NAME} enabled \u00b7 /chrome`,
        priority: 'low' as const,
      }
    }

    return null
  })
}
