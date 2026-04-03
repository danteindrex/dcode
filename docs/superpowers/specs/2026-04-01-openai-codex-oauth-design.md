# OpenAI Codex OAuth Design

Date: 2026-04-01

## Goal

Add native OAuth login support for the `openai-codex` provider in this CLI without changing the existing Anthropic login flow or the current functional Anthropic runtime.

This slice must:

- open a browser-based OpenAI/Codex login flow
- capture the callback locally
- exchange the auth code for tokens
- store tokens in this repo's own config/storage layout
- refresh tokens when needed
- let `openai-codex` provider calls use stored OAuth automatically

## Non-Goals

This slice does not:

- replace Anthropic OAuth
- replace all auth storage in the repo
- add generic provider-agnostic OAuth for every provider
- change telemetry, remote bridge, or web backend systems

## Approach

Recommended approach: add a provider-specific OAuth implementation for `openai-codex`, while reusing existing local patterns from the repo where they are transport-agnostic.

Why:

- It keeps the change isolated.
- It avoids coupling `openai-codex` auth to Anthropic-specific OAuth endpoints and account semantics.
- It keeps the door open to a later generic provider OAuth framework once at least two non-Anthropic OAuth providers exist.

## Architecture

### 1. Provider-specific OAuth runtime

Add a new runtime area:

- `src/providers/openai-codex/oauth.ts`

Responsibilities:

- generate PKCE verifier and challenge
- construct the authorization URL
- start or coordinate the loopback callback listener
- validate callback state
- exchange authorization code for tokens
- refresh access tokens

This module must not depend on Anthropic OAuth constants.

### 2. Token storage

Add:

- `src/providers/openai-codex/storage.ts`

Responsibilities:

- load persisted Codex OAuth credentials
- save updated credentials
- clear credentials on logout or invalid-token failure

Stored data shape should include:

- `accessToken`
- `refreshToken`
- `expiresAt`
- optional provider/account metadata such as `email`, `accountId`, and `baseUrl`

Storage must use this repo’s config/state location, not `openclaw`’s storage format.

### 3. Auth resolution

Extend:

- `src/providers/openai-codex/auth.ts`

Resolution order:

1. valid stored OAuth credentials
2. refreshable stored OAuth credentials
3. explicit env vars
4. fail with a clear login-required error

That preserves explicit env overrides while making native OAuth the normal path.

### 4. CLI login entry point

Add a Codex-specific login command path rather than changing Anthropic `/login` semantics.

Acceptable forms:

- a new slash command such as `/login-openai-codex`
- a CLI subcommand such as `claude auth login-openai-codex`

Recommendation: use a distinct command first. Do not overload the existing Anthropic login flow in this slice.

### 5. Provider integration

`openai-codex` provider calls should:

- resolve OAuth from storage through `auth.ts`
- refresh automatically if expired and refresh is possible
- use the refreshed token for the Responses API transport already implemented

## Data Flow

1. User starts OpenAI Codex login command.
2. CLI generates PKCE state and opens the browser.
3. OpenAI redirects to local callback URL.
4. CLI validates state and exchanges code for tokens.
5. Tokens are saved locally in this repo’s storage.
6. `openai-codex` provider loads tokens from storage during model calls.
7. If expired, refresh runs automatically and storage is updated.

## Error Handling

Expected failures and behavior:

- browser open failure: print auth URL for manual copy
- callback timeout: abort with retry guidance
- state mismatch: reject callback and fail safely
- token exchange failure: preserve no partial credentials
- refresh failure: clear unusable stored token and return login-required error
- network errors: surface provider-specific actionable messages

## Verification

This slice is complete only if all of the following are verified:

- browser auth URL generation works
- callback capture works
- token exchange works
- tokens persist and reload correctly
- refresh path works
- `openai-codex` provider call succeeds using stored OAuth
- Anthropic login and runtime behavior remain unchanged

## Risks

- OpenAI auth endpoint details may differ from assumptions and require live adjustment
- this repo’s existing import graph can make isolated auth testing harder than transport testing
- if OpenAI account metadata is sparse, some profile fields may need to stay optional

## Implementation Boundary

Only change code required for:

- Codex OAuth login
- Codex token storage
- Codex token refresh
- Codex provider auth resolution
- the minimal command surface needed to trigger the flow

Do not refactor Anthropic OAuth or broader settings storage in this slice.
