/*
 * 自動配置
 * 1. 初期配置を変えて何通りも力学シミュレーション（反発・関係のばね・グループのまとまり等）
 * 2. おおよその位置を縦横のマス目に割り当て、空いた行・列を詰める
 * 3. 「重なり・線の交差・線が人を貫く・グループの四角に関係ない人が入る」などを採点
 * 4. 上位の案は一人ずつ近くのマスへの移動・入れ替えで仕上げ、一番点数の良い案を返す
 */
import { R } from './constants';
import { nodeExtent } from './model';
import type { Edge, Group, Pos, VNode } from './types';
import { clamp, textW } from './util';

function rng32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 2つの線分が交差するか */
function segX(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
/** 点と線分の距離 */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1), qx = ax + vx * t, qy = ay + vy * t;
  return { d: Math.hypot(px - qx, py - qy), qx, qy, t };
}
type Box = { x0: number; y0: number; x1: number; y1: number };
type Cell = [number, number];

export function computeLayout(ns: VNode[], edges: Edge[], groups: Group[], seed: number): Pos[] {
  const N = ns.length, idx = new Map(ns.map((n, i) => [n.id, i]));
  // 人物ごとの占有範囲（名前・肩書きの文字幅を含む）。中心からの相対
  const ex = ns.map((n) => { const e = nodeExtent(n); return { hw: (e.x1 - e.x0) / 2, cy: (e.y0 + e.y1) / 2 - n.y, hh: (e.y1 - e.y0) / 2 }; });
  // 関係（同じ2人の間の複数本は1本にまとめ、ラベルが長いほど距離を取る）
  const pm = new Map<string, { i: number; j: number; c: number; lw: number }>();
  for (const e of edges) {
    const i = idx.get(e.from), j = idx.get(e.to);
    if (i === undefined || j === undefined) continue;
    const k = i < j ? `${i}|${j}` : `${j}|${i}`;
    const p = pm.get(k) || { i: Math.min(i, j), j: Math.max(i, j), c: 0, lw: 0 };
    p.c++; p.lw = Math.max(p.lw, textW(e.label, 12.5)); pm.set(k, p);
  }
  const P = [...pm.values()].map((p) => ({ ...p, L: 150 + p.lw * 0.35 + (p.c - 1) * 24 }));
  const deg = ns.map(() => 0);
  P.forEach((p) => { deg[p.i]++; deg[p.j]++; });
  const G = groups.map((g) => ns.map((n, i) => (n.groups.includes(g.id) ? i : -1)).filter((i) => i >= 0)).filter((m) => m.length);
  const inG = G.map((m) => new Set(m));
  // 描画と同じ大きさの四角（入れ子の段数による余白）で判定する
  const rankG = G.map((m, g) => {
    let rk = 0;
    G.forEach((h, j) => { if (j === g || !h.some((i) => inG[g].has(i))) return; if (h.length < m.length || (h.length === m.length && j < g)) rk++; });
    return rk;
  });
  const span = (pos: Pos[], m: number[]) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of m) {
      const e = ex[i];
      x0 = Math.min(x0, pos[i].x - e.hw); x1 = Math.max(x1, pos[i].x + e.hw);
      y0 = Math.min(y0, pos[i].y + e.cy - e.hh); y1 = Math.max(y1, pos[i].y + e.cy + e.hh);
    }
    return { x0, y0, x1, y1 };
  };
  const realBox = (pos: Pos[], g: number): Box => {
    const s = span(pos, G[g]), ps = 18 + 16 * rankG[g], pt = 46 + 32 * rankG[g];
    return { x0: s.x0 - ps, y0: s.y0 - pt, x1: s.x1 + ps, y1: s.y1 + ps };
  };
  const groupBox = (pos: Pos[], m: number[], pad: number): Box => {
    const s = span(pos, m);
    return { x0: s.x0 - pad, y0: s.y0 - pad - 30, x1: s.x1 + pad, y1: s.y1 + pad };
  };
  const rnd = rng32(seed * 7919 + N * 31 + P.length);

  function init(t: number): Pos[] {
    if (t === 0 && seed === 1) return ns.map((n) => ({ x: n.x + (rnd() - 0.5) * 4, y: n.y + (rnd() - 0.5) * 4 }));
    const k = G.length, rg = k > 1 ? 140 + 70 * k + 25 * Math.sqrt(N) : 0, a0 = rnd() * Math.PI * 2;
    const gc = G.map((_, g) => ({ x: Math.cos(a0 + (g * 2 * Math.PI) / k) * rg * 1.3, y: Math.sin(a0 + (g * 2 * Math.PI) / k) * rg * 0.8 }));
    return ns.map((_, i) => {
      const gs = G.map((m, g) => (inG[g].has(i) ? g : -1)).filter((g) => g >= 0);
      const j = 60 + 25 * Math.sqrt(N), a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * j;
      if (gs.length) {
        const cx = gs.reduce((s, g) => s + gc[g].x, 0) / gs.length, cy = gs.reduce((s, g) => s + gc[g].y, 0) / gs.length;
        return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
      }
      const R0 = rg + 160 + 40 * Math.sqrt(N);
      return { x: Math.cos(a) * R0 * Math.sqrt(rnd()) * 1.3, y: Math.sin(a) * R0 * Math.sqrt(rnd()) * 0.8 };
    });
  }

  function simulate(pos: Pos[], IT: number) {
    const K = 150;
    for (let it = 0; it < IT; it++) {
      const prog = it / IT, T = 70 * Math.pow(1 - prog, 1.6) + 0.6;
      const dx = new Float64Array(N), dy = new Float64Array(N);
      // 反発と重なり防止
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
          let x = pos[i].x - pos[j].x, y = pos[i].y - pos[j].y;
          let d = Math.hypot(x, y);
          if (d < 0.01) { x = rnd() - 0.5; y = rnd() - 0.5; d = Math.hypot(x, y); }
          if (d < 900) { const f = (K * K) / d; dx[i] += (x / d) * f; dy[i] += (y / d) * f; dx[j] -= (x / d) * f; dy[j] -= (y / d) * f; }
          const ox = ex[i].hw + ex[j].hw + 28 - Math.abs(x), yc = pos[i].y + ex[i].cy - (pos[j].y + ex[j].cy), oy = ex[i].hh + ex[j].hh + 22 - Math.abs(yc);
          if (ox > 0 && oy > 0) {
            if (ox < oy) { const s = Math.sign(x) || 1; dx[i] += s * ox * 3; dx[j] -= s * ox * 3; }
            else { const s = Math.sign(yc) || 1; dy[i] += s * oy * 3; dy[j] -= s * oy * 3; }
          }
        }
      // 関係のばね
      for (const p of P) {
        const a = pos[p.i], b = pos[p.j], x = b.x - a.x, y = b.y - a.y, d = Math.hypot(x, y) || 0.01, f = (d - p.L) * 0.9;
        dx[p.i] += (x / d) * f; dy[p.i] += (y / d) * f; dx[p.j] -= (x / d) * f; dy[p.j] -= (y / d) * f;
      }
      // グループのまとまりと、関係ない人を枠の外へ
      G.forEach((m, g) => {
        const cx = m.reduce((s, i) => s + pos[i].x, 0) / m.length, cy = m.reduce((s, i) => s + pos[i].y, 0) / m.length;
        for (const i of m) { dx[i] += (cx - pos[i].x) * 0.7; dy[i] += (cy - pos[i].y) * 0.7; }
        if (prog < 0.2) return;
        const b = groupBox(pos, m, 34);
        for (let i = 0; i < N; i++) {
          if (inG[g].has(i)) continue;
          const e = ex[i], l = pos[i].x - e.hw, r = pos[i].x + e.hw, t = pos[i].y + e.cy - e.hh, bt = pos[i].y + e.cy + e.hh;
          if (r <= b.x0 || l >= b.x1 || bt <= b.y0 || t >= b.y1) continue;
          const opt = ([[-(r - b.x0), 0], [b.x1 - l, 0], [0, -(bt - b.y0)], [0, b.y1 - t]] as [number, number][]).sort(
            (u, v) => Math.abs(u[0] + u[1]) - Math.abs(v[0] + v[1]),
          )[0];
          dx[i] += opt[0] * 4; dy[i] += opt[1] * 4;
          for (const k of m) { dx[k] -= (opt[0] * 4) / m.length; dy[k] -= (opt[1] * 4) / m.length; }
        }
      });
      // 共通メンバーのないグループどうしは四角が重ならないよう押し離す
      if (prog > 0.1) {
        const bx = G.map((m) => groupBox(pos, m, 30));
        for (let g = 0; g < G.length; g++)
          for (let h = g + 1; h < G.length; h++) {
            if (G[g].some((i) => inG[h].has(i))) continue;
            const a = bx[g], b = bx[h], ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
            if (ox <= 0 || oy <= 0) continue;
            const horiz = ox < oy;
            const sgn = horiz ? Math.sign(a.x0 + a.x1 - (b.x0 + b.x1)) || 1 : Math.sign(a.y0 + a.y1 - (b.y0 + b.y1)) || 1;
            const f = Math.min(ox, oy) * 1.6;
            for (const i of G[g]) { if (horiz) dx[i] += sgn * f; else dy[i] += sgn * f; }
            for (const i of G[h]) { if (horiz) dx[i] -= sgn * f; else dy[i] -= sgn * f; }
          }
      }
      // 線が関係ない人物の上を通らないように
      if (prog > 0.15)
        for (const p of P) {
          const a = pos[p.i], b = pos[p.j];
          for (let k = 0; k < N; k++) {
            if (k === p.i || k === p.j) continue;
            const s = segDist(pos[k].x, pos[k].y, a.x, a.y, b.x, b.y), lim = R + 34;
            if (s.d < lim && s.t > 0.02 && s.t < 0.98) {
              const ux = (pos[k].x - s.qx) / (s.d || 1), uy = (pos[k].y - s.qy) / (s.d || 1), f = (lim - s.d) * 2.2;
              dx[k] += ux * f; dy[k] += uy * f;
              dx[p.i] -= ux * f * 0.5; dy[p.i] -= uy * f * 0.5; dx[p.j] -= ux * f * 0.5; dy[p.j] -= uy * f * 0.5;
            }
          }
        }
      // 中心へ弱く引く（関係の多い人ほど中心へ）
      let mx = 0, my = 0;
      pos.forEach((q) => { mx += q.x; my += q.y; });
      mx /= N; my /= N;
      for (let i = 0; i < N; i++) { const w = 0.03 + 0.012 * deg[i]; dx[i] -= (pos[i].x - mx) * w; dy[i] -= (pos[i].y - my) * w * 1.25; }
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(dx[i], dy[i]);
        if (d > 0) { const m = Math.min(d, T); pos[i].x += (dx[i] / d) * m; pos[i].y += (dy[i] / d) * m; }
      }
    }
  }

  // 力学で決めたおおよその位置を、縦横のマス目に割り当てる
  const cw = clamp(Math.max(...ex.map((e) => e.hw * 2)) + 44, 130, 210), ch = Math.max(...ex.map((e) => e.hh * 2)) + 44;
  const order = [...Array(N).keys()].sort((a, b) => deg[b] - deg[a]);
  function gridCells(pos: Pos[]): Cell[] {
    const avg = P.length ? P.reduce((s, p) => s + Math.hypot(pos[p.i].x - pos[p.j].x, pos[p.i].y - pos[p.j].y), 0) / P.length : cw;
    const sc = (cw * 1.05) / (avg || 1), used = new Set<string>(), cell: Cell[] = new Array(N);
    for (const i of order) {
      const gx = (pos[i].x * sc) / cw, gy = (pos[i].y * sc) / ch, cx = Math.round(gx), cy = Math.round(gy);
      let best: Cell | null = null, bd = Infinity;
      for (let rad = 0; rad < 16 && !best; rad++)
        for (let x = cx - rad; x <= cx + rad; x++)
          for (let y = cy - rad; y <= cy + rad; y++) {
            if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== rad || used.has(`${x},${y}`)) continue;
            const d = (x - gx) ** 2 + (y - gy) ** 2 * 1.3;
            if (d < bd) { bd = d; best = [x, y]; }
          }
      used.add(best!.join(',')); cell[i] = best!;
    }
    return cell;
  }
  // マス目→座標。空いた行・列は詰め、グループの境目には枠とラベルの分だけ余白を足す
  function toPos(cell: Cell[]): Pos[] {
    const xs = [...new Set(cell.map((c) => c[0]))].sort((a, b) => a - b), ys = [...new Set(cell.map((c) => c[1]))].sort((a, b) => a - b);
    const mx = new Map(xs.map((v, k) => [v, k])), my = new Map(ys.map((v, k) => [v, k]));
    const C = cell.map((c) => [mx.get(c[0])!, my.get(c[1])!]);
    const colG = xs.map(() => new Set<number>()), rowG = ys.map(() => new Set<number>());
    C.forEach(([c, rw], i) => G.forEach((_, g) => { if (inG[g].has(i)) { colG[c].add(g); rowG[rw].add(g); } }));
    const diff = (a: Set<number>, b: Set<number>) => [...a].some((g) => !b.has(g));
    const colX = [0];
    for (let c = 1; c < xs.length; c++) colX.push(colX[c - 1] + cw + (diff(colG[c], colG[c - 1]) || diff(colG[c - 1], colG[c]) ? 40 : 0));
    const rowY = [0];
    for (let rw = 1; rw < ys.length; rw++) rowY.push(rowY[rw - 1] + ch + (diff(rowG[rw], rowG[rw - 1]) ? 50 : 0) + (diff(rowG[rw - 1], rowG[rw]) ? 20 : 0));
    return C.map(([c, rw]) => ({ x: colX[c], y: rowY[rw] }));
  }
  // 仕上げ: 一人ずつ近くのマスへの移動・入れ替えを試し、点数が良くなれば採用
  function improve(cell: Cell[], deadline: number) {
    const key = (c: Cell) => `${c[0]},${c[1]}`, occ = new Map(cell.map((c, i) => [key(c), i]));
    let cur = score(toPos(cell));
    const rad = N > 30 ? 1 : 2;
    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      for (const i of order) {
        if (performance.now() > deadline) return cur;
        const [x0, y0] = cell[i];
        let mv: [number, number, number] | null = null, bs = cur;
        for (let dx = -rad; dx <= rad; dx++)
          for (let dy = -rad; dy <= rad; dy++) {
            if (!dx && !dy) continue;
            const nx = x0 + dx, ny = y0 + dy, j = occ.get(`${nx},${ny}`) ?? -1;
            cell[i] = [nx, ny]; if (j >= 0) cell[j] = [x0, y0];
            const sc = score(toPos(cell));
            if (sc < bs - 0.01) { bs = sc; mv = [nx, ny, j]; }
            cell[i] = [x0, y0]; if (j >= 0) cell[j] = [nx, ny];
          }
        if (mv) {
          const [nx, ny, j] = mv;
          occ.delete(key(cell[i]));
          if (j >= 0) { occ.delete(`${nx},${ny}`); cell[j] = [x0, y0]; occ.set(key(cell[j]), j); }
          cell[i] = [nx, ny]; occ.set(key(cell[i]), i); cur = bs; changed = true;
        }
      }
      if (!changed) break;
    }
    return cur;
  }
  function score(pos: Pos[]) {
    let sc = 0;
    // 線の交差
    for (let a = 0; a < P.length; a++)
      for (let b = a + 1; b < P.length; b++) {
        const p = P[a], q = P[b];
        if (p.i === q.i || p.i === q.j || p.j === q.i || p.j === q.j) continue;
        if (segX(pos[p.i].x, pos[p.i].y, pos[p.j].x, pos[p.j].y, pos[q.i].x, pos[q.i].y, pos[q.j].x, pos[q.j].y)) sc += 9;
      }
    // 線の長さのばらつき・線が関係ない人を貫く
    for (const p of P) {
      const d = Math.hypot(pos[p.i].x - pos[p.j].x, pos[p.i].y - pos[p.j].y);
      sc += Math.pow((d - p.L) / p.L, 2) * 2;
      for (let k = 0; k < N; k++) {
        if (k === p.i || k === p.j) continue;
        if (segDist(pos[k].x, pos[k].y, pos[p.i].x, pos[p.i].y, pos[p.j].x, pos[p.j].y).d < R + 22) sc += 45;
      }
    }
    const bx = G.map((_, g) => realBox(pos, g));
    // 四角どうしの重なり: 共通メンバーがいなければ重ならない。いても共通メンバーの分を超えて重ならない
    for (let g = 0; g < G.length; g++)
      for (let h = g + 1; h < G.length; h++) {
        const a = bx[g], b = bx[h], ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ox <= 0 || oy <= 0) continue;
        const shared = G[g].filter((i) => inG[h].has(i));
        if (!shared.length) { sc += 30 + (ox * oy) / 2500; continue; }
        const s = span(pos, shared);
        const extra = ox * oy - (s.x1 - s.x0 + 90) * (s.y1 - s.y0 + 110);
        if (extra > 0) sc += extra / 2500;
      }
    // 四角の中に関係ない人が入らない（強く避ける）
    G.forEach((_, g) => {
      const b = bx[g];
      for (let i = 0; i < N; i++) {
        if (inG[g].has(i)) continue;
        const e = ex[i];
        if (pos[i].x + e.hw > b.x0 && pos[i].x - e.hw < b.x1 && pos[i].y + e.cy + e.hh > b.y0 && pos[i].y + e.cy - e.hh < b.y1) sc += 120;
      }
    });
    // 人物どうしの重なり
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++)
        if (Math.abs(pos[i].x - pos[j].x) < ex[i].hw + ex[j].hw + 8 && Math.abs(pos[i].y + ex[i].cy - (pos[j].y + ex[j].cy)) < ex[i].hh + ex[j].hh + 6) sc += 20;
    // 広がりすぎない
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pos.forEach((q) => { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); });
    sc += (((x1 - x0 + 200) * (y1 - y0 + 200)) / (N * 200 * 200)) * 4;
    return sc;
  }
  // 横長の画面に収まるよう、広がりの長い方向を横にそろえる
  function orient(pos: Pos[]) {
    let mx = 0, my = 0;
    pos.forEach((q) => { mx += q.x; my += q.y; });
    mx /= N; my /= N;
    let sxx = 0, syy = 0, sxy = 0;
    pos.forEach((q) => { const x = q.x - mx, y = q.y - my; sxx += x * x; syy += y * y; sxy += x * y; });
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), c = Math.cos(-th), s = Math.sin(-th);
    pos.forEach((q) => { const x = q.x - mx, y = q.y - my; q.x = x * c - y * s; q.y = x * s + y * c; });
  }

  const trials = clamp(Math.round(12000 / (N * N + P.length * 4)), 4, 18), IT = N > 60 ? 260 : 420;
  const t0 = performance.now();
  const cands: { cell: Cell[]; sc: number }[] = [];
  for (let t = 0; t < trials; t++) {
    const pos = init(t);
    simulate(pos, IT);
    orient(pos);
    const cell = gridCells(pos);
    cands.push({ cell, sc: score(toPos(cell)) });
  }
  cands.sort((a, b) => a.sc - b.sc);
  const deadline = t0 + 2500;
  for (const c of cands.slice(0, 5)) c.sc = improve(c.cell, deadline);
  cands.sort((a, b) => a.sc - b.sc);
  return toPos(cands[0].cell);
}
