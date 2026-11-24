/**
 * Access: OPEN (decision 2026-11-23). There is no sign-in and no app permission; every page and data
 * route is readable by anyone who can reach the server. What remains is a network guard: by default
 * the server answers only loopback peers with a loopback Host header (this also blocks DNS rebinding,
 * so other websites open in the same browser cannot read the map).
 */
import type { Request, RequestHandler } from 'express';
import type { ServerConfig } from './config.ts';

export function isLoopbackRequest(req: Request): boolean {
  const ip = req.socket.remoteAddress ?? '';
  const ipOk = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const hostHeader = (req.headers.host ?? '').toLowerCase();
  const hostname = hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0];
  const hostOk = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  return ipOk && hostOk;
}

export function loopbackGuard(cfg: ServerConfig): RequestHandler {
  return (req, res, next) => {
    if (cfg.loopbackOnly && !isLoopbackRequest(req)) {
      res.status(403).type('text/plain').send('Forbidden: this map is served to this machine only.');
      return;
    }
    next();
  };
}
