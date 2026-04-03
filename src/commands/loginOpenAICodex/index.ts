import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'login-openai-codex',
  description: 'Sign in to OpenAI Codex',
  load: () => import('./loginOpenAICodex.js'),
} satisfies Command
