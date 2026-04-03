import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, test } from 'bun:test'

import loginOpenAICodex from './index.js'

describe('login-openai-codex command', () => {
  test('registers as a built-in command', () => {
    const commandsSource = readFileSync(
      join(process.cwd(), 'src', 'commands.ts'),
      'utf8',
    )

    expect(loginOpenAICodex.name).toBe('login-openai-codex')
    expect(commandsSource).toContain(
      "import loginOpenAICodex from './commands/loginOpenAICodex/index.js'",
    )
    expect(commandsSource).toContain('loginOpenAICodex,')
  })
})
