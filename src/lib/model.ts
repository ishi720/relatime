// データモデル: 読み込み時の正規化と、シート間の「引き継ぎ」の解決
import { EDGE_COLORS, PALETTE, R, STATUSES } from './constants';
import type { Crop, Doc, Edge, EdgeEntry, Group, ImgSet, Person, Sheet, SheetNode, StatusKey, VNode } from './types';
import { isRemoved } from './types';
import { clamp, textW, uid } from './util';

export const okImg = (v: unknown): v is string => typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(v);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const okCrop = (c: any): Crop | null => (c && [c.x, c.y, c.s].every(Number.isFinite) ? { x: +c.x, y: +c.y, s: +c.s } : null);
const okColor = (c: unknown, def: string) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : def);

export const blankDoc = (): Doc => ({ v: 4, title: '', groups: [], people: {}, sheets: [{ id: uid(), name: 'シート1', nodes: [], edges: [] }], cur: 0, summaryPos: null });

/**
 * 読み込んだデータを今の形式にそろえる。
 * 旧形式（シートなし / 関係やグループを各シートが丸ごと持つ形式）も変換する。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalize(input: any): Doc {
  let o = input;
  if (!o || typeof o !== 'object') throw new Error('相関図のデータではありません');
  if (!Array.isArray(o.sheets)) {
    // 旧形式（シートなし）
    if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) throw new Error('相関図のデータではありません');
    o = {
      title: o.title,
      groups: o.groups,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      people: Object.fromEntries(o.nodes.filter((n: any) => n && n.id != null).map((n: any) => [String(n.id), { name: n.name, img: n.img, src: n.src, crop: n.crop }])),
      sheets: [{ id: 's1', name: 'シート1', nodes: o.nodes, edges: o.edges }],
      cur: 0,
    };
  }
  const v: number = +o.v || 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: Group[] = (o.groups || []).filter((g: any) => g && g.id).map((g: any) => ({ id: String(g.id), name: String(g.name ?? ''), color: okColor(g.color, PALETTE[0]) }));
  const gids = new Set(groups.map((g) => g.id));
  const people: Record<string, Person> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [id, p] of Object.entries<any>(o.people || {})) {
    if (!p) continue;
    people[String(id)] = { name: String(p.name ?? '名前なし'), img: okImg(p.img) ? p.img : '', src: okImg(p.src) ? p.src : '', crop: okCrop(p.crop) };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sheets: Sheet[] = o.sheets.filter((sh: any) => sh && Array.isArray(sh.nodes)).map((sh: any, si: number) => {
    const seen = new Set<string>();
    const nodes: SheetNode[] = sh.nodes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((n: any) => n && people[String(n.id)] && !seen.has(String(n.id)) && seen.add(String(n.id)))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((n: any, i: number): SheetNode => {
        const status: StatusKey = STATUSES.some((x) => x.k === n.status) ? n.status : '';
        const rawGroups = Array.isArray(n.groups) ? n.groups : Array.isArray(n.gOv) ? n.gOv : n.group ? [n.group] : [];
        return {
          id: String(n.id),
          sub: String(n.sub ?? ''),
          status,
          statusText: String(n.statusText ?? ''),
          gray: typeof n.gray === 'boolean' ? n.gray : ['dead', 'left'].includes(n.status),
          imgOv: n.imgOv && okImg(n.imgOv.img) ? { img: n.imgOv.img, src: okImg(n.imgOv.src) ? n.imgOv.src : '', crop: okCrop(n.imgOv.crop) } : null,
          gOv:
            v >= 4
              ? Array.isArray(n.gOv) ? [...new Set<string>(n.gOv.map(String))].filter((g) => gids.has(g)) : null
              : [...new Set<string>(rawGroups.map(String))].filter((g) => gids.has(g)),
          x: Number.isFinite(+n.x) ? +n.x : Math.cos(i) * 200,
          y: Number.isFinite(+n.y) ? +n.y : Math.sin(i) * 200,
        };
      });
    const raw = Array.isArray(sh.edges) ? sh.edges : [];
    const edges: EdgeEntry[] = raw
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((e: any) =>
        e && (e.removed ? v >= 3 && e.id != null
          : people[String(e.from)] && people[String(e.to)] && e.from !== e.to && (v >= 3 || (seen.has(String(e.from)) && seen.has(String(e.to))))))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: any): EdgeEntry =>
        e.removed
          ? { id: String(e.id), removed: true }
          : {
              id: String(e.id ?? uid()),
              from: String(e.from),
              to: String(e.to),
              label: String(e.label ?? ''),
              dir: ['forward', 'both', 'none'].includes(e.dir) ? e.dir : 'forward',
              style: e.style === 'dashed' ? 'dashed' : 'solid',
              color: okColor(e.color, EDGE_COLORS[0]),
            });
    return { id: String(sh.id ?? uid()), name: String(sh.name ?? `シート${si + 1}`), nodes, edges };
  });
  if (!sheets.length) sheets.push({ id: uid(), name: 'シート1', nodes: [], edges: [] });

  if (v < 3) {
    // 旧形式（各シートが関係を丸ごと持っていた）→ 前のシートとの差分に変換
    const full = sheets.map((sh) => sh.edges as Edge[]);
    const same = (a: Edge, b: Edge) => (['from', 'to', 'label', 'dir', 'style', 'color'] as const).every((k) => a[k] === b[k]);
    for (let i = 1; i < sheets.length; i++) {
      const prev = new Map(full[i - 1].map((e) => [e.id, e]));
      const ids = new Set(full[i].map((e) => e.id));
      sheets[i].edges = [
        ...full[i].filter((e) => !(prev.has(e.id) && same(prev.get(e.id)!, e))),
        ...full[i - 1].filter((e) => !ids.has(e.id)).map((e) => ({ id: e.id, removed: true as const })),
      ];
    }
  }
  if (v < 4) {
    // 旧形式（各シートが所属を丸ごと持っていた）→ 前と同じなら「引き継ぎ」に
    const last = new Map<string, string[]>();
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    sheets.forEach((sh) =>
      sh.nodes.forEach((n) => {
        const prev = last.get(n.id);
        const g = n.gOv || [];
        n.gOv = prev && same(prev, g) ? null : g;
        last.set(n.id, g);
      }),
    );
  }
  const summaryPos =
    o.summaryPos && typeof o.summaryPos === 'object'
      ? Object.fromEntries(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Object.entries<any>(o.summaryPos).filter(([, p]) => p && Number.isFinite(+p.x) && Number.isFinite(+p.y)).map(([k, p]) => [k, { x: +p.x, y: +p.y }]),
        )
      : null;
  return { v: 4, summaryPos, title: String(o.title ?? ''), groups, people, sheets, cur: clamp(Math.floor(+o.cur || 0), 0, sheets.length - 1) };
}

/* ---------- 引き継ぎの解決 ---------- */

