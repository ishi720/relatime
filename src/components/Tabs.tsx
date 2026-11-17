'use client';
// 下のタブ: 時系列のシート。クリックで切り替え、ダブルクリックで名前変更、ドラッグで並べ替え
import { useEffect, useRef, useState } from 'react';
import { useEditor } from '@/store/editor';

function RenameInput({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (v: string | null) => { if (done.current) return; done.current = true; onDone(v); };
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input ref={ref} className="trename" defaultValue={initial}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') finish(ref.current!.value); if (e.key === 'Escape') finish(null); }}
      onBlur={() => finish(ref.current!.value)}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} />
  );
}

export default function Tabs() {
  const sheets = useEditor((s) => s.doc.sheets);
  const curIdx = useEditor((s) => s.doc.cur);
  const allMode = useEditor((s) => s.allMode);
  const a = useEditor.getState();
  const [renaming, setRenaming] = useState<number | null>(null);
  const [dropTo, setDropTo] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 選んでいるタブが見える位置までスクロール
  useEffect(() => {
    listRef.current?.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [curIdx, allMode, sheets.length]);

  const finishRename = (i: number, v: string | null) => {
    setRenaming(null);
    const name = v?.trim();
    if (name && name !== sheets[i].name) a.renameSheet(i, name);
  };
  const sheetMenu = (anchor: DOMRect, i: number) =>
    a.openMenu(anchor, [
      { label: '名前を変更', fn: () => setRenaming(i) },
      { label: '複製して次に追加', fn: () => a.addSheet(true) },
      { label: '← 前へ移動', disabled: i === 0, fn: () => a.moveSheet(i, i - 1) },
      { label: '次へ移動 →', disabled: i === sheets.length - 1, fn: () => a.moveSheet(i, i + 1) },
      null,
      { label: 'このシートを削除', danger: true, disabled: sheets.length < 2, fn: () => a.openModal({ type: 'deleteSheet', index: i }) },
    ]);

  return (
    <div id="tabs">
      <button className="tnav" title="前のシート" disabled={curIdx === 0 && !allMode} onClick={() => (allMode ? a.switchSheet(sheets.length - 1) : a.switchSheet(curIdx - 1))}>◀</button>
      <button className="tnav" title="次のシート" disabled={curIdx === sheets.length - 1 || allMode} onClick={() => a.switchSheet(curIdx + 1)}>▶</button>
      <div className="tlist" ref={listRef}>
        {sheets.map((sh, i) => {
          const on = i === curIdx && !allMode;
          return (
            <div key={sh.id} className={`tab ${on ? 'on' : ''} ${dropTo === i ? 'dropto' : ''}`} draggable title={`${sh.name}（ダブルクリックで名前を変更）`}
              onClick={(e) => { if ((e.target as Element).closest('.tmore,.trename')) return; a.switchSheet(i); }}
              onDoubleClick={(e) => { if ((e.target as Element).closest('.tmore')) return; setRenaming(i); }}
              onDragStart={(e) => { dragFrom.current = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'sheet'); }}
              onDragOver={(e) => { if (dragFrom.current === null) return; e.preventDefault(); setDropTo(i); }}
              onDragLeave={() => setDropTo(null)}
              onDrop={(e) => { e.preventDefault(); setDropTo(null); if (dragFrom.current !== null) a.moveSheet(dragFrom.current, i); dragFrom.current = null; }}
              onDragEnd={() => { dragFrom.current = null; setDropTo(null); }}>
              <span className="tnum">{i + 1}</span>
              {renaming === i ? <RenameInput initial={sh.name} onDone={(v) => finishRename(i, v)} /> : <span className="tname">{sh.name}</span>}
              {on && <button className="tmore" title="シートの操作" onClick={(e) => sheetMenu(e.currentTarget.getBoundingClientRect(), i)}>▾</button>}
            </div>
          );
        })}
        <button className="tadd" title="シートを追加"
          onClick={(e) => a.openMenu(e.currentTarget.getBoundingClientRect(), [
            { label: `「${sheets[curIdx].name}」を複製して次に追加`, fn: () => a.addSheet(true) },
            { label: '空のシートを次に追加', fn: () => a.addSheet(false) },
          ])}>＋</button>
      </div>
      <div className={`tab tall ${allMode ? 'on' : ''}`} id="tAll" title="全シートの人物と関係を最新の状態でまとめた図" onClick={() => a.enterAll()}>
        <span className="tnum">★</span><span className="tname">全体（最新）</span>
      </div>
    </div>
  );
}
