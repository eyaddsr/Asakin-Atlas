import { useMemo } from 'react';
import { useScrollFade } from '../useScrollFade.ts';
import type { LensRow, Model, Verif } from '@shared/atlas.ts';
import { ALL_VERIFS, intTitle, lensFor, shortName, systemStats } from '@shared/atlas.ts';
import { tooltipWords } from '@shared/graph.ts';
import { COVERAGE_AR, COVERAGE_REASON_AR, DEPLOY_AR, LANE_KIND_AR, MECH_AR, UNRESOLVED_AR, VERIF_AR } from '../labels.ts';
import { Icon, Monogram, VerifSwatch, VSTYLE } from '../ui.tsx';

type Props = {
  model: Model;
  sysId: string;
  visible: ReadonlySet<Verif>;
  motion: boolean;
  activeInt: string | null;
  onOpenInt: (id: string) => void;
  onFocus: (id: string) => void;
  onImpact: () => void;
  onShowInAtlas: () => void;
  onUnlinked: () => void;
};

export function Lens({ model, sysId, visible, motion, activeInt, onOpenInt, onFocus, onImpact, onShowInAtlas, onUnlinked }: Props) {
  const fadeRef = useScrollFade<HTMLDivElement>();
  const sys = model.idx.systems.get(sysId)!;
  const lens = useMemo(() => lensFor(model, sysId, visible), [model, sysId, visible]);
  const all = useMemo(() => lensFor(model, sysId), [model, sysId]);
  const st = useMemo(() => systemStats(model, sysId), [model, sysId]);
  const lane = model.lane.get(sysId)!;
  const filtered = visible.size < ALL_VERIFS.size;
  const tot = st.total || 1;
  const w = (n: number) => Math.round((n / tot) * 100);
  const reg = sys.registryRecordId ? model.d.registry.records.find((r) => r.id === sys.registryRecordId) : null;
  const unlinked = model.unlinked.get(sysId)?.length ?? 0;
  const about = sys.description ?? sys.shortDescription ?? tooltipWords(sys);

  return (
    <div className="lens-scroll fade-y" ref={fadeRef} data-testid="lens">
      <div className="lens-grid">
        <div className="col-head col-in">
          <span className="t">الوارد <span className="count-pill">{lens.incoming.length}</span></span>
          <span className="d">أنظمة ترسل بيانات إلى {shortName(sys)}</span>
        </div>
        <div className="grid-spacer" />
        <div className="col-head col-out">
          <span className="t">الصادر <span className="count-pill">{lens.outgoing.length}</span></span>
          <span className="d">أنظمة يرسل إليها {shortName(sys)} بيانات</span>
        </div>

        <div className="rows rows-in" data-testid="lens-in">
          {lens.incoming.length > 0 && <Spine side="in" motion={motion} />}
          {lens.incoming.map((r) => <Row key={r.x.id} r={r} model={model} motion={motion} active={activeInt === r.x.id} onOpen={onOpenInt} onFocus={onFocus} />)}
          {lens.incoming.length === 0 && <div className="empty-box">لا توجد روابط واردة {filtered && all.incoming.length ? 'ضمن التصفية الحالية' : 'موثّقة'}</div>}
        </div>

        <section className="focus-card" aria-label={`بطاقة ${sys.displayName}`} data-testid="focus-card">
          <div className="top">
            <Monogram code={model.mono.get(sysId)!} lane={lane} size={52} />
            <span className={`kind-badge ${lane}`}>{LANE_KIND_AR[lane]}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2>{shortName(sys)}</h2>
            <span className="en">{sys.displayName !== shortName(sys) ? `${sys.displayName} · ` : ''}{sys.key}</span>
          </div>
          {about && <p className="about">{about}</p>}
          {sys.coverage !== 'complete' && sys.layer === 'internal' && (
            <div className="warn" role="note">
              <span className="dot" aria-hidden="true" />
              <span>{sys.coverage === 'not_audited'
                ? 'لم يُفحص هذا النظام بعد — روابطه مستمدة من تقارير الأنظمة الأخرى فقط، وغيابها لا يعني عدم وجودها.'
                : 'تدقيق جزئي — قد تكون بعض روابطه غير ظاهرة بعد.'}{sys.coverageNote ? ` (${sys.coverageNote})` : ''}</span>
            </div>
          )}
          <dl className="facts-dl">
            <dt>النطاق المنشور</dt><dd><span className="ltr" style={{ fontSize: 12.5 }}>{sys.domainName ?? '—'}</span></dd>
            <dt>التغطية</dt><dd>{COVERAGE_AR[sys.coverage]} · {COVERAGE_REASON_AR[sys.coverageReason]}</dd>
            <dt>حالة النشر</dt><dd>{DEPLOY_AR[sys.deploymentStatus]}</dd>
            <dt>Registry</dt><dd>{reg ? <><span className="ltr" style={{ fontSize: 12.5 }}>{reg.code}</span> · {reg.status}</> : 'غير مسجّل في اللقطة'}</dd>
            <dt>التكاملات</dt><dd>{st.incoming} وارد · {st.outgoing} صادر</dd>
          </dl>
          <div className="docbar">
            <div className="lbl"><span>حالة التوثيق</span><span className="mono">{st.total ? `${w(st.counts.documented)}% ${VERIF_AR.documented}` : '—'}</span></div>
            <div className="bar" aria-hidden="true">
              <span className="ok" style={{ width: `${w(st.counts.documented)}%` }} />
              <span className="part" style={{ width: `${w(st.counts.partial)}%` }} />
              <span className="q" style={{ width: `${w(st.counts.needs_verification)}%` }} />
            </div>
            <div className="nums">
              <span>{st.counts.documented} {VERIF_AR.documented}</span><span>{st.counts.partial} {VERIF_AR.partial}</span>
              <span style={{ color: 'var(--attn-ink)' }}>{st.counts.needs_verification} {VERIF_AR.needs_verification}</span>
            </div>
          </div>
          <div className="card-actions">
            <button type="button" className="btn dark" onClick={onImpact} data-testid="go-impact">{Icon.radar()}محاكاة أثر التغيير</button>
            <button type="button" className="btn" onClick={onShowInAtlas}>موقعه في الأطلس</button>
          </div>
          {(unlinked > 0 || all.internal.length > 0 || all.negative.length > 0 || sys.openQuestions.length > 0) && (
            <div className="side-links">
              {unlinked > 0 && (
                <button type="button" onClick={onUnlinked} data-testid="open-unlinked">
                  <span>حقول غير مرتبطة بتكامل محدد</span><span className="mono">{unlinked}</span>
                </button>
              )}
              {all.internal.length > 0 && (
                <details>
                  <summary>تكاملات داخل النظام نفسه ({all.internal.length})</summary>
                  <ul>{all.internal.map((x) => <li key={x.id}><button type="button" className="link-btn" onClick={() => onOpenInt(x.id)}>{intTitle(x)}</button></li>)}</ul>
                </details>
              )}
              {all.negative.length > 0 && (
                <details>
                  <summary>نتائج نفي موثقة ({all.negative.length})</summary>
                  <ul>{all.negative.map((x) => <li key={x.id}><button type="button" className="link-btn" onClick={() => onOpenInt(x.id)}>{intTitle(x)}</button></li>)}</ul>
                </details>
              )}
              {sys.openQuestions.length > 0 && (
                <details>
                  <summary>أسئلة مفتوحة من التدقيق ({sys.openQuestions.length})</summary>
                  <ul>{sys.openQuestions.map((q, i) => <li key={i} dir="auto">{q}</li>)}</ul>
                </details>
              )}
            </div>
          )}
        </section>

        <div className="rows rows-out" data-testid="lens-out">
          {lens.outgoing.length > 0 && <Spine side="out" motion={motion} />}
          {lens.outgoing.map((r) => <Row key={r.x.id} r={r} model={model} motion={motion} active={activeInt === r.x.id} onOpen={onOpenInt} onFocus={onFocus} />)}
          {lens.outgoing.length === 0 && <div className="empty-box">لا توجد روابط صادرة {filtered && all.outgoing.length ? 'ضمن التصفية الحالية' : 'موثّقة'}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * A horizontal connector drawn right → left (`toLeft`) or left → right, sized by its CSS box so it follows
 * the responsive column gap. Percent coordinates keep dash and bead spacing in pixels (no stretching).
 */
function Wire({ cls, color, dash, toLeft, fwd, back, motion, width = 2 }: {
  cls: string; color: string; dash?: string; toLeft: boolean; fwd: boolean; back: boolean; motion: boolean; width?: number;
}) {
  const [x1, x2] = toLeft ? ['100%', '0'] : ['0', '100%'];
  return (
    <svg className={cls} aria-hidden="true" height="8">
      <line x1={x1} y1="4" x2={x2} y2="4" stroke={color} strokeWidth={width} strokeDasharray={dash || undefined} strokeLinecap="round" />
      {motion && fwd && <line className="bead-short f" x1={x1} y1="4" x2={x2} y2="4" fill="none" strokeDasharray="0.5 17.5" strokeLinecap="round" stroke={color} strokeWidth="4.5" />}
      {motion && back && <line className="bead-short b" x1={x1} y1="4" x2={x2} y2="4" fill="none" strokeDasharray="0.5 17.5" strokeLinecap="round" stroke={color} strokeWidth="3" strokeOpacity={0.55} />}
    </svg>
  );
}

function Spine({ side, motion }: { side: 'in' | 'out'; motion: boolean }) {
  return (
    <div className={`spine spine-${side}`} aria-hidden="true">
      <span className="spine-line" />
      <Wire cls="spine-link" color="#C5CCD8" toLeft fwd back={false} motion={motion} />
      {side === 'in' && <span className="spine-head" />}
    </div>
  );
}

function Row({ r, model, motion, active, onOpen, onFocus }: { r: LensRow; model: Model; motion: boolean; active: boolean; onOpen: (id: string) => void; onFocus: (id: string) => void }) {
  const other = r.other ? model.idx.systems.get(r.other) : null;
  const st = VSTYLE[r.verif];
  const name = other ? shortName(other) : `طرف غير محدد: ${r.otherEnd.unresolved ? UNRESOLVED_AR[r.otherEnd.unresolved.class] : 'غير معروف'}`;
  const two = (r.fwd && r.back) || r.reciprocal;
  const twoLabel = r.fwd && r.back ? 'ثنائي: بيانات في الاتجاهين ضمن هذا التكامل' : 'تبادل ثنائي: يوجد تكامل معاكس مع النظام نفسه';
  const refocus = other ? (
    <button type="button" className="refocus" aria-label={`ركّز على ${other.displayName}`} title={`ركّز على ${other.displayName}`} onClick={() => onFocus(other.id)}>{Icon.target()}</button>
  ) : <span className="refocus ghost" aria-hidden="true" />;
  // incoming: data travels right → left towards the focus card; outgoing: from the card's spine to the row
  const stub = r.side === 'in'
    ? <Wire cls="stub stub-in" color={st.color} dash={st.dash} toLeft fwd={r.fwd} back={r.back} motion={motion} />
    : (
      <>
        <Wire cls="stub stub-out" color={st.color} dash={st.dash} toLeft fwd={r.fwd} back={r.back} motion={motion} />
        <span className="stub-head" aria-hidden="true" style={{ borderRightColor: st.color }} />
      </>
    );
  const card = (
    <button type="button" className="row-card" aria-current={active ? 'true' : undefined} onClick={() => onOpen(r.x.id)} data-testid="lens-row"
      aria-label={`${name} — ${intTitle(r.x)} — ${VERIF_AR[r.verif]}`} title={`${intTitle(r.x)}
${name} · ${MECH_AR[r.x.mechanism.kind]} · ${VERIF_AR[r.verif]}`}>
      <Monogram code={other ? model.mono.get(other.id)! : '؟'} lane={other ? model.lane.get(other.id)! : 'unresolved'} size={36} />
      <span className="body">
        <span className="who"><span className="ellipsis" dir="auto">{name}</span><span className="sep" aria-hidden="true">·</span><span className="m">{MECH_AR[r.x.mechanism.kind]}</span></span>
        <span className="t" dir="auto">{intTitle(r.x)}</span>
      </span>
      {two && <span className="two-badge" role="img" aria-label={twoLabel} title={twoLabel}>{Icon.twoWay()}</span>}
      <span className="vcell">
        <VerifSwatch v={r.verif} w={28} />
        <span className="vlabel" style={{ color: st.ink }}>{VERIF_AR[r.verif]}</span>
      </span>
    </button>
  );
  return (
    <div className="row">
      {stub}
      {r.side === 'in' ? <>{refocus}{card}</> : <>{card}{refocus}</>}
    </div>
  );
}