const findNode = (doc: Doc, si: number, id: string) => doc.sheets[si]?.nodes.find((n) => n.id === id);

/** 時代ごとの画像: このシート以前で一番近い「差し替え」、なければ共通画像 */
export function resolveImg(doc: Doc, si: number, id: string): ImgSet & { from: number } {
  for (let j = si; j >= 0; j--) {
    const m = findNode(doc, j, id);
    if (m && m.imgOv) return { ...m.imgOv, from: j };
  }
  const p = doc.people[id];
  return { img: p?.img || '', src: p?.src || '', crop: p?.crop || null, from: -1 };
}

/** 所属グループ: このシート以前で一番近い「所属の変更」（抜けた・入ったも以降に引き継ぐ） */
export function resolveGroups(doc: Doc, si: number, id: string): { g: string[]; from: number } {
  for (let j = si; j >= 0; j--) {
    const m = findNode(doc, j, id);
    if (m && m.gOv) return { g: m.gOv, from: j };
  }
  return { g: [], from: -1 };
}

/** 関係: 1枚目から順に各シートの追加・変更・終了を重ねた結果 */
export function edgeMap(doc: Doc, si: number) {
  const m = new Map<string, { e: Edge; from: number }>();
  for (let j = 0; j <= si; j++)
    for (const e of doc.sheets[j].edges) {
      if (isRemoved(e)) m.delete(e.id);
      else m.set(e.id, { e, from: j });
    }
  return m;
}
/** そのシートで表示する関係（両端の人物がそのシートにいるものだけ） */
export function effEdges(doc: Doc, si: number): Edge[] {
  const here = new Set(doc.sheets[si].nodes.map((n) => n.id));
  return [...edgeMap(doc, si).values()].map((x) => x.e).filter((e) => here.has(e.from) && here.has(e.to));
}
export const edgeOrigin = (doc: Doc, si: number, id: string) => edgeMap(doc, si).get(id)?.from ?? -1;
export const inheritedBefore = (doc: Doc, si: number, id: string) => si > 0 && edgeMap(doc, si - 1).has(id);

