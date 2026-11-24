import type { Dataset } from '@shared/schema.ts';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Open access: the snapshot is served without sign-in (see server/auth.ts). */
export async function getSnapshot(): Promise<Dataset> {
  const r = await fetch('/api/snapshot', { credentials: 'same-origin' });
  if (r.status === 503) { const b = await r.json().catch(() => ({})); throw new ApiError(503, `اللقطة المعتمدة غير متاحة: ${b.message ?? ''}`); }
  if (!r.ok) throw new ApiError(r.status, 'تعذّر تحميل اللقطة');
  return r.json();
}
