# このリポジトリでの作業メモ（Claude 向け）

貴金属買取アフィリエイトの静的サイト（Astro / GitHub Pages）。

## 新しいLPを作るときの運用（重要）

ユーザーは**このチャットで新LPを依頼**する。その際は次の方針で作る：

- ⚠️ **プラチナは案件対象外（2026-08-06）**。プラチナ系LPを新規に作らない。既存の `LP2nd` / `pt-yubiwa` /
  `pt-kaitori` に**広告費を向けない**（全期間で41,974円＝総支出の17.4%が回収不能だった）。
  詳細は `docs/controlled-test-runbook-2026-07-20.md` の「2026-08-06 改訂」。
- **構造の土台はひな形を使う**：金系 = `src/pages/LP3/index.astro` ／ ~~プラチナ系 = `src/pages/LP2nd/index.astro`~~（対象外）。
  比較・強化版の金LP = `public/manekiya-otakaraya/index.html`（素のHTML。ネックレス版 `public/kin-necklace/` はこれを複製し、
  画像とCSSは `/manekiya-otakaraya/` を参照して重複を避けている）。
  比較表・キャンペーン日付の自動計算・CTA計測・相見積もり漫画・CSS 等はひな形からそのまま継承し、**構造・デザインをひな形と一致**させる。
- **中身は“丸コピー”ではなく、AIが判断して臨機応変に作り込む**。検索意図に合わせて次を案件ごとに最適化する：
  `title` / `desc`（SEO）、`landingIntent`、FVヒーロー画像の `alt`、`refTtl`（あなたの◯◯、今ならいくら？）、
  `faq`（その商材・重さ・特徴に合った質問と答え）、必要なら見出しやコピーのキーワード。
- **型からの逸脱も必要ならOK**（臨機応変）。その商材特有のセクション追加・並べ替え等が有効なら提案・実施し、
  **ひな形と大きく変える判断をしたときは一言添える**。
- 生成の土台として `npm run new-lp -- scripts/lp-configs/<slug>.config.mjs` を使ってよい（`scripts/new-lp.mjs`）。
  ただし config の中身（特に title/desc/faq）は上記の判断で作る。詳細は `docs/新しいLPの作り方.md`。
- FV画像は先に `public/images/` に置く。生成後は必ず `npm run build` で確認。

既存LP例：`kin-kihei`（金喜平）/ `kihei-30g`・`kihei-50g`（喜平ネックレス重さ別）/ `k18-necklace-30g`（K18ネックレス）。
いずれも「ひな形＋検索意図の差し替え」構成。

## デプロイ / 運用の要点

- push→`main` で `.github/workflows/deploy.yml` がビルド＆GitHub Pagesへ公開。**PRはマージすると自動デプロイ**。
- GitHub Pages が一時的に `Deployment failed, try again later.` を返すことがある（コードの問題ではない）。
  deploy ステップは**自動リトライ（最大2回）**を入れてある。ビルド成果物が正常なら再実行で復旧する。
- キャンペーン日付は自動計算：**まねきや＝月次**（`mkCampDays` / 当月1日〜末日）、**おたからや＝週次**（`campDays` / 次の日曜）。
  比較表・カウントダウンでこの2つを取り違えないこと。
- 相場は `scripts/update-rates.mjs`（田中貴金属→三菱マテリアル→前回値維持）。`yen()` 等は `src/lib/rates.js`。

## 作業スタイル

- コミット/プッシュは指定のブランチで行い、PR作成→squashマージ。**mainへ直接pushしない**。
- 大きめの変更・型からの逸脱・中身の方針が分かれる点は、勝手に進めず一言確認する。
