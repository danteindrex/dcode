import { describe, expect, test } from 'bun:test'
import {
  renderHostedControlPlaneCss,
  renderHostedControlPlaneHtml,
  renderHostedControlPlaneJs,
} from './webAssets.js'

describe('hosted control-plane web assets', () => {
  test('renders the hosted app shell', () => {
    const html = renderHostedControlPlaneHtml()

    expect(html).toContain('Hosted Remote Response Channel')
    expect(html).toContain('id="session-select"')
    expect(html).toContain('id="command-form"')
    expect(html).toContain('id="command-output"')
    expect(html).toContain('/api/sessions')
    expect(html).toContain('/api/sessions/:sessionId/commands')
    expect(html).toContain('/api/sessions/:sessionId/commands/:commandId')
    expect(html).toContain('/app.css')
    expect(html).toContain('/app.js')
  })

  test('renders companion css and javascript assets', () => {
    expect(renderHostedControlPlaneCss()).toContain('--accent')
    expect(renderHostedControlPlaneCss()).toContain('.command-form')
    expect(renderHostedControlPlaneJs()).toContain("getJson('/api/sessions')")
    expect(renderHostedControlPlaneJs()).toContain(
      "'/api/sessions/' + encodeURIComponent(sessionId) + '/commands'",
    )
    expect(renderHostedControlPlaneJs()).toContain(
      "'/api/sessions/' + encodeURIComponent(activeSessionId) + '/commands/' + encodeURIComponent(activeCommandId)",
    )
    expect(renderHostedControlPlaneJs()).toContain('setInterval(() => {')
    expect(renderHostedControlPlaneJs()).toContain('loadCommand()')
    expect(renderHostedControlPlaneJs()).toContain('commandOutput.textContent = JSON.stringify')
  })
})
