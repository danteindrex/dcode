# OpenAI Codex OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native OAuth login, storage, refresh, and provider auth resolution for `openai-codex` without changing the existing Anthropic login flow.

**Architecture:** Introduce a provider-local OAuth/runtime/storage path for `openai-codex`, then add a dedicated login command that writes credentials into this repo’s own state. Keep Anthropic auth untouched and teach the `openai-codex` provider to prefer stored OAuth, refresh when needed, and fall back to env tokens only when explicitly present.

**Tech Stack:** Bun, TypeScript, existing repo config/state helpers, existing local callback/OAuth patterns, OpenAI OAuth + Responses API transport

---

## File Map

- Create: `src/providers/openai-codex/oauth.ts`
- Create: `src/providers/openai-codex/storage.ts`
- Create: `src/providers/openai-codex/oauth.test.ts`
- Create: `src/providers/openai-codex/storage.test.ts`
- Create: `src/commands/loginOpenAICodex/index.ts`
- Create: `src/commands/loginOpenAICodex/loginOpenAICodex.tsx`
- Create: `src/commands/loginOpenAICodex/loginOpenAICodex.test.tsx`
- Modify: `src/providers/openai-codex/auth.ts`
- Modify: `src/providers/openai-codex/provider.test.ts`
- Modify: `src/commands.ts`
- Modify: `src/utils/config.ts`

### Task 1: Add Stored Codex OAuth Credentials

**Files:**
- Create: `src/providers/openai-codex/storage.ts`
- Create: `src/providers/openai-codex/storage.test.ts`
- Modify: `src/utils/config.ts`

- [ ] **Step 1: Write the failing storage tests**

```ts
import { describe, expect, test } from 'bun:test'

import {
  clearStoredOpenAICodexOAuth,
  getStoredOpenAICodexOAuth,
  saveStoredOpenAICodexOAuth,
} from './storage.js'

describe('openai-codex storage', () => {
  test('persists and reloads oauth credentials', () => {
    saveStoredOpenAICodexOAuth({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2030-01-01T00:00:00.000Z',
      baseUrl: 'https://api.openai.com/v1',
      email: 'user@example.com',
      accountId: 'acct_123',
    })

    expect(getStoredOpenAICodexOAuth()).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2030-01-01T00:00:00.000Z',
      baseUrl: 'https://api.openai.com/v1',
      email: 'user@example.com',
      accountId: 'acct_123',
    })
  })

  test('clears stored oauth credentials', () => {
    saveStoredOpenAICodexOAuth({
      accessToken: 'access-1',
      expiresAt: '2030-01-01T00:00:00.000Z',
      baseUrl: 'https://api.openai.com/v1',
    })

    clearStoredOpenAICodexOAuth()

    expect(getStoredOpenAICodexOAuth()).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `C:\Users\user\.bun\bin\bun.exe test src/providers/openai-codex/storage.test.ts`
Expected: FAIL because `storage.ts` does not exist and config has no Codex OAuth fields.

- [ ] **Step 3: Add config fields and storage implementation**

```ts
export type OpenAICodexStoredOAuth = {
  accessToken: string
  refreshToken?: string
  expiresAt: string
  baseUrl: string
  email?: string
  accountId?: string
}

