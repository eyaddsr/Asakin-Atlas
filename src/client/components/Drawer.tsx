import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EndRef, FieldMapping, Integration } from '@shared/schema.ts';
import { EVIDENCE_RANK } from '@shared/schema.ts';
import type { Model } from '@shared/atlas.ts';
import { fieldTags, intTitle, lineage, shortName, siblings, verifOf, type Hop } from '@shared/atlas.ts';
import { WITHHELD } from '@shared/sensitive.ts';
import {
  CORROB_AR, DEPLOY_CLAIM_AR, EVIDENCE_AR, GRANT_AR, MECH_AR, TAG_AR, TAG_TITLE, TRI_AR, TRIGGER_AR, UNRESOLVED_AR, VERIF_AR, VERIF_BASIS, nCount,
} from '../labels.ts';
import type { Tab } from '../route.ts';
import { useScrollFade } from '../useScrollFade.ts';
import { Icon, Monogram, Undoc, VerifSwatch, VSTYLE } from '../ui.tsx';

type Props = {
  model: Model;
  intId: string | null;
  unlinkedSys: string | null;
  tab: Tab;
  highlight: string | null;
  motion: boolean;
  onClose: () => void;
  onTab: (t: Tab) => void;
  onOpenInt: (id: string, map?: string | null) => void;
  onFocusSys: (id: string) => void;
};

const LINK_AR = {
  matched: 'مطابق لتكامل واحد', token_reference: 'إشارة رمزية لتكامل', multi_integration: 'يشير إلى عدة تكاملات',
  unmatched_reference: 'إشارة لا تطابق تكاملًا', missing_integration_id: 'بلا معرّف تكامل',
} as const;
const REVIEW_AR = { new: 'جديد', matched: 'مطابق', conflict: 'تعارض', needs_review: 'يحتاج مراجعة', accepted: 'مقبول', rejected: 'مرفوض' } as const;
const SCOPE_AR = { inter_system: 'بين نظامين', intra_system: 'داخل النظام نفسه', unresolved: 'طرف غير محدد', negative_finding: 'نتيجة نفي (لا يوجد ربط)' } as const;
const Q_AR = { review: 'مراجعة', conflict: 'تعارض', mapping_link: 'ربط حقول' } as const;

export function Drawer(p: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, [p.intId, p.unlinkedSys]);
  const x = p.intId ? p.model.idx.integrations.get(p.intId) ?? null : null;
  return (
    <>
      <button type="button" className="scrim" aria-label="إغلاق التفاصيل" tabIndex={-1} onClick={p.onClose} />
      <aside className="drawer" aria-label={x ? 'تفاصيل التكامل' : 'حقول غير مرتبطة'} data-testid="drawer" role="dialog" aria-modal="false">
        {x ? <IntegrationPanel {...p} x={x} closeRef={closeRef} /> : p.unlinkedSys ? <UnlinkedPanel {...p} sysId={p.unlinkedSys} closeRef={closeRef} /> : null}
      </aside>
    </>
  );
}

function endLabel(m: Model, e: EndRef): string {
  if (e.systemId) return shortName(m.idx.systems.get(e.systemId)!);
  return e.unresolved ? UNRESOLVED_AR[e.unresolved.class] : 'غير محدد';
}

function EndButton({ m, e, onFocusSys }: { m: Model; e: EndRef; onFocusSys: (id: string) => void }) {
  const sys = e.systemId ? m.idx.systems.get(e.systemId) : null;
  return (
    <button type="button" className="end-btn" disabled={!sys} onClick={() => sys && onFocusSys(sys.id)} title={sys ? `ركّز على ${sys.displayName}` : e.raw ?? undefined}>
      <Monogram code={sys ? m.mono.get(sys.id)! : '؟'} lane={sys ? m.lane.get(sys.id)! : 'unresolved'} size={30} />
      <span className="nm" dir="auto">{endLabel(m, e)}</span>
    </button>
  );
}

