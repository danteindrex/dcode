import { describe, expect, test } from 'bun:test'
import { getClaudeInChromeBrowserTools } from './browserTools.js'

describe('claude in chrome browser tools helper', () => {
  test('returns a safe array when the private chrome package is unavailable', () => {
    expect(Array.isArray(getClaudeInChromeBrowserTools())).toBe(true)
  })
})
