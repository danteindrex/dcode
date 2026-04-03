import { feature } from 'bun:bundle'
import * as React from 'react'
import { resetCostState } from '../../bootstrap/state.js'
import {
  clearTrustedDeviceToken,
  enrollTrustedDevice,
} from '../../bridge/trustedDevice.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { ConsoleOAuthFlow } from '../../components/ConsoleOAuthFlow.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { Box, Text } from '../../ink.js'
import {
  LoginOpenAICodexDialog,
} from '../loginOpenAICodex/loginOpenAICodex.js'
import { getProviderIdForModel } from '../../providers/models.js'
import type { ProviderId } from '../../providers/types.js'
import { isProviderId } from '../../providers/types.js'
import { refreshGrowthBookAfterAuthChange } from '../../services/analytics/growthbook.js'
import { refreshPolicyLimits } from '../../services/policyLimits/index.js'
import { refreshRemoteManagedSettings } from '../../services/remoteManagedSettings/index.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { stripSignatureBlocks } from '../../utils/messages.js'
import {
  checkAndDisableAutoModeIfNeeded,
  checkAndDisableBypassPermissionsIfNeeded,
  resetAutoModeGateCheck,
  resetBypassPermissionsCheck,
} from '../../utils/permissions/bypassPermissionsKillswitch.js'
import { resetUserCache } from '../../utils/user.js'

type LoginResult = {
  success: boolean
  message: string
}

function parseRequestedProvider(
  args: string | undefined,
  activeModel: string,
): ProviderId {
  if (typeof args === 'string' && args.trim().length > 0) {
    const requested = args.trim().split(/\s+/, 1)[0]
    if (isProviderId(requested)) {
      return requested
    }
    const parsed = getProviderIdForModel(requested)
    if (requested.includes('/') || parsed !== 'anthropic') {
      return parsed
    }
  }

  return getProviderIdForModel(activeModel)
}

function inputGuide(exitState: { pending: boolean; keyName: string }) {
  return exitState.pending ? (
    <Text>Press {exitState.keyName} again to exit</Text>
  ) : (
    <ConfigurableShortcutHint
      action="confirm:no"
      context="Confirmation"
      fallback="Esc"
      description="cancel"
    />
  )
}

function ProviderSetupDialog({
  providerId,
  onDone,
}: {
  providerId: Exclude<ProviderId, 'anthropic' | 'openai-codex'>
  onDone: (result: LoginResult) => void
}): React.ReactNode {
  const copy =
    providerId === 'openai'
      ? {
          title: 'OpenAI Setup',
          lines: [
            'OpenAI uses API-key configuration rather than browser login.',
            'Set OPENAI_API_KEY, then switch to an OpenAI model.',
            'Example: $env:OPENAI_API_KEY=\'...\'',
          ],
        }
      : providerId === 'gemini'
        ? {
            title: 'Gemini Setup',
            lines: [
              'Gemini uses API-key configuration rather than browser login.',
              'Set GEMINI_API_KEY or GOOGLE_API_KEY, then switch to a Gemini model.',
              'Example: $env:GEMINI_API_KEY=\'...\'',
            ],
          }
        : {
            title: 'Ollama Setup',
            lines: [
              'Ollama uses your local runtime rather than browser login.',
              'Start Ollama and ensure the target model is installed locally.',
              'Optional: set OLLAMA_HOST if your server is not at http://127.0.0.1:11434.',
            ],
          }

  return (
    <Dialog
      title={copy.title}
      onCancel={() =>
        onDone({
          success: false,
          message: `${copy.title} closed`,
        })
      }
      color="permission"
      inputGuide={inputGuide}
    >
      <Box flexDirection="column" gap={1}>
        {copy.lines.map(line => (
          <Text key={line}>{line}</Text>
        ))}
        <Text dimColor>
          Supported login targets: `/login anthropic`, `/login openai-codex`,
          `/login openai`, `/login gemini`, `/login ollama`
        </Text>
      </Box>
    </Dialog>
  )
}

function AnthropicLoginDialog({
  onDone,
}: {
  onDone: (result: LoginResult) => void
}): React.ReactNode {
  return (
    <Dialog
      title="Anthropic Login"
      onCancel={() =>
        onDone({
          success: false,
          message: 'Anthropic login interrupted',
        })
      }
      color="permission"
      inputGuide={inputGuide}
    >
      <ConsoleOAuthFlow
        onDone={() =>
          onDone({
            success: true,
            message: 'Anthropic login successful',
          })
        }
      />
    </Dialog>
  )
}

function LoginRouter({
  providerId,
  context,
  onDone,
}: {
  providerId: ProviderId
  context: LocalJSXCommandContext
  onDone: (result: LoginResult) => void
}): React.ReactNode {
  if (providerId === 'openai-codex') {
    return (
      <LoginOpenAICodexDialog
        context={context}
        onDone={message =>
          onDone({
            success: /successful/i.test(message),
            message,
          })
        }
      />
    )
  }

  if (providerId === 'anthropic') {
    return <AnthropicLoginDialog onDone={onDone} />
  }

  return <ProviderSetupDialog providerId={providerId} onDone={onDone} />
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<React.ReactNode> {
  return (
    <Login
      args={args}
      context={context}
      onDone={async result => {
        context.onChangeAPIKey()
        context.setMessages(stripSignatureBlocks)

        if (result.success) {
          resetCostState()
          void refreshRemoteManagedSettings()
          void refreshPolicyLimits()
          resetUserCache()
          refreshGrowthBookAfterAuthChange()
          clearTrustedDeviceToken()
          void enrollTrustedDevice()
          resetBypassPermissionsCheck()
          const appState = context.getAppState()
          void checkAndDisableBypassPermissionsIfNeeded(
            appState.toolPermissionContext,
            context.setAppState,
          )
          if (feature('TRANSCRIPT_CLASSIFIER')) {
            resetAutoModeGateCheck()
            void checkAndDisableAutoModeIfNeeded(
              appState.toolPermissionContext,
              context.setAppState,
              appState.fastMode,
            )
          }
          context.setAppState(prev => ({
            ...prev,
            authVersion: prev.authVersion + 1,
          }))
        }

        onDone(result.message)
      }}
    />
  )
}

export function Login(props: {
  args?: string
  context: LocalJSXCommandContext
  onDone: (result: LoginResult) => void
}): React.ReactNode {
  const mainLoopModel = useMainLoopModel()
  const providerId = parseRequestedProvider(props.args, mainLoopModel)

  return (
    <LoginRouter
      providerId={providerId}
      context={props.context}
      onDone={props.onDone}
    />
  )
}
