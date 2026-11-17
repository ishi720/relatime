'use client';
// エディタの状態と操作（データ・元に戻す履歴・選択・表示位置・ダイアログ）
import { produce } from 'immer';
import { create } from 'zustand';
import { EDGE_COLORS, LEGACY_STORAGE_KEYS, PALETTE, STORAGE_KEY } from '@/lib/constants';
import { computeLayout } from '@/lib/layout';
import { blankDoc, bounds, buildSummary, edgeMap, inheritedBefore, normalize, resolveGroups, sheetView } from '@/lib/model';
import type { Crop, Doc, Edge, ImgSet, Pos, Selection, SheetNode, VNode, View } from '@/lib/types';
import { isRemoved } from '@/lib/types';
import { clamp, nextName, uid } from '@/lib/util';

/* ---------- 表示用データ（引き継ぎ解決済み）。doc が変わらない限り使い回す ---------- */
export type ViewData = { nodes: VNode[]; edges: Edge[]; byId: Map<string, VNode>; origin?: Map<string, number>; placed?: boolean };
let cache: { doc: Doc; all: boolean; v: ViewData } | null = null;
export function viewOf(doc: Doc, all: boolean): ViewData {
  if (cache && cache.doc === doc && cache.all === all) return cache.v;
  let v: ViewData;
  if (all) {
    const s = buildSummary(doc);
    v = { nodes: s.nodes, edges: s.edges, byId: new Map(s.nodes.map((n) => [n.id, n])), origin: s.origin, placed: s.placed };
  } else {
    const nodes = sheetView(doc, doc.cur);
    const here = new Set(nodes.map((n) => n.id));
    const edges = [...edgeMap(doc, doc.cur).values()].map((x) => x.e).filter((e) => here.has(e.from) && here.has(e.to));
    v = { nodes, edges, byId: new Map(nodes.map((n) => [n.id, n])) };
  }
  cache = { doc, all, v };
  return v;
}

export type MenuItem = { label: string; fn: () => void; disabled?: boolean; danger?: boolean } | null;
export type ImageResult = ImgSet & { crop: Crop };
export type Modal =
  | { type: 'export'; png: string; svg: string }
  | { type: 'data' }
  | { type: 'new' }
  | { type: 'deleteSheet'; index: number }
  | { type: 'crop'; src: string; crop: Crop | null; onDone: (r: ImageResult) => void }
  | null;

type State = {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  sel: Selection;
  mode: 'select' | 'connect';
  connectFrom: string | null;
  allMode: boolean;
  view: View;
  hits: Set<string>;
  toast: { msg: string; id: number } | null;
  modal: Modal;
  menu: { left: number; bottom: number; items: MenuItem[] } | null;
  layoutSeed: number;
  /** キャンバスの大きさ（Canvas が登録） */
  stage: () => DOMRect | null;
};

type Actions = {
  commit(): void;
  update(fn: (d: Doc) => void, commit?: boolean): void;
  undo(): void;
  redo(): void;
  notify(msg: string): void;
  readOnly(): boolean;
  select(s: Selection): void;
  // 人物
  addPerson(at?: Pos): void;
  addPeopleWithImages(list: (ImageResult & { name: string })[], at: Pos): void;
  bringIn(id: string): void;
  purgePerson(id: string): void;
  setNode(id: string, patch: Partial<Pick<SheetNode, 'sub' | 'status' | 'statusText' | 'gray'>>, commit?: boolean): void;
  setName(id: string, name: string, commit?: boolean): void;
  toggleGroup(id: string, gid: string): void;
  revertGroups(id: string): void;
  applyImage(id: string, r: ImageResult, scope: 'base' | 'here' | number): void;
  clearImageOverride(id: string): void;
  clearBaseImage(id: string): void;
  setPositions(map: Record<string, Pos>, commit?: boolean): void;
  // 関係
  startConnect(from?: string | null): void;
  endConnect(): void;
  handleConnect(id: string): void;
  setEdge(id: string, patch: Partial<Omit<Edge, 'id'>>, commit?: boolean): void;
  swapEdge(id: string): void;
  revertEdge(id: string): void;
  deleteSel(): void;
  // グループ
  addGroup(): string;
  setGroup(id: string, patch: { name?: string; color?: string }, commit?: boolean): void;
  deleteGroup(id: string): void;
  // シート
  switchSheet(i: number): void;
  enterAll(): void;
  addSheet(copy: boolean): void;
  moveSheet(from: number, to: number): void;
  renameSheet(i: number, name: string): void;
  deleteSheet(i: number): void;
  // 全体
  setTitle(t: string, commit?: boolean): void;
  importDoc(d: Doc): void;
  newBlank(): void;
  // 表示
  setView(v: View): void;
  zoomAt(mx: number, my: number, f: number): void;
  fit(): void;
  focusNode(id: string): void;
  setHits(h: Set<string>): void;
  autoLayout(): void;
  openModal(m: Modal): void;
  openMenu(anchor: DOMRect, items: MenuItem[]): void;
  closeMenu(): void;
};

