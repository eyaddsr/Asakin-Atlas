import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChangeKind, Model, Thread } from '@shared/atlas.ts';
import type { Integration } from '@shared/schema.ts';
import { ALL_VERIFS, buildThreads, impactRings, intTitle, shortName, tileName, verifOf } from '@shared/atlas.ts';
import { CHANGE_AR } from '../labels.ts';
import { useScrollFade } from '../useScrollFade.ts';
import { ThreadCard } from '../components/ThreadCard.tsx';
import { Monogram, VerifSwatch, VSTYLE } from '../ui.tsx';

type Props = {
  model: Model;
  sysId: string;
  change: ChangeKind;
  motion: boolean;
  onOpenInt: (id: string) => void;
  onFocus: (id: string) => void;
  onBack: () => void;
};

const RING2_MAX = 14;

export function Impact({ model, sysId, change, motion, onOpenInt, onFocus, onBack }: Props) {
  const fadeRef = useScrollFade<HTMLElement>();
  const sys = model.idx.systems.get(sysId)!;
  const im = useMemo(() => impactRings(model, sysId, change), [model, sysId, change]);
  const ring2Shown = im.ring2.slice(0, RING2_MAX);
  const threads = useMemo(() => {
    const keep = new Set([sysId, ...im.ring1, ...ring2Shown]);
    return buildThreads(model, ALL_VERIFS, [...im.ring1Ints, ...im.ring2Ints]).filter((t) => keep.has(t.from) && keep.has(t.to));
  }, [model, sysId, im]); // eslint-disable-line react-hooks/exhaustive-deps
  const canvas = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [edgeHover, setEdgeHover] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const W = size.w; const H = size.h;
  // keep pills (max 190px wide, 40px tall) fully inside the canvas
  const inside = (x: number, y: number) => ({ x: Math.min(W - 100, Math.max(100, x)), y: Math.min(H - 26, Math.max(26, y)) });
  const pos = new Map<string, { x: number; y: number }>();
  pos.set(sysId, { x: W / 2, y: H / 2 });
  const n1 = im.ring1.length;
  im.ring1.forEach((id, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n1, 1);
    const far = n1 > 10 && i % 2 === 1;
    const rx = (far ? 0.31 : 0.22) * W; const ry = (far ? 0.33 : 0.25) * H;
    pos.set(id, inside(W / 2 + rx * Math.cos(a), H / 2 + ry * Math.sin(a)));
  });
  ring2Shown.forEach((id, i) => {
    const a = -Math.PI / 2 + Math.PI / Math.max(ring2Shown.length, 1) + (2 * Math.PI * i) / ring2Shown.length;
    pos.set(id, inside(W / 2 + 0.42 * W * Math.cos(a), H / 2 + 0.43 * H * Math.sin(a)));
  });

  const segs = threads.map((t) => {
    const P = pos.get(t.from)!; const Q = pos.get(t.to)!;
    const dx = Q.x - P.x; const dy = Q.y - P.y; const len = Math.hypot(dx, dy) || 1;
    const k = t.reciprocal ? (t.from < t.to ? 4 : -4) : 0;
    const ox = (-dy / len) * k; const oy = (dx / len) * k;
    const ring2 = !(t.from === sysId || t.to === sysId);
    return { t, d: `M ${P.x + ox} ${P.y + oy} L ${Q.x + ox} ${Q.y + oy}`, mid: { x: (P.x + Q.x) / 2 + ox, y: (P.y + Q.y) / 2 + oy }, ring2 };
  });
  const hot = segs.find((x) => x.t.id === edgeHover);
  const ch = CHANGE_AR[change];

  return (
    <div className="impact-wrap" data-testid="impact">
      <aside className="impact-aside fade-y" ref={fadeRef} aria-label="ملخص الأثر">
        <div className="scope">
          <span>نطاق الأثر المحتمل · {ch.ar}</span>
          <p>{ch.desc}</p>
        </div>
        <div className="stat3">
          <div><b data-testid="impact-direct">{im.ring1.length}</b><span>تأثر مباشر</span></div>
          <div><b>{im.ring2.length}</b><span>غير مباشر</span></div>
          <div className="q"><b>{im.unverified}</b><span>رابط يحتاج تحقق</span></div>
        </div>
        {im.unverified > 0 && (
          <div className="warn"><span className="dot" aria-hidden="true" />
            <span>قد يكون الأثر أوسع أو أضيق مما يظهر: {im.unverified} {im.unverified === 1 ? 'رابط' : 'روابط'} ضمن هذا النطاق لم يُتحقق منها بعد، والأثر هنا محتمل وليس مؤكدًا.</span>
          </div>
        )}
        {sys.coverage !== 'complete' && sys.layer === 'internal' && (
          <div className="warn"><span className="dot" aria-hidden="true" /><span>{shortName(sys)} لم يُدقق بالكامل؛ قد توجد روابط غير ظاهرة.</span></div>
        )}
        <div className="aff-list">
          <b>التكاملات المتأثرة مباشرة</b>
          {im.ring1Ints.map((x) => <AffRow key={x.id} x={x} model={model} sysId={sysId} onOpen={onOpenInt} />)}
          {im.ring1Ints.length === 0 && <div className="empty-box" style={{ textAlign: 'right' }}>لا توجد أنظمة متأثرة بهذا النوع من التغيير وفق البيانات الحالية.</div>}
        </div>
        {im.ring2.length > 0 && (
          <div className="aff-list">
            <b>ويمتد الأثر إلى</b>
            <div className="chips2">{im.ring2.map((id) => <button type="button" key={id} onClick={() => onFocus(id)}>{shortName(model.idx.systems.get(id)!)}</button>)}</div>
          </div>
        )}
        <button type="button" className="btn" style={{ marginTop: 'auto' }} onClick={onBack}>العودة إلى روابط {shortName(sys)}</button>
      </aside>

      <div className="impact-canvas" ref={canvas} data-testid="impact-canvas">
        <svg className="rings" aria-hidden="true">
          <ellipse cx={W / 2} cy={H / 2} rx={0.42 * W} ry={0.43 * H} fill="none" stroke="#CDD3DC" strokeDasharray="3 7" />
          <ellipse cx={W / 2} cy={H / 2} rx={0.27 * W} ry={0.29 * H} fill="#2B44D6" fillOpacity={0.04} stroke="#B4C0F0" strokeDasharray="3 7" />
          <ellipse cx={W / 2} cy={H / 2} rx={0.1 * W} ry={0.11 * H} fill="#2B44D6" fillOpacity={0.06} />
        </svg>
        <svg className="lines" aria-hidden="true">
          {segs.map(({ t, d, ring2 }) => {
            const st = VSTYLE[t.verif]; const isHot = edgeHover === t.id;
            return (
              <g key={t.id} style={{ opacity: isHot ? 1 : ring2 ? 0.7 : 1 }}>
                <path d={d} fill="none" stroke={st.color} strokeWidth={isHot ? 3.25 : ring2 ? 1.25 : 1.75} strokeDasharray={st.dash || undefined} strokeLinecap="round" />
                {motion && t.fwd && <path className="bead f" fill="none" strokeDasharray="0.5 28" strokeLinecap="round" d={d} stroke={st.color} strokeWidth={ring2 ? 3.5 : 4.5} />}
                {motion && t.back && <path className="bead b" fill="none" strokeDasharray="0.5 28" strokeLinecap="round" d={d} stroke={st.color} strokeWidth={ring2 ? 2.5 : 3} strokeOpacity={0.55} />}
                <path d={d} fill="none" stroke="#0E1420" strokeOpacity={0} strokeWidth={14} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onMouseEnter={() => setEdgeHover(t.id)} onMouseLeave={() => setEdgeHover(null)} onClick={() => openThread(t)} />
              </g>
            );
          })}
        </svg>
        <div className="impact-center" style={{ left: W / 2, top: H / 2 }}>
          <span className="pill"><Monogram code={model.mono.get(sysId)!} lane="channels" how="inv" size={32} round />{shortName(sys)}</span>
          <span className="tagline">نقطة التغيير</span>
        </div>
        {[...im.ring1, ...ring2Shown].map((id) => {
          const p = pos.get(id)!; const s = model.idx.systems.get(id)!; const r2 = !im.ring1.includes(id);
          return (
            <button type="button" key={id} className={`inode${r2 ? ' r2' : ''}`} style={{ left: p.x, top: p.y }} data-testid="impact-node"
              title={`${r2 ? 'تأثر غير مباشر' : 'تأثر مباشر'} — انقر لعرض روابط ${s.displayName}`} onClick={() => onFocus(id)}>
              <Monogram code={model.mono.get(id)!} lane={model.lane.get(id)!} size={28} round />
              <span className="nm" dir="auto">{tileName(s)}</span>
            </button>
          );
        })}
        {im.ring2.length > RING2_MAX && <span className="impact-key" style={{ left: 16, right: 'auto', top: 16, bottom: 'auto' }}>+{im.ring2.length - RING2_MAX} أنظمة أخرى في الدائرة الثانية</span>}
        {hot && (
          <ThreadCard model={model} thread={hot.t}
            style={{ left: Math.min(W - 160, Math.max(160, hot.mid.x)), top: hot.mid.y, transform: `translate(-50%, ${hot.mid.y < 300 ? '16px' : 'calc(-100% - 16px)'})` }} />
        )}
        <div className="impact-key">
          <span><span aria-hidden="true" className="round" style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', border: '1.5px solid #9AA3B2' }} />الدائرة الأولى: تأثر مباشر</span>
          <span><span aria-hidden="true" className="round" style={{ width: 12, height: 12, borderRadius: '50%', background: '#F4F6F9', border: '1.5px dashed #9AA3B2' }} />الدائرة الثانية: تأثر غير مباشر</span>
        </div>
      </div>
    </div>
  );

  function openThread(t: Thread) { onOpenInt(t.intIds[0]!); }
}

function AffRow({ x, model, sysId, onOpen }: { x: Integration; model: Model; sysId: string; onOpen: (id: string) => void }) {
  const o = model.ori.get(x.id)!;
  const isFrom = o.from.systemId === sysId;
  const otherId = (isFrom ? o.to.systemId : o.from.systemId)!;
  const other = model.idx.systems.get(otherId)!;
  const rel: string[] = [];
  if (isFrom ? o.fwd : o.back) rel.push('يستقبل منه بيانات');
  if (isFrom ? o.back : o.fwd) rel.push('يرسل إليه بيانات');
  if (!isFrom && o.initiatorKnown) rel.push('يستدعيه');
  const v = verifOf(model, x.id);
  return (
    <button type="button" className="aff" onClick={() => onOpen(x.id)}>
      <Monogram code={model.mono.get(otherId)!} lane={model.lane.get(otherId)!} size={30} />
      <span className="body">
        <span>{shortName(other)} · {rel.length ? rel.join(' · ') : 'اتجاه غير موثق'}</span>
        <span dir="auto">{intTitle(x)}</span>
      </span>
      <VerifSwatch v={v} />
    </button>
  );
}