function IntegrationPanel({ model: m, x, tab, highlight, motion, onClose, onTab, onOpenInt, onFocusSys, closeRef }: Props & { x: Integration; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  const fadeRef = useScrollFade<HTMLDivElement>();
  const o = m.ori.get(x.id)!;
  const v = verifOf(m, x.id);
  const st = VSTYLE[v];
  const reporter = m.idx.systems.get(x.reportedBySystemId)!;
  const fields = m.mappings.get(x.id) ?? [];
  const qs = m.questions.get(x.id) ?? [];
  const sibs = siblings(m, x);
  const tabs: { id: Tab; ar: string; n: number; q?: boolean }[] = [
    { id: 'fields', ar: 'البيانات المتبادلة', n: fields.length },
    { id: 'how', ar: 'طريقة العمل', n: 0 },
    { id: 'evidence', ar: 'التحقق والأدلة', n: qs.length, q: true },
  ];
  const noDir = !o.fwd && !o.back;
  return (
    <>
      <div className="drawer-head">
        <div className="row1">
          <div className="codes">
            <span className="code-chip">{reporter.key} · {x.agentIntegrationId}</span>
            <span className="vbadge" style={{ background: st.bg, color: st.ink }} data-testid="verif-badge"><VerifSwatch v={v} w={20} />{VERIF_AR[v]}</span>
            {x.scope !== 'inter_system' && <span className="vbadge" style={{ background: 'var(--soft)', color: 'var(--ink-2)' }}>{SCOPE_AR[x.scope]}</span>}
          </div>
          <button type="button" ref={closeRef} className="icon-btn" aria-label="إغلاق" onClick={onClose} data-testid="drawer-close">{Icon.close()}</button>
        </div>

        <div className="ends">
          <EndButton m={m} e={o.from} onFocusSys={onFocusSys} />
          <div className="wire" aria-label={dirText(m, x)}>
            <div className="lane" aria-hidden="true">
              <svg style={{ right: 0 }}>
                <line x1="100%" y1="4" x2="0" y2="4" stroke={noDir ? '#B9C1CE' : st.color} strokeWidth="2" strokeDasharray={noDir ? '4 5' : st.dash || undefined} strokeLinecap="round" />
                {motion && o.fwd && <line className="bead f" fill="none" strokeDasharray="0.5 28" strokeLinecap="round" x1="100%" y1="4" x2="0" y2="4" stroke={st.color} strokeWidth="4.5" />}
              </svg>
              <span className="head-l" style={{ borderRightColor: noDir ? '#B9C1CE' : st.color }} />
              <span className="lbl">{MECH_AR[x.mechanism.kind]}{o.initiatorKnown ? '' : ' · بادئ غير موثق'}</span>
            </div>
            {o.back && (
              <div className="lane" aria-hidden="true">
                <svg style={{ left: 0 }}>
                  <line x1="0" y1="4" x2="100%" y2="4" stroke={st.color} strokeWidth="2" strokeDasharray={st.dash || undefined} strokeLinecap="round" />
                  {motion && <line className="bead f" fill="none" strokeDasharray="0.5 28" strokeLinecap="round" x1="0" y1="4" x2="100%" y2="4" stroke={st.color} strokeWidth="4.5" />}
                </svg>
                <span className="head-r" style={{ borderLeftColor: st.color }} />
                <span className="lbl">{o.fwd ? 'بيانات في الاتجاه المعاكس أيضًا' : 'بيانات عائدة في الاستجابة'}</span>
              </div>
            )}
            {noDir && <span style={{ fontSize: 11.5, color: 'var(--attn-ink)', textAlign: 'center' }}>اتجاه البيانات غير موثق</span>}
          </div>
          <EndButton m={m} e={o.to} onFocusSys={onFocusSys} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 dir="auto" data-testid="drawer-title">{intTitle(x)}</h2>
          {x.purpose && x.purpose !== intTitle(x) && <p className="why" dir="auto">{x.purpose}</p>}
        </div>

        {sibs.length > 0 && (
          <div className="sibs" data-testid="siblings">
            <span>تكاملات أخرى بين النظامين ({sibs.length}):</span>
            {sibs.slice(0, 6).map((y) => <button type="button" key={y.id} onClick={() => onOpenInt(y.id)} title={intTitle(y)}>{intTitle(y)}</button>)}
            {sibs.length > 6 && <span>+{sibs.length - 6}</span>}
          </div>
        )}

        <div className="tabs" role="tablist" aria-label="أقسام التكامل">
          {tabs.map((t) => (
            <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)} data-testid={`tab-${t.id}`}>
              {t.ar}{t.n > 0 && <span className={`n${t.q ? ' q' : ''}`}>{t.n}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-body fade-y" ref={fadeRef} role="tabpanel">
        {tab === 'fields' && <FieldsTab m={m} x={x} fields={fields} highlight={highlight} onOpenInt={onOpenInt} onFocusSys={onFocusSys} />}
        {tab === 'how' && <HowTab m={m} x={x} />}
        {tab === 'evidence' && <EvidenceTab m={m} x={x} onOpenInt={onOpenInt} />}
      </div>
      <ReadOnlyFoot />
    </>
  );
}

function ReadOnlyFoot() {
  return (
    <div className="drawer-foot" data-testid="readonly-note">
      <span aria-hidden="true" className="round" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ink-4)', flex: 'none' }} />
      الخريطة للقراءة فقط — تُضاف الأدلة وقرارات التحقق عبر مراجعة بيانات التدقيق في Git، ثم تُنشر لقطة جديدة.
    </div>
  );
}

function dirText(m: Model, x: Integration): string {
  const o = m.ori.get(x.id)!;
  const a = endLabel(m, o.from); const b = endLabel(m, o.to);
  const who = o.initiatorKnown ? `يبدأ الطلب: ${a}` : 'بادئ الطلب غير موثق';
  const data = o.fwd && o.back ? `بيانات في الاتجاهين بين ${a} و${b}` : o.fwd ? `تنتقل البيانات من ${a} إلى ${b}` : o.back ? `تعود البيانات من ${b} إلى ${a}` : 'اتجاه البيانات غير موثق';
  return `${who} · ${data}`;
}

/* --------------------------------------------------------------- fields */

function FieldsTab({ m, x, fields, highlight, onOpenInt, onFocusSys }: { m: Model; x: Integration; fields: FieldMapping[]; highlight: string | null; onOpenInt: (id: string, map?: string | null) => void; onFocusSys: (id: string) => void }) {
  const [trace, setTrace] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(highlight);
  useEffect(() => { setTrace(null); setOpen(highlight); }, [x.id, highlight]);
  const lines = useMemo(() => new Map(fields.map((f) => [f.id, lineage(m, f)] as const)), [m, fields]);
  const o = m.ori.get(x.id)!;
  if (!fields.length) {
    return (
      <div className="nofields">
        <b>لم تُوثّق الحقول المتبادلة في هذا التكامل بعد.</b>
        <span>لا توجد مطابقة حقول في تقرير التدقيق لهذا التكامل. ستبقى الحالة كما هي حتى تُضاف مطابقة موثقة في دورة التدقيق التالية.</span>
      </div>
    );
  }
  const a = endLabel(m, o.from); const b = endLabel(m, o.to);
  const title = o.fwd && !o.back ? 'يُرسَل — الطلب' : o.back && !o.fwd ? 'يعود — الاستجابة' : 'الحقول المتبادلة';
  const [c1, c2] = o.fwd && !o.back ? [`في ${a}`, `في ${b}`] : o.back && !o.fwd ? [`في ${b}`, `في ${a}`] : ['الحقل المصدر', 'الحقل الوجهة'];
  const matched = fields.filter((f) => f.link.status === 'matched');
  const uncertain = fields.filter((f) => f.link.status !== 'matched');
  const tr = trace ? lines.get(trace) ?? null : null;
  const trField = trace ? fields.find((f) => f.id === trace) : null;
  return (
    <div data-testid="field-table">
      {tr && trField && <Lineage m={m} hops={tr} cur={trField} onClose={() => setTrace(null)} onOpenInt={onOpenInt} onFocusSys={onFocusSys} />}
      {[{ ar: title, rows: matched }, { ar: 'حقول بربط غير مؤكد بهذا التكامل', rows: uncertain }].filter((sec) => sec.rows.length).map((sec) => (
        <div className="fsec" key={sec.ar}>
          <div className="h"><b>{sec.ar}</b><span>{nCount(sec.rows.length, 'حقل واحد', 'حقلان', 'حقول')}</span></div>
          <div className="fgrid hd"><span>{c1}</span><span /><span>{c2}</span><span>النوع</span><span>الوسوم</span></div>
          {sec.rows.map((f) => (
            <FieldRow key={f.id} f={f} on={trace === f.id} hl={highlight === f.id} open={open === f.id} hasTrace={!!lines.get(f.id)}
              onTrace={() => setTrace(trace === f.id ? null : f.id)} onToggle={() => setOpen(open === f.id ? null : f.id)} m={m} />
          ))}
        </div>
      ))}
    </div>
  );
}

function FieldRow({ f, on, hl, open, hasTrace, onTrace, onToggle, m }: { f: FieldMapping; on: boolean; hl: boolean; open: boolean; hasTrace: boolean; onTrace: () => void; onToggle: () => void; m: Model }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (hl) ref.current?.scrollIntoView({ block: 'center' }); }, [hl]);
  const tags = fieldTags(f);
  return (
    <div ref={ref} className={`frow${on ? ' on' : ''}${hl ? ' hl' : ''}`} data-testid="field-row" data-mapping={f.id}>
      <div className="fgrid">
        <span className="p">{f.sourcePath ?? <Undoc />}</span>
        {Icon.arrowL()}
        <span className="p">{f.destinationPath ?? <Undoc />}</span>
        <span className="ty">{f.dataType ?? '—'}</span>
        <span className="tg">
          {tags.map((t) => <span key={t} className={`tag ${t}`} title={TAG_TITLE[t]}>{TAG_AR[t]}{t === 'personal' ? '؟' : ''}</span>)}
          {hasTrace && <button type="button" className="trace-btn" aria-pressed={on} onClick={onTrace}>{on ? 'إخفاء المسار' : 'تتبّع المسار'}</button>}
          <button type="button" className="more" aria-expanded={open} onClick={onToggle}>تفاصيل</button>
        </span>
      </div>
      {open && <FieldDetail f={f} m={m} />}
    </div>
  );
}

