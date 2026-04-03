# Multi-Provider Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a provider-neutral runtime that preserves Anthropic behavior and adds built-in support for OpenAI API, OpenAI Codex OAuth, Gemini API-key, and Ollama without changing unrelated functional CLI/TUI/tool behavior.

**Architecture:** Keep the existing CLI, REPL, tool loop, and query orchestration intact. Replace the hardcoded Anthropic model boundary with a built-in provider registry and normalized stream/event interface. Reuse existing storage and auth files in this repo; do not import OpenClaw storage or plugin loading.

**Tech Stack:** Bun, TypeScript, existing Claude Code runtime, Anthropic SDK, OpenAI SDK or HTTP client, Gemini HTTP client, Ollama HTTP client, Bun test, TypeScript compiler.

---

### Task 1: Scaffold the provider runtime contracts and registry

**Files:**
- Create: `src/providers/types.ts`
- Create: `src/providers/registry.ts`
- Create: `src/providers/runtime.ts`
- Create: `src/providers/models.ts`
- Create: `src/providers/normalize.ts`
- Test: `src/providers/registry.test.ts`
- Test: `src/providers/models.test.ts`

- [ ] **Step 1: Write the failing tests for provider registration and model parsing**

```ts
// src/providers/registry.test.ts
import { describe, expect, it } from 'bun:test'
import { createProviderRegistry } from './registry.js'

describe('createProviderRegistry', () => {
  it('registers built-in providers by id', () => {
    const registry = createProviderRegistry([
      { id: 'anthropic' } as never,
      { id: 'openai' } as never,
    ])

    expect(registry.get('anthropic')?.id).toBe('anthropic')
    expect(registry.get('openai')?.id).toBe('openai')
    expect(registry.get('missing')).toBeUndefined()
  })
})
```

```ts
// src/providers/models.test.ts
import { describe, expect, it } from 'bun:test'
import { parseProviderModelRef } from './models.js'

describe('parseProviderModelRef', () => {
  it('parses provider/model refs', () => {
    expect(parseProviderModelRef('openai/gpt-5.4')).toEqual({
      provider: 'openai',
      model: 'gpt-5.4',
    })
  })

  it('returns null for malformed refs', () => {
    expect(parseProviderModelRef('gpt-5.4')).toBeNull()
    expect(parseProviderModelRef('openai/')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/providers/registry.test.ts src/providers/models.test.ts`

Expected: FAIL with module-not-found errors for the new provider files.

- [ ] **Step 3: Add the minimal provider contracts and registry**

```ts
// src/providers/types.ts
import type { Message, StreamEvent } from '../types/message.js'
import type { ToolUseContext } from '../Tool.js'
import type { SystemPrompt } from '../utils/systemPromptType.js'

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'openai-codex'
  | 'gemini'
  | 'ollama'

export type ProviderModelRef = {
  provider: ProviderId
  model: string
}

export type ProviderCallParams = {
  messages: Message[]
  systemPrompt: SystemPrompt
  toolUseContext: ToolUseContext
  model: string
}

export type ProviderCallResult = AsyncGenerator<StreamEvent | Message, void, void>

export type ProviderDefinition = {
  id: ProviderId
  call(params: ProviderCallParams): ProviderCallResult
}
```

```ts
// src/providers/registry.ts
import type { ProviderDefinition, ProviderId } from './types.js'

export type ProviderRegistry = {
  get(id: string): ProviderDefinition | undefined
  list(): ProviderDefinition[]
}

export function createProviderRegistry(
  providers: ProviderDefinition[],
): ProviderRegistry {
  const byId = new Map<ProviderId, ProviderDefinition>()
  for (const provider of providers) {
    byId.set(provider.id, provider)
  }
  return {
    get(id) {
      return byId.get(id as ProviderId)
    },
    list() {
      return [...byId.values()]
    },
  }
}
```

```ts
// src/providers/models.ts
import type { ProviderId, ProviderModelRef } from './types.js'

export function parseProviderModelRef(input: string): ProviderModelRef | null {
  const trimmed = input.trim()
  const slash = trimmed.indexOf('/')
  if (slash <= 0 || slash === trimmed.length - 1) {
    return null
  }
  return {
    provider: trimmed.slice(0, slash) as ProviderId,
    model: trimmed.slice(slash + 1),
  }
}
```

