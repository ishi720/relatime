// 相関図のデータ型（保存・書き出しされる形）

export type Crop = { x: number; y: number; s: number };

/** 画像一式: 表示用(img)・切り抜き前の元画像(src)・切り抜き範囲(crop) */
export type ImgSet = { img: string; src: string; crop: Crop | null };

/** 人物（全シート共通）: 名前と共通画像 */
export type Person = { name: string } & ImgSet;

export type Group = { id: string; name: string; color: string };

export type StatusKey = '' | 'dead' | 'missing' | 'injured' | 'left' | 'custom';

/** シート上の人物: シートごとに変えられる項目 */
export type SheetNode = {
  id: string;
  sub: string;
  status: StatusKey;
  statusText: string;
  gray: boolean;
  /** このシートで設定した所属（null なら前のシートから引き継ぐ） */
  gOv: string[] | null;
  /** このシートから差し替えた画像（null なら前のシート or 共通画像） */
  imgOv: ImgSet | null;
  x: number;
  y: number;
};

export type EdgeDir = 'forward' | 'both' | 'none';
export type Edge = {
  id: string;
  from: string;
  to: string;
  label: string;
  dir: EdgeDir;
  style: 'solid' | 'dashed';
  color: string;
};
/** シートごとの関係の差分: 追加・変更（Edge）か、このシート以降で終了（removed） */
export type EdgeEntry = Edge | { id: string; removed: true };
export const isRemoved = (e: EdgeEntry): e is { id: string; removed: true } => 'removed' in e;

export type Sheet = { id: string; name: string; nodes: SheetNode[]; edges: EdgeEntry[] };

export type Pos = { x: number; y: number };

export type Doc = {
  v: 4;
  title: string;
  groups: Group[];
  people: Record<string, Person>;
  sheets: Sheet[];
  cur: number;
  /** 全体（最新）ビューで動かした配置 */
  summaryPos: Record<string, Pos> | null;
};

/** 画面に表示する人物（引き継ぎを解決済み） */
export type VNode = {
  id: string;
  name: string;
  img: string;
  src: string;
  crop: Crop | null;
  /** 画像がどこから来ているか: -1=共通画像, それ以外=差し替えたシート番号 */
  imgFrom: number;
  sub: string;
  status: StatusKey;
  statusText: string;
  gray: boolean;
  groups: string[];
  /** 所属がどこから来ているか: -1=なし, それ以外=設定したシート番号 */
  groupsFrom: number;
  x: number;
  y: number;
  /** 全体ビューのみ: 最後に登場したシート */
  lastSheet?: number;
};

export type Selection = { type: 'node' | 'edge'; id: string } | null;
export type View = { x: number; y: number; k: number };