function FieldDetail({ f, m }: { f: FieldMapping; m: Model }) {
  const rep = m.idx.systems.get(f.reportedBySystemId);
  return (
    <dl className="fdetail" data-testid="field-detail">
      <dt>المسار المصدر</dt><dd className="ltr">{f.sourcePath ?? <Undoc />}</dd>
      <dt>المسار الوجهة</dt><dd className="ltr">{f.destinationPath ?? <Undoc />}</dd>
      <dt>الكيان</dt><dd dir="auto"><Undoc>{f.entity}</Undoc></dd>
      <dt>التحويل</dt><dd dir="auto"><Undoc>{f.transformation}</Undoc></dd>
      <dt>الاستخدام</dt><dd dir="auto"><Undoc>{f.usage}</Undoc></dd>
      <dt>مطلوب</dt><dd>{f.required === null ? <Undoc /> : f.required ? 'نعم' : 'لا'}</dd>
      <dt>الاتجاه كما ورد</dt><dd dir="auto"><Undoc>{f.directionRaw}</Undoc></dd>
      <dt>الدليل</dt><dd>{EVIDENCE_AR[f.evidence.level]}</dd>
      <dt>ربط التكامل</dt><dd>{LINK_AR[f.link.status]}{f.link.raw ? <> · <span className="ltr">{f.link.raw}</span></> : null}</dd>
      <dt>حالة المراجعة</dt><dd>{REVIEW_AR[f.reviewStatus]}</dd>
      <dt>المُبلّغ</dt><dd>{rep ? `${rep.key}${f.agentMappingId ? ` · ${f.agentMappingId}` : ''}` : '—'}</dd>
      {f.withheldFields.length > 0 && <><dt>محجوب</dt><dd>{WITHHELD}</dd></>}
    </dl>
  );
}

