import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'webapp-control',
  description: 'Start or manage the local control-plane web app',
  immediate: true,
  load: () => import('./webapp-control.js'),
} satisfies Command
