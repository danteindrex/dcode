import React, { useEffect, useRef, useState } from 'react'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Spinner } from '../../components/Spinner.js'
import TextInput from '../../components/TextInput.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Link, Text } from '../../ink.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { loginWithOpenAICodexOAuth } from '../../providers/openai-codex/oauth.js'

type FlowState =
  | { type: 'starting' }
  | { type: 'waiting'; url: string; browserOpened?: boolean }
  | { type: 'success'; email?: string }
  | { type: 'error'; message: string }

function createAbortError(message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export function LoginOpenAICodexDialog({
  context,
  onDone,
}: {
  context: LocalJSXCommandContext
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const [flowState, setFlowState] = useState<FlowState>({ type: 'starting' })
  const [manualInput, setManualInput] = useState('')
  const [cursorOffset, setCursorOffset] = useState(0)
  const manualResolverRef = useRef<((value: string) => void) | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const cancelLogin = (message: string) => {
    abortControllerRef.current?.abort(createAbortError(message))
    manualResolverRef.current = null
    onDone(message)
  }

  useEffect(() => {
    let cancelled = false
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    void loginWithOpenAICodexOAuth({
      signal: abortController.signal,
      manualCodeInput: () =>
        new Promise<string>((resolve, reject) => {
          manualResolverRef.current = resolve
          const abortHandler = () => {
            manualResolverRef.current = null
            reject(
              createAbortError('OpenAI Codex OAuth login cancelled.'),
            )
          }
          abortController.signal.addEventListener('abort', abortHandler, {
            once: true,
          })
          const resolver = (value: string) => {
            abortController.signal.removeEventListener('abort', abortHandler)
            resolve(value)
          }
          manualResolverRef.current = resolver
        }),
      onAuthorizeUrl: url => {
        if (!cancelled) {
          setFlowState(current =>
            current.type === 'waiting'
              ? { ...current, url }
              : { type: 'waiting', url },
          )
        }
      },
      onBrowserOpenResult: opened => {
        if (!cancelled) {
          setFlowState(current =>
            current.type === 'waiting'
              ? { ...current, browserOpened: opened }
              : current,
          )
        }
      },
    })
      .then(result => {
        if (cancelled) {
          return
        }
        context.onChangeAPIKey()
        setFlowState({ type: 'success', email: result.email })
        setTimeout(() => {
          onDone(
            result.email
              ? `OpenAI Codex login successful (${result.email})`
              : 'OpenAI Codex login successful',
          )
        }, 0)
      })
      .catch(error => {
        if (
          !cancelled &&
          !(error instanceof Error && error.name === 'AbortError')
        ) {
          setFlowState({
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
          })
        }
      })

    return () => {
      cancelled = true
      abortController.abort(createAbortError('OpenAI Codex OAuth login cancelled.'))
      abortControllerRef.current = null
      manualResolverRef.current = null
    }
  }, [context, onDone])

  return (
    <Dialog
      title="OpenAI Codex Login"
      onCancel={() => cancelLogin('OpenAI Codex login cancelled')}
      color="permission"
      inputGuide={exitState =>
        exitState.pending ? (
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
    >
      <Box flexDirection="column" gap={1}>
        {flowState.type === 'starting' ? (
          <Box>
            <Spinner />
            <Text>Starting OpenAI Codex OAuth…</Text>
          </Box>
        ) : null}

        {flowState.type === 'waiting' ? (
          <>
            <Text>
              Complete sign-in in your browser. If the callback cannot reach this
              CLI, paste the full redirect URL or authorization code below.
            </Text>
            {flowState.browserOpened === false ? (
              <Text dimColor>
                Browser launch did not complete automatically. Open the link
                below manually to continue.
              </Text>
            ) : null}
            <Link url={flowState.url}>
              <Text dimColor>{flowState.url}</Text>
            </Link>
            <Box>
              <Text>Paste redirect URL or code &gt; </Text>
              <TextInput
                value={manualInput}
                onChange={setManualInput}
                onChangeCursorOffset={setCursorOffset}
                cursorOffset={cursorOffset}
                onSubmit={value => {
                  const resolver = manualResolverRef.current
                  if (!resolver) {
                    return
                  }
                  manualResolverRef.current = null
                  resolver(value)
                  setManualInput('')
                  setCursorOffset(0)
                }}
              />
            </Box>
          </>
        ) : null}

        {flowState.type === 'success' ? (
          <Text color="success">
            OpenAI Codex login successful
            {flowState.email ? `: ${flowState.email}` : ''}
          </Text>
        ) : null}

        {flowState.type === 'error' ? (
          <Text color="error">{flowState.message}</Text>
        ) : null}
      </Box>
    </Dialog>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  _args?: string,
): Promise<React.ReactNode> {
  return <LoginOpenAICodexDialog context={context} onDone={onDone} />
}
