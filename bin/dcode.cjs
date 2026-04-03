#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

function resolveBunCommand() {
  if (process.env.BUN_BINARY && process.env.BUN_BINARY.trim()) {
    return process.env.BUN_BINARY.trim();
  }

  if (process.env.BUN_INSTALL && process.env.BUN_INSTALL.trim()) {
    return path.join(process.env.BUN_INSTALL.trim(), 'bin', 'bun.exe');
  }

  const defaultWindowsBun = 'C:\\Users\\user\\.bun\\bin\\bun.exe';
  return defaultWindowsBun;
}

function resolveSpawnArgs(bun, cliPath, argv) {
  if (bun.toLowerCase().endsWith('.exe')) {
    return [bun, [cliPath, ...argv]];
  }

  return [bun, [cliPath, ...argv]];
}

const bun = resolveBunCommand();
const cliPath = path.resolve(__dirname, '..', 'dist', 'cli.js');
const [command, args] = resolveSpawnArgs(bun, cliPath, process.argv.slice(2));
const result = spawnSync(command, args, {
  stdio: 'inherit',
  windowsHide: false,
});

if (result.error) {
  console.error(`Failed to start dcode via ${bun}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