export function getStoredOpenAICodexOAuth(): OpenAICodexStoredOAuth | undefined
export function saveStoredOpenAICodexOAuth(
  value: OpenAICodexStoredOAuth,
): void
export function clearStoredOpenAICodexOAuth(): void
```

- [ ] **Step 4: Run test to verify it passes**

Run: `C:\Users\user\.bun\bin\bun.exe test src/providers/openai-codex/storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/openai-codex/storage.ts src/providers/openai-codex/storage.test.ts src/utils/config.ts
git commit -m "feat: add stored openai codex oauth credentials"
```

### Task 2: Resolve Stored OAuth Before Env Tokens

**Files:**
- Modify: `src/providers/openai-codex/auth.ts`
- Modify: `src/providers/openai-codex/provider.test.ts`

- [ ] **Step 1: Write the failing auth-resolution test**

```ts
test('prefers stored oauth credentials over env fallback', () => {
  saveStoredOpenAICodexOAuth({
    accessToken: 'stored-access',
    refreshToken: 'stored-refresh',
    expiresAt: '2030-01-01T00:00:00.000Z',
    baseUrl: 'https://api.openai.com/v1',
  })

  process.env.OPENAI_CODEX_ACCESS_TOKEN = 'env-access'

  expect(resolveOpenAICodexAuth()).toMatchObject({
    accessToken: 'stored-access',
    refreshToken: 'stored-refresh',
    baseUrl: 'https://api.openai.com/v1',
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `C:\Users\user\.bun\bin\bun.exe test src/providers/openai-codex/provider.test.ts`
Expected: FAIL because auth currently only reads env vars.

- [ ] **Step 3: Update auth resolution**

```ts
export type OpenAICodexAuth = {
  accessToken: string
  refreshToken?: string
  baseUrl: string
  expiresAt?: string
  source: 'stored-oauth' | 'env'
  email?: string
  accountId?: string
}
```

Resolution order:

1. valid stored OAuth
2. env vars
3. throw login-required error

- [ ] **Step 4: Run test to verify it passes**

Run: `C:\Users\user\.bun\bin\bun.exe test src/providers/openai-codex/provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/openai-codex/auth.ts src/providers/openai-codex/provider.test.ts
git commit -m "feat: resolve stored openai codex oauth"
```

### Task 3: Implement PKCE + Token Exchange Helpers

**Files:**
- Create: `src/providers/openai-codex/oauth.ts`
- Create: `src/providers/openai-codex/oauth.test.ts`

- [ ] **Step 1: Write the failing OAuth helper tests**

```ts
import { describe, expect, test } from 'bun:test'

import {
  buildOpenAICodexAuthorizeUrl,
  createOpenAICodexPkcePair,
} from './oauth.js'

describe('openai-codex oauth helpers', () => {
  test('creates a verifier and challenge', async () => {
    const pair = await createOpenAICodexPkcePair()
    expect(pair.verifier.length).toBeGreaterThan(20)
    expect(pair.challenge.length).toBeGreaterThan(20)
  })

  test('builds an authorize url with pkce and state', async () => {
    const pair = await createOpenAICodexPkcePair()
    const url = buildOpenAICodexAuthorizeUrl({
      clientId: 'client-id',
      redirectUri: 'http://127.0.0.1:45455/callback',
      state: 'state-123',
      challenge: pair.challenge,
    })
    expect(url.toString()).toContain('client_id=client-id')
    expect(url.toString()).toContain('state=state-123')
    expect(url.toString()).toContain('code_challenge=')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `C:\Users\user\.bun\bin\bun.exe test src/providers/openai-codex/oauth.test.ts`
Expected: FAIL because helper functions do not exist.

- [ ] **Step 3: Implement the helper module**

```ts
export async function createOpenAICodexPkcePair(): Promise<{
  verifier: string
  challenge: string
}>

export function buildOpenAICodexAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  state: string
  challenge: string
  baseUrl?: string
}): URL
```

Include:

- PKCE SHA-256 challenge generation
- state token generation helper
- token endpoint exchange helper signature for later login flow work

- [ ] **Step 4: Run test to verify it passes**

Run: `C:\Users\user\.bun\bin\bun.exe test src/providers/openai-codex/oauth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/openai-codex/oauth.ts src/providers/openai-codex/oauth.test.ts
git commit -m "feat: add openai codex oauth pkce helpers"
```

### Task 4: Add Dedicated Login Command Surface

**Files:**
- Create: `src/commands/loginOpenAICodex/index.ts`
- Create: `src/commands/loginOpenAICodex/loginOpenAICodex.tsx`
- Create: `src/commands/loginOpenAICodex/loginOpenAICodex.test.tsx`
- Modify: `src/commands.ts`

- [ ] **Step 1: Write the failing command registration test**

```ts
test('registers login-openai-codex command', async () => {
  const commands = await getCommands()
  expect(commands.some(cmd => cmd.name === 'login-openai-codex')).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `C:\Users\user\.bun\bin\bun.exe test src/commands/loginOpenAICodex/loginOpenAICodex.test.tsx`
Expected: FAIL because command does not exist.

- [ ] **Step 3: Add command wiring**

Command behavior:

- starts the OpenAI Codex OAuth flow
- opens browser when possible
- prints URL when browser open fails
- stores resulting credentials using `storage.ts`

- [ ] **Step 4: Run test to verify it passes**

Run: `C:\Users\user\.bun\bin\bun.exe test src/commands/loginOpenAICodex/loginOpenAICodex.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/loginOpenAICodex src/commands.ts
git commit -m "feat: add login command for openai codex oauth"
```

### Task 5: Implement Callback + Token Exchange

**Files:**
- Modify: `src/providers/openai-codex/oauth.ts`
- Modify: `src/commands/loginOpenAICodex/loginOpenAICodex.tsx`
- Modify: `src/commands/loginOpenAICodex/loginOpenAICodex.test.tsx`

- [ ] **Step 1: Write the failing end-to-end login test with mocked exchange**

```ts
test('stores oauth credentials after successful callback', async () => {
  await runOpenAICodexLoginFlow({
    openUrl: async () => {},
    exchangeCodeForTokens: async () => ({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2030-01-01T00:00:00.000Z',
      baseUrl: 'https://api.openai.com/v1',
      email: 'user@example.com',
      accountId: 'acct_123',
    }),
    waitForCallback: async () => ({
      code: 'code-123',
      state: 'state-123',
    }),
  })

  expect(getStoredOpenAICodexOAuth()?.accessToken).toBe('access-1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `C:\Users\user\.bun\bin\bun.exe test src/commands/loginOpenAICodex/loginOpenAICodex.test.tsx`
Expected: FAIL because login flow does not exchange/store tokens yet.

- [ ] **Step 3: Implement callback and exchange**

Add:

- local callback listener wrapper
- state validation
- authorization code exchange
- persistence on success
- cleanup on failure

- [ ] **Step 4: Run test to verify it passes**

Run: `C:\Users\user\.bun\bin\bun.exe test src/commands/loginOpenAICodex/loginOpenAICodex.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/openai-codex/oauth.ts src/commands/loginOpenAICodex/loginOpenAICodex.tsx src/commands/loginOpenAICodex/loginOpenAICodex.test.tsx
git commit -m "feat: complete openai codex oauth login flow"
```

### Task 6: Add Refresh-on-Use for Provider Calls

**Files:**
- Modify: `src/providers/openai-codex/oauth.ts`
- Modify: `src/providers/openai-codex/auth.ts`
- Modify: `src/providers/openai-codex/provider.test.ts`

- [ ] **Step 1: Write the failing refresh test**

```ts
test('refreshes expired stored oauth before provider use', async () => {
  saveStoredOpenAICodexOAuth({
    accessToken: 'expired-access',
    refreshToken: 'refresh-1',
    expiresAt: '2000-01-01T00:00:00.000Z',
    baseUrl: 'https://api.openai.com/v1',
  })

  await resolveOpenAICodexAuth({
    refresh: async () => ({
      accessToken: 'fresh-access',
      refreshToken: 'refresh-2',
      expiresAt: '2030-01-01T00:00:00.000Z',
      baseUrl: 'https://api.openai.com/v1',
    }),
  })

  expect(getStoredOpenAICodexOAuth()?.accessToken).toBe('fresh-access')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `C:\Users\user\.bun\bin\bun.exe test src/providers/openai-codex/provider.test.ts`
Expected: FAIL because expired stored OAuth is not refreshed.

- [ ] **Step 3: Implement refresh path**

Rules:

- if stored token is unexpired, use it
- if expired and refresh token exists, refresh and store
- if refresh fails, clear invalid stored OAuth and throw login-required

- [ ] **Step 4: Run test to verify it passes**

Run: `C:\Users\user\.bun\bin\bun.exe test src/providers/openai-codex/provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/openai-codex/auth.ts src/providers/openai-codex/oauth.ts src/providers/openai-codex/provider.test.ts
git commit -m "feat: refresh stored openai codex oauth tokens"
```

### Task 7: Live Verification

**Files:**
- Modify: none unless bugs are found

- [ ] **Step 1: Verify focused automated tests**

Run:

```bash
C:\Users\user\.bun\bin\bun.exe test src/providers/openai-codex/storage.test.ts src/providers/openai-codex/oauth.test.ts src/providers/openai-codex/provider.test.ts src/commands/loginOpenAICodex/loginOpenAICodex.test.tsx src/providers/runtime.test.ts
```

Expected: PASS

- [ ] **Step 2: Perform manual login**

Run:

```bash
C:\Users\user\.bun\bin\bun.exe dist/cli.js
```

Then invoke:

```text
/login-openai-codex
```

Expected:

- browser opens or URL is printed
- callback completes
- credentials persist in this repo’s storage

- [ ] **Step 3: Perform live provider call**

Run a smoke script that uses stored OAuth through `createOpenAICodexProvider()`.

Expected:

- successful OpenAI response
- no env token required

- [ ] **Step 4: Sanity-check Anthropic path remains untouched**

Run:

```bash
C:\Users\user\.bun\bin\bun.exe test src/providers/anthropic/provider.test.ts src/providers/runtime.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add native openai codex oauth support"
```

## Self-Review

- Spec coverage: storage, login flow, token exchange, refresh, provider use, and verification are all mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, or deferred implementation markers remain in the task steps.
- Type consistency: stored credential type, auth result type, and login flow responsibilities are named consistently across tasks.
