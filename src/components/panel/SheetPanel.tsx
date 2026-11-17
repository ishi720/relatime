'use client';
import { flushSync } from 'react-dom';
// 何も選んでいないとき: シートの概要・いない人物・グループの一覧・使い方
import { initial } from '@/lib/util';
import { useEditor, useViewData } from '@/store/editor';
import { useCommitOnce } from '../hooks';

function GroupRow({ id, name, color, count }: { id: string; name: string; color: string; count: number }) {
  const a = useEditor.getState();
  const nameOnce = useCommitOnce(), colorOnce = useCommitOnce();
  return (
    <li>
      <input type="color" value={color} title="色を変更" onFocus={colorOnce.onFocus} onChange={(e) => a.setGroup(id, { color: e.target.value }, colorOnce.first())} />
      <input className="gname" value={name} onFocus={nameOnce.onFocus} onChange={(e) => a.setGroup(id, { name: e.target.value }, nameOnce.first())} />
      <span className="cnt">{count}人</span>
      <button className="x" title="グループを削除" onClick={() => a.deleteGroup(id)}>×</button>
    </li>
  );
}

export default function SheetPanel() {
  const doc = useEditor((s) => s.doc);
  const { nodes, edges } = useViewData();
  const a = useEditor.getState();
  const here = new Set(nodes.map((n) => n.id));
  const away = Object.keys(doc.people).filter((id) => !here.has(id));

  return (
    <>
      <div className="ph"><span className="kicker">シート {doc.cur + 1}：{doc.sheets[doc.cur].name}</span></div>
      <div className="stats"><div><b>{nodes.length}</b>人物</div><div><b>{edges.length}</b>関係</div></div>
      {away.length > 0 && (
        <>
          <h4>このシートにいない人物（{away.length}）</h4>
          <ul className="away">
            {away.map((id) => {
              const p = doc.people[id], used = doc.sheets.some((sh) => sh.nodes.some((n) => n.id === id));
              return (
                <li key={id}>
                  <span className="mini">{p.img ? <img src={p.img} alt="" /> : initial(p.name)}</span>
                  <span className="nm">{p.name}</span>
                  <button className="btn sm" onClick={() => a.bringIn(id)}>登場させる</button>
                  {!used && <button className="x" title="どのシートにもいないので完全に削除" onClick={() => a.purgePerson(id)}>×</button>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <h4>グループ（四角で囲む）</h4>
      <ul className="groups">
        {doc.groups.map((g) => <GroupRow key={g.id} id={g.id} name={g.name} color={g.color} count={nodes.filter((n) => n.groups.includes(g.id)).length} />)}
      </ul>
      <button className="btn" id="gAdd" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
        onClick={() => {
          // 追加した行をすぐ描画してから入力欄に移る（直後の入力が欠けないように）
          flushSync(() => a.addGroup());
          const ins = document.querySelectorAll<HTMLInputElement>('.gname'); const last = ins[ins.length - 1]; last?.focus(); last?.select();
        }}>＋ グループを追加</button>
      <h4>使い方</h4>
      <ul className="tips">
        <li>背景をダブルクリックでその場所に人物を追加</li>
        <li>「関係をつなぐ」→ 2人を順にクリック</li>
        <li>人物はドラッグで移動、背景ドラッグで画面移動</li>
        <li>グループ名のタグをドラッグするとメンバーごと移動</li>
        <li>画像ファイルを人物にドロップで画像を設定、背景にドロップで画像付きの人物を追加</li>
        <li>ホイール／ピンチで拡大縮小</li>
        <li>Delete で削除、Ctrl+Z で元に戻す</li>
        <li>上の検索欄（/ キー）で名前から人物を探せます。番号を押すとそのシートへ移動</li>
        <li>下のタブで時系列のシートを切り替え。＋で次の場面を作ると人物・関係・グループが引き継がれ、前のシートで直した関係は以降にも反映されます（ドラッグで並べ替え、ダブルクリックで名前変更）</li>
      </ul>
      <p className="note">内容はこのブラウザに自動保存されます。別の端末で使うときは「データ」から書き出して読み込んでください。</p>
    </>
  );
}
