import { createRequire } from 'module'

type BrowserTool = {
  name: string
}

const require = createRequire(import.meta.url)

let cachedBrowserTools: BrowserTool[] | null = null

export function getClaudeInChromeBrowserTools(): BrowserTool[] {
  if (cachedBrowserTools) {
    return cachedBrowserTools
  }

  try {
    const mod = require('@ant/claude-for-chrome-mcp') as {
      BROWSER_TOOLS?: BrowserTool[]
    }
    cachedBrowserTools = Array.isArray(mod.BROWSER_TOOLS)
      ? mod.BROWSER_TOOLS
      : []
  } catch {
    cachedBrowserTools = []
  }

  return cachedBrowserTools
}

export function resetClaudeInChromeBrowserToolsForTesting(): void {
  cachedBrowserTools = null
}
