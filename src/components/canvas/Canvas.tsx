'use client';
// キャンバス: ドラッグ移動・画面移動・拡大縮小（ホイール/ピンチ）・関係をつなぐ・画像のドロップ
import { useEffect, useRef, useState } from 'react';
import { FONT } from '@/lib/constants';
import type { Pos } from '@/lib/types';
import { useEditor, useViewData, viewOf } from '@/store/editor';
import { autoCropFile, pickImage } from '../hooks';
import GraphLayers from './GraphLayers';

type Drag =
  | { type: 'node'; id: string; ox: number; oy: number; moved: boolean }
  | { type: 'group'; ids: string[]; orig: Pos[]; sx: number; sy: number; moved: boolean }
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean };

export default function Canvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const vd = useViewData();
  const groups = useEditor((s) => s.doc.groups);
  const view = useEditor((s) => s.view);
  const sel = useEditor((s) => s.sel);
  const mode = useEditor((s) => s.mode);
  const connectFrom = useEditor((s) => s.connectFrom);
  const hits = useEditor((s) => s.hits);
  const allMode = useEditor((s) => s.allMode);
  const [tmpTo, setTmpTo] = useState<Pos | null>(null);
  const [panning, setPanning] = useState(false);
  const [dropping, setDropping] = useState(false);
  const drag = useRef<Drag | null>(null);
  const ptrs = useRef(new Map<number, Pos>());
  const pinch = useRef<{ d: number; k: number; vx: number; vy: number; mx: number; my: number } | null>(null);

  // キャンバスの大きさをストアから参照できるようにする
  useEffect(() => {
    useEditor.setState({ stage: () => svgRef.current?.getBoundingClientRect() ?? null });
  }, []);
  // ホイールで拡大縮小（ページのスクロールを止めるため passive:false で登録）
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = svg.getBoundingClientRect();
      useEditor.getState().zoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-ev.deltaY * 0.0015));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (cx: number, cy: number): Pos => {
    const r = svgRef.current!.getBoundingClientRect(), v = useEditor.getState().view;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  };

  const onPointerDown = (ev: React.PointerEvent<SVGSVGElement>) => {
    const st = useEditor.getState();
    ptrs.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { svgRef.current!.setPointerCapture(ev.pointerId); } catch { /* 取れなくても続行 */ }
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()], r = svgRef.current!.getBoundingClientRect();
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: st.view.k, vx: st.view.x, vy: st.view.y, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
      drag.current = null;
      return;
    }
    const t = (ev.target as Element).closest('[data-kind]') as SVGElement | null;
    const pt = toWorld(ev.clientX, ev.clientY);
    const v = viewOf(st.doc, st.allMode);
    const kind = t?.dataset.kind, id = t?.dataset.id || '';
    if (kind === 'node') {
      if (st.mode === 'connect') { st.handleConnect(id); return; }
      const n = v.byId.get(id)!;
      if (!(st.sel?.type === 'node' && st.sel.id === id)) st.select({ type: 'node', id });
      drag.current = { type: 'node', id, ox: pt.x - n.x, oy: pt.y - n.y, moved: false };
    } else if (kind === 'group') {
      if (st.mode === 'connect') st.endConnect();
      const ms = v.nodes.filter((n) => n.groups.includes(id));
      drag.current = { type: 'group', ids: ms.map((n) => n.id), orig: ms.map((n) => ({ x: n.x, y: n.y })), sx: pt.x, sy: pt.y, moved: false };
    } else if (kind === 'edge') {
      if (st.mode === 'connect') st.endConnect();
      st.select({ type: 'edge', id });
    } else {
      drag.current = { type: 'pan', sx: ev.clientX, sy: ev.clientY, vx: st.view.x, vy: st.view.y, moved: false };
      setPanning(true);
    }
  };

  const onPointerMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const st = useEditor.getState();
    if (ptrs.current.has(ev.pointerId)) ptrs.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const pc = pinch.current;
    if (pc && ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const k = Math.max(0.2, Math.min(3, (pc.k * d) / pc.d)), wx = (pc.mx - pc.vx) / pc.k, wy = (pc.my - pc.vy) / pc.k;
      st.setView({ k, x: pc.mx - wx * k, y: pc.my - wy * k });
      return;
    }
    if (st.mode === 'connect' && st.connectFrom) setTmpTo(toWorld(ev.clientX, ev.clientY));
    const dg = drag.current;
    if (!dg) return;
    if (dg.type === 'node') {
      const pt = toWorld(ev.clientX, ev.clientY), n = viewOf(st.doc, st.allMode).byId.get(dg.id);
      if (!n) return;
      const to = { x: Math.round(pt.x - dg.ox), y: Math.round(pt.y - dg.oy) };
      if (!dg.moved) { if (Math.hypot(to.x - n.x, to.y - n.y) < 2) return; st.commit(); dg.moved = true; }
      st.setPositions({ [dg.id]: to }, false);
    } else if (dg.type === 'group') {
      const pt = toWorld(ev.clientX, ev.clientY), dx = pt.x - dg.sx, dy = pt.y - dg.sy;
      if (!dg.moved) { if (Math.hypot(dx, dy) < 2) return; st.commit(); dg.moved = true; }
      const map: Record<string, Pos> = {};
      dg.ids.forEach((id, i) => { map[id] = { x: Math.round(dg.orig[i].x + dx), y: Math.round(dg.orig[i].y + dy) }; });
      st.setPositions(map, false);
    } else {
      const dx = ev.clientX - dg.sx, dy = ev.clientY - dg.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) dg.moved = true;
      st.setView({ ...st.view, x: dg.vx + dx, y: dg.vy + dy });
    }
  };

  const onPointerUp = (ev: React.PointerEvent<SVGSVGElement>) => {
    const st = useEditor.getState();
    ptrs.current.delete(ev.pointerId);
    if (ptrs.current.size < 2) pinch.current = null;
    setPanning(false);
    const dg = drag.current;
    if (dg && !dg.moved && ev.type === 'pointerup') {
      if (dg.type === 'pan') { if (st.mode === 'connect') st.endConnect(); else if (st.sel) st.select(null); }
      if (dg.type === 'group' && st.sel) st.select(null);
    }
    drag.current = null;
  };

  const onDoubleClick = (ev: React.MouseEvent<SVGSVGElement>) => {
    if ((ev.target as Element).closest('[data-kind]')) return;
    useEditor.getState().addPerson(toWorld(ev.clientX, ev.clientY));
  };

  /* 画像ファイルのドロップ: 人物の上なら画像を設定、背景なら画像付きの人物を追加 */
  const onDragOver = (ev: React.DragEvent) => {
    if ([...ev.dataTransfer.types].includes('Files')) { ev.preventDefault(); setDropping(true); }
  };
  const onDragLeave = (ev: React.DragEvent) => {
    if (!(ev.currentTarget as Element).contains(ev.relatedTarget as Node)) setDropping(false);
  };
  const onDrop = async (ev: React.DragEvent) => {
    ev.preventDefault();
    setDropping(false);
    const st = useEditor.getState();
    if (st.readOnly()) return;
    const files = [...ev.dataTransfer.files].filter((f) => /^image\//.test(f.type));
    if (!files.length) { st.notify('画像ファイルをドロップしてください'); return; }
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-kind=node]') as SVGElement | null;
    if (hit && files.length === 1) {
      const id = hit.dataset.id!;
      // 共通画像がまだなければ共通に、あればこのシートから差し替え
      const scope = st.doc.people[id]?.img && st.doc.sheets.length > 1 ? 'here' : 'base';
      pickImage(files[0], (r) => useEditor.getState().applyImage(id, r, scope));
      return;
    }
    const pt = toWorld(ev.clientX, ev.clientY), nameOf = (f: File) => f.name.replace(/\.[^.]+$/, '');
    if (files.length === 1) {
      pickImage(files[0], (r) => useEditor.getState().addPeopleWithImages([{ ...r, name: nameOf(files[0]) }], pt));
      return;
    }
    // 複数のときは自動で切り抜く（あとで「切り抜き調整」で直せる）
    const made = [];
    for (const f of files) {
      try { made.push({ ...(await autoCropFile(f)), name: nameOf(f) }); } catch { /* 読めない画像は飛ばす */ }
    }
    if (made.length) st.addPeopleWithImages(made, pt);
    else st.notify('画像を読み込めませんでした');
  };

  const hint = allMode
    ? '全体（最新）：全シートの人物と関係を最新の状態でまとめて表示中（配置だけ変更できます）'
    : mode === 'connect'
      ? connectFrom ? `「${vd.byId.get(connectFrom)?.name || ''}」とつなぐ相手をクリック（Escでキャンセル）` : 'つなぐ元の人物をクリック（Escでキャンセル）'
      : '';
  const s = 24 * view.k;

  return (
    <div id="wrap" className={dropping ? 'dropping' : ''} style={{ backgroundSize: `${s}px ${s}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <svg id="stage" ref={svgRef} className={`${panning ? 'panning' : ''} ${mode === 'connect' ? 'connect' : ''}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={onDoubleClick}>
        <defs><filter id="fGray"><feColorMatrix type="saturate" values="0" /></filter></defs>
        <g id="vp" transform={`translate(${view.x},${view.y}) scale(${view.k})`} fontFamily={FONT}>
          <GraphLayers nodes={vd.nodes} byId={vd.byId} edges={vd.edges} groups={groups}
            selNode={sel?.type === 'node' ? sel.id : null} selEdge={sel?.type === 'edge' ? sel.id : null}
            connectFrom={connectFrom} connecting={mode === 'connect'} hits={hits} tmpTo={mode === 'connect' ? tmpTo : null} />
        </g>
      </svg>
      <div id="hint" className={hint ? 'show' : ''}>{hint}</div>
      {!vd.nodes.length && (
        <div id="empty"><div className="box"><b style={{ color: 'var(--ink)' }}>まだ誰もいません</b><br />背景をダブルクリック、または「＋ 人物」で追加</div></div>
      )}
      <div className="zoom">
        <button title="拡大" onClick={() => { const r = useEditor.getState().stage(); if (r) useEditor.getState().zoomAt(r.width / 2, r.height / 2, 1.2); }}>＋</button>
        <button title="縮小" onClick={() => { const r = useEditor.getState().stage(); if (r) useEditor.getState().zoomAt(r.width / 2, r.height / 2, 1 / 1.2); }}>−</button>
      </div>
    </div>
  );
}
