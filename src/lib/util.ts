export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const uid = () => Math.random().toString(36).slice(2, 9);

/** 色を白に近づける（a=0 で元の色、1 で白） */
export function tint(hex: string, a: number) {
  const v = parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round(c + (255 - c) * a);
  return `rgb(${m((v >> 16) & 255)},${m((v >> 8) & 255)},${m(v & 255)})`;
}

/** 丸の中に出す1文字（「姓 名」なら名の1文字目） */
export function initial(name: string) {
  const t = (name || '').trim().split(/[\s　]+/);
  const s = t[t.length - 1] || '?';
  return [...s][0] || '?';
}

/** 文字列のおおよその表示幅（全角=fs、半角=0.6fs） */
export function textW(s: string | undefined, fs: number) {
  let w = 0;
  for (const ch of String(s || '')) w += ch.charCodeAt(0) > 255 ? fs : fs * 0.6;
  return w;
}

/** 検索用: 全角半角・カタカナひらがな・空白の違いを無視 */
export const normText = (v: string) =>
  String(v || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・･.]/g, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** 「第1話 出会い」→「第2話」のように次のシート名を作る */
export function nextName(name: string) {
  const m = name.match(/^(.*?)(\d+)(\D*)$/);
  return m ? m[1] + (+m[2] + 1) + m[3].split(/[\s　]/)[0] : `${name}（続き）`;
}
