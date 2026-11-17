'use client';
import { EDGE_COLORS, PRESETS } from '@/lib/constants';
import { edgeOrigin, inheritedBefore } from '@/lib/model';
import type { Edge } from '@/lib/types';
import { useEditor, useViewData } from '@/store/editor';
import { useCommitOnce } from '../hooks';

export default function EdgePanel({ e }: { e: Edge }) {
  const doc = useEditor((s) => s.doc);
  const { byId } = useViewData();
  const a = useEditor.getState();
  const once = useCommitOnce();
  const org = edgeOrigin(doc, doc.cur, e.id), inh = inheritedBefore(doc, doc.cur, e.id);
  const sheetName = (i: number) => doc.sheets[i]?.name ?? '';

  let note: React.ReactNode = null;
  if (org < doc.cur) {
    note = (
      <>「{sheetName(org)}」から引き継いだ関係です。ここで変更すると、このシート以降だけが変わります。
        <div className="imgbtns"><button className="btn sm" id="eGoto" onClick={() => { a.switchSheet(org); a.select({ type: 'edge', id: e.id }); }}>「{sheetName(org)}」で編集する</button></div></>
    );
  } else if (inh) {
    note = (
      <>このシートで内容を変更しています。以降のシートにも引き継がれます。
        <div className="imgbtns"><button className="btn sm" id="eRevert" onClick={() => a.revertEdge(e.id)}>変更を取り消す（前のシートに合わせる）</button></div></>
    );
  } else if (doc.sheets.length > 1) note = 'このシートで追加した関係です。以降のシートにも引き継がれます。';

  return (
    <>
      <div className="ph"><span className="kicker">関係</span><button className="x" title="閉じる" onClick={() => a.select(null)}>×</button></div>
      <div className="pair"><span>{byId.get(e.from)?.name}</span><button id="eSwap" title="向きを入れ替え" onClick={() => a.swapEdge(e.id)}>⇄</button><span>{byId.get(e.to)?.name}</span></div>
      <label className="f">ラベル<input id="eLabel" value={e.label} placeholder="例：幼なじみ" onFocus={once.onFocus} onChange={(ev) => a.setEdge(e.id, { label: ev.target.value }, once.first())} /></label>
      <div className="chips">{PRESETS.map((t) => <button key={t} onClick={() => a.setEdge(e.id, { label: t })}>{t}</button>)}</div>
      <div className="field"><span>矢印</span>
        <div className="seg" id="eDir">
          {([['forward', '一方向 →'], ['both', '双方向 ↔'], ['none', 'なし ―']] as const).map(([v, t]) => (
            <button key={v} className={e.dir === v ? 'on' : ''} onClick={() => a.setEdge(e.id, { dir: v })}>{t}</button>
          ))}
        </div>
      </div>
      <div className="field"><span>線の種類</span>
        <div className="seg" id="eStyle">
          {([['solid', '実線'], ['dashed', '点線']] as const).map(([v, t]) => (
            <button key={v} className={e.style === v ? 'on' : ''} onClick={() => a.setEdge(e.id, { style: v })}>{t}</button>
          ))}
        </div>
      </div>
      <div className="field"><span>色</span>
        <div className="sw" id="eColor">
          {EDGE_COLORS.map((c) => <button key={c} title={c} style={{ background: c }} className={e.color === c ? 'on' : ''} onClick={() => a.setEdge(e.id, { color: c })} />)}
        </div>
      </div>
      {note && <div className="inhnote">{note}</div>}
      <div className="row"><button className="btn danger" id="eDel" onClick={() => a.deleteSel()}>{inh ? 'このシート以降で関係を終わらせる' : 'この関係を削除'}</button></div>
    </>
  );
}
