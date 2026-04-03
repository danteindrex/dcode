import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, test } from 'bun:test'
import webappControl from './index.js'

describe('webapp-control command', () => {
  test('registers as a built-in command', () => {
    const commandsSource = readFileSync(
      join(process.cwd(), 'src', 'commands.ts'),
      'utf8',
    )
    const mainSource = readFileSync(
      join(process.cwd(), 'src', 'main.tsx'),
      'utf8',
    )

    expect(webappControl.name).toBe('webapp-control')
    expect(commandsSource).toContain(
      "import webappControl from './commands/webapp-control/index.js'",
    )
    expect(commandsSource).toContain('webappControl,')
    expect(mainSource).toContain("program.command('webapp-control [action]')")
    expect(mainSource).toContain("program.command('webapp-control-server'")
    expect(mainSource).toContain("./hostedControlPlane/channel.js")
    expect(readFileSync(
      join(process.cwd(), 'src', 'commands', 'webapp-control', 'webapp-control.tsx'),
      'utf8',
    )).toContain('getHostedControlPlaneUrl')
  })
})
