import type { CSSProperties } from 'react';
import type { Model, Thread } from '@shared/atlas.ts';
import { fieldTags, intTitle, shortName } from '@shared/atlas.ts';
import { MECH_AR } from '../labels.ts';

/** Hover card for a thread (design artboard 2): who → whom, mechanism, title, the data it carries. */
export function ThreadCard({ model, thread, style }: { model: Model; thread: Thread; style: CSSProperties }) {
  const ints = thread.intIds.map((id) => model.idx.integrations.get(id)!).filter(Boolean);
  const from = model.idx.systems.get(thread.from); const to = model.idx.systems.get(thread.to);
  const mechs = [...new Set(ints.map((x) => MECH_AR[x.mechanism.kind]))];
  const fields = ints.flatMap((x) => model.mappings.get(x.id) ?? []).filter((f) => f.link.status === 'matched');
  const label = thread.fwd && !thread.back ? 'يُرسَل' : thread.back && !thread.fwd ? 'يعود في الاستجابة' : thread.fwd && thread.back ? 'بيانات في الاتجاهين' : 'الحقول (اتجاه غير موثق)';
  return (
    <div className="edge-card" style={style} data-testid="thread-card" role="tooltip">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span className="route">
          <span>{from ? shortName(from) : '؟'}</span><span aria-hidden="true">←</span><span>{to ? shortName(to) : '؟'}</span>
          <span aria-hidden="true">·</span><span>{mechs.slice(0, 2).join(' · ')}</span>
        </span>
        <span className="ttl">{ints.length === 1 ? intTitle(ints[0]!) : `${ints.length} تكاملات بين النظامين`}</span>
        {ints.length > 1 && (
          <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            {ints.slice(0, 3).map((x) => intTitle(x)).join(' · ')}{ints.length > 3 ? ` · +${ints.length - 3}` : ''}
          </span>
        )}
      </div>
      {fields.length > 0 ? (
        <div className="sec">
          <span>{label}</span>
          {fields.slice(0, 4).map((f) => (
            <span className="fd" key={f.id}>
              <span className="p">{f.sourcePath ?? 'غير موثق'} → {f.destinationPath ?? 'غير موثق'}</span>
              {fieldTags(f).includes('personal') && <span className="tag personal">بيان شخصي</span>}
            </span>
          ))}
          {fields.length > 4 && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>+ {fields.length - 4} حقول أخرى</span>}
        </div>
      ) : <span style={{ fontSize: 12, color: 'var(--attn-ink)' }}>لم تُوثّق الحقول المتبادلة بعد</span>}
      {thread.needs > 0 && <span style={{ fontSize: 12, color: 'var(--attn-ink)' }}>{thread.needs} {thread.needs === 1 ? 'تكامل يحتاج' : 'تكاملات تحتاج'} تحققًا</span>}
      <span className="foot">انقر على الخط لعرض كل البيانات وتتبّعها</span>
    </div>
  );
}
