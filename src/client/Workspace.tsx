import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from '@shared/schema.ts';
import { buildIndex } from '@shared/graph.ts';
import type { SearchHit } from '@shared/analysis.ts';
import { ALL_VERIFS, buildModel, buildThreads, shortName, verifCounts, VERIFS, type ChangeKind, type Thread, type Verif } from '@shared/atlas.ts';
import { Atlas } from './views/Atlas.tsx';
import { Lens } from './views/Lens.tsx';
import { Impact } from './views/Impact.tsx';
import { Drawer } from './components/Drawer.tsx';
import { SearchBox } from './components/SearchBox.tsx';
import { CHANGE_AR, VERIF_AR } from './labels.ts';
import { useRoute, type Route } from './route.ts';
import { AsakinLogo, Icon, VerifSwatch, VSTYLE } from './ui.tsx';
import { exportPagePdf } from './exportPdf.ts';

function usePrefersReducedMotion() {
  const [rm, setRm] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setRm(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return rm;
}

export function Workspace({ dataset }: { dataset: Dataset }) {
  const idx = useMemo(() => buildIndex(dataset), [dataset]);
  const model = useMemo(() => buildModel(dataset, idx), [dataset, idx]);
  const counts = useMemo(() => verifCounts(model), [model]);
  const [route, go] = useRoute();
  const [filt, setFilt] = useState<ReadonlySet<Verif>>(ALL_VERIFS);
  const [mode, setMode] = useState<'hover' | 'all'>('hover');
  const prefersRM = usePrefersReducedMotion();
  // Data movement is always animated; only the operating system's reduce-motion setting turns it off.
  const motion = !prefersRM;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Validate the route against the snapshot (stale or hand-edited links fall back safely).
  const r: Route = useMemo(() => {
    const sysOk = !!route.sys && idx.systems.has(route.sys);
    const view = route.view !== 'atlas' && !sysOk ? 'atlas' : route.view;
    return { ...route, view, sys: sysOk ? route.sys : null, int: route.int && idx.integrations.has(route.int) ? route.int : null, unlinked: route.unlinked && sysOk };
  }, [route, idx]);

  const threads = useMemo(() => buildThreads(model, filt), [model, filt]);
  const drawerOpen = !!r.int || r.unlinked;

  const openSystem = useCallback((id: string) => { setSpotlight(null); go({ view: 'lens', sys: id, int: null, unlinked: false, map: null }); }, [go]);
  const openInt = useCallback((id: string, map: string | null = null) => go({ int: id, unlinked: false, tab: 'fields', map }), [go]);
  const closeDrawer = useCallback(() => go({ int: null, unlinked: false, map: null }), [go]);
  const toAtlas = useCallback((spot: string | null = null) => { setSpotlight(spot); go({}, { reset: true }); }, [go]);

  const onPick = (h: SearchHit) => {
    if (h.type === 'system') { openSystem(h.id); return; }
    if (h.type === 'integration') {
      const o = model.ori.get(h.id)!;
      go({ view: 'lens', sys: o.from.systemId ?? o.to.systemId ?? h.systemId, int: h.id, unlinked: false, tab: 'fields', map: null });
      return;
    }
    const intId = h.integrationId;
    if (intId) {
      const o = model.ori.get(intId)!;
      go({ view: 'lens', sys: o.from.systemId ?? o.to.systemId ?? h.systemId, int: intId, unlinked: false, tab: 'fields', map: h.type === 'field' ? h.id : null });
      return;
    }
    if (h.type === 'field') { go({ view: 'lens', sys: h.systemId, int: null, unlinked: true, map: h.id }); return; }
    openSystem(h.systemId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key !== 'Escape') return;
      if (drawerOpen) closeDrawer();
      else if (r.view === 'impact') go({ view: 'lens' });
      else if (r.view === 'lens') toAtlas(r.sys);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, r.view, r.sys, closeDrawer, go, toAtlas]);

  const sys = r.sys ? idx.systems.get(r.sys)! : null;
  const toggleV = (v: Verif) => {
    const n = new Set(filt);
    if (n.has(v)) n.delete(v); else n.add(v);
    if (n.size) setFilt(n);
  };
  const onlyNeeds = filt.size === 1 && filt.has('needs_verification');

  const doExport = async () => {
    const root = appRef.current;
    const logo = root?.querySelector<SVGSVGElement>('[data-testid="brand"] svg');
    if (!root || !logo || exporting) return;
    setExporting(true); setExportError(null);
    try {
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const part = r.view === 'atlas' ? 'atlas' : `${r.view === 'impact' ? `impact-${r.change}` : 'system'}-${sys?.key ?? ''}`;
      const intPart = r.int ? `-${idx.integrations.get(r.int)?.agentIntegrationId ?? 'integration'}` : r.unlinked ? '-unlinked-fields' : '';
      const fileName = `asakin-integration-map_${part}${intPart}_${date}.pdf`.replace(/[^A-Za-z0-9._-]+/g, '-');
      await exportPagePdf({ root, logo, skipTop: 64, fileName, title: `${title} — خريطة تكاملات أساكن` });
    } catch {
      setExportError('تعذّر إنشاء ملف PDF. حاول مرة أخرى.');
    } finally {
      setExporting(false);
    }
  };

  let title = 'أطلس الأنظمة';
  let subtitle = `${dataset.systems.length} نظامًا · ${dataset.integrations.length} تكاملًا — مرتّبة من القنوات إلى المزودين الخارجيين · لقطة ${dataset.meta.generatedAt}`;
  if (r.view === 'lens' && sys) { title = shortName(sys); subtitle = 'يصل الوارد من اليمين، ويخرج الصادر إلى اليسار — انقر أي رابط لفحصه.'; }
  if (r.view === 'impact' && sys) { title = `ماذا لو تغيّر ${shortName(sys)}؟`; subtitle = 'تُرسم الأنظمة المتأثرة في دوائر حسب بُعدها عن نقطة التغيير — أثر محتمل وليس مؤكدًا.'; }

  return (
    <div className="app" ref={appRef}>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => toAtlas()} aria-label="أساكن — خريطة التكاملات، العودة إلى الأطلس" title="خريطة تكاملات أساكن" data-testid="brand">
          <AsakinLogo height={28} />
        </button>
        <SearchBox ref={searchRef} dataset={dataset} idx={idx} onPick={onPick} />
        <div className="top-actions">
          <button type="button" className="pill-btn" onClick={() => void doExport()} disabled={exporting} aria-busy={exporting} data-testid="export-pdf"
            title="تنزيل الصفحة الحالية كملف PDF">
            {Icon.download()}<span>{exporting ? 'جارٍ التصدير…' : 'تصدير PDF'}</span>
          </button>
        </div>
      </header>

      <div className="titlebar">
        <div className="heading">
          <nav className="crumbs" aria-label="مسار التصفح" data-testid="crumbs">
            {r.view === 'atlas' ? <span className="here">الأطلس</span> : <button type="button" onClick={() => toAtlas(r.sys)}>الأطلس</button>}
            {sys && r.view !== 'atlas' && <><span className="sep" aria-hidden="true">/</span>
              {r.view === 'lens' ? <span className="here">{shortName(sys)}</span> : <button type="button" onClick={() => go({ view: 'lens' })}>{shortName(sys)}</button>}</>}
            {r.view === 'impact' && <><span className="sep" aria-hidden="true">/</span><span className="here">محاكاة الأثر</span></>}
          </nav>
          <div className="h1row"><h1 data-testid="page-title">{title}</h1><span>{subtitle}</span></div>
        </div>
        <div className="controls">
          {r.view !== 'impact' && (
            <div className="legend-chips" role="group" aria-label="تصفية الروابط حسب حالة التحقق" data-testid="legend">
              {VERIFS.map((v) => (
                <button type="button" key={v} className="chip-btn" aria-pressed={filt.has(v)} onClick={() => toggleV(v)} data-testid={`legend-${v}`}>
                  <VerifSwatch v={v} />
                  <span>{VERIF_AR[v]}</span>
                  <span className="n" style={{ color: filt.has(v) ? VSTYLE[v].ink : undefined }}>{counts[v]}</span>
                </button>
              ))}
              {filt.size < 3 && <button type="button" className="link-btn" onClick={() => setFilt(ALL_VERIFS)}>إظهار الكل</button>}
            </div>
          )}
          {r.view === 'atlas' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="vrule" aria-hidden="true" />
              <span className="seg-label">الخيوط</span>
              <div className="seg" role="group" aria-label="متى تظهر خيوط الربط">
                <button type="button" aria-pressed={mode === 'hover'} onClick={() => setMode('hover')} data-testid="mode-hover">عند التمرير</button>
                <button type="button" aria-pressed={mode === 'all'} onClick={() => setMode('all')} data-testid="mode-all">كلها</button>
              </div>
            </div>
          )}
          {r.view === 'impact' && (
            <div className="seg" role="group" aria-label="نوع التغيير" data-testid="change-kind">
              {(Object.keys(CHANGE_AR) as ChangeKind[]).map((c) => (
                <button type="button" key={c} aria-pressed={r.change === c} onClick={() => go({ change: c }, { replace: true })} style={{ height: 32, padding: '0 16px' }}>{CHANGE_AR[c].ar}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="stage">
        {r.view === 'atlas' && (
          <Atlas model={model} threads={threads} mode={mode} motion={motion} onlyNeeds={onlyNeeds} spotlight={spotlight}
            onOpenSystem={openSystem} onOpenThread={(t: Thread) => openInt(t.intIds[0]!)} />
        )}
        {r.view === 'lens' && r.sys && (
          <Lens model={model} sysId={r.sys} visible={filt} motion={motion} activeInt={r.int}
            onOpenInt={(id) => openInt(id)} onFocus={openSystem}
            onImpact={() => go({ view: 'impact', int: null, unlinked: false })}
            onShowInAtlas={() => toAtlas(r.sys)}
            onUnlinked={() => go({ unlinked: true, int: null, map: null })} />
        )}
        {r.view === 'impact' && r.sys && (
          <Impact model={model} sysId={r.sys} change={r.change} motion={motion}
            onOpenInt={(id) => openInt(id)} onFocus={openSystem} onBack={() => go({ view: 'lens' })} />
        )}
      </main>

      {exporting && (
        <div className="export-veil" data-export-skip="" role="status" aria-live="polite"><div><div className="spinner" />جارٍ إعداد ملف PDF…</div></div>
      )}
      {exportError && (
        <div className="toast" data-export-skip="" role="alert">{exportError}
          <button type="button" className="link-btn" onClick={() => setExportError(null)}>إغلاق</button>
        </div>
      )}

      {drawerOpen && (
        <Drawer model={model} intId={r.int} unlinkedSys={r.unlinked ? r.sys : null} tab={r.tab} highlight={r.map} motion={motion}
          onClose={closeDrawer} onTab={(t) => go({ tab: t }, { replace: true })} onOpenInt={openInt} onFocusSys={openSystem} />
      )}
    </div>
  );
}
