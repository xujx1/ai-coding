import type { PermissionsConfig } from './types.js';

export const DEFAULT_PERMISSIONS_CONFIG: PermissionsConfig = {
  defaultMode: 'default',
  maxOutputChars: 50000,
  dangerousCommands: [
    'rm -rf /', 'mkfs', 'dd if=', ':(){:|:&};:',
    'chmod -R 777 /', 'chown -R', '> /dev/sd',
    'curl | sh', 'wget | sh', 'eval',
    'sudo ', 'su ', 'reboot', 'shutdown',
    'kill -9 1', 'init 0', 'init 6',
  ],
};

export function loadPermissionsEnv(env: NodeJS.ProcessEnv = process.env): Partial<PermissionsConfig> {
  const config: Partial<PermissionsConfig> = {};
  const mode = env.PERMISSION_MODE;
  if (mode && ['plan', 'default', 'acceptEdits', 'dontAsk', 'locked'].includes(mode)) {
    config.defaultMode = mode as PermissionsConfig['defaultMode'];
  }
  return config;
}
