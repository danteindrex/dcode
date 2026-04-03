import type { LocalJSXCommandCall } from '../../types/command.js'
import { openBrowser } from '../../utils/browser.js'
import { getHostedControlPlaneUrl } from '../../services/backend/targets.js'
import {
  ensureControlPlaneServer,
  getActiveControlPlaneServer,
  stopControlPlaneServer,
} from '../../controlPlane/manager.js'

export const WEBAPP_CONTROL_USAGE =
  'Usage: /webapp-control [start|open|stop|status]\nDefault: start'

export function isWebappControlAction(value: string): boolean {
  return ['start', 'open', 'stop', 'status'].includes(value)
}

export async function runWebappControlAction(action: string): Promise<string> {
  const hostedUrl = getHostedControlPlaneUrl()
  if (hostedUrl) {
    if (action === 'stop') {
      return 'Hosted control-plane web app is managed remotely'
    }

    if (action === 'status') {
      return `Hosted control-plane web app running at ${hostedUrl}`
    }

    if (action === 'open' || action === 'start') {
      await openBrowser(hostedUrl)
      return `Hosted control-plane web app available at ${hostedUrl}`
    }
  }

  if (action === 'stop') {
    const stopped = await stopControlPlaneServer()
    return stopped
      ? 'Local control-plane web app stopped'
      : 'Local control-plane web app is not running'
  }

  if (action === 'status') {
    const current = getActiveControlPlaneServer()
    return current
      ? `Local control-plane web app running at ${current.url}`
      : 'Local control-plane web app is not running'
  }

  const server = await ensureControlPlaneServer({
    openOnStart: action === 'start',
  })

  if (action === 'open') {
    await openBrowser(server.url)
  }

  return `Local control-plane web app available at ${server.url}`
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const action = (args || 'start').trim() || 'start'

  if (!isWebappControlAction(action)) {
    onDone(WEBAPP_CONTROL_USAGE, { display: 'system' })
    return
  }

  onDone(await runWebappControlAction(action), { display: 'system' })
}
