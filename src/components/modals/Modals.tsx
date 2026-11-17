'use client';
// ダイアログ: 画像の保存・データの書き出し/読み込み・新規・シート削除・顔の切り抜き
import { useRef, useState } from 'react';
import { normalize } from '@/lib/model';
import { useEditor } from '@/store/editor';
import CropDialog from './CropDialog';

async function copyText(text: string, ta?: HTMLTextAreaElement | null) {
  const { notify } = useEditor.getState();
  try {
    await navigator.clipboard.writeText(text);
    notify('コピーしました');
  } catch {
    try {
      if (ta) { ta.focus(); ta.select(); }
      if (document.execCommand('copy')) notify('コピーしました');
      else throw new Error();
    } catch {
      notify('コピーできませんでした。手動で選択してコピーしてください');
    }
  }
}

function DataBody() {
  const doc = useEditor((s) => s.doc);
  const [text, setText] = useState(() => JSON.stringify(doc, null, 2));
  const [err, setErr] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <p>下のJSONをコピーして保存しておけば、いつでも貼り付けて復元できます。別の相関図を読み込むときは、内容を貼り替えて「読み込む」を押してください。</p>
      <textarea id="jArea" ref={ta} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
      {err && <p className="err">{err}</p>}
      <div className="row">
        <button className="btn" onClick={() => copyText(text, ta.current)}>コピー</button>
        <label className="btn" style={{ justifyContent: 'center', flex: 1 }}>ファイルを開く
          <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setText(String(r.result)); r.readAsText(f); }} />
        </label>
        <button className="btn primary" id="jLoad" onClick={() => {
          try { useEditor.getState().importDoc(normalize(JSON.parse(text))); }
          catch (e) { setErr('読み込めませんでした：' + ((e as Error).message || e)); }
        }}>読み込む</button>
      </div>
    </>
  );
}

export default function Modals() {
  const modal = useEditor((s) => s.modal);
  const sheets = useEditor((s) => s.doc.sheets);
  const close = () => useEditor.getState().openModal(null);
  if (!modal) return null;

  let title = '', body: React.ReactNode = null;
  switch (modal.type) {
    case 'export':
      title = '画像として保存';
      body = (
        <>
          <p>画像を右クリック（スマホは長押し）して「画像を保存」してください。高解像度（2倍）のPNGです。</p>
          <div className="preview"><img src={modal.png} alt="相関図" /></div>
          <div className="row">
            <a className="btn" href={modal.png} download="相関図.png" style={{ justifyContent: 'center', flex: 1, textDecoration: 'none' }}>PNGをダウンロード</a>
            <button className="btn" id="svgCopy" onClick={() => copyText(modal.svg)}>SVGコードをコピー</button>
          </div>
        </>
      );
      break;
    case 'data':
      title = 'データの書き出し・読み込み';
      body = <DataBody />;
      break;
    case 'new':
      title = '新しい相関図';
      body = (
        <>
          <p>いまの相関図を消して、白紙から始めますか？（Ctrl+Z で元に戻せます）</p>
          <div className="row"><button className="btn" onClick={close}>キャンセル</button><button className="btn primary" id="nOk" onClick={() => useEditor.getState().newBlank()}>白紙にする</button></div>
        </>
      );
      break;
    case 'deleteSheet':
      title = 'シートを削除';
      body = (
        <>
          <p>「{sheets[modal.index]?.name}」を削除しますか？（Ctrl+Z で元に戻せます）</p>
          <div className="row"><button className="btn" onClick={close}>キャンセル</button><button className="btn danger" id="dOk" onClick={() => useEditor.getState().deleteSheet(modal.index)}>削除する</button></div>
        </>
      );
      break;
    case 'crop':
      title = '顔の部分を切り抜く';
      body = <CropDialog src={modal.src} initial={modal.crop} onCancel={close} onDone={(r) => { close(); modal.onDone(r); }} />;
      break;
  }
  return (
    <div className="modal" id="modal" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="card">
        <div className="mh"><b>{title}</b><button className="x" id="mClose" onClick={close}>×</button></div>
        <div id="mBody">{body}</div>
      </div>
    </div>
  );
}