export function loadSaved(): Doc | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY) ?? LEGACY_STORAGE_KEYS.map((k) => localStorage.getItem(k)).find((v) => v != null);
    if (s) return normalize(JSON.parse(s));
  } catch {
    /* 壊れたデータは無視して白紙から */
  }
  return null;
}

const cur = (d: Doc) => d.sheets[d.cur];
const sheetNode = (d: Doc, id: string) => cur(d).nodes.find((n) => n.id === id);

export const useEditor = create<State & Actions>()((set, get) => {
  /** 編集できない「全体」表示中は止める */
  const readOnly = () => {
    if (!get().allMode) return false;
    get().notify('「全体（最新）」は自動でまとめた図です。編集は各シートで行ってください');
    return true;
  };
  const leaveConnect = { mode: 'select' as const, connectFrom: null };

  return {
    doc: blankDoc(),
    past: [],
    future: [],
    sel: null,
    mode: 'select',
    connectFrom: null,
    allMode: false,
    view: { x: 0, y: 0, k: 1 },
    hits: new Set(),
    toast: null,
    modal: null,
    menu: null,
    layoutSeed: 0,
    stage: () => null,

    commit() {
      const { doc, past } = get();
      set({ past: [...past.slice(-59), doc], future: [] });
    },
    update(fn, commit = true) {
      if (commit) get().commit();
      set({ doc: produce(get().doc, fn) });
    },
    undo() {
      const { past, doc, future } = get();
      if (!past.length) return;
      set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [...future, doc] });
      fixSelection();
    },
    redo() {
      const { past, doc, future } = get();
      if (!future.length) return;
      set({ doc: future[future.length - 1], future: future.slice(0, -1), past: [...past, doc] });
      fixSelection();
    },
    notify(msg) {
      set({ toast: { msg, id: Date.now() + Math.random() } });
    },
    readOnly,
    select(s) {
      set({ sel: s });
    },

    /* ---------- 人物 ---------- */
    addPerson(at) {
      if (readOnly()) return;
      const { view, sel, doc } = get();
      const r = get().stage();
      const p = at || { x: ((r?.width ?? 800) / 2 - view.x) / view.k + (Math.random() - 0.5) * 60, y: ((r?.height ?? 600) / 2 - view.y) / view.k + (Math.random() - 0.5) * 60 };
      const id = uid();
      const inherit = sel?.type === 'node' ? resolveGroups(doc, doc.cur, sel.id).g : [];
      get().update((d) => {
        d.people[id] = { name: '新しい人物', img: '', src: '', crop: null };
        cur(d).nodes.push({ id, sub: '', status: '', statusText: '', gray: false, gOv: [...inherit], imgOv: null, x: Math.round(p.x), y: Math.round(p.y) });
      });
      set({ sel: { type: 'node', id } });
    },
    addPeopleWithImages(list, at) {
      if (readOnly()) return;
      let last = '';
      get().update((d) => {
        list.forEach((m, i) => {
          const id = (last = uid());
          d.people[id] = { name: m.name || '新しい人物', img: m.img, src: m.src, crop: m.crop };
          cur(d).nodes.push({ id, sub: '', status: '', statusText: '', gray: false, gOv: [], imgOv: null, x: Math.round(at.x + i * 130), y: Math.round(at.y) });
        });
      });
      set({ sel: { type: 'node', id: last } });
      get().notify(`${list.length}人を追加しました`);
    },
    bringIn(id) {
      if (readOnly()) return;
      const { doc, view } = get();
      // 近いシートでの肩書き・状態・位置を引き継ぐ（所属は前のシートから自動で引き継ぎ）
      let tpl: SheetNode | undefined;
      for (let dd = 1; dd < doc.sheets.length && !tpl; dd++)
        for (const k of [doc.cur - dd, doc.cur + dd]) {
          const f = doc.sheets[k]?.nodes.find((n) => n.id === id);
          if (f) { tpl = f; break; }
        }
      const appearedBefore = doc.sheets.slice(0, doc.cur).some((sh) => sh.nodes.some((m) => m.id === id));
      const r = get().stage();
      get().update((d) => {
        cur(d).nodes.push({
          id, sub: tpl?.sub || '', status: tpl?.status || '', statusText: tpl?.statusText || '', gray: !!tpl?.gray,
          gOv: appearedBefore ? null : [...(tpl ? resolveGroups(doc, doc.sheets.indexOf(doc.sheets.find((sh) => sh.nodes.includes(tpl!))!), id).g : [])],
          imgOv: null,
          x: Math.round(tpl ? tpl.x : ((r?.width ?? 800) / 2 - view.x) / view.k),
          y: Math.round(tpl ? tpl.y : ((r?.height ?? 600) / 2 - view.y) / view.k),
        });
      });
      set({ sel: { type: 'node', id } });
    },
    purgePerson(id) {
      get().update((d) => {
        delete d.people[id];
        d.sheets.forEach((sh) => { sh.edges = sh.edges.filter((x) => isRemoved(x) || (x.from !== id && x.to !== id)); });
      });
    },
    setNode(id, patch, commit = true) {
      get().update((d) => { const n = sheetNode(d, id); if (n) Object.assign(n, patch); }, commit);
    },
    setName(id, name, commit = true) {
      get().update((d) => { if (d.people[id]) d.people[id].name = name; }, commit);
    },
    toggleGroup(id, gid) {
      const { doc } = get();
      const g = resolveGroups(doc, doc.cur, id).g;
      get().update((d) => { const n = sheetNode(d, id); if (n) n.gOv = g.includes(gid) ? g.filter((x) => x !== gid) : [...g, gid]; });
    },
    revertGroups(id) {
      get().update((d) => { const n = sheetNode(d, id); if (n) n.gOv = null; });
      get().notify('前のシートの所属に戻しました');
    },
    applyImage(id, r, scope) {
      const v = { img: r.img, src: r.src, crop: r.crop };
      const sheetName = cur(get().doc).name;
      get().update((d) => {
        if (scope === 'base') Object.assign(d.people[id], v);
        else {
          const si = scope === 'here' ? d.cur : scope;
          const m = d.sheets[si].nodes.find((x) => x.id === id);
          if (m) m.imgOv = v;
        }
      });
      get().notify(scope === 'base' ? '全シート共通の画像を設定しました' : scope === 'here' ? `「${sheetName}」から画像を差し替えました` : '切り抜きを更新しました');
    },
    clearImageOverride(id) {
      get().update((d) => { const n = sheetNode(d, id); if (n) n.imgOv = null; });
      get().notify('差し替えを解除しました');
    },
    clearBaseImage(id) {
      get().update((d) => { Object.assign(d.people[id], { img: '', src: '', crop: null }); });
    },
    setPositions(map, commit = false) {
      const { allMode, doc } = get();
      if (allMode) {
        const vd = viewOf(doc, true);
        get().update((d) => {
          const base: Record<string, Pos> = d.summaryPos ? { ...d.summaryPos } : Object.fromEntries(vd.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
          for (const [id, p] of Object.entries(map)) base[id] = { x: p.x, y: p.y };
          d.summaryPos = base;
        }, commit);
      } else {
        get().update((d) => {
          for (const n of cur(d).nodes) { const p = map[n.id]; if (p) { n.x = p.x; n.y = p.y; } }
        }, commit);
      }
    },

    /* ---------- 関係 ---------- */
    startConnect(from = null) {
      if (readOnly()) return;
      set({ mode: 'connect', connectFrom: from });
    },
    endConnect() {
      set(leaveConnect);
    },
    handleConnect(id) {
      const { connectFrom } = get();
      if (!connectFrom) { set({ connectFrom: id }); return; }
      if (id === connectFrom) return;
      const e: Edge = { id: uid(), from: connectFrom, to: id, label: '', dir: 'forward', style: 'solid', color: EDGE_COLORS[0] };
      get().update((d) => { cur(d).edges.push(e); });
      set({ ...leaveConnect, sel: { type: 'edge', id: e.id } });
    },
    setEdge(id, patch, commit = true) {
      // 引き継いだ関係を変えるときは、このシート用の変更として複製してから（前のシートには影響させない）
      const eff = viewOf(get().doc, false).edges.find((x) => x.id === id);
      if (!eff) return;
      get().update((d) => {
        const list = cur(d).edges;
        let o = list.find((x) => x.id === id && !isRemoved(x)) as Edge | undefined;
        if (!o) { o = { ...eff }; list.push(o); o = list[list.length - 1] as Edge; }
        Object.assign(o, patch);
      }, commit);
    },
    swapEdge(id) {
      const e = viewOf(get().doc, false).edges.find((x) => x.id === id);
      if (e) get().setEdge(id, { from: e.to, to: e.from });
    },
    revertEdge(id) {
      get().update((d) => { cur(d).edges = cur(d).edges.filter((x) => x.id !== id); });
      get().notify('前のシートの内容に戻しました');
    },
    deleteSel() {
      if (readOnly()) return;
      const { sel, doc } = get();
      if (!sel) return;
      if (sel.type === 'node') {
        // 人物を外すと、その人の関係はこのシートでは表示されなくなる（再登場すれば戻る）
        get().update((d) => { cur(d).nodes = cur(d).nodes.filter((n) => n.id !== sel.id); });
        get().notify('このシートから外しました（他のシートには残ります）');
      } else {
        const inh = inheritedBefore(doc, doc.cur, sel.id);
        get().update((d) => {
          cur(d).edges = cur(d).edges.filter((x) => x.id !== sel.id);
          if (inh) cur(d).edges.push({ id: sel.id, removed: true });
        });
        get().notify('関係を削除しました（Ctrl+Z で元に戻せます）');
      }
      set({ sel: null });
    },

    /* ---------- グループ ---------- */
    addGroup() {
      const id = uid();
      get().update((d) => { d.groups.push({ id, name: '新しいグループ', color: PALETTE[d.groups.length % PALETTE.length] }); });
      return id;
    },
    setGroup(id, patch, commit = true) {
      get().update((d) => { const g = d.groups.find((x) => x.id === id); if (g) Object.assign(g, patch); }, commit);
    },
    deleteGroup(id) {
      get().update((d) => {
        d.groups = d.groups.filter((g) => g.id !== id);
        d.sheets.forEach((sh) => sh.nodes.forEach((n) => { if (n.gOv) n.gOv = n.gOv.filter((g) => g !== id); }));
      });
    },

    /* ---------- シート ---------- */
    switchSheet(i) {
      const { doc, allMode } = get();
      if (!Number.isInteger(i) || i < 0 || i >= doc.sheets.length || (i === doc.cur && !allMode)) return;
      set({ doc: produce(doc, (d) => { d.cur = i; }), allMode: false, sel: null, ...leaveConnect });
    },
    enterAll() {
      if (get().allMode) return;
      set({ allMode: true, sel: null, ...leaveConnect });
      const vd = viewOf(get().doc, true);
      if (!vd.placed && vd.nodes.length > 1) get().autoLayout(); // 初めて開いたときは自動で並べる
      else get().fit();
    },
    addSheet(copy) {
      if (get().allMode) set({ allMode: false, doc: produce(get().doc, (d) => { d.cur = d.sheets.length - 1; }) });
      const src = cur(get().doc);
      const sh = { id: uid(), name: nextName(src.name), nodes: [] as SheetNode[], edges: [] };
      // 複製は「引き継ぎ」: 人物は位置・肩書き・状態をコピー、所属・画像・関係は前のシートから引き継ぐ
      if (copy) sh.nodes = src.nodes.map((n) => ({ ...n, gOv: null, imgOv: null }));
      get().update((d) => { d.sheets.splice(d.cur + 1, 0, sh); d.cur++; });
      set({ sel: null });
      get().notify(copy ? `「${src.name}」を複製して「${sh.name}」を作りました` : `「${sh.name}」を追加しました`);
    },
    moveSheet(from, to) {
      const { doc } = get();
      if (to < 0 || to >= doc.sheets.length || from === to) return;
      const curId = cur(doc).id;
      get().update((d) => {
        const [sh] = d.sheets.splice(from, 1);
        d.sheets.splice(to, 0, sh);
        d.cur = d.sheets.findIndex((x) => x.id === curId);
      });
    },
    renameSheet(i, name) {
      get().update((d) => { d.sheets[i].name = name; });
    },
    deleteSheet(i) {
      if (get().doc.sheets.length < 2) { get().notify('最後のシートは削除できません'); return; }
      get().update((d) => {
        // 後ろのシートの見え方が変わらないよう、関係の差分を次のシートへ移す
        const nx = d.sheets[i + 1];
        if (nx) {
          const own = new Set(nx.edges.map((x) => x.id));
          nx.edges = [...d.sheets[i].edges.filter((x) => !own.has(x.id)), ...nx.edges];
        }
        d.sheets.splice(i, 1);
        d.cur = clamp(d.cur > i ? d.cur - 1 : d.cur, 0, d.sheets.length - 1);
      });
      set({ sel: null, modal: null });
    },

    /* ---------- 全体 ---------- */
    setTitle(t, commit = true) {
      get().update((d) => { d.title = t; }, commit);
    },
    importDoc(d) {
      get().commit();
      set({ doc: d, sel: null, allMode: false, modal: null, ...leaveConnect });
      requestAnimationFrame(() => get().fit());
      get().notify('読み込みました');
    },
    newBlank() {
      get().commit();
      set({ doc: blankDoc(), sel: null, allMode: false, modal: null, ...leaveConnect });
      requestAnimationFrame(() => get().fit());
    },

    /* ---------- 表示 ---------- */
    setView(v) {
      set({ view: v });
    },
    zoomAt(mx, my, f) {
      const { view } = get();
      const k = clamp(view.k * f, 0.2, 3), wx = (mx - view.x) / view.k, wy = (my - view.y) / view.k;
      set({ view: { k, x: mx - wx * k, y: my - wy * k } });
    },
    fit() {
      const r = get().stage();
      if (!r) return;
      const { doc, allMode } = get();
      const vd = viewOf(doc, allMode);
      if (!vd.nodes.length) { set({ view: { x: r.width / 2, y: r.height / 2, k: 1 } }); return; }
      const b = bounds(vd.nodes, doc.groups), pad = 24;
      const k = clamp(Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h), 0.25, 1.3);
      set({ view: { k, x: r.width / 2 - (b.x + b.w / 2) * k, y: r.height / 2 - (b.y + b.h / 2) * k } });
    },
    focusNode(id) {
      const { doc, allMode } = get();
      const n = viewOf(doc, allMode).byId.get(id);
      const r = get().stage();
      if (!n || !r) return;
      set({ sel: { type: 'node', id } });
      const s0 = get().view, k = Math.max(s0.k, 1), tx = r.width / 2 - n.x * k, ty = r.height / 2 - n.y * k, t0 = performance.now();
      const step = (t: number) => {
        const a = Math.min(1, (t - t0) / 300), e = 1 - Math.pow(1 - a, 3);
        set({ view: { k: s0.k + (k - s0.k) * e, x: s0.x + (tx - s0.x) * e, y: s0.y + (ty - s0.y) * e } });
        if (a < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    setHits(h) {
      set({ hits: h });
    },
    autoLayout() {
      const { doc, allMode } = get();
      const vd = viewOf(doc, allMode);
      const ns = vd.nodes;
      if (ns.length < 2) return;
      const seed = get().layoutSeed + 1;
      set({ layoutSeed: seed });
      get().notify('並べ方を計算しています…');
      setTimeout(() => {
        const pos = computeLayout(ns, vd.edges, doc.groups, seed);
        // 元の重心に合わせ、10px 単位にそろえる
        let ox = 0, oy = 0, px = 0, py = 0;
        ns.forEach((n, i) => { ox += n.x; oy += n.y; px += pos[i].x; py += pos[i].y; });
        const sx = (ox - px) / ns.length, sy = (oy - py) / ns.length;
        const to = pos.map((q) => ({ x: Math.round((q.x + sx) / 10) * 10, y: Math.round((q.y + sy) / 10) * 10 }));
        const from = ns.map((n) => ({ x: n.x, y: n.y }));
        get().commit();
        const t0 = performance.now();
        const step = (t: number) => {
          const a = Math.min(1, (t - t0) / 520), e = a < 0.5 ? 4 * a * a * a : 1 - Math.pow(-2 * a + 2, 3) / 2;
          const map: Record<string, Pos> = {};
          ns.forEach((n, i) => { map[n.id] = a < 1 ? { x: from[i].x + (to[i].x - from[i].x) * e, y: from[i].y + (to[i].y - from[i].y) * e } : to[i]; });
          get().setPositions(map, false);
          if (a < 1) requestAnimationFrame(step);
          else { get().fit(); get().notify('自動配置しました（もう一度押すと別の並べ方を試します）'); }
        };
        requestAnimationFrame(step);
      }, 30);
    },
    openModal(m) {
      set({ modal: m });
    },
    openMenu(anchor, items) {
      set({ menu: { left: anchor.left, bottom: window.innerHeight - anchor.top + 6, items } });
    },
    closeMenu() {
      set({ menu: null });
    },
  };

  /** 元に戻した結果、選択していたものが無くなっていたら選択を外す */
  function fixSelection() {
    const { sel, doc, allMode } = get();
    if (!sel) return;
    const vd = viewOf(doc, allMode);
    const ok = sel.type === 'node' ? vd.byId.has(sel.id) : vd.edges.some((e) => e.id === sel.id);
    if (!ok) set({ sel: null });
  }
});

/** 今の表示データ（コンポーネント用） */
export function useViewData() {
  const doc = useEditor((s) => s.doc);
  const all = useEditor((s) => s.allMode);
  return viewOf(doc, all);
}