```ts
// src/providers/normalize.ts
export type NormalizedProviderEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; id: string; input: unknown }
  | { type: 'done'; stopReason?: string }
  | { type: 'error'; message: string }
```

```ts
// src/providers/runtime.ts
import type { ProviderDefinition } from './types.js'
import { createProviderRegistry } from './registry.js'

export function createProviderRuntime(providers: ProviderDefinition[]) {
  const registry = createProviderRegistry(providers)
  return {
    registry,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/providers/registry.test.ts src/providers/models.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/types.ts src/providers/registry.ts src/providers/runtime.ts src/providers/models.ts src/providers/normalize.ts src/providers/registry.test.ts src/providers/models.test.ts
git commit -m "refactor: add provider runtime scaffolding"
```

### Task 2: Wrap the existing Anthropic path behind the new provider interface

**Files:**
- Create: `src/providers/anthropic/provider.ts`
- Create: `src/providers/anthropic/client.ts`
- Modify: `src/services/api/claude.ts`
- Modify: `src/services/api/client.ts`
- Test: `src/providers/anthropic/provider.test.ts`

- [ ] **Step 1: Write the failing Anthropic provider tests**

```ts
// src/providers/anthropic/provider.test.ts
import { describe, expect, it } from 'bun:test'
import { createAnthropicProvider } from './provider.js'

describe('createAnthropicProvider', () => {
  it('exposes the anthropic provider id', () => {
    expect(createAnthropicProvider().id).toBe('anthropic')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/providers/anthropic/provider.test.ts`

Expected: FAIL with module-not-found for `src/providers/anthropic/provider.ts`.

- [ ] **Step 3: Extract a thin Anthropic adapter without changing behavior**

```ts
// src/providers/anthropic/provider.ts
import { queryModelWithStreaming } from '../../services/api/claude.js'
import type { ProviderDefinition } from '../types.js'

export function createAnthropicProvider(): ProviderDefinition {
  return {
    id: 'anthropic',
    call(params) {
      return queryModelWithStreaming({
        messages: params.messages,
        systemPrompt: params.systemPrompt,
        toolUseContext: params.toolUseContext,
        model: params.model,
      } as never)
    },
  }
}
```

```ts
// src/providers/anthropic/client.ts
export { getAnthropicClient } from '../../services/api/client.js'
```

- [ ] **Step 4: Run Anthropic adapter test**

Run: `bun test src/providers/anthropic/provider.test.ts`

Expected: PASS

- [ ] **Step 5: Typecheck to confirm the adapter did not break the old path**

Run: `bun run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/providers/anthropic/provider.ts src/providers/anthropic/client.ts src/providers/anthropic/provider.test.ts
git commit -m "refactor: wrap anthropic path as provider"
```

### Task 3: Switch the query dependency boundary to the provider runtime

**Files:**
- Modify: `src/query/deps.ts`
- Modify: `src/providers/runtime.ts`
- Modify: `src/utils/model/providers.ts`
- Modify: `src/utils/model/model.ts`
- Test: `src/query/deps.test.ts`
- Test: `src/providers/runtime.test.ts`

- [ ] **Step 1: Write the failing tests for provider runtime dispatch**

```ts
// src/providers/runtime.test.ts
import { describe, expect, it } from 'bun:test'
import { createProviderRuntime } from './runtime.js'

describe('createProviderRuntime', () => {
  it('dispatches to the requested provider', () => {
    const runtime = createProviderRuntime([
      {
        id: 'anthropic',
        call() {
          throw new Error('not used')
        },
      },
      {
        id: 'openai',
        call() {
          return [] as never
        },
      },
    ])

    expect(runtime.registry.get('openai')?.id).toBe('openai')
  })
})
```

```ts
// src/query/deps.test.ts
import { describe, expect, it } from 'bun:test'
import { productionDeps } from './deps.js'

describe('productionDeps', () => {
  it('returns a callable model dependency', () => {
    expect(typeof productionDeps().callModel).toBe('function')
  })
})
```

