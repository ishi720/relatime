// 関係の線の形: 同じ2人の間に複数あるときは曲げてずらし、ラベルは人物の外側の空いた区間の中央に置く
import { R } from './constants';
import { nodeExtent } from './model';
import type { Edge, VNode } from './types';

const unit = (x: number, y: number): [number, number] => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

export type EdgeGeom = {
  d: string;
  arrows: string[];
  label: { x: number; y: number } | null;
};

/** i: 同じ2人の間の何本目か / count: その2人の間の本数 */
export function edgeGeometry(e: Edge, a: VNode, b: VNode, i: number, count: number): EdgeGeom {
  const [p, q] = e.from < e.to ? [a, b] : [b, a];
  const L = Math.hypot(q.x - p.x, q.y - p.y) || 1, nx = -(q.y - p.y) / L, ny = (q.x - p.x) / L;
  const off = (i - (count - 1) / 2) * 54;
  const cx = (a.x + b.x) / 2 + nx * off * 2, cy = (a.y + b.y) / 2 + ny * off * 2;
  const rr = R + 5;
  const [ux, uy] = unit(cx - a.x, cy - a.y), [vx, vy] = unit(cx - b.x, cy - b.y);
  const sx = a.x + ux * rr, sy = a.y + uy * rr, ex = b.x + vx * rr, ey = b.y + vy * rr;
  const head = (tx: number, ty: number, dx: number, dy: number) => {
    const [ax, ay] = unit(dx, dy), bx = tx - ax * 13, by = ty - ay * 13, px = -ay * 6.5, py = ax * 6.5;
    return `M${tx},${ty} L${bx + px},${by + py} L${bx - px},${by - py} Z`;
  };
  const arrows: string[] = [];
  let lsx = sx, lsy = sy, lex = ex, ley = ey;
  if (e.dir === 'forward' || e.dir === 'both') {
    arrows.push(head(ex, ey, ex - cx, ey - cy));
    const [dx, dy] = unit(ex - cx, ey - cy); lex -= dx * 9; ley -= dy * 9;
  }
  if (e.dir === 'both') {
    arrows.push(head(sx, sy, sx - cx, sy - cy));
    const [dx, dy] = unit(sx - cx, sy - cy); lsx -= dx * 9; lsy -= dy * 9;
  }
  const d = `M${lsx},${lsy} Q${cx},${cy} ${lex},${ley}`;
  if (!e.label) return { d, arrows, label: null };
  // 線が人物（名前・肩書き含む）の範囲を出る位置
  const exitT = (n: VNode, ddx: number, ddy: number) => {
    const ext = nodeExtent(n), hw = (ext.x1 - ext.x0) / 2 + 4, top = ext.y0 - n.y - (n.status ? 10 : 0) - 4, bot = ext.y1 - n.y + 4;
    const tx = ddx > 0 ? hw / ddx : ddx < 0 ? -hw / ddx : Infinity, ty = ddy > 0 ? bot / ddy : ddy < 0 ? top / ddy : Infinity;
    return Math.min(tx, ty);
  };
  const ta = exitT(a, b.x - a.x, b.y - a.y), tb = exitT(b, a.x - b.x, a.y - b.y);
  const lt = ta + tb < 0.92 ? (ta + 1 - tb) / 2 : 0.5, u1 = 1 - lt;
  return {
    d,
    arrows,
    label: { x: u1 * u1 * sx + 2 * u1 * lt * cx + lt * lt * ex, y: u1 * u1 * sy + 2 * u1 * lt * cy + lt * lt * ey },
  };
}

/** 同じ2人の間の関係ごとに [何本目, 本数] を割り当てる */
export function pairIndex(edges: Edge[]) {
  const pairs = new Map<string, Edge[]>();
  for (const e of edges) {
    const k = [e.from, e.to].sort().join('|');
    (pairs.get(k) || pairs.set(k, []).get(k)!).push(e);
  }
  const out = new Map<string, [number, number]>();
  for (const list of pairs.values()) list.forEach((e, i) => out.set(e.id, [i, list.length]));
  return out;
}
