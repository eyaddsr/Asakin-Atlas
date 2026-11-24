import type { CSSProperties, ReactNode } from 'react';
import type { LaneId, Verif } from '@shared/atlas.ts';

/** Line semantics from the approved design: colour + dash = verification state. */
export const VSTYLE: Record<Verif, { color: string; ink: string; dash: string; bg: string; css: 'solid' | 'dashed' | 'dotted' }> = {
  documented: { color: '#2B44D6', ink: '#2336B0', dash: '', bg: '#EEF1FD', css: 'solid' },
  partial: { color: '#5B70E0', ink: '#2E43C2', dash: '7 5', bg: '#F1F3FC', css: 'dashed' },
  needs_verification: { color: '#C24E0A', ink: '#953A05', dash: '1 6', bg: '#FDF1E8', css: 'dotted' },
};

export function VerifSwatch({ v, w = 24, op = 1 }: { v: Verif; w?: number; op?: number }) {
  const s = VSTYLE[v];
  return (
    <svg width={w} height="6" viewBox={`0 0 ${w} 6`} aria-hidden="true" style={{ opacity: op, flex: 'none' }}>
      <line x1="2" y1="3" x2={w - 2} y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash || undefined} strokeLinecap="round" />
    </svg>
  );
}

type MonoHow = '' | 'inv' | 'dim';
export function monoColors(lane: LaneId | 'unresolved', how: MonoHow = '') {
  if (lane === 'unresolved') return { bg: '#FFFFFF', fg: '#953A05', bd: '#E3A47E', st: 'dashed' };
  if (how === 'inv') return { bg: '#FFFFFF', fg: '#0E1420', bd: '#FFFFFF', st: 'solid' };
  if (how === 'dim') {
    if (lane === 'external') return { bg: '#FFFFFF', fg: '#8E97A5', bd: '#CDD3DC', st: 'dashed' };
    const c = lane === 'core' ? '#B9C3F1' : '#C3C9D3';
    return { bg: c, fg: '#FFFFFF', bd: c, st: 'solid' };
  }
  if (lane === 'core') return { bg: '#2B44D6', fg: '#FFFFFF', bd: '#2B44D6', st: 'solid' };
  if (lane === 'external') return { bg: '#FFFFFF', fg: '#0E1420', bd: '#8A93A3', st: 'dashed' };
  return { bg: '#0E1420', fg: '#FFFFFF', bd: '#0E1420', st: 'solid' };
}

export function Monogram({ code, lane, size = 34, how = '', round = false }: { code: string; lane: LaneId | 'unresolved'; size?: number; how?: MonoHow; round?: boolean }) {
  const c = monoColors(lane, how);
  const fs = size >= 50 ? 13 : size >= 34 ? (code.length > 3 ? 9.5 : 10.5) : (code.length > 3 ? 8 : 9);
  const style: CSSProperties = {
    width: size, height: size, background: c.bg, color: c.fg, borderColor: c.bd, borderStyle: c.st as CSSProperties['borderStyle'],
    fontSize: fs, borderRadius: round ? '50%' : size >= 50 ? 'var(--r-xl)' : 'var(--r-sm)',
  };
  return <span className={round ? 'mono-badge round' : 'mono-badge'} style={style} aria-hidden="true">{code}</span>;
}

