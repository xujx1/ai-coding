import * as path from 'path';

export interface ServerConfig {
  port: number;
  host: string;
  runtimeDir: string;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 3000,
  host: '0.0.0.0',
  runtimeDir: path.resolve(process.cwd(), 'runtime-projects'),
};

export function loadServerEnv(env: NodeJS.ProcessEnv = process.env): Partial<ServerConfig> {
  const config: Partial<ServerConfig> = {};
  if (env.PORT) config.port = parseInt(env.PORT, 10);
  if (env.HOST) config.host = env.HOST;
  if (env.RUNTIME_DIR) config.runtimeDir = path.resolve(env.RUNTIME_DIR);
  return config;
}