/** 前のシートで所属を明示しているシート番号（なければ -1） */
export function prevGroupsSheet(doc: Doc, si: number, id: string) {
  for (let j = si - 1; j >= 0; j--) if (findNode(doc, j, id)?.gOv) return j;
  return -1;
}

/** シートに表示する人物（画像・所属の引き継ぎを解決済み） */
export function sheetView(doc: Doc, si: number): VNode[] {
  return doc.sheets[si].nodes.map((n) => {
    const im = resolveImg(doc, si, n.id);
    const gr = resolveGroups(doc, si, n.id);
    return {
      id: n.id, name: doc.people[n.id]?.name ?? '', img: im.img, src: im.src, crop: im.crop, imgFrom: im.from,
      sub: n.sub, status: n.status, statusText: n.statusText, gray: n.gray, groups: gr.g, groupsFrom: gr.from, x: n.x, y: n.y,
    };
  });
}

/**
 * 全体（最新）: どこかのシートに登場した全員を、最後に登場したシートの状態で。
 * 関係は最後のシートまで引き継いだ結果（途中で終わらせた関係は含めない）。
 */
export function buildSummary(doc: Doc) {
  const last = new Map<string, number>();
  doc.sheets.forEach((sh, si) => sh.nodes.forEach((n) => last.set(n.id, si)));
  const P = doc.summaryPos || {};
  const nodes: VNode[] = [...last].map(([id, si]) => {
    const v = sheetView(doc, si).find((x) => x.id === id)!;
    return { ...v, lastSheet: si, x: P[id] ? P[id].x : v.x, y: P[id] ? P[id].y : v.y };
  });
  const ids = new Set(nodes.map((n) => n.id));
  const em = edgeMap(doc, doc.sheets.length - 1);
  const edges = [...em.values()].map((x) => x.e).filter((e) => ids.has(e.from) && ids.has(e.to));
  return { nodes, edges, origin: new Map([...em].map(([id, x]) => [id, x.from])), placed: !!doc.summaryPos };
}

/* ---------- 形と大きさ ---------- */

/** 人物が占める範囲（名前・肩書きの文字を含む） */
export function nodeExtent(n: Pick<VNode, 'name' | 'sub' | 'x' | 'y'>) {
  const hw = Math.max(R, textW(n.name, 14) / 2, textW(n.sub, 11.5) / 2) + 6;
  return { x0: n.x - hw, x1: n.x + hw, y0: n.y - R - 6, y1: n.y + R + (n.sub ? 46 : 28) };
}

export type GroupBox = { g: Group; ids: string[]; x: number; y: number; w: number; h: number };

/** グループの四角。共通メンバーのいる小さいグループの数だけ外側に広げ、入れ子のラベルが重ならないようにする */
export function groupBoxes(nodes: VNode[], groups: Group[]): GroupBox[] {
  const mem = groups.map((g) => nodes.filter((n) => n.groups.includes(g.id)));
  const out: GroupBox[] = [];
  groups.forEach((g, i) => {
    const ms = mem[i];
    if (!ms.length) return;
    const ids = new Set(ms.map((n) => n.id));
    let rank = 0;
    mem.forEach((hm, j) => {
      if (j === i || !hm.some((n) => ids.has(n.id))) return;
      if (hm.length < ms.length || (hm.length === ms.length && j < i)) rank++;
    });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of ms) {
      const e = nodeExtent(n);
      x0 = Math.min(x0, e.x0); y0 = Math.min(y0, e.y0); x1 = Math.max(x1, e.x1); y1 = Math.max(y1, e.y1);
    }
    const ps = 18 + 16 * rank, pt = 46 + 32 * rank;
    out.push({ g, ids: [...ids], x: x0 - ps, y: y0 - pt, w: x1 - x0 + ps * 2, h: y1 - y0 + pt + ps });
  });
  return out;
}

/** 図全体の範囲（人物・グループの四角を含む） */
export function bounds(nodes: VNode[], groups: Group[]) {
  if (!nodes.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    const hw = Math.max(R, textW(n.name, 14) / 2, textW(n.sub, 11.5) / 2) + 10;
    x0 = Math.min(x0, n.x - hw); x1 = Math.max(x1, n.x + hw);
    y0 = Math.min(y0, n.y - R - 12); y1 = Math.max(y1, n.y + R + (n.sub ? 50 : 32));
  }
  for (const b of groupBoxes(nodes, groups)) {
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  const m = 36;
  return { x: x0 - m, y: y0 - m, w: x1 - x0 + m * 2, h: y1 - y0 + m * 2 };
}
