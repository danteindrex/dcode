import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_CLOUD_ENVIRONMENT_KIND,
  DEFAULT_CLOUD_ENVIRONMENT_TYPE,
  buildDefaultCloudEnvironmentPayload,
} from './environments.js'

describe('buildDefaultCloudEnvironmentPayload', () => {
  test('preserves the existing default cloud environment contract', () => {
    expect(
      buildDefaultCloudEnvironmentPayload(
        'Default',
        'Default - trusted network access',
      ),
    ).toEqual({
      name: 'Default',
      kind: DEFAULT_CLOUD_ENVIRONMENT_KIND,
      description: 'Default - trusted network access',
      config: {
        environment_type: DEFAULT_CLOUD_ENVIRONMENT_TYPE,
        cwd: '/home/user',
        init_script: null,
        environment: {},
        languages: [
          { name: 'python', version: '3.11' },
          { name: 'node', version: '20' },
        ],
        network_config: {
          allowed_hosts: [],
          allow_default_hosts: true,
        },
      },
    })
  })
})
