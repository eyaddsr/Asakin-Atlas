/**
 * npm run dev   -> Express + Vite middleware (single port, loopback only)
 * npm run start -> Express serving the built client from dist/
 * Access is open (no sign-in); the server serves this machine only unless OPEN_ACCESS_NETWORK=1.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app.ts';
import { ConfigError, loadConfig, ROOT } from './config.ts';

async function main() {
  let config;
  try { config = loadConfig(); } catch (e) {
    if (e instanceof ConfigError) { console.log(`\n[refused to start] ${e.message}\n`); console.error(`[refused to start] ${e.message}`); process.exit(1); }
    throw e;
  }
  const useDist = process.argv.includes('--dist') || process.env.SERVE_DIST === '1' || process.env.npm_lifecycle_event === 'start';
  const app = createApp({ config, serveClient: useDist ? 'dist' : 'none' });

  if (!useDist) {
    const { createServer } = await import('vite');
    const vite = await createServer({ configFile: join(ROOT, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else if (!existsSync(join(ROOT, 'dist', 'client', 'index.html'))) {
    console.error('dist/client not built. Run npm run build first.');
    process.exit(1);
  }
  app.listen(config.port, config.host, () => {
    console.log(`Asakin Integration Map → http://${config.host === '::1' ? '[::1]' : config.host}:${config.port}  (access: open, no sign-in · ${config.loopbackOnly ? 'this machine only' : 'NETWORK (OPEN_ACCESS_NETWORK=1)'} · data: ${config.dataDir.replace(ROOT, '.')})`);
  });
}

void main();
