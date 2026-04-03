import { describe, expect, test } from 'bun:test'
import { parseUserSpecifiedModel } from './model.js'

describe('parseUserSpecifiedModel', () => {
  test('falls back to a default model when the input is missing', () => {
    expect(typeof parseUserSpecifiedModel(undefined)).toBe('string')
    expect(parseUserSpecifiedModel(undefined).length).toBeGreaterThan(0)
    expect(typeof parseUserSpecifiedModel(null)).toBe('string')
    expect(typeof parseUserSpecifiedModel('')).toBe('string')
  })
})
