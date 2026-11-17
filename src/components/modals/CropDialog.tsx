'use client';
// 顔の部分を正方形で切り抜く: 中をドラッグで移動、角・スライダー・ホイールで大きさを変更
import { useEffect, useRef, useState } from 'react';
import { clampCrop, cropToData, defaultCrop, loadImg } from '@/lib/image';
import type { Crop } from '@/lib/types';
import { clamp } from '@/lib/util';
import type { ImageResult } from '@/store/editor';

type Op = { move: true; dx: number; dy: number } | { move: false; hd: string; ax: number; ay: number };

export default function CropDialog({ src, initial, onDone, onCancel }: { src: string; initial: Crop | null; onDone: (r: ImageResult) => void; onCancel: () => void }) {
  const [im, setIm] = useState<HTMLImageElement | null>(null);
  const [c, setC] = useState<Crop | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLCanvasElement>(null);
  const op = useRef<Op | null>(null);

  useEffect(() => {
    let alive = true;
    loadImg(src).then(async (img) => {
      if (!alive) return;
      setIm(img);
      setC(initial ? clampCrop(initial, img.naturalWidth, img.naturalHeight) : await defaultCrop(img));
    });
    return () => { alive = false; };
  }, [src, initial]);

  const w = im?.naturalWidth ?? 1, h = im?.naturalHeight ?? 1;
  const maxW = Math.min(420, (typeof window !== 'undefined' ? window.innerWidth : 800) - 80), maxH = Math.min(420, (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.5);
  const k = Math.min(maxW / w, maxH / h), dw = Math.round(w * k), dh = Math.round(h * k);
  const minS = Math.min(24, w, h), maxS = Math.min(w, h);
  const resizeKeepCenter = (cc: Crop, s: number) => {
    const cx = cc.x + cc.s / 2, cy = cc.y + cc.s / 2, ss = clamp(s, minS, maxS);
    return clampCrop({ x: cx - ss / 2, y: cy - ss / 2, s: ss }, w, h);
  };

  // プレビュー（図の中で丸く表示される見え方）
  useEffect(() => {
    const cv = prevRef.current;
    if (!cv || !im || !c) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, 160, 160);
    ctx.save();
    ctx.beginPath(); ctx.arc(80, 80, 80, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 160, 160);
    ctx.drawImage(im, c.x, c.y, c.s, c.s, 0, 0, 160, 160);
    ctx.restore();
  }, [im, c]);

  // ホイールで大きさ変更（passive:false で登録）
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => { ev.preventDefault(); setC((cc) => (cc ? resizeKeepCenter(cc, cc.s * Math.exp(ev.deltaY * 0.0015)) : cc)); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  if (!im || !c) return <p>画像を読み込んでいます…</p>;

  const toImg = (ev: React.PointerEvent) => { const r = stageRef.current!.getBoundingClientRect(); return { x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top) / k }; };

  const onDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const p = toImg(ev), hd = (ev.target as HTMLElement).dataset.h;
    if (hd) op.current = { move: false, hd, ax: hd.includes('w') ? c.x + c.s : c.x, ay: hd.includes('n') ? c.y + c.s : c.y };
    else op.current = { move: true, dx: p.x - c.x, dy: p.y - c.y };
  };
  const onMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    const o = op.current;
    if (!o) return;
    const p = toImg(ev);
    if (o.move) { setC(clampCrop({ x: p.x - o.dx, y: p.y - o.dy, s: c.s }, w, h)); return; }
    const sx = o.hd.includes('w') ? -1 : 1, sy = o.hd.includes('n') ? -1 : 1;
    const lim = Math.min(sx > 0 ? w - o.ax : o.ax, sy > 0 ? h - o.ay : o.ay);
    const s = clamp(Math.max((p.x - o.ax) * sx, (p.y - o.ay) * sy), Math.min(24, lim), lim);
    setC({ s, x: sx > 0 ? o.ax : o.ax - s, y: sy > 0 ? o.ay : o.ay - s });
  };
  const onUp = () => { op.current = null; };

  return (
    <>
      <p>四角を顔に合わせてください。中をドラッグで移動、角をドラッグ（またはスライダー・ホイール）で大きさを変えられます。丸の内側が図に表示されます。</p>
      <div className="crop-wrap">
        <div className="crop-stage" id="cStage" ref={stageRef} style={{ width: dw, height: dh }}>
          <img src={src} alt="" draggable={false} />
          <div className="crop-box" id="cBox" style={{ left: c.x * k, top: c.y * k, width: c.s * k, height: c.s * k }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <div className="crop-circle" />
            {['nw', 'ne', 'sw', 'se'].map((hd) => <i key={hd} data-h={hd} />)}
          </div>
        </div>
        <div className="crop-side"><canvas id="cPrev" ref={prevRef} width={160} height={160} /><span>プレビュー</span></div>
      </div>
      <div className="crop-size"><span>小</span>
        <input type="range" id="cSize" min={minS} max={maxS} step={1} value={c.s} onChange={(e) => setC(resizeKeepCenter(c, +e.target.value))} />
        <span>大</span></div>
      <div className="row">
        <button className="btn" id="cAuto" onClick={async () => setC(await defaultCrop(im))}>位置を初期化</button>
        <button className="btn" id="cCancel" onClick={onCancel}>キャンセル</button>
        <button className="btn primary" id="cOk" onClick={() => onDone({ img: cropToData(im, c), src, crop: { x: Math.round(c.x), y: Math.round(c.y), s: Math.round(c.s) } })}>この範囲で決定</button>
      </div>
    </>
  );
}