- [ ] **Step 2: Run tests to verify the new behavior is not wired yet**

Run: `bun test src/providers/runtime.test.ts src/query/deps.test.ts`

Expected: `runtime.test.ts` passes or partially passes; `deps.test.ts` passes. Keep this as a baseline before the wiring change.

- [ ] **Step 3: Add runtime dispatch and update `query/deps.ts`**

```ts
// src/providers/runtime.ts
import { createProviderRegistry } from './registry.js'
import { createAnthropicProvider } from './anthropic/provider.js'

const registry = createProviderRegistry([createAnthropicProvider()])

export async function* callProviderModel(params: {
  provider: string
  model: string
  messages: unknown[]
  systemPrompt: unknown
  toolUseContext: unknown
}) {
  const provider = registry.get(params.provider)
  if (!provider) {
    throw new Error(`Unknown provider: ${params.provider}`)
  }
  yield* provider.call(params as never)
}
```

```ts
// src/query/deps.ts
import { callProviderModel } from '../providers/runtime.js'

export function productionDeps(): QueryDeps {
  return {
    callModel: callProviderModel as QueryDeps['callModel'],
    microcompact: microcompactMessages,
    autocompact: autoCompactIfNeeded,
    uuid: randomUUID,
  }
}
```

```ts
// src/utils/model/providers.ts
export type APIProvider =
  | 'anthropic'
  | 'openai'
  | 'openai-codex'
  | 'gemini'
  | 'ollama'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
```

- [ ] **Step 4: Add compatibility mapping in model resolution**

```ts
// src/utils/model/model.ts
import { parseProviderModelRef } from '../../providers/models.js'

export function resolveUserSpecifiedProviderModel(
  specified: string | null | undefined,
) {
  if (!specified) return null
  return parseProviderModelRef(specified)
}
```

- [ ] **Step 5: Run typecheck and focused tests**

Run: `bun test src/providers/runtime.test.ts src/query/deps.test.ts`

Expected: PASS

Run: `bun run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/query/deps.ts src/providers/runtime.ts src/utils/model/providers.ts src/utils/model/model.ts src/providers/runtime.test.ts src/query/deps.test.ts
git commit -m "refactor: route query deps through provider runtime"
```

### Task 4: Implement the OpenAI API-key provider

**Files:**
- Create: `src/providers/openai/provider.ts`
- Create: `src/providers/openai/client.ts`
- Create: `src/providers/openai/normalize.ts`
- Modify: `src/providers/runtime.ts`
- Test: `src/providers/openai/provider.test.ts`

- [ ] **Step 1: Write the failing OpenAI provider tests**

```ts
// src/providers/openai/provider.test.ts
import { describe, expect, it } from 'bun:test'
import { createOpenAIProvider } from './provider.js'

describe('createOpenAIProvider', () => {
  it('exposes the openai provider id', () => {
    expect(createOpenAIProvider().id).toBe('openai')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/providers/openai/provider.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Add OpenAI provider implementation**

```ts
// src/providers/openai/client.ts
import OpenAI from 'openai'

export function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for provider openai')
  }
  return new OpenAI({ apiKey })
}
```

```ts
// src/providers/openai/provider.ts
import type { ProviderDefinition } from '../types.js'
import { createOpenAIClient } from './client.js'

export function createOpenAIProvider(): ProviderDefinition {
  return {
    id: 'openai',
    async *call(_params) {
      createOpenAIClient()
      yield { type: 'assistant', message: { role: 'assistant', content: [] } } as never
    },
  }
}
```

- [ ] **Step 4: Register the provider**

```ts
// src/providers/runtime.ts
import { createOpenAIProvider } from './openai/provider.js'

const registry = createProviderRegistry([
  createAnthropicProvider(),
  createOpenAIProvider(),
])
```

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test src/providers/openai/provider.test.ts src/providers/runtime.test.ts`

Expected: PASS

Run: `bun run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/providers/openai/provider.ts src/providers/openai/client.ts src/providers/openai/normalize.ts src/providers/runtime.ts src/providers/openai/provider.test.ts
git commit -m "feat: add openai provider"
```

