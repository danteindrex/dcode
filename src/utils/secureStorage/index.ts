import { createFallbackStorage } from './fallbackStorage.js'
import { plainTextStorage } from './plainTextStorage.js'
import type { SecureStorage } from './types.js'

/**
 * Get the appropriate secure storage implementation for the current platform
 */
export function getSecureStorage(): SecureStorage {
  if (process.platform === 'darwin') {
    // Lazy-load the macOS keychain implementation so non-macOS environments
    // do not pay its import cost or fail on platform-specific module issues.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { macOsKeychainStorage } =
      require('./macOsKeychainStorage.js') as typeof import('./macOsKeychainStorage.js')
    return createFallbackStorage(macOsKeychainStorage, plainTextStorage)
  }

  // TODO: add libsecret support for Linux

  return plainTextStorage
}
