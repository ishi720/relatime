// 画像: 元画像を縮小して保持し、顔の範囲を正方形で切り抜く
import type { Crop } from './types';
import { clamp } from './util';

export const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('画像を読み込めませんでした'));
    im.src = url;
  });

/** 選んだ画像ファイルを長辺640pxに縮小した JPEG(data URL) にする */
export async function loadSource(file: File) {
  if (!file || !/^image\//.test(file.type)) throw new Error('画像ファイルを選んでください');
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImg(url);
    const MAX = 640, k = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * k);
    c.height = Math.round(im.naturalHeight * k);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function clampCrop(c: Crop, w: number, h: number): Crop {
  const s = clamp(c.s, Math.min(24, w, h), Math.min(w, h));
  return { s, x: clamp(c.x, 0, w - s), y: clamp(c.y, 0, h - s) };
}

type FaceDetectorLike = { detect(im: HTMLImageElement): Promise<{ boundingBox: DOMRectReadOnly }[]> };

/** 最初の切り抜き範囲: 顔検出に対応したブラウザでは顔に、それ以外は中央やや上に */
export async function defaultCrop(im: HTMLImageElement): Promise<Crop> {
  const w = im.naturalWidth, h = im.naturalHeight;
  const FD = (window as unknown as { FaceDetector?: new (o: object) => FaceDetectorLike }).FaceDetector;
  if (FD) {
    try {
      const f = (await new FD({ fastMode: true, maxDetectedFaces: 1 }).detect(im))[0];
      if (f) {
        const b = f.boundingBox, s = Math.max(b.width, b.height) * 1.7;
        return clampCrop({ x: b.x + b.width / 2 - s / 2, y: b.y + b.height / 2 - s / 2, s }, w, h);
      }
    } catch {
      /* 検出できなければ下の既定位置 */
    }
  }
  const s = Math.min(w, h) * 0.6, cy = h > w * 1.1 ? h * 0.3 : h * 0.45; // 縦長なら上寄り（顔がありやすい位置）
  return clampCrop({ x: w / 2 - s / 2, y: cy - s / 2, s }, w, h);
}

/** 切り抜いて 160×160 の JPEG(data URL) にする */
export function cropToData(im: HTMLImageElement, c: Crop) {
  const S = 160, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, S, S);
  ctx.drawImage(im, c.x, c.y, c.s, c.s, 0, 0, S, S);
  return cv.toDataURL('image/jpeg', 0.85);
}
