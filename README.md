# Relatime

relation（関係）＋ time（時間）。時系列で変わる人物の相関図を作るWebアプリです。Next.js（React）＋ TypeScript で作っています。

## 起動

```bash
npm install
npm run dev      # 開発用 http://localhost:3000
npm run build    # 本番用にビルド
npm start        # ビルドしたものを起動
```

Node.js 20 以上が必要です。

## 使っているもの

| 用途 | ライブラリ |
|---|---|
| フレームワーク | Next.js 16（App Router） |
| 画面 | React 19 |
| 状態管理 | zustand |
| 変更しやすいデータ更新 | immer |

図はSVGで描いています。自動配置は外部ライブラリを使わない自作の計算です。

## フォルダ構成

```
src/
├─ app/                  Next.js のページ（layout.tsx / page.tsx / globals.css）
├─ lib/                  画面に依存しないロジック
│  ├─ types.ts           データの型
│  ├─ model.ts           読み込み時の正規化・シート間の引き継ぎ・全体（最新）の組み立て・グループの四角
│  ├─ layout.ts          自動配置
│  ├─ edgeGeometry.ts    関係の線とラベルの位置
│  ├─ image.ts           画像の縮小・顔の切り抜き
│  ├─ constants.ts       色・状態・定数
│  └─ util.ts            小さな関数
├─ store/
│  └─ editor.ts          状態と操作（元に戻す履歴・選択・表示位置・すべての編集操作）
└─ components/
   ├─ Editor.tsx         全体の組み立て・自動保存・キーボード操作
   ├─ Header.tsx         上部のツールバー
   ├─ SearchBox.tsx      名前で検索
   ├─ Tabs.tsx           下のシートのタブ
   ├─ canvas/            図（ドラッグ・拡大縮小・ドロップ）と描画
   ├─ panel/             右側のパネル（人物・関係・シート・全体）
   ├─ modals/            ダイアログ（顔の切り抜き・画像・データ・新規・シート削除）
   ├─ Overlays.tsx       お知らせとメニュー
   ├─ exportImage.ts     PNG 書き出し
   └─ hooks.ts           入力欄の「元に戻す」区切り・画像選択の流れ
```

## データの保存

- ブラウザの localStorage（キー `relatime-v1`）に自動保存します。名前を変える前のキー `soukanzu-maker-v1` に保存されたデータがあれば、それを引き継ぎます。
- 「データ」から JSON で書き出し・読み込みができます。前のHTML版で書き出したデータもそのまま読み込めます。

### データの形（v4）

- `people`: 人物（名前と全シート共通の画像）
- `sheets[]`: 時系列のシート。シートごとに
  - `nodes`: 登場する人物の位置・肩書き・状態・灰色表示、所属の変更（`gOv`）、画像の差し替え（`imgOv`）
  - `edges`: 前のシートからの関係の差分（追加・変更、または `removed` で終了）
- 所属・画像・関係は、そのシート以前で一番近い変更を引き継ぎます（`lib/model.ts`）。

## 公開

`npm run build` で静的なページとして出力されるので、Vercel などにそのまま公開できます。
