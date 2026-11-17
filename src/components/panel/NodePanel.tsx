'use client';
import { flushSync } from 'react-dom';
import { STATUSES } from '@/lib/constants';
import { prevGroupsSheet } from '@/lib/model';
import type { VNode } from '@/lib/types';
import { initial } from '@/lib/util';
import { useEditor, useViewData } from '@/store/editor';
import { pickImage, recrop, useCommitOnce } from '../hooks';

export default function NodePanel({ n }: { n: VNode }) {
  const doc = useEditor((s) => s.doc);
  const { edges, byId } = useViewData();
  const a = useEditor.getState();
  const nameOnce = useCommitOnce(), subOnce = useCommitOnce(), stOnce = useCommitOnce();
  const base = doc.people[n.id];
  const multi = doc.sheets.length > 1;
  const sheetName = (i: number) => doc.sheets[i]?.name ?? '';
  const rels = edges.filter((e) => e.from === n.id || e.to === n.id);

  // 画像がどこから来ているか
  const ownImg = n.imgFrom === doc.cur;
  const imgNote = ownImg
    ? `「${sheetName(doc.cur)}」から差し替えた画像です。次に差し替えるまで、以降のシートにも使われます。`
    : n.imgFrom >= 0 ? `「${sheetName(n.imgFrom)}」で差し替えた画像を引き継いでいます。`
    : n.img && multi ? '全シート共通の画像です。' : '';
  // 所属がどこから来ているか
  const prevG = prevGroupsSheet(doc, doc.cur, n.id);

  const onFile = (scope: 'base' | 'here') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) pickImage(f, (r) => useEditor.getState().applyImage(n.id, r, scope));
  };

  return (
    <>
      <div className="ph"><span className="kicker">人物</span><button className="x" title="閉じる" onClick={() => a.select(null)}>×</button></div>
      <label className="f">名前<input id="fName" value={n.name} onFocus={nameOnce.onFocus} onChange={(e) => a.setName(n.id, e.target.value, nameOnce.first())} /></label>
      <label className="f">肩書き・メモ<input id="fSub" value={n.sub} placeholder="例：主人公" onFocus={subOnce.onFocus} onChange={(e) => a.setNode(n.id, { sub: e.target.value }, subOnce.first())} /></label>

      <div className="field"><span>状態（このシートでの状態）</span>
        <div className="stchips">
          {STATUSES.map((x) => (
            <button key={x.k || 'none'} data-st={x.k} className={n.status === x.k ? 'on' : ''} style={{ '--c': x.color || '#6b7280' } as React.CSSProperties}
              onClick={() => { if (n.status === x.k) return; flushSync(() => a.setNode(n.id, { status: x.k })); if (x.k === 'custom') { const f = document.getElementById('fStText') as HTMLInputElement | null; f?.focus(); f?.select(); } }}>{x.label}</button>
          ))}
        </div>
        {n.status === 'custom' && (
          <input id="fStText" className="stinput" value={n.statusText} placeholder="例：封印、闇落ち、記憶喪失"
            onFocus={stOnce.onFocus} onChange={(e) => a.setNode(n.id, { statusText: e.target.value }, stOnce.first())} />
        )}
        <label className="toggle">
          <input type="checkbox" id="fGrayChk" checked={n.gray} onChange={(e) => a.setNode(n.id, { gray: e.target.checked })} />
          <span className="sw2" />灰色にする（このシートで）
        </label>
      </div>

      <div className="field"><span>画像</span>
        <div className="avrow"><div className="av">{n.img ? <img src={n.img} alt="" /> : initial(n.name)}</div><div className="imgnote">{imgNote}</div></div>
        <div className="imgbtns">
          {multi && <label className="btn sm primary">このシートから差し替え<input type="file" data-scope="here" accept="image/*" hidden onChange={onFile('here')} /></label>}
          <label className="btn sm">{base?.img ? (multi ? '共通画像を変更' : '画像を変更') : multi ? '共通画像を選ぶ' : '画像を選ぶ'}<input type="file" data-scope="base" accept="image/*" hidden onChange={onFile('base')} /></label>
          {n.src && <button className="btn sm" id="fCrop" onClick={() => recrop(n.src, n.crop, (r) => useEditor.getState().applyImage(n.id, r, n.imgFrom < 0 ? 'base' : n.imgFrom))}>切り抜き調整</button>}
          {ownImg && <button className="btn sm" id="fOvDel" onClick={() => a.clearImageOverride(n.id)}>差し替えを解除</button>}
          {base?.img && <button className="btn sm" id="fImgDel" onClick={() => a.clearBaseImage(n.id)}>{multi ? '共通画像を外す' : '外す'}</button>}
        </div>
        <div className="tiny">{multi ? '「このシートから差し替え」で、成長後・変身後など時代ごとに画像を変えられます。' : ''}画像を選ぶと顔の部分を切り抜く画面が開きます。</div>
      </div>

      <div className="field"><span>所属グループ（複数選択可）</span>
        {multi && n.groupsFrom === doc.cur && prevG >= 0 && (
          <div className="inhnote" style={{ margin: '0 0 8px' }}>このシートで所属を変えています（抜けた・入ったは以降のシートにも引き継ぎ）。
            <div className="imgbtns"><button className="btn sm" id="fGRevert" onClick={() => a.revertGroups(n.id)}>変更を取り消す（「{sheetName(prevG)}」に合わせる）</button></div>
          </div>
        )}
        {multi && n.groupsFrom >= 0 && n.groupsFrom < doc.cur && (
          <div className="tiny" style={{ margin: '0 0 7px' }}>「{sheetName(n.groupsFrom)}」から引き継いでいます。ここで変えると、このシート以降が変わります。</div>
        )}
        <div className="gchips">
          {doc.groups.length ? doc.groups.map((g) => (
            <button key={g.id} data-tg={g.id} className={n.groups.includes(g.id) ? 'on' : ''} style={{ '--c': g.color } as React.CSSProperties} onClick={() => a.toggleGroup(n.id, g.id)}>{g.name || '(無題)'}</button>
          )) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>グループがありません</span>}
        </div>
      </div>

      <div className="row"><button className="btn primary" id="fConnect" onClick={() => a.startConnect(n.id)}>⤳ この人から関係をつなぐ</button></div>
      <h4>関係（{rels.length}）</h4>
      <ul className="rels">
        {rels.length ? rels.map((e) => {
          const out = e.from === n.id, o = byId.get(out ? e.to : e.from);
          const ar = e.dir === 'both' ? '↔' : e.dir === 'none' ? '―' : out ? '→' : '←';
          return (
            <li key={e.id} onClick={() => a.select({ type: 'edge', id: e.id })}>
              <span style={{ color: e.color }}>{ar}</span>{o?.name}
              {e.label && <span className="lab" style={{ color: e.color, borderColor: e.color }}>{e.label}</span>}
            </li>
          );
        }) : <li style={{ cursor: 'default', color: 'var(--muted)' }}>まだ関係がありません</li>}
      </ul>
      <div className="row"><button className="btn danger" id="fDel" onClick={() => a.deleteSel()}>このシートから外す</button></div>
      <p className="note">名前と画像は全シート共通です。肩書き・状態・灰色表示・グループ・位置・関係はシートごとに変えられます（シートを複製すると状態も引き継がれます）。</p>
    </>
  );
}
