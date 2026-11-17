'use client';
// 名前で検索: 全角半角・カタカナひらがな・空白の違いを無視。番号を押すとそのシートへ移動
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveImg } from '@/lib/model';
import { clamp, initial, normText } from '@/lib/util';
import { useEditor, viewOf } from '@/store/editor';

type Hit = { id: string; name: string; nm: string; sheets: number[] };

export default function SearchBox() {
  const doc = useEditor((s) => s.doc);
  const allMode = useEditor((s) => s.allMode);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const list: Hit[] = useMemo(() => {
    const nq = normText(q);
    if (!nq) return [];
    const inView = (h: Hit) => (allMode ? h.sheets.length > 0 : h.sheets.includes(doc.cur));
    return Object.entries(doc.people)
      .map(([id, p]) => ({ id, name: p.name, nm: normText(p.name), sheets: doc.sheets.map((sh, i) => (sh.nodes.some((n) => n.id === id) ? i : -1)).filter((i) => i >= 0) }))
      .filter((x) => x.nm.includes(nq))
      .sort((a, b) => +inView(b) - +inView(a) || +b.nm.startsWith(nq) - +a.nm.startsWith(nq) || a.name.localeCompare(b.name, 'ja'));
  }, [q, doc, allMode]);

  // 図の上の目印
  const showHits = (l: Hit[]) => {
    const st = useEditor.getState();
    st.setHits(new Set(l.filter((x) => (st.allMode ? x.sheets.length > 0 : x.sheets.includes(st.doc.cur))).map((x) => x.id)));
  };
  const nearest = (sheets: number[]) => (sheets.length ? sheets.reduce((a, b) => (Math.abs(b - doc.cur) < Math.abs(a - doc.cur) ? b : a)) : -1);

  const close = () => {
    setOpen(false);
    useEditor.getState().setHits(new Set());
    inputRef.current?.blur();
  };
  const pick = (k: number, si?: number) => {
    const x = list[k];
    if (!x) return;
    close();
    const st = useEditor.getState();
    if (st.allMode && si === undefined) {
      if (viewOf(st.doc, true).byId.has(x.id)) st.focusNode(x.id);
      else st.notify('どのシートにも登場していない人物です');
      return;
    }
    const target = si ?? (x.sheets.includes(st.doc.cur) ? st.doc.cur : nearest(x.sheets));
    if (target < 0) { st.bringIn(x.id); requestAnimationFrame(() => useEditor.getState().focusNode(x.id)); return; }
    if (target !== st.doc.cur || st.allMode) { st.switchSheet(target); st.notify(`「${st.doc.sheets[target].name}」に移動しました`); }
    requestAnimationFrame(() => useEditor.getState().focusNode(x.id));
  };

  // 一覧が開いている間は、今のシートにいる該当者に図の上で目印を付ける
  useEffect(() => { if (open) showHits(list); }, [open, list]);

  const cur = clamp(idx, 0, Math.max(0, list.length - 1));
  return (
    <div className="search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a94a6" strokeWidth="2.4" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
      <input
        id="q" ref={inputRef} placeholder="名前で検索（/）" autoComplete="off" aria-label="名前で検索" value={q}
        onChange={(e) => {
          setQ(e.target.value); setIdx(0); setOpen(true);
        }}
        onFocus={() => { if (q) setOpen(true); }}
        onBlur={() => setTimeout(() => { if (document.activeElement !== inputRef.current) { setOpen(false); useEditor.getState().setHits(new Set()); } }, 150)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (list.length) setIdx((cur + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length);
          } else if (e.key === 'Enter') {
            if (e.nativeEvent.isComposing) return;
            e.preventDefault();
            pick(cur);
          } else if (e.key === 'Escape') {
            setQ(''); close();
          }
        }}
      />
      {open && q && (
        <div className="qres" ref={boxRef} onPointerDown={(e) => e.preventDefault()}>
          {!list.length ? (
            <div className="qempty">見つかりませんでした</div>
          ) : (
            <>
              <div className="qhead">{list.length}件・数字はその人物がいるシート</div>
              {list.map((x, k) => {
                const si = x.sheets.includes(doc.cur) ? doc.cur : nearest(x.sheets);
                const nd = si >= 0 ? doc.sheets[si].nodes.find((n) => n.id === x.id) : undefined;
                const img = nd ? resolveImg(doc, si, x.id).img : doc.people[x.id]?.img;
                const sub = si < 0 ? 'どのシートにもいません（選ぶとこのシートに登場）' : si === doc.cur ? nd?.sub || 'このシートにいます' : `「${doc.sheets[si].name}」にいます`;
                return (
                  <div key={x.id} className={`qi ${k === cur ? 'on' : ''}`} onClick={() => pick(k)}>
                    <span className="mini">{img ? <img src={img} alt="" /> : initial(x.name)}</span>
                    <div className="qt"><b>{x.name}</b><small>{sub}</small></div>
                    <div className="qs">
                      {x.sheets.map((i) => (
                        <button key={i} className={i === doc.cur ? 'cur' : ''} title={doc.sheets[i].name} onClick={(e) => { e.stopPropagation(); pick(k, i); }}>{i + 1}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
