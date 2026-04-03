import { afterEach, describe, expect, test } from 'bun:test'

import { getTeleportSessionsBaseUrl } from './api.js'

const ORIGINAL_BACKEND_URL = process.env.CLAUDE_CODE_APP_BACKEND_URL

afterEach(() => {
  if (ORIGINAL_BACKEND_URL === undefined) {
    delete process.env.CLAUDE_CODE_APP_BACKEND_URL
  } else {
    process.env.CLAUDE_CODE_APP_BACKEND_URL = ORIGINAL_BACKEND_URL
  }
})

describe('getTeleportSessionsBaseUrl', () => {
  test('uses the configured backend origin', () => {
    process.env.CLAUDE_CODE_APP_BACKEND_URL = 'https://backend.example.test/'

    expect(getTeleportSessionsBaseUrl()).toBe(
      'https://backend.example.test/v1/sessions',
    )
  })
})