function Lineage({ m, hops, cur, onClose, onOpenInt, onFocusSys }: { m: Model; hops: Hop[]; cur: FieldMapping; onClose: () => void; onOpenInt: (id: string, map?: string | null) => void; onFocusSys: (id: string) => void }) {
  return (
    <div className="lineage" data-testid="lineage">
      <div className="hd">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <b>مسار «<span className="ltr">{cur.destinationPath}</span>» عبر الأنظمة</b>
          <span>مسار محتمل: يربط مطابقات حقول موثقة يتطابق فيها اسم الحقل الأخير عبر {hops.length} أنظمة. تحقق منه قبل الاعتماد عليه.</span>
        </div>
        <button type="button" className="icon-btn sm" aria-label="إغلاق المسار" onClick={onClose}>{Icon.close(16)}</button>
      </div>
      <div className="hops">
        {hops.map((h, i) => {
          const s = m.idx.systems.get(h.systemId)!;
          const isCur = h.mappingId === cur.id;
          const color = h.intId ? VSTYLE[verifOf(m, h.intId)].color : VSTYLE.documented.color;
          return (
            <span key={`${h.systemId}-${i}`} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <span className="hop-arrow" aria-hidden="true" style={{ color }}><i style={{ borderTopColor: color }} /><b style={{ borderRightColor: color }} /></span>}
              <button type="button" className={`hop${isCur ? ' cur' : ''}`} onClick={() => (h.intId ? onOpenInt(h.intId, h.mappingId) : onFocusSys(h.systemId))}>
                <span>{shortName(s)}</span><span>{h.field}</span>
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ how */

function HowTab({ m, x }: { m: Model; x: Integration }) {
  const reporter = m.idx.systems.get(x.reportedBySystemId)!;
  const r = x.registryRole;
  const registryUsed = [r.discovery, r.authorization, r.routing].includes('yes') || x.mechanism.kind === 'registry_assisted_api';
  const facts: { k: string; v: ReactNode; mono?: boolean; wide?: boolean }[] = [
    { k: 'اتجاه التبادل', v: dirText(m, x), wide: true },
    { k: 'المحفّز', v: <Undoc>{x.trigger.raw ?? (x.trigger.kind !== 'unknown' ? TRIGGER_AR[x.trigger.kind] : null)}</Undoc> },
    { k: 'التكرار', v: <Undoc>{x.trigger.frequency}</Undoc> },
    { k: 'الآلية', v: <>{MECH_AR[x.mechanism.kind]}{x.mechanism.raw ? <div className="m" style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{x.mechanism.raw}</div> : null}</> },
    { k: 'المصادقة', v: <Undoc>{x.auth}</Undoc> },
    {
      k: 'نقاط الاتصال', wide: true,
      v: x.endpoints.length ? <ul>{x.endpoints.map((e, i) => <li key={i} className="m">{e.method ? `${e.method} ` : ''}{e.path}</li>)}</ul> : <Undoc />,
    },
    {
      k: 'المسار ودور Registry', wide: true,
      v: registryUsed
        ? <>بمساعدة Registry — اكتشاف: {TRI_AR[r.discovery]} · رمز/تفويض: {TRI_AR[r.authorization]} · توجيه: {TRI_AR[r.routing]} · نقل بيانات: {TRI_AR[r.dataTransfer]}. {r.dataTransfer !== 'yes' ? 'تنتقل البيانات مباشرة بين النظامين؛ Registry ليس محطة عبور.' : ''}</>
        : 'مباشر بين النظامين (لا يذكر التقرير دورًا لـ Registry)',
    },
    { k: 'منحة Registry', v: GRANT_AR[x.registryGrant.status] },
    { k: 'حالة التفعيل في الكود', v: <>{DEPLOY_CLAIM_AR[x.deployment.status]}{x.deployment.raw ? <span className="muted"> · {x.deployment.raw}</span> : null}</> },
    { k: 'المُبلّغ عنه', v: `${reporter.displayName} (${reporter.key})` },
    { k: 'النطاق', v: SCOPE_AR[x.scope] },
    { k: 'الاتجاه كما ورد في التقرير', v: <span className="m"><Undoc>{x.direction.raw}</Undoc></span> },
  ];
  if (x.sdkSystemIds.length) facts.push({ k: 'مكتبات SDK', v: x.sdkSystemIds.map((id) => m.idx.systems.get(id)?.displayName ?? id).join('، ') });
  for (const end of [x.source, x.target]) {
    if (!end.systemId) facts.push({ k: 'طرف غير محدد', v: <>{end.unresolved ? UNRESOLVED_AR[end.unresolved.class] : 'غير معروف'}{end.raw ? <span className="m"> · {end.raw}</span> : null}</>, wide: true });
  }
  return (
    <div className="facts" data-testid="how-tab">
      {facts.map((f) => (
        <div key={f.k} className={`fact${f.wide ? ' wide' : ''}`}>
          <span>{f.k}</span>
          <div dir="auto">{f.v}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- evidence */

function EvidenceTab({ m, x, onOpenInt }: { m: Model; x: Integration; onOpenInt: (id: string) => void }) {
  const v = verifOf(m, x.id);
  const st = VSTYLE[v];
  const evIndex = useMemo(() => new Map(m.d.evidence.map((e) => [e.id, e] as const)), [m]);
  const rank = EVIDENCE_RANK[x.evidence.level];
  const checks = [
    { t: 'طرفا التكامل محددان', on: !!x.source.systemId && !!x.target.systemId },
    { t: 'اتجاه البيانات موثق', on: x.direction.data !== 'unknown' },
    { t: 'دليل من الكود المصدري (مُبلّغ من وكيل التدقيق)', on: rank >= EVIDENCE_RANK.code_observed },
    { t: 'تحقق اختباري أو تشغيلي (مُبلّغ)', on: rank >= EVIDENCE_RANK.test_verified },
    { t: 'مؤكد من الطرفين أو مطابق لواجهة المزوّد', on: x.corroboration.state === 'two_sided' || x.corroboration.state === 'provider_surface_match' },
  ];
  const qs = m.questions.get(x.id) ?? [];
  const evs = x.evidenceIds.map((id) => evIndex.get(id)).filter((e) => !!e);
  return (
    <div className="ev" data-testid="evidence-tab">
      <div className="ev-box" style={{ background: st.bg }}>
        <VerifSwatch v={v} w={32} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <b style={{ color: st.ink }}>{VERIF_AR[v]}</b>
          <span>{VERIF_BASIS[v]}</span>
          <span>مستوى الدليل المُبلّغ: <b style={{ fontSize: 13 }}>{EVIDENCE_AR[x.evidence.level]}</b> · التأكيد: {CORROB_AR[x.corroboration.state]}</span>
        </div>
      </div>
      <div>
        <h3>ما تم التحقق منه (وفق تقرير التدقيق)</h3>
        <ul className="checks">
          {checks.map((c) => (
            <li key={c.t} className={c.on ? 'on' : 'off'}>
              <span className="ci" aria-hidden="true">{c.on ? Icon.check('#FFFFFF') : null}</span>
              <span>{c.t}</span>{!c.on && <span className="st">— لم يتحقق</span>}
            </li>
          ))}
        </ul>
      </div>
      {evs.length > 0 && (
        <div>
          <h3>سجلات الأدلة ({evs.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {evs.map((e) => (
              <div key={e.id} className="evrec">
                <span dir="auto">{e.contentWithheld ? WITHHELD : <Undoc>{e.finding}</Undoc>}</span>
                {(e.file || e.symbol) && <span className="loc">{[e.file, e.lines ? `:${e.lines}` : '', e.symbol ? ` · ${e.symbol}` : ''].join('')}</span>}
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{EVIDENCE_AR[e.level]}{e.observedAt ? ` · ${e.observedAt}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {x.corroboration.counterpartIds.length > 0 && (
        <div>
          <h3>ادعاءات مقابلة من الطرف الآخر</h3>
          <div className="sibs">
            {x.corroboration.counterpartIds.map((id) => {
              const y = m.idx.integrations.get(id);
              return y ? <button type="button" key={id} onClick={() => onOpenInt(id)}>{m.idx.systems.get(y.reportedBySystemId)?.key} · {y.agentIntegrationId}</button> : null;
            })}
          </div>
        </div>
      )}
      {qs.length > 0 && (
        <div>
          <h3>أسئلة مفتوحة</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {qs.map((q, i) => (
              <div key={i} className="oq"><span className="qdot-lg" aria-hidden="true" style={{ marginTop: 0 }} /><span style={{ flex: 1 }} dir="auto">{q.text}</span><span className="k">{Q_AR[q.kind]}</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- unlinked */

function UnlinkedPanel({ model: m, sysId, highlight, onClose, closeRef }: Props & { sysId: string; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  const fadeRef = useScrollFade<HTMLDivElement>();
  const sys = m.idx.systems.get(sysId)!;
  const rows = m.unlinked.get(sysId) ?? [];
  const [open, setOpen] = useState<string | null>(highlight);
  return (
    <>
      <div className="drawer-head" style={{ paddingBottom: 14 }}>
        <div className="row1">
          <div className="codes"><span className="code-chip">{sys.key}</span><span className="vbadge" style={{ background: VSTYLE.needs_verification.bg, color: VSTYLE.needs_verification.ink }}>ربط غير مؤكد</span></div>
          <button type="button" ref={closeRef} className="icon-btn" aria-label="إغلاق" onClick={onClose} data-testid="drawer-close">{Icon.close()}</button>
        </div>
        <h2>حقول غير مرتبطة بتكامل محدد</h2>
        <p className="why">أبلغ {shortName(sys)} عن {nCount(rows.length, 'مطابقة حقل واحدة', 'مطابقتي حقل', 'مطابقات حقول')} لا ترتبط بتكامل واحد مؤكد. تبقى ظاهرة هنا للمراجعة ولا تُحتسب كربط مؤكد.</p>
      </div>
      <div className="drawer-body fade-y" ref={fadeRef} data-testid="field-table">
        <div className="fsec">
          <div className="fgrid hd"><span>الحقل المصدر</span><span /><span>الحقل الوجهة</span><span>النوع</span><span>حالة الربط</span></div>
          {rows.map((f) => (
            <FieldRowUnlinked key={f.id} f={f} m={m} hl={highlight === f.id} open={open === f.id} onToggle={() => setOpen(open === f.id ? null : f.id)} />
          ))}
        </div>
      </div>
      <ReadOnlyFoot />
    </>
  );
}

function FieldRowUnlinked({ f, m, hl, open, onToggle }: { f: FieldMapping; m: Model; hl: boolean; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (hl) ref.current?.scrollIntoView({ block: 'center' }); }, [hl]);
  return (
    <div ref={ref} className={`frow${hl ? ' hl' : ''}`} data-testid="field-row" data-mapping={f.id}>
      <div className="fgrid">
        <span className="p">{f.sourcePath ?? <Undoc />}</span>
        {Icon.arrowL()}
        <span className="p">{f.destinationPath ?? <Undoc />}</span>
        <span className="ty">{f.dataType ?? '—'}</span>
        <span className="tg">
          <span className="tag uncertain_link">{LINK_AR[f.link.status]}</span>
          <button type="button" className="more" aria-expanded={open} onClick={onToggle}>تفاصيل</button>
        </span>
      </div>
      {open && <FieldDetail f={f} m={m} />}
    </div>
  );
}