const svgProps = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
export const Icon = {
  search: (c = '#566070') => <svg className="lead" width="18" height="18" viewBox="0 0 24 24" {...svgProps} stroke={c} strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  close: (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" {...svgProps} strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  target: () => <svg width="18" height="18" viewBox="0 0 24 24" {...svgProps} strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /></svg>,
  twoWay: () => <svg width="16" height="16" viewBox="0 0 24 24" {...svgProps} strokeWidth="2"><path d="M20 8H5M9 4 5 8l4 4M4 16h15M15 12l4 4-4 4" /></svg>,
  radar: () => <svg width="18" height="18" viewBox="0 0 24 24" {...svgProps} strokeWidth="1.8"><circle cx="12" cy="12" r="2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" /></svg>,
  cursor: () => <svg width="16" height="16" viewBox="0 0 24 24" {...svgProps} stroke="#566070" strokeWidth="1.8"><path d="M19 3 5 10l6 2 2 6z" /></svg>,
  check: (c: string) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  arrowL: () => <svg width="16" height="16" viewBox="0 0 24 24" {...svgProps} stroke="#8A93A3" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>,
  download: () => <svg width="14" height="14" viewBox="0 0 24 24" {...svgProps} strokeWidth="2"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>,
  oneWay: () => <svg width="34" height="14" viewBox="0 0 34 14" {...svgProps} stroke="#2B44D6" strokeWidth="2"><path d="M32 7H3M8 2 3 7l5 5" /></svg>,
  bothWays: () => <svg width="34" height="14" viewBox="0 0 34 14" {...svgProps} stroke="#2B44D6" strokeWidth="2"><path d="M32 3.5H3M6 1 3 3.5 6 6M2 10.5h29M28 8l3 2.5L28 13" /></svg>,
};

/** Asakin company logo (Dark Blue · English · horizontal), from the Asakin brand kit. */
export function AsakinLogo({ height = 28 }: { height?: number }) {
  return (
    <svg height={height} width={(height * 553.92) / 109.75} viewBox="0 0 553.92 109.75" fill="#1e305e" aria-hidden="true" focusable="false">
      <path d="M126.32,109.71h-14.22V33.87L45.16,14.33v30.97h-14.22V13.93c0-4.43,2.03-8.49,5.58-11.15,3.54-2.65,8.01-3.46,12.25-2.21l67.53,19.71c5.9,1.73,10.01,7.22,10.01,13.36v76.07Z" />
      <path d="M71.06,109.71h-14.22v-51.51l-42.63-12.44v63.96H0V42.64c0-3.78,1.73-7.24,4.75-9.51,3.02-2.26,6.83-2.96,10.46-1.9l47.3,13.81c5.04,1.47,8.55,6.16,8.55,11.41v53.26Z" />
      <path d="M553.92,109.71h-13.43v-47.76l-39.37-11.49v59.25h-13.43v-62.29c0-3.54,1.63-6.79,4.46-8.92,2.83-2.12,6.41-2.77,9.81-1.78l43.93,12.82c4.72,1.38,8.02,5.78,8.02,10.7v49.47Z" />
      <path d="M369.3,35.81h-39.4c-2.05,0-3.71,1.66-3.71,3.71v8.12h38.3v21.75l-1.06-1.42c-4.6-6.1-10.39-8.58-20-8.58-17.82,0-25.79,12.64-25.79,25.15s7.98,25.21,25.79,25.21c9.6,0,15.4-2.5,20-8.61l1.06-1.42v9.98h13.54V44.56c0-4.83-3.92-8.75-8.73-8.75ZM347.85,97.68c-10.41,0-16.63-4.91-16.63-13.14s6.22-13.09,16.63-13.09,16.65,4.9,16.65,13.09-6.22,13.14-16.65,13.14Z" />
      <path d="M435.64,37.27l-20.61,30.34h-12.4V23.09c0-1.7-1.38-3.08-3.08-3.08h-10.46v89.74h13.54v-30.06h12.4l20.61,30.06h16.4l-24.77-36.09,21.5-31.59c1.39-2.04-.07-4.81-2.54-4.81h-10.58Z" />
      <rect x="463.09" y="44.05" width="13.55" height="65.7" />
      <path d="M475.19,23l-10.29-2.78c-.96-.11-1.81.64-1.81,1.61v11.71h13.54v-8.93c0-.82-.62-1.52-1.43-1.61Z" />
      <path d="M277.29,65.7c-6.29-1.67-10-3.24-12.15-4.93-2.15-1.69-2.72-3.52-2.72-5.75,0-2.69,1.31-7.2,10.09-7.36l27.81-.02v-8.72c0-1.7-1.38-3.08-3.08-3.08h-21.11c-2.99,0-4.93.11-6.02.19-.22.02-.36.03-.44.05-12.86,1.53-20.8,8.94-20.8,19.35s4.39,17.45,26.33,22.1c13.33,2.84,17.85,5.7,17.85,11.29,0,2.57-1.2,8.64-12.23,9.08h-26.24c-1.7,0-3.08,1.38-3.08,3.08v8.72h29.33c7.74-.22,14.29-2.42,18.95-6.37,4.44-3.79,6.78-8.86,6.78-14.67,0-12.89-7.68-17.23-29.3-22.97Z" />
      <path d="M204.76,20.79h-10.66c-2.31,0-4.37,1.46-5.13,3.64l-29.95,85.32h15.02l7.25-20.64h36.28l7.25,20.64h15.05l-29.98-85.32c-.77-2.18-2.82-3.64-5.13-3.64ZM185.78,76.34l13.66-38.89,13.66,38.89h-27.33Z" />
    </svg>
  );
}

export const Undoc = ({ children }: { children?: ReactNode }) =>
  (children === null || children === undefined || children === '' ? <span className="undoc">غير موثق</span> : <>{children}</>);
