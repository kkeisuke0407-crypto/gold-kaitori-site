# 実装結果

## テンプレート設計

- 共通テンプレート: `src/pages/hikakaku-watch/story/[model].astro`
- モデル別データ: `src/data/hikakaku-watch-model-stories.ts`
- 追加スタイル: `public/hikakaku-watch-story/model.css`
- モデル別画像: `public/hikakaku-watch-story/models/<slug>/`

新しいモデルを追加する場合は、データオブジェクト1件と `hero-v1.webp` / `entry-form-v1.webp` の2素材を追加する。ページ本文を複製しないため、共通導線や注意書きの修正は1ファイルで反映できる。

## 派生URL

- `/hikakaku-watch/story/submariner/`
- `/hikakaku-watch/story/datejust/`
- `/hikakaku-watch/story/daytona/`
- `/hikakaku-watch/story/gmt-master-ii/`
- `/hikakaku-watch/story/explorer/`

## KWの統合方針

- 「モデル名 買取価格」「モデル名 買取相場」「ロレックス モデル名 買取相場」は同じモデルLPへ集約する。
- CONDITION系の現行ページは変更しない。
- 計測intentは `hikakaku_watch_model_<slug>` とし、モデル単位でMCVを分ける。

## 検証

- `npm run build`: 成功、34ページ生成
- `astro check`: リポジトリ全体では既存の `_unpublished` 等39ファイルに診断あり。今回追加したモデルデータ・動的ページには診断なし
- 320×720: 5モデルすべて横スクロールなし、金額切れなし、画像欠損なし
- 375×812: 入力画面、最終査定、最終CTA、FAQ開閉を確認
- 768×1024: 最大7桁の査定額表示を確認
- 1440×900: 760pxの縦1列レイアウト、中央配置、CTA幅を確認

## 未実施

- 本番公開は未実施。既存ページを変更せず、新規派生ページのみ追加した状態。
- ASP条件・記事/CR承認は [公式確認]。
