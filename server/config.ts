import { resolve } from 'node:path';

export type ServerConfig = {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  /** true unless the operator explicitly opted in to serving on a network interface */
  loopbackOnly: boolean;
  dataDir: string;
};

export const ROOT = resolve(import.meta.dirname, '..');
export const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export class ConfigError extends Error {}

/**
 * Open access (decision 2026-11-23: no sign-in, no app permission). Because anyone who can reach the
 * server can read the whole map, the server stays on this machine unless the operator explicitly sets
 * OPEN_ACCESS_NETWORK=1 to serve it on a network / hosted environment.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  const host = env.HOST ?? '127.0.0.1';
  const port = Number(env.PORT ?? 5317);
  const network = env.OPEN_ACCESS_NETWORK === '1';
  if (!network) {
    if (!LOOPBACK_HOSTS.has(host)) {
      throw new ConfigError(`The map has no sign-in, so it only serves this machine. HOST "${host}" is not a loopback address; set OPEN_ACCESS_NETWORK=1 to serve it on a network deliberately.`);
    }
    const hosted = ['REPL_ID', 'REPLIT_DEPLOYMENT', 'REPLIT_DEV_DOMAIN', 'VERCEL', 'RENDER', 'FLY_APP_NAME', 'K_SERVICE', 'CODESPACES']
      .filter((k) => env[k]);
    if (hosted.length) throw new ConfigError(`The map has no sign-in; refusing to start on a hosted/preview environment (${hosted.join(', ')} set) without OPEN_ACCESS_NETWORK=1.`);
  }
  return {
    env: nodeEnv, host, port, loopbackOnly: !network,
    dataDir: resolve(env.DATA_DIR ?? resolve(ROOT, 'data', 'private', 'canonical')),
  };
}
