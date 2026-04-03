import { createRequire } from 'module'
import { isEnvDefinedFalsy } from '../../utils/envUtils.js'
import {
  ColorDiff as TsColorDiff,
  ColorFile as TsColorFile,
  getSyntaxTheme as tsGetSyntaxTheme,
  type SyntaxTheme,
} from '../../native-ts/color-diff/index.js'

const require = createRequire(import.meta.url)

type NativeColorDiffModule = {
  ColorDiff: typeof TsColorDiff
  ColorFile: typeof TsColorFile
  getSyntaxTheme: (themeName: string) => SyntaxTheme
}

let cachedNativeModule: NativeColorDiffModule | null | undefined

function getColorDiffModule(): NativeColorDiffModule {
  if (cachedNativeModule) {
    return cachedNativeModule
  }

  try {
    cachedNativeModule = require('color-diff-napi') as NativeColorDiffModule
  } catch {
    cachedNativeModule = {
      ColorDiff: TsColorDiff,
      ColorFile: TsColorFile,
      getSyntaxTheme: tsGetSyntaxTheme,
    }
  }

  return cachedNativeModule
}

export type ColorModuleUnavailableReason = 'env'

/**
 * Returns a static reason why the color-diff module is unavailable, or null if available.
 * 'env' = disabled via CLAUDE_CODE_SYNTAX_HIGHLIGHT
 *
 * The TS port of color-diff works in all build modes, so the only way to
 * disable it is via the env var.
 */
export function getColorModuleUnavailableReason(): ColorModuleUnavailableReason | null {
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_SYNTAX_HIGHLIGHT)) {
    return 'env'
  }
  return null
}

export function expectColorDiff(): typeof TsColorDiff | null {
  return getColorModuleUnavailableReason() === null
    ? getColorDiffModule().ColorDiff
    : null
}

export function expectColorFile(): typeof TsColorFile | null {
  return getColorModuleUnavailableReason() === null
    ? getColorDiffModule().ColorFile
    : null
}

export function getSyntaxTheme(themeName: string): SyntaxTheme | null {
  return getColorModuleUnavailableReason() === null
    ? getColorDiffModule().getSyntaxTheme(themeName)
    : null
}
