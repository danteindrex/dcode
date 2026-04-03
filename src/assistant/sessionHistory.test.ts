import { afterEach, describe, expect, test } from 'bun:test'

import { getSessionEventsBaseUrl } from './sessionHistory.js'

const ORIGINAL_BACKEND_URL = process.env.CLAUDE_CODE_APP_BACKEND_URL

afterEach(() => {
  if (ORIGINAL_BACKEND_URL === undefined) {
    delete process.env.CLAUDE_CODE_APP_BACKEND_URL
  } else {
    process.env.CLAUDE_CODE_APP_BACKEND_URL = ORIGINAL_BACKEND_URL
  }
})

describe('getSessionEventsBaseUrl', () => {
  test('uses the configured backend origin', () => {
    process.env.CLAUDE_CODE_APP_BACKEND_URL = 'https://backend.example.test/'

    expect(getSessionEventsBaseUrl('session_123')).toBe(
      'https://backend.example.test/v1/sessions/session_123/events',
    )
  })
})
