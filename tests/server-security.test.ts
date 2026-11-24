/**
 * Server boundary with OPEN access (decision 2026-11-23: no sign-in, no app permission).
 * What must still hold: private files are never served, the server answers this machine only unless the
 * operator explicitly opts in, other websites cannot read it through DNS rebinding, and no login surface remains.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.ts';
import { ConfigError, loadConfig, type ServerConfig } from '../server/config.ts';
import { importFixture } from './fixture.ts';
import type { DataState } from '../server/data.ts';

const dataset = importFixture().dataset;
const data: DataState = { ok: true, dataset, body: JSON.stringify(dataset), missingMappingLinks: [] };
const cfg = (over: Partial<ServerConfig> = {}): ServerConfig => ({ env: 'test', host: '127.0.0.1', port: 0, loopbackOnly: true, dataDir: 'unused', ...over });
const app = createApp({ config: cfg(), data });

describe('open access on this machine', () => {
  it('the snapshot loads without any sign-in, with no-store caching', async () => {
    const r = await request(app).get('/api/snapshot').set('Host', 'localhost');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.integrations.length).toBe(dataset.integrations.length);
  });
  it('the snapshot never contains withheld secrets', async () => {
    const r = await request(app).get('/api/snapshot').set('Host', 'localhost');
    expect(r.text).not.toMatch(/hunter2|CONFIDENTIAL|eyJhbGciOiJIUzI1NiJ9/);
  });
  it('no login, session or raw JSON export surface remains', async () => {
    for (const [method, path] of [['get', '/api/session'], ['get', '/api/export/snapshot.json'], ['post', '/auth/dev-login'], ['post', '/auth/logout']] as const) {
      const r = await request(app)[method](path).set('Host', 'localhost');
      expect(r.status).toBe(404);
      expect(r.text).not.toContain('PROV');
    }
  });
  it('an unavailable snapshot is a recoverable 503, not a crash', async () => {
    const broken = createApp({ config: cfg(), data: { ok: false, error: 'invalid', issues: [] } as unknown as DataState });
    expect((await request(broken).get('/api/snapshot').set('Host', 'localhost')).status).toBe(503);
  });
});

describe('network guard (no sign-in, so the map stays on this machine by default)', () => {
  it('a non-loopback Host header (DNS rebinding / public URL) is refused for every route', async () => {
    for (const path of ['/', '/api/snapshot', '/api/health']) {
      const r = await request(app).get(path).set('Host', 'integration-map.example.com');
      expect(r.status).toBe(403);
      expect(r.text).not.toContain('PROV');
    }
  });
  it('configuration refuses network or hosted serving unless explicitly opted in', () => {
    expect(() => loadConfig({ HOST: '0.0.0.0' })).toThrow(ConfigError);
    expect(() => loadConfig({ REPL_ID: 'x' })).toThrow(/hosted/);
    expect(loadConfig({}).loopbackOnly).toBe(true);
    expect(loadConfig({ HOST: '0.0.0.0', OPEN_ACCESS_NETWORK: '1' }).loopbackOnly).toBe(false);
  });
  it('with the explicit network opt-in, other hosts are served', async () => {
    const net = createApp({ config: cfg({ host: '0.0.0.0', loopbackOnly: false }), data });
    expect((await request(net).get('/api/health').set('Host', 'map.internal.example')).status).toBe(200);
  });
});

describe('private files are never served (acceptance 13)', () => {
  const paths = [
    '/docs/ASAKIN-INTEGRATION-AUDIT.zip', '/docs/CONFIDENTIAL-risk-triage.md', '/data/private/canonical/systems.json',
    '/data/private/candidate/integrations.json', '/data/private/reviewed/decisions.json', '/../docs/CONFIDENTIAL-risk-triage.md', '/%2e%2e/docs/x.zip',
    '/@fs/C:/anything/docs/CONFIDENTIAL-risk-triage.md', '/server/app.ts', '/scripts/import.ts', '/.env', '/README.md', '/x.csv', '/design/Main.dc.html',
  ];
  for (const p of paths) {
    it(`${p} -> 404`, async () => {
      const r = await request(app).get(p).set('Host', 'localhost');
      expect([403, 404]).toContain(r.status);
      expect(r.text).not.toMatch(/D-07|risk triage|consolidated/i);
    });
  }
  it('unknown API paths do not fall through', async () => {
    const r = await request(app).get('/api/../docs/x.zip').set('Host', 'localhost');
    expect([403, 404]).toContain(r.status);
  });
});
