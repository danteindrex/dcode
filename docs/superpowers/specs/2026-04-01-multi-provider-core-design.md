# Multi-Provider Core Design

## Goal

Make this CLI runtime provider-neutral while preserving existing Anthropic behavior and adding first-class support for OpenAI API, OpenAI Codex OAuth, Gemini, and Ollama.

This phase is intentionally limited to the model/runtime boundary. It does not replace Anthropic remote-control backends, telemetry services, or existing storage/session layout.

## Non-Goals

- Replacing Anthropic Remote Control, bridge mode, session ingress, or mobile/web control in this phase
- Replacing existing telemetry sinks or GrowthBook/entitlement systems in this phase
- Adopting OpenClaw storage, auth storage, session storage, or plugin loading architecture
- Rebuilding every disabled or private Anthropic feature in this phase
- Changing already functional CLI, TUI, tools, slash commands, or permission flows unless the provider boundary requires a narrow change

## Current State

The current runtime is only partially generic.

- [`src/query.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\query.ts) is mostly orchestration and tool-loop logic
- [`src/query/deps.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\query\deps.ts) binds the loop to Anthropic-specific model execution
- [`src/services/api/claude.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\services\api\claude.ts) owns Anthropic request shaping, stream handling, and message schema conversion
- [`src/services/api/client.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\services\api\client.ts) owns Anthropic/Bedrock/Vertex/Foundry client construction and auth
- [`src/utils/model/providers.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\utils\model\providers.ts) is a hardcoded env-switch rather than a provider runtime

This makes multi-provider support difficult because provider-specific logic is embedded in the core path instead of isolated behind a stable interface.

## Design Principles

1. Preserve working behavior first.
2. Extract and wrap before rewriting.
3. Keep upper layers provider-agnostic.
4. Confine provider quirks below a normalization boundary.
5. Use OpenClaw only as a reference for model connection patterns, auth flow shape, transport adapters, and provider capability hooks.
6. Do not import OpenClaw storage or plugin-loader architecture.

## Target Architecture

Phase 1 introduces a built-in provider runtime registry, not a full external plugin system.

### Stable upper layers

The following should remain conceptually unchanged:

- CLI entrypoints and Commander setup
- REPL and TUI rendering
- slash commands
- tool registry and execution
- permission system
- session flow and history flow
- main query orchestration in [`src/query.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\query.ts)

### New provider boundary

`query.ts` should continue to call a single `callModel()`-style dependency, but that dependency must route through a provider-neutral runtime instead of directly calling Anthropic-only code.

The new boundary should resolve:

- provider id
- model id
- auth mode and credentials
- provider capabilities
- request/stream adapter
- provider-specific error mapping

### Built-in providers in this phase

- `anthropic`
- `openai`
- `openai-codex`
- `gemini`
- `ollama`

Anthropic remains supported and should be the first provider adapted to the new interface using existing code paths.

## Proposed File Boundaries

Create a new provider runtime area:

- `src/providers/types.ts`
  Shared contracts for provider runtime, auth resolution, stream normalization, capabilities, and request execution.
- `src/providers/registry.ts`
  Built-in provider registration and lookup.
- `src/providers/runtime.ts`
  Main dispatch layer used by `query/deps.ts`.
- `src/providers/normalize.ts`
  Provider-native stream/tool event normalization into one internal event shape.
- `src/providers/models.ts`
  Shared `provider/model` parsing, provider default selection, and model normalization helpers.
- `src/providers/auth.ts`
  Shared runtime auth helpers that reuse this repo's existing config/token storage.

Provider implementations:

- `src/providers/anthropic/*`
- `src/providers/openai/*`
- `src/providers/openai-codex/*`
- `src/providers/gemini/*`
- `src/providers/ollama/*`

Existing files expected to change:

