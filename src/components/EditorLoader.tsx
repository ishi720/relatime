'use client';
// エディタはブラウザの保存領域（localStorage）を使うため、サーバーでは描画せずブラウザだけで読み込む
import dynamic from 'next/dynamic';

const Editor = dynamic(() => import('./Editor'), { ssr: false });

export default function EditorLoader() {
  return <Editor />;
}