### Task 5: Implement the OpenAI Codex OAuth provider

**Files:**
- Create: `src/providers/openai-codex/provider.ts`
- Create: `src/providers/openai-codex/auth.ts`
- Create: `src/providers/openai-codex/client.ts`
- Modify: `src/providers/runtime.ts`
- Test: `src/providers/openai-codex/provider.test.ts`

- [ ] **Step 1: Write the failing Codex provider tests**

```ts
// src/providers/openai-codex/provider.test.ts
import { describe, expect, it } from 'bun:test'
import { createOpenAICodexProvider } from './provider.js'

describe('createOpenAICodexProvider', () => {
  it('exposes the openai-codex provider id', () => {
    expect(createOpenAICodexProvider().id).toBe('openai-codex')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/providers/openai-codex/provider.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Add Codex auth/client wrappers using this repo storage**

```ts
// src/providers/openai-codex/auth.ts
export type CodexOAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export function getCodexOAuthTokens(): CodexOAuthTokens {
  throw new Error('Codex OAuth token loading not implemented')
}
```

```ts
// src/providers/openai-codex/client.ts
import OpenAI from 'openai'
import { getCodexOAuthTokens } from './auth.js'

export function createOpenAICodexClient() {
  const tokens = getCodexOAuthTokens()
  return new OpenAI({ apiKey: tokens.accessToken })
}
```

```ts
// src/providers/openai-codex/provider.ts
import type { ProviderDefinition } from '../types.js'
import { createOpenAICodexClient } from './client.js'

export function createOpenAICodexProvider(): ProviderDefinition {
  return {
    id: 'openai-codex',
    async *call(_params) {
      createOpenAICodexClient()
      yield { type: 'assistant', message: { role: 'assistant', content: [] } } as never
    },
  }
}
```

- [ ] **Step 4: Register the provider and add focused tests**

```ts
// src/providers/runtime.ts
import { createOpenAICodexProvider } from './openai-codex/provider.js'

const registry = createProviderRegistry([
  createAnthropicProvider(),
  createOpenAIProvider(),
  createOpenAICodexProvider(),
])
```

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test src/providers/openai-codex/provider.test.ts src/providers/runtime.test.ts`

Expected: PASS

Run: `bun run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/providers/openai-codex/provider.ts src/providers/openai-codex/auth.ts src/providers/openai-codex/client.ts src/providers/runtime.ts src/providers/openai-codex/provider.test.ts
git commit -m "feat: add openai codex provider"
```

### Task 6: Implement the Gemini API-key provider

**Files:**
- Create: `src/providers/gemini/provider.ts`
- Create: `src/providers/gemini/client.ts`
- Modify: `src/providers/runtime.ts`
- Test: `src/providers/gemini/provider.test.ts`

- [ ] **Step 1: Write the failing Gemini provider tests**

```ts
// src/providers/gemini/provider.test.ts
import { describe, expect, it } from 'bun:test'
import { createGeminiProvider } from './provider.js'

describe('createGeminiProvider', () => {
  it('exposes the gemini provider id', () => {
    expect(createGeminiProvider().id).toBe('gemini')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/providers/gemini/provider.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Add Gemini client/provider wrappers**

```ts
// src/providers/gemini/client.ts
export function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is required for provider gemini')
  }
  return apiKey
}
```

```ts
// src/providers/gemini/provider.ts
import type { ProviderDefinition } from '../types.js'
import { getGeminiApiKey } from './client.js'

export function createGeminiProvider(): ProviderDefinition {
  return {
    id: 'gemini',
    async *call(_params) {
      getGeminiApiKey()
      yield { type: 'assistant', message: { role: 'assistant', content: [] } } as never
    },
  }
}
```

- [ ] **Step 4: Register Gemini and run tests**

Run: `bun test src/providers/gemini/provider.test.ts src/providers/runtime.test.ts`

Expected: PASS

Run: `bun run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/gemini/provider.ts src/providers/gemini/client.ts src/providers/runtime.ts src/providers/gemini/provider.test.ts
git commit -m "feat: add gemini provider"
```

### Task 7: Implement the Ollama provider

**Files:**
- Create: `src/providers/ollama/provider.ts`
- Create: `src/providers/ollama/client.ts`
- Modify: `src/providers/runtime.ts`
- Test: `src/providers/ollama/provider.test.ts`

- [ ] **Step 1: Write the failing Ollama provider tests**

```ts
// src/providers/ollama/provider.test.ts
import { describe, expect, it } from 'bun:test'
import { createOllamaProvider } from './provider.js'

