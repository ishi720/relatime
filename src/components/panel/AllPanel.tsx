'use client';
// 全体（最新）表示中のパネル: 閲覧専用。編集は各シートへ移動して行う
import { statusLabel } from '@/lib/constants';
import { initial } from '@/lib/util';
import { useEditor, useViewData } from '@/store/editor';

export default function AllPanel() {
  const doc = useEditor((s) => s.doc);
  const sel = useEditor((s) => s.sel);
  const vd = useViewData();
  const a = useEditor.getState();
  const sheetName = (i: number) => doc.sheets[i]?.name ?? '';
  const go = (si: number) => {
    const keep = sel;
    a.switchSheet(si);
    if (keep) a.select(keep);
  };
  const goBtn = (si: number) => <button className="btn sm primary" data-go={si} onClick={() => go(si)}>「{sheetName(si)}」で編集</button>;

  if (sel?.type === 'node') {
    const n = vd.byId.get(sel.id);
    if (n) {
      const rels = vd.edges.filter((e) => e.from === n.id || e.to === n.id);
      const apps = doc.sheets.map((sh, i) => (sh.nodes.some((m) => m.id === n.id) ? i : -1)).filter((i) => i >= 0);
      return (
        <>
          <div className="ph"><span className="kicker">人物（最新の状態）</span><button className="x" onClick={() => a.select(null)}>×</button></div>
          <div className="avrow">
            <div className="av">{n.img ? <img src={n.img} alt="" /> : initial(n.name)}</div>
            <div><b style={{ fontSize: 15 }}>{n.name}</b><div className="tiny" style={{ margin: '2px 0 0' }}>{n.sub}</div></div>
          </div>
          <div className="inhnote">
            最後に登場したシート：<b>{sheetName(n.lastSheet!)}</b>
            {n.status && <><br />状態：{statusLabel(n.status, n.statusText)}</>}{n.gray && '（灰色）'}
            <br />登場したシート：{apps.map((i) => i + 1).join('・')}
            <div className="imgbtns">{goBtn(n.lastSheet!)}</div>
          </div>
          <h4>所属グループ</h4>
          <div className="gchips">
            {n.groups.map((id) => doc.groups.find((g) => g.id === id)).filter(Boolean).map((g) => (
              <button key={g!.id} className="on" style={{ '--c': g!.color, cursor: 'default' } as React.CSSProperties}>{g!.name}</button>
            ))}
            {!n.groups.length && <span className="tiny">なし</span>}
          </div>
          <h4>関係（{rels.length}）</h4>
          <ul className="rels">
            {rels.length ? rels.map((e) => {
              const out = e.from === n.id, o = vd.byId.get(out ? e.to : e.from);
              const ar = e.dir === 'both' ? '↔' : e.dir === 'none' ? '―' : out ? '→' : '←';
              return (
                <li key={e.id} onClick={() => a.select({ type: 'edge', id: e.id })}>
                  <span style={{ color: e.color }}>{ar}</span>{o?.name}
                  {e.label && <span className="lab" style={{ color: e.color, borderColor: e.color }}>{e.label}</span>}
                </li>
              );
            }) : <li style={{ cursor: 'default', color: 'var(--muted)' }}>関係はありません</li>}
          </ul>
        </>
      );
    }
  }
  if (sel?.type === 'edge') {
    const e = vd.edges.find((x) => x.id === sel.id);
    if (e) {
      const org = vd.origin?.get(e.id) ?? 0;
      return (
        <>
          <div className="ph"><span className="kicker">関係（最新の状態）</span><button className="x" onClick={() => a.select(null)}>×</button></div>
          <div className="pair">
            <span>{vd.byId.get(e.from)?.name}</span>
            <span style={{ flex: 'none', color: e.color }}>{e.dir === 'both' ? '↔' : e.dir === 'none' ? '―' : '→'}</span>
            <span>{vd.byId.get(e.to)?.name}</span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, color: e.color, margin: '14px 0 4px' }}>{e.label || '（ラベルなし）'}</p>
          <div className="inhnote">最後に内容が決まったシート：<b>{sheetName(org)}</b><div className="imgbtns">{goBtn(org)}</div></div>
        </>
      );
    }
  }
  return (
    <>
      <div className="ph"><span className="kicker">全体（最新）</span></div>
      <div className="stats"><div><b>{vd.nodes.length}</b>人物</div><div><b>{vd.edges.length}</b>関係</div></div>
      <p className="note">全{doc.sheets.length}シートに登場した人物と関係を、それぞれの最新の状態でまとめた図です。</p>
      <ul className="tips">
        <li>肩書き・状態・グループ・画像は、その人物が最後に登場したシートのもの</li>
        <li>関係は最後のシートまで引き継いだ内容（途中で終わらせた関係は出ません）</li>
        <li>各シートを直すと、この図にも自動で反映されます</li>
        <li>ここでは配置だけ変えられます（ドラッグ・自動配置）。中身の編集は各シートで</li>
        <li>「画像」でこの全体図を書き出せます</li>
      </ul>
    </>
  );
}
