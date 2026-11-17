'use client';
import { useEditor } from '@/store/editor';
import { exportImage } from './exportImage';
import { useCommitOnce } from './hooks';
import SearchBox from './SearchBox';

export default function Header() {
  const title = useEditor((s) => s.doc.title);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const mode = useEditor((s) => s.mode);
  const allMode = useEditor((s) => s.allMode);
  const sel = useEditor((s) => s.sel);
  const a = useEditor.getState();
  const once = useCommitOnce();

  return (
    <header>
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="6" cy="7" r="3.2" fill="#E8615A" /><circle cx="18" cy="6" r="3.2" fill="#3D8BD9" /><circle cx="12" cy="18" r="3.2" fill="#2BA57A" />
          <path d="M8.6 8.5 10.6 15M15.6 8 13.4 15.2M9.2 6.7h5.6" stroke="#5A6B7D" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Relatime
      </div>
      <input id="title" placeholder="相関図のタイトル" aria-label="タイトル" value={title} onFocus={once.onFocus} onChange={(e) => a.setTitle(e.target.value, once.first())} />
      <SearchBox />
      <div className="tools">
        <button className="btn primary" title="人物を追加 (N)" disabled={allMode} onClick={() => a.addPerson()}>＋ 人物</button>
        <button className={`btn ${mode === 'connect' ? 'active' : ''}`} title="関係をつなぐ (C)" disabled={allMode}
          onClick={() => (mode === 'connect' ? a.endConnect() : a.startConnect(sel?.type === 'node' ? sel.id : null))}>⤳ 関係をつなぐ</button>
        <span className="sep" />
        <button className="btn" title="重なりを整理して自動配置" onClick={() => a.autoLayout()}>自動配置</button>
        <button className="btn" title="全体を表示" onClick={() => a.fit()}>全体表示</button>
        <button className="btn" title="元に戻す (Ctrl+Z)" disabled={!canUndo} onClick={() => a.undo()}>↶</button>
        <button className="btn" title="やり直し (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => a.redo()}>↷</button>
        <span className="sep" />
        <button className="btn" onClick={exportImage}>画像</button>
        <button className="btn" onClick={() => a.openModal({ type: 'data' })}>データ</button>
        <button className="btn" onClick={() => a.openModal({ type: 'new' })}>新規</button>
      </div>
    </header>
  );
}