- [`src/query/deps.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\query\deps.ts)
- [`src/utils/model/providers.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\utils\model\providers.ts)
- [`src/utils/model/model.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\utils\model\model.ts)
- [`src/services/api/claude.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\services\api\claude.ts)
- [`src/services/api/client.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\services\api\client.ts)

Existing Anthropic code should be moved behind `src/providers/anthropic/*` where practical, not deleted outright at the start of the refactor.

## Provider Contract

Each provider implementation should own the following concerns:

- model id normalization
- default model selection
- auth resolution
- request payload shaping
- upstream transport setup
- stream parsing
- tool-call parsing quirks
- usage extraction
- stop-reason mapping
- missing-auth and provider-specific error messages

Each provider must emit a shared internal event format that upper layers already know how to consume.

That shared format must cover:

- assistant text deltas
- optional reasoning/thinking deltas
- tool call start
- tool call arguments delta or final arguments
- message completion
- usage data
- stop reason
- provider error

## Anthropic Provider Strategy

Anthropic is not reimplemented from scratch.

Instead:

1. Extract the existing Anthropic request/auth/stream logic from [`src/services/api/claude.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\services\api\claude.ts) and [`src/services/api/client.ts`](C:\Users\user\Documents\New%20folder\Claude-code\src\services\api\client.ts) behind the new provider interface.
2. Make the new runtime call Anthropic through that interface.
3. Verify no behavior drift before adding non-Anthropic providers.

This is the compatibility baseline for the new provider runtime.

## OpenAI and OpenAI Codex Strategy

These must be separate providers.

### `openai`

- Standard OpenAI API-key access
- Normal OpenAI model selection and transport handling
- Provider-specific request and stream adaptation

### `openai-codex`

- ChatGPT/Codex OAuth-backed access
- Separate auth flow and token refresh logic from standard API-key OpenAI
- Provider-specific model rules, entitlement handling, and missing-auth guidance

This separation is required because Codex OAuth is not just an alternate credential for the same runtime behavior.

## Gemini Strategy

Gemini support in this phase is API-key Gemini through the provider boundary.

The provider must own Gemini-specific stream, tool-call, and schema quirks below the normalization layer.

OAuth-style Gemini login is not part of this first sub-project and must not shape storage or runtime design in phase 1.

## Ollama Strategy

Ollama should be supported as a local or remote provider through its own provider implementation.

It must own:

- base URL handling
- local compatibility quirks
- tool-call normalization
- explicit missing-auth or missing-endpoint diagnostics

Ollama should not be forced through Anthropic-specific assumptions such as Anthropic message schemas or OAuth paths.

## Data Flow

Target runtime flow:

1. Upper-layer code calls provider-neutral `callModel()`.
2. Runtime resolves provider and model.
3. Runtime resolves auth and capabilities.
4. Runtime selects provider transport.
5. Provider emits provider-native events.
6. Normalization layer converts those events into shared internal stream events.
7. Existing query/tool/TUI layers continue consuming the shared format.

This keeps provider-specific complexity below the boundary.

## Error Handling

Provider runtime must fail explicitly and locally.

Requirements:

- Unknown provider must produce a clear configuration error.
- Unknown model must produce a provider-specific model error.
- Missing auth must produce a provider-specific remediation message.
- Unsupported provider feature must produce a clear capability error.
- Stream parse failures must be wrapped into provider-tagged runtime errors.
- Provider-specific transport errors must not leak raw upstream structures into upper layers unless they are also logged diagnostically.

Upper layers should not need to understand provider-specific error taxonomies.

## Testing Strategy

Phase 1 is only complete when all of the following are verified:

### Compatibility

- Anthropic still works through the new provider boundary
- Existing print mode still works
- Existing interactive REPL flow still works
- Existing tool loop still works

### Provider coverage

- OpenAI API-key path works
- OpenAI Codex OAuth path works
- Gemini path works
- Ollama path works

### Regression coverage

- Existing working CLI/TUI/tool behavior is preserved
- Tool calls still round-trip correctly across providers
- Stream deltas normalize correctly into the internal message/event shape
- Usage and stop reasons are mapped correctly

### Verification evidence

Each completion claim in implementation must be backed by fresh test or runtime verification output.

## Incremental Migration Plan

1. Add provider contracts and runtime registry without switching the main query path.
2. Adapt Anthropic into the new interface using existing code.
3. Switch `query/deps.ts` to the provider runtime after Anthropic parity is verified.
4. Add OpenAI.
5. Add OpenAI Codex OAuth.
6. Add Gemini.
7. Add Ollama.
8. Remove or reduce obsolete hardcoded provider-switch logic after parity is confirmed.

## Risks

- Anthropic assumptions may exist outside the current API layer and surface during extraction.
- Different providers expose different tool-call stream semantics, which can cause subtle regressions if normalization is incomplete.
- Codex OAuth and Gemini integration may require additional auth/runtime edge-case handling beyond the first provider contract draft.
- Replacing the provider boundary too aggressively could regress working Anthropic behavior.

## Decision Summary

- Use OpenClaw only for model connection patterns, provider hook ideas, auth-flow shape, and transport/normalization lessons.
- Do not adopt OpenClaw storage or plugin-loader architecture.
- Keep Anthropic support.
- Add OpenAI, OpenAI Codex, Gemini, and Ollama in the same provider runtime family.
- Prefer extraction and wrapping over rewriting.