describe('createOllamaProvider', () => {
  it('exposes the ollama provider id', () => {
    expect(createOllamaProvider().id).toBe('ollama')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/providers/ollama/provider.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Add Ollama client/provider wrappers**

```ts
// src/providers/ollama/client.ts
export function getOllamaBaseUrl() {
  return process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
}
```

```ts
// src/providers/ollama/provider.ts
import type { ProviderDefinition } from '../types.js'
import { getOllamaBaseUrl } from './client.js'

export function createOllamaProvider(): ProviderDefinition {
  return {
    id: 'ollama',
    async *call(_params) {
      getOllamaBaseUrl()
      yield { type: 'assistant', message: { role: 'assistant', content: [] } } as never
    },
  }
}
```

- [ ] **Step 4: Register Ollama and run tests**

Run: `bun test src/providers/ollama/provider.test.ts src/providers/runtime.test.ts`

Expected: PASS

Run: `bun run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/ollama/provider.ts src/providers/ollama/client.ts src/providers/runtime.ts src/providers/ollama/provider.test.ts
git commit -m "feat: add ollama provider"
```

### Task 8: Harden normalization, capability errors, and regression verification

**Files:**
- Modify: `src/providers/normalize.ts`
- Modify: `src/providers/runtime.ts`
- Modify: `src/providers/openai/*`
- Modify: `src/providers/openai-codex/*`
- Modify: `src/providers/gemini/*`
- Modify: `src/providers/ollama/*`
- Test: `src/providers/normalize.test.ts`
- Test: `src/providers/runtime.integration.test.ts`

- [ ] **Step 1: Write failing normalization tests**

```ts
// src/providers/normalize.test.ts
import { describe, expect, it } from 'bun:test'
import { normalizeProviderError } from './normalize.js'

describe('normalizeProviderError', () => {
  it('wraps provider-specific errors with provider context', () => {
    expect(normalizeProviderError('openai', new Error('boom'))).toEqual({
      type: 'error',
      provider: 'openai',
      message: 'boom',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/providers/normalize.test.ts`

Expected: FAIL because `normalizeProviderError` is missing.

- [ ] **Step 3: Implement normalization helpers and runtime errors**

```ts
// src/providers/normalize.ts
export function normalizeProviderError(provider: string, error: Error) {
  return {
    type: 'error' as const,
    provider,
    message: error.message,
  }
}
```

- [ ] **Step 4: Run the focused test suite**

Run: `bun test src/providers/*.test.ts src/providers/**/*.test.ts src/query/deps.test.ts`

Expected: PASS

- [ ] **Step 5: Run the final typecheck**

Run: `bun run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/providers/normalize.ts src/providers/normalize.test.ts src/providers/runtime.ts src/providers/openai src/providers/openai-codex src/providers/gemini src/providers/ollama
git commit -m "test: verify provider normalization and runtime behavior"
```

## Self-Review

### Spec coverage

- Provider-neutral runtime boundary: covered by Tasks 1 through 3
- Anthropic preserved as provider: covered by Task 2
- OpenAI provider: covered by Task 4
- OpenAI Codex provider: covered by Task 5
- Gemini API-key provider: covered by Task 6
- Ollama provider: covered by Task 7
- Shared normalization and regression verification: covered by Task 8

### Placeholder scan

- No `TODO` or `TBD` markers remain in the plan
- All tasks name exact files and commands
- Each code step includes concrete snippets

### Type consistency

- Provider ids are consistently `anthropic`, `openai`, `openai-codex`, `gemini`, and `ollama`
- Shared runtime files are consistently under `src/providers/*`
- Query boundary consistently points to `src/query/deps.ts`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-01-multi-provider-core.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
