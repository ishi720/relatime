'use client';
// 画面下のお知らせ（トースト）と、タブの「▾」「＋」から開くメニュー
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clamp } from '@/lib/util';
import { useEditor } from '@/store/editor';

export function Toast() {
  const toast = useEditor((s) => s.toast);
  if (!toast) return null;
  // id が変わるたびに作り直し、CSS アニメーションで表示→自動で消える
  return <div id="toast" key={toast.id} className="anim">{toast.msg}</div>;
}

export function PopMenu() {
  const menu = useEditor((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(0);
  // 画面からはみ出さない位置に置く
  useLayoutEffect(() => {
    if (menu && ref.current) setLeft(clamp(menu.left, 8, window.innerWidth - ref.current.offsetWidth - 8));
  }, [menu]);
  // メニューの外を押したら閉じる
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node) || (e.target as Element).closest?.('.tmore,.tadd')) return;
      useEditor.getState().closeMenu();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menu]);
  if (!menu) return null;
  return (
    <div className="menu" ref={ref} style={{ left, bottom: menu.bottom }}>
      {menu.items.map((it, k) =>
        it ? (
          <button key={k} disabled={it.disabled} className={it.danger ? 'danger' : ''} onClick={() => { useEditor.getState().closeMenu(); it.fn(); }}>{it.label}</button>
        ) : <hr key={k} />,
      )}
    </div>
  );
}
