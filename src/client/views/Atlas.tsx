import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Model, Thread } from '@shared/atlas.ts';
import { shortName, systemStats, tileName } from '@shared/atlas.ts';
import { coverageNote, isolationLabel } from '@shared/graph.ts';
import { ThreadCard } from '../components/ThreadCard.tsx';
import { Icon, Monogram, VSTYLE } from '../ui.tsx';
import { curveAt, curveD, layoutAtlas, threadCurve, TILE_H, TILE_W, type Curve } from './atlasLayout.ts';

type Props = {
  model: Model;
  threads: Thread[];
  mode: 'hover' | 'all';
  motion: boolean;
  onlyNeeds: boolean;
  spotlight: string | null;
  onOpenSystem: (id: string) => void;
  onOpenThread: (t: Thread) => void;
};

const MAX_ANIMATED = 60;

export function Atlas({ model, threads, mode, motion, onlyNeeds, spotlight, onOpenSystem, onOpenThread }: Props) {
  const L = useMemo(() => layoutAtlas(model), [model]);
  const stats = useMemo(() => new Map(model.d.systems.map((s) => [s.id, systemStats(model, s.id)])), [model]);
  const [hover, setHover] = useState<string | null>(spotlight);
  const [edgeHover, setEdgeHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [box, setBox] = useState({ w: 1200, h: 700 });
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const onEdge = useRef(false);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  // Fit the width; shrink up to 15% more to avoid a vertical scroll; leave room for a scrollbar.
  const fitW = (box.w - 18) / L.W;
  const fitH = (box.h - 4) / L.H;
  const fit = Math.max(0.55, Math.min(1, fitW, Math.max(fitH, fitW * 0.85)));
  const s = Math.max(0.4, Math.min(2.2, fit * zoom));

  useEffect(() => {
    if (!spotlight) return;
    setHover(spotlight);
    const p = L.pos.get(spotlight);
    const sc = scroller.current;
    if (p && sc) sc.scrollTo({ left: Math.max(0, p.x * s - sc.clientWidth / 2), top: Math.max(0, p.y * s - sc.clientHeight / 2) });
  }, [spotlight]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearT = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  const enter = (id: string) => { clearT(); setHover(id); };
  /* grace period so the pointer can travel from a system onto one of its threads */
  const leave = () => { clearT(); timer.current = window.setTimeout(() => { timer.current = null; if (!onEdge.current) setHover(null); }, 260); };

  const act = hover;
  const shown = mode === 'all' ? threads : threads.filter((t) => act && (t.from === act || t.to === act));
  const nb = new Set<string>();
  if (act) for (const t of shown) { if (t.from === act) nb.add(t.to); if (t.to === act) nb.add(t.from); }
  const animate = motion && shown.length > 0;

  const drawn = shown.map((t) => {
    const P = L.pos.get(t.from)!; const Q = L.pos.get(t.to)!;
    const lane = t.reciprocal ? (t.from < t.to ? 1 : -1) : 0;
    const c = threadCurve(P, Q, lane);
    const touch = !!act && (t.from === act || t.to === act);
    const hot = edgeHover === t.id;
    return { t, c, touch, hot, z: hot ? 2 : touch ? 1 : 0 };
  }).sort((a, b) => a.z - b.z);

  const hotThread = drawn.find((x) => x.hot);
  let card: { x: number; y: number; below: boolean } | null = null;
  if (hotThread) {
    const m = curveAt(hotThread.c, 0.5).p;
    card = { x: Math.min(L.W * s - 160, Math.max(160, m.x * s)), y: m.y * s, below: m.y * s < 300 };
  }

  function renderThread({ t, c, touch, hot }: (typeof drawn)[number]) {
    const st = VSTYLE[t.verif];
    const d = curveD(c);
    const op = hot || touch ? 1 : act ? 0.1 : 0.55;
    const beads = animate && (touch || shown.length <= MAX_ANIMATED);
    return (
      <g key={t.id} style={{ opacity: op, transition: 'opacity .25s ease' }} data-thread={t.id}>
        <path d={d} fill="none" stroke={st.color} strokeWidth={hot ? 3.5 : touch ? 2.25 : 1.25} strokeDasharray={st.dash || undefined} strokeLinecap="round" />
        {beads && t.fwd && <path className="bead f" fill="none" strokeDasharray="0.5 28" strokeLinecap="round" d={d} stroke={st.color} strokeWidth={touch ? 5 : 3.5} />}
        {beads && t.back && <path className="bead b" fill="none" strokeDasharray="0.5 28" strokeLinecap="round" d={d} stroke={st.color} strokeWidth={touch ? 3.5 : 2.5} strokeOpacity={0.55} />}
        {!animate && (touch || hot || mode === 'all') && <Chevrons c={c} fwd={t.fwd} back={t.back} color={st.color} />}
        <path d={d} className="thread-hit" fill="none" stroke="#0E1420" strokeOpacity={0} strokeWidth={14}
          onMouseEnter={() => { clearT(); onEdge.current = true; setEdgeHover(t.id); }}
          onMouseLeave={() => { onEdge.current = false; setEdgeHover(null); leave(); }}
          onClick={() => { onEdge.current = false; clearT(); setEdgeHover(null); onOpenThread(t); }} />
      </g>
    );
  }

  const peekSys = act ? model.idx.systems.get(act) : null;
  const peekStats = act ? stats.get(act) : null;

  return (
    <div className="atlas-frame" ref={frame} data-testid="atlas">
      <div className="atlas-scroll" ref={scroller}>
        <div className="atlas-sizer" style={{ width: L.W * s, height: L.H * s }}>
          <div className="atlas-layer" style={{ width: L.W, height: L.H, transform: `scale(${s})` }}>
            {L.lanes.map((ln) => (
              <div key={ln.id}>
                <div className="lane-bg" aria-hidden="true" style={{ left: ln.x, width: ln.w, top: ln.top, height: ln.bottom - ln.top }} />
                <div className="lane-head" style={{ left: ln.cx, top: 26 }}>
                  <span className="en">{ln.idx} · {ln.en}</span>
                  <span className="ar">{ln.ar}</span>
                  <span className="cnt">{ln.n}</span>
                </div>
              </div>
            ))}
            {/* Background threads sit under the tiles; focused/hovered threads get their own layer above. */}
            <svg className="threads under" width={L.W} height={L.H} aria-hidden="true">
              {drawn.filter((x) => !x.touch && !x.hot).map(renderThread)}
            </svg>
            {model.d.systems.map((sys) => {
              const p = L.pos.get(sys.id)!;
              const st = stats.get(sys.id)!;
              const isA = act === sys.id; const isN = nb.has(sys.id); const dim = !!act && !isA && !isN;
              const lane = model.lane.get(sys.id)!;
              const note = coverageNote(sys);
              const iso = isolationLabel(sys, st.total > 0);
              const hasQ = st.counts.needs_verification > 0;
              const cls = ['tile', isA ? 'active' : '', isN ? 'nb' : '', dim ? 'dim' : '', sys.coverage === 'not_audited' && sys.layer === 'internal' ? 'unaudited' : ''].filter(Boolean).join(' ');
              const label = `${sys.displayName} (${sys.key}) — ${st.incoming} وارد · ${st.outgoing} صادر${note ? ` · ${note}` : ''}${iso && !note ? ` · ${iso}` : ''}${hasQ ? ` · ${st.counts.needs_verification} يحتاج تحقق` : ''}`;
              return (
                <button key={sys.id} type="button" className={cls} data-testid={`node-${sys.key}`} aria-label={label} title={sys.displayName}
                  style={{ left: p.x, top: p.y, width: TILE_W, height: TILE_H, opacity: onlyNeeds && !hasQ && !isA ? 0.55 : 1 }}
                  onMouseEnter={() => enter(sys.id)} onMouseLeave={leave} onFocus={() => enter(sys.id)} onBlur={leave}
                  onClick={() => onOpenSystem(sys.id)}>
                  <Monogram code={model.mono.get(sys.id)!} lane={lane} size={32} how={isA ? 'inv' : dim ? 'dim' : ''} />
                  <span className="names">
                    <span className="nm" dir="auto">{tileName(sys)}</span>
                    <span className="key">{sys.key}</span>
                  </span>
                  <span className="meta">
                    {hasQ && <span className="qdot" title="يتضمن روابط تحتاج تحقق" />}
                    <span className="deg">{st.total}</span>
                  </span>
                </button>
              );
            })}
            <svg className="threads over" width={L.W} height={L.H} aria-hidden="true">
              {drawn.filter((x) => x.touch || x.hot).map(renderThread)}
            </svg>
          </div>
          {hotThread && card && (
            <ThreadCard model={model} thread={hotThread.t}
              style={{ left: card.x, top: card.y, transform: `translate(-50%, ${card.below ? '16px' : 'calc(-100% - 16px)'})` }} />
          )}
        </div>
      </div>

      <div className="atlas-legend" aria-label="مفتاح الاتجاه">
        <span>{Icon.oneWay()}اتجاه واحد</span>
        <span>{Icon.bothWays()}ثنائي — مساران أو بيانات عائدة</span>
        <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>الحركة تُظهر اتجاه البيانات · لقطة توثيقية، ليست حالة تشغيل حية</span>
      </div>

      <div className="peek" aria-live="polite" data-testid="peek">
        {peekSys && peekStats ? (
          <>
            <b>{shortName(peekSys)}</b>
            <span>
              {peekStats.total === 0
                ? isolationLabel(peekSys, false)
                : `${peekStats.incoming} وارد · ${peekStats.outgoing} صادر${peekStats.reciprocalPeers ? ` · تبادل ثنائي مع ${peekStats.reciprocalPeers}` : ''}${peekStats.counts.needs_verification ? ` · ${peekStats.counts.needs_verification} يحتاج تحقق` : ''}`}
              {coverageNote(peekSys) && peekStats.total > 0 ? ` · ${coverageNote(peekSys)}` : ''}
            </span>
            <span aria-hidden="true" style={{ width: 1, height: 14, background: 'var(--line-4)' }} />
            <span className="go">انقر للتركيز ←</span>
          </>
        ) : (
          <>
            {Icon.cursor()}
            <span>{onlyNeeds ? 'تُعرض الروابط التي تحتاج تحققًا فقط — ابدأ من أي نظام عليه نقطة برتقالية.' : mode === 'all' ? 'كل الخيوط ظاهرة — مرّر على نظام لعزل روابطه.' : 'مرّر على نظام لتظهر روابطه، ثم على أي خط لترى البيانات التي يحملها.'}</span>
          </>
        )}
      </div>

      <div className="zoom-ctl" role="group" aria-label="التكبير">
        <button type="button" aria-label="تكبير" data-testid="zoom-in" onClick={() => setZoom((z) => Math.min(2.2 / fit, z * 1.2))}>+</button>
        <button type="button" aria-label="تصغير" onClick={() => setZoom((z) => Math.max(0.4 / fit, z / 1.2))}>−</button>
        <button type="button" aria-label="ملاءمة العرض" data-testid="zoom-fit" onClick={() => setZoom(1)} style={{ fontSize: 12 }}>⤢</button>
      </div>
      <span className="sr-only" data-testid="atlas-scale">{s.toFixed(2)}</span>
    </div>
  );
}

function Chevrons({ c, fwd, back, color }: { c: Curve; fwd: boolean; back: boolean; color: string }) {
  const arrows: { t: number; flip: boolean }[] = [];
  if (fwd && back) arrows.push({ t: 0.42, flip: false }, { t: 0.58, flip: true });
  else if (fwd) arrows.push({ t: 0.5, flip: false });
  else if (back) arrows.push({ t: 0.5, flip: true });
  return (
    <>
      {arrows.map((a, i) => {
        const { p, angle } = curveAt(c, a.t);
        return <path key={i} d="M -5 -4.5 L 4 0 L -5 4.5 Z" fill={color} transform={`translate(${p.x} ${p.y}) rotate(${angle + (a.flip ? 180 : 0)})`} />;
      })}
    </>
  );
}
