import { useEffect } from 'react'
import {
  drainRemoteControlPlaneCommands,
  drainStoreControlPlaneCommands,
} from '../controlPlane/queueBridge.js'
import { getActiveControlPlaneServer } from '../controlPlane/manager.js'
import { enqueue } from '../utils/messageQueueManager.js'

export async function drainControlPlaneCommands(
  onSubmitMessage: (content: string) => boolean,
): Promise<number> {
  const server = getActiveControlPlaneServer()
  if (!server) {
    return 0
  }

  const enqueuePrompt = (text: string) => {
    enqueue({
      mode: 'prompt',
      value: text,
      priority: 'next',
    })
  }

  if ('store' in server && server.store) {
    return drainStoreControlPlaneCommands(
      server.store,
      onSubmitMessage,
      enqueuePrompt,
    )
  }

  return await drainRemoteControlPlaneCommands(
    server.url,
    onSubmitMessage,
    enqueuePrompt,
  )
}

type Props = {
  isLoading: boolean
  onSubmitMessage: (content: string) => boolean
}

export function useControlPlaneBridge({
  isLoading,
  onSubmitMessage,
}: Props): void {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const poll = () => {
      if (cancelled) {
        return
      }
      if (isLoading) {
        timeout = setTimeout(poll, 1500)
        return
      }
      void drainControlPlaneCommands(onSubmitMessage)
        .catch(() => {
          // The control-plane is optional. Ignore transient polling errors.
        })
        .finally(() => {
          if (!cancelled) {
            timeout = setTimeout(poll, 1500)
          }
        })
    }

    poll()

    return () => {
      cancelled = true
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }, [isLoading, onSubmitMessage])
}
