import { forwardRef, useMemo, useState } from 'react';
import type { Dataset } from '@shared/schema.ts';
import type { Index } from '@shared/graph.ts';
import { search, type SearchHit } from '@shared/analysis.ts';
import { Icon } from '../ui.tsx';

const KIND_AR: Record<SearchHit['type'], string> = { system: 'نظام', integration: 'تكامل', entity: 'كيان', field: 'حقل' };

type Props = { dataset: Dataset; idx: Index; onPick: (h: SearchHit) => void };

export const SearchBox = forwardRef<HTMLInputElement, Props>(function SearchBox({ dataset, idx, onPick }, ref) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => search(dataset, idx, q, 12), [dataset, idx, q]);
  const show = open && q.trim().length >= 2;
  const pick = (h: SearchHit) => { onPick(h); setQ(''); setOpen(false); };
  return (
    <div className="search" role="search">
      <label htmlFor="atlas-search" className="sr-only">ابحث في الخريطة</label>
      {Icon.search()}
      <input
        id="atlas-search" ref={ref} value={q} autoComplete="off" spellCheck={false} data-testid="search-input"
        placeholder="ابحث عن نظام أو تكامل أو حقل — مثل: APMP، units، /api/integration"
        role="combobox" aria-expanded={show} aria-controls="search-results" aria-autocomplete="list"
        aria-activedescendant={show && hits[active] ? `hit-${active}` : undefined}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pick(hits[active]!); }
          else if (e.key === 'Escape') { e.stopPropagation(); if (q) setQ(''); else (e.target as HTMLInputElement).blur(); setOpen(false); }
        }}
      />
      {q && <button type="button" className="icon-btn sm clear" aria-label="مسح البحث" onClick={() => setQ('')}>{Icon.close(16)}</button>}
      {show && (
        <div className="search-pop" id="search-results" role="listbox" aria-label="نتائج البحث" data-testid="search-results">
          {hits.length === 0 && <div className="search-empty">لا توجد نتائج مطابقة.</div>}
          {hits.map((h, i) => (
            <button type="button" key={`${h.type}:${h.id}`} id={`hit-${i}`} role="option" aria-selected={i === active} className="search-hit"
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(h)}>
              <span className="kind">{KIND_AR[h.type]}</span>
              <span className="body">
                <span className="title" dir="auto">{h.label}</span>
                <span className="sub" dir="auto">{h.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
