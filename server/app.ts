import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loopbackGuard } from './auth.ts';
import { ROOT, type ServerConfig } from './config.ts';
import { loadCanonical, type DataState } from './data.ts';

/**
 * Paths that must never be served, whatever serves static files (Vite dev or dist):
 * private data, raw archive, docs (incl. confidential file), sources, Vite's /@fs escape hatch.
 */
export const BLOCKED_PATH = /(?:^|\/)(?:data|docs|design|scripts|server|tests|e2e|\.git|\.env[^/]*)(?:\/|$)|\.\.|CONFIDENTIAL|\.(?:zip|md|csv|map)(?:$|\?)/i;

/** Vite dev serves files outside its root via /@fs/<abs path>; only these prefixes are allowed. */
const FS_ALLOWED = ['src/client', 'shared', 'node_modules'].map((p) => join(ROOT, p).replace(/\\/g, '/').toLowerCase());

export const blockPrivatePaths: RequestHandler = (req, res, next) => {
  const path = decodeURIComponentSafe(req.path);
  if (path.startsWith('/api/')) return next();
  const fs = /\/@fs\/(.*)$/.exec(path);
  if (fs) {
    const abs = fs[1]!.replace(/\\/g, '/').replace(/^\/?/, '').toLowerCase();
    const ok = FS_ALLOWED.some((p) => abs.startsWith(p.replace(/^\//, ''))) && !BLOCKED_PATH.test(abs.slice(ROOT.length));
    if (!ok) { res.status(404).type('text/plain').send('Not found'); return; }
    return next();
  }
  if (BLOCKED_PATH.test(path) || BLOCKED_PATH.test(req.originalUrl.split('?')[0]!)) { res.status(404).type('text/plain').send('Not found'); return; }
  next();
};

function decodeURIComponentSafe(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

export type AppOptions = { config: ServerConfig; data?: DataState; serveClient?: 'dist' | 'none' };

export function createApp({ config, data, serveClient = 'none' }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  const state = data ?? loadCanonical(config.dataDir);

  app.use(helmet({
    contentSecurityPolicy: config.env === 'development' && serveClient === 'none' ? false : {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"], formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use(loopbackGuard(config));
  app.use(blockPrivatePaths);
  app.use(express.json({ limit: '4kb' }));

  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (_req, res) => { res.json({ ok: true }); }); // no data, no version details

  const requireData: RequestHandler = (_req, res, next) => {
    if (!state.ok) { res.status(503).json({ error: 'snapshot_unavailable', message: state.error, issues: state.issues }); return; }
    next();
  };
  // Open access (no sign-in): see server/auth.ts for the remaining network guard.
  app.get('/api/snapshot', requireData, (_req, res) => {
    if (!state.ok) return;
    res.type('application/json').send(state.body);
  });
  app.get('/api/review/missing-mapping-links', requireData, (_req, res) => {
    if (!state.ok) return;
    res.json(state.missingMappingLinks);
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'not_found' }); });

  if (serveClient === 'dist') {
    const dist = join(ROOT, 'dist', 'client');
    if (existsSync(dist)) {
      app.use(express.static(dist, { index: false, dotfiles: 'deny', fallthrough: true }));
      app.get(/^\/(?!api\/).*/, (_req, res) => { res.sendFile(join(dist, 'index.html')); });
    }
  }
  return app;
}
