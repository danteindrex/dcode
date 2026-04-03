import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import {
  CLAUDE_IN_CHROME_PRODUCT_NAME,
} from '../../utils/claudeInChrome/common.js'

const command: Command = {
  name: 'chrome',
  description: `${CLAUDE_IN_CHROME_PRODUCT_NAME} settings`,
  availability: ['claude-ai'],
  isEnabled: () => !getIsNonInteractiveSession(),
  type: 'local-jsx',
  load: () => import('./chrome.js'),
}

export default command
