import type { StatusKey } from './types';

/** 人物の丸の半径 */
export const R = 32;
export const NODE_COLOR = '#4A5568';
/** 画像書き出し用のフォント指定（書き出した画像ではCSS変数が使えないため実名で指定） */
export const FONT = "'Noto Sans JP','Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif";
export const STORAGE_KEY = 'relatime-v1';
/** 名前を変える前の保存キー（残っていれば読み込んで引き継ぐ） */
export const LEGACY_STORAGE_KEYS = ['soukanzu-maker-v1'];

export const PALETTE = ['#E8615A', '#3D8BD9', '#2BA57A', '#9B6BD6', '#E89B2D', '#D9558F', '#1FA3B3', '#5A6B7D'];
export const EDGE_COLORS = ['#5A6B7D', '#E8615A', '#D9558F', '#E89B2D', '#2BA57A', '#3D8BD9', '#9B6BD6', '#1F2430'];
export const PRESETS = ['親子', '兄弟', '姉妹', '夫婦', '恋人', '片思い', '友人', '親友', '幼なじみ', 'ライバル', '上司', '部下', '師弟', '同僚', '敵対', '協力'];

/** 状態（シートごと）: 札を付けるだけ。灰色表示は別の設定 */
export const STATUSES: { k: StatusKey; label: string; color?: string }[] = [
  { k: '', label: 'なし' },
  { k: 'dead', label: '死亡', color: '#1f2430' },
  { k: 'missing', label: '行方不明', color: '#6b7280' },
  { k: 'injured', label: '負傷', color: '#E8615A' },
  { k: 'left', label: '退場', color: '#8A94A6' },
  { k: 'custom', label: 'その他', color: '#9B6BD6' },
];
export const statusOf = (k: StatusKey) => STATUSES.find((x) => x.k === k) || STATUSES[0];
export const statusLabel = (k: StatusKey, text: string) => (k === 'custom' ? text || 'その他' : statusOf(k).label);
