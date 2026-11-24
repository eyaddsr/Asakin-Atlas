/**
 * Hash routing for the exploration journey (Atlas → Lens → Integration drawer → Impact).
 * Only opaque record ids appear in the URL; the hash is never sent to the server.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ChangeKind } from '@shared/atlas.ts';

export type View = 'atlas' | 'lens' | 'impact';
export type Tab = 'fields' | 'how' | 'evidence';
export type Route = {
  view: View;
  sys: string | null;
  change: ChangeKind;
  int: string | null;        // integration drawer
  unlinked: boolean;         // unlinked-mappings drawer for `sys`
  tab: Tab;
  map: string | null;        // highlighted field mapping
};

export const HOME: Route = { view: 'atlas', sys: null, change: 'outage', int: null, unlinked: false, tab: 'fields', map: null };

const ID = /^[a-z]{2,4}_[0-9a-f]{12}$/;
const okId = (s: string | undefined | null) => (s && ID.test(s) ? s : null);
const CHANGES: ChangeKind[] = ['outage', 'data', 'api'];
const TABS: Tab[] = ['fields', 'how', 'evidence'];

export function parseHash(hash: string): Route {
  const [path = '', qs = ''] = hash.replace(/^#/, '').split('?');
  const seg = path.split('/').filter(Boolean);
  const q = new URLSearchParams(qs);
  const r: Route = { ...HOME };
  if (seg[0] === 'system' && okId(seg[1])) { r.view = 'lens'; r.sys = seg[1]!; }
  else if (seg[0] === 'impact' && okId(seg[1])) {
    r.view = 'impact'; r.sys = seg[1]!;
    r.change = CHANGES.includes(seg[2] as ChangeKind) ? (seg[2] as ChangeKind) : 'outage';
  }
  r.int = okId(q.get('int'));
  r.unlinked = !r.int && q.get('unlinked') === '1' && !!r.sys;
  r.tab = TABS.includes(q.get('tab') as Tab) ? (q.get('tab') as Tab) : 'fields';
  r.map = okId(q.get('map'));
  return r;
}

export function formatHash(r: Route): string {
  let path = '/atlas';
  if (r.view === 'lens' && r.sys) path = `/system/${r.sys}`;
  else if (r.view === 'impact' && r.sys) path = `/impact/${r.sys}/${r.change}`;
  const q = new URLSearchParams();
  if (r.int) { q.set('int', r.int); if (r.tab !== 'fields') q.set('tab', r.tab); }
  else if (r.unlinked) q.set('unlinked', '1');
  if ((r.int || r.unlinked) && r.map) q.set('map', r.map);
  const s = q.toString();
  return `#${path}${s ? `?${s}` : ''}`;
}

export function useRoute(): [Route, (next: Partial<Route>, opts?: { replace?: boolean; reset?: boolean }) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on); };
  }, []);
  const go = useCallback((next: Partial<Route>, opts?: { replace?: boolean; reset?: boolean }) => {
    const cur = parseHash(window.location.hash);
    const hash = formatHash({ ...(opts?.reset ? HOME : cur), ...next });
    if (hash !== window.location.hash) {
      if (opts?.replace) window.history.replaceState(null, '', hash);
      else window.history.pushState(null, '', hash);
    }
    setRoute(parseHash(hash));
  }, []);
  return [route, go];
}
