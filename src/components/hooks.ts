'use client';
import { useRef } from 'react';
import { cropToData, loadImg, loadSource } from '@/lib/image';
import type { Crop } from '@/lib/types';
import { useEditor, type ImageResult } from '@/store/editor';

/**
 * 文字入力用: 入力欄に入ってから最初の1文字目だけ「元に戻す」の区切りを作る。
 * onFocus を入力欄に付け、変更時に first() の結果を commit 引数に渡す。
 */
export function useCommitOnce() {
  const started = useRef(false);
  return {
    onFocus: () => { started.current = false; },
    first: () => { if (started.current) return false; started.current = true; return true; },
  };
}

/** 画像ファイルを選んだら、顔の部分を切り抜く画面を開く */
export async function pickImage(file: File, onDone: (r: ImageResult) => void) {
  const { openModal, notify } = useEditor.getState();
  try {
    const src = await loadSource(file);
    openModal({ type: 'crop', src, crop: null, onDone });
  } catch (e) {
    notify((e as Error).message);
  }
}

/** 切り抜き画面を開き直す（切り抜き調整） */
export function recrop(src: string, crop: Crop | null, onDone: (r: ImageResult) => void) {
  useEditor.getState().openModal({ type: 'crop', src, crop, onDone });
}

/** 複数枚まとめて追加するとき用: 画面を開かずに自動で切り抜く */
export async function autoCropFile(file: File): Promise<ImageResult> {
  const { defaultCrop } = await import('@/lib/image');
  const src = await loadSource(file);
  const im = await loadImg(src);
  const crop = await defaultCrop(im);
  return { img: cropToData(im, crop), src, crop };
}
