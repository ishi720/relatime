'use client';
// 画像の書き出し: 表示中の図（選択の印などを外した状態）をSVGにまとめ、2倍解像度のPNGにする
import { flushSync } from 'react-dom';
import { FONT } from '@/lib/constants';
import { bounds } from '@/lib/model';
import { textW } from '@/lib/util';
import { useEditor, viewOf } from '@/store/editor';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function buildExportSvg() {
  const st = useEditor.getState();
  const saved = { sel: st.sel, connectFrom: st.connectFrom, hits: st.hits };
  // 選択の印・検索の印を消した状態で描き直してから中身を取り出す
  flushSync(() => useEditor.setState({ sel: null, connectFrom: null, hits: new Set() }));
  const html = (id: string) => document.getElementById(id)?.innerHTML ?? '';
  const layers = html('gG') + html('gE') + html('gGL') + html('gN');
  flushSync(() => useEditor.setState(saved));

  const { doc, allMode } = st;
  const vd = viewOf(doc, allMode);
  const ttl = [doc.title, allMode ? '全体（最新）' : doc.sheets[doc.cur].name].filter(Boolean).join('　');
  const b = bounds(vd.nodes, doc.groups), pad = 28, tH = ttl ? 60 : 0;
  const W = Math.ceil(Math.max(b.w, textW(ttl, 24) + 40) + pad * 2), H = Math.ceil(b.h + pad * 2 + tH);
  const ox = (W - b.w) / 2 - b.x;
  const str =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><filter id="fGray"><feColorMatrix type="saturate" values="0"/></filter></defs>` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/><g font-family="${FONT.replace(/"/g, '')}">` +
    (ttl ? `<text x="${W / 2}" y="${pad + 22}" text-anchor="middle" font-size="24" font-weight="700" fill="#1f2430">${esc(ttl)}</text>` : '') +
    `<g transform="translate(${ox},${pad + tH - b.y})">${layers}</g></g></svg>`;
  return { W, H, str };
}

export function exportImage() {
  const st = useEditor.getState();
  if (!viewOf(st.doc, st.allMode).nodes.length) { st.notify('まだ人物がいません'); return; }
  const { W, H, str } = buildExportSvg();
  const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  const img = new Image();
  img.onload = () => {
    let png = svgUrl;
    try {
      const s = 2, c = document.createElement('canvas');
      c.width = W * s; c.height = H * s;
      const ctx = c.getContext('2d')!;
      ctx.scale(s, s);
      ctx.drawImage(img, 0, 0);
      png = c.toDataURL('image/png');
    } catch {
      /* PNGにできないブラウザではSVGのまま表示 */
    }
    useEditor.getState().openModal({ type: 'export', png, svg: str });
  };
  img.onerror = () => useEditor.getState().notify('画像の生成に失敗しました');
  img.src = svgUrl;
}
