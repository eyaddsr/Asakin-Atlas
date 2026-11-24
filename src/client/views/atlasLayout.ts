/** Deterministic lane layout for the Atlas (design artboard 1), in LTR pixel coordinates. */
import type { LaneId, Model } from '@shared/atlas.ts';
import { LANES, shortName } from '@shared/atlas.ts';

export const TILE_W = 184;
export const TILE_H = 52;
const ROW = 62;
const SUB = 204;
const PAD = 12;
const GAP = 22;
const TOP = 96;
const BOTTOM = 96;
const SIDE = 24;
const MAX_ROWS = 10;

export type Pt = { x: number; y: number };
export type LaneBox = { id: LaneId; ar: string; en: string; idx: string; x: number; w: number; cx: number; n: number; top: number; bottom: number };
export type AtlasLayout = { W: number; H: number; pos: Map<string, Pt>; lanes: LaneBox[] };

/** Lanes run right → left in reading order (القنوات first), so the LTR drawing order is reversed. */
export function layoutAtlas(m: Model): AtlasLayout {
  const order = [...LANES].reverse();
  const groups = order.map((l) => ({
    lane: l,
    list: m.d.systems.filter((s) => m.lane.get(s.id) === l.id)
      .sort((a, b) => a.domain.localeCompare(b.domain) || shortName(a).localeCompare(shortName(b)) || (a.key < b.key ? -1 : 1)),
  }));
  const shape = groups.map((g) => {
    const n = g.list.length;
    const cols = Math.max(1, Math.ceil(n / MAX_ROWS));
    return { ...g, n, cols, rows: Math.max(1, Math.ceil(n / cols)) };
  });
  const maxRows = Math.max(...shape.map((s) => s.rows));
  const areaH = maxRows * ROW;
  const pos = new Map<string, Pt>();
  const lanes: LaneBox[] = [];
  let x = SIDE;
  for (const g of shape) {
    const w = g.cols * SUB + PAD * 2;
    g.list.forEach((s, i) => {
      const c = Math.floor(i / g.rows);               // c = 0 is the right-most sub-column
      const r = i % g.rows;
      const inCol = Math.min(g.rows, g.n - c * g.rows);
      pos.set(s.id, {
        x: x + PAD + (g.cols - 1 - c) * SUB + SUB / 2,
        y: TOP + (areaH - inCol * ROW) / 2 + r * ROW + ROW / 2,
      });
    });
    lanes.push({ id: g.lane.id, ar: g.lane.ar, en: g.lane.en, idx: g.lane.idx, x, w, cx: x + w / 2, n: g.n, top: 14, bottom: TOP + areaH + BOTTOM - 14 });
    x += w + GAP;
  }
  return { W: x - GAP + SIDE, H: TOP + areaH + BOTTOM, pos, lanes };
}

export type Curve = [Pt, Pt, Pt, Pt];

/** Cubic thread between two tiles; `lane` (−1/0/1) separates the two orientations of a reciprocal pair. */
export function threadCurve(P: Pt, Q: Pt, lane: number): Curve {
  if (Math.abs(P.x - Q.x) < 1) {
    const sx = P.x - TILE_W / 2;
    const bx = sx - 34 - Math.abs(lane) * 10;
    const o = lane * 5;
    return [{ x: sx, y: P.y + o }, { x: bx, y: P.y + o }, { x: bx, y: Q.y + o }, { x: sx, y: Q.y + o }];
  }
  const dir = Q.x > P.x ? 1 : -1;
  const sx = P.x + dir * TILE_W / 2; const ex = Q.x - dir * TILE_W / 2;
  const sy = P.y + lane * 6; const ey = Q.y + lane * 6;
  const mx = (sx + ex) / 2;
  return [{ x: sx, y: sy }, { x: mx, y: sy }, { x: mx, y: ey }, { x: ex, y: ey }];
}

export const curveD = (c: Curve) => `M ${c[0].x} ${c[0].y} C ${c[1].x} ${c[1].y}, ${c[2].x} ${c[2].y}, ${c[3].x} ${c[3].y}`;

export function curveAt(c: Curve, t: number): { p: Pt; angle: number } {
  const u = 1 - t;
  const p = {
    x: u * u * u * c[0].x + 3 * u * u * t * c[1].x + 3 * u * t * t * c[2].x + t * t * t * c[3].x,
    y: u * u * u * c[0].y + 3 * u * u * t * c[1].y + 3 * u * t * t * c[2].y + t * t * t * c[3].y,
  };
  const dx = 3 * u * u * (c[1].x - c[0].x) + 6 * u * t * (c[2].x - c[1].x) + 3 * t * t * (c[3].x - c[2].x);
  const dy = 3 * u * u * (c[1].y - c[0].y) + 6 * u * t * (c[2].y - c[1].y) + 3 * t * t * (c[3].y - c[2].y);
  return { p, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}
