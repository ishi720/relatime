'use client';
// Relatime 本体: 保存・キーボード操作をまとめ、各部品を並べる
import { useEffect } from 'react';
import { STORAGE_KEY } from '@/lib/constants';
import { loadSaved, useEditor } from '@/store/editor';
import Canvas from './canvas/Canvas';
import Header from './Header';
import Modals from './modals/Modals';
import { PopMenu, Toast } from './Overlays';
import Panel from './panel/Panel';
import Tabs from './Tabs';

/** 保存されていた相関図を読み込み、変更があれば自動で保存する */
function usePersistence() {
  useEffect(() => {
    const saved = loadSaved();
    if (saved) useEditor.setState({ doc: saved });
    requestAnimationFrame(() => useEditor.getState().fit());
    let timer: ReturnType<typeof setTimeout> | undefined;
    let warned = false;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(useEditor.getState().doc));
          warned = false;
        } catch {
          if (!warned) { warned = true; useEditor.getState().notify('ブラウザの保存容量がいっぱいです。「データ」から書き出して保存してください'); }
        }
      }, 250);
    });
    return () => { unsub(); clearTimeout(timer); };
  }, []);
}

/** キーボード操作 */
function useShortcuts() {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const a = useEditor.getState();
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && /INPUT|TEXTAREA|SELECT/.test(el.tagName);
      if (ev.key === 'Escape') {
        if (a.modal) return a.openModal(null);
        if (a.menu) return a.closeMenu();
        if (typing) return el!.blur();
        if (a.mode === 'connect') a.endConnect();
        else a.select(null);
        return;
      }
      if (typing || a.modal) return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (ev.key === '/' || (mod && ev.key.toLowerCase() === 'k')) {
        ev.preventDefault();
        const q = document.getElementById('q') as HTMLInputElement | null;
        q?.focus(); q?.select();
        return;
      }
      if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) a.redo(); else a.undo(); return; }
      if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); a.redo(); return; }
      if (mod) return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); a.deleteSel(); }
      else if (ev.key === 'n' || ev.key === 'N') { ev.preventDefault(); a.addPerson(); }
      else if (ev.key === 'c' || ev.key === 'C') {
        if (a.mode === 'connect') a.endConnect();
        else a.startConnect(a.sel?.type === 'node' ? a.sel.id : null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

export default function Editor() {
  usePersistence();
  useShortcuts();
  return (
    <>
      <Header />
      <main>
        <div id="left">
          <Canvas />
          <Tabs />
        </div>
        <Panel />
      </main>
      <Modals />
      <PopMenu />
      <Toast />
    </>
  );
}
