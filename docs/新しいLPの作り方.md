# 新しいLPの作り方（ひな形から一発生成）

金系・プラチナ系の新しいランディングページ（LP）は、**ひな形をコピーして「検索意図で変わる部分」だけを差し替える**方式で作ります。手作業でセクションを組む必要はありません。

## ひな形（テンプレート）

| 種類 | ひな形ファイル | `base` の値 |
|---|---|---|
| **金系** | `src/pages/LP3/index.astro` | `"gold"` |
| **プラチナ系** | `src/pages/LP2nd/index.astro` | `"platinum"` |

ひな形には、比較表・本日の相場・高く売る3ポイント・ランキング3社・相見積もり漫画・FAQ・最終CTA・キャンペーン日付の自動計算・CTA計測などが**すべて入っています**。新LPはこれと**構造・CSSが完全一致**し、下記の「変更箇所」だけがページ固有になります。

## 変更箇所（＝config に書く項目）

| キー | 必須 | 内容 |
|---|:--:|---|
| `base` | ✅ | `"gold"`(LP3) か `"platinum"`(LP2nd) |
| `slug` | ✅ | URLパス。`src/pages/<slug>/` に生成 → `https://kaitori.hakobu-family.com/<slug>/` |
| `title` | ✅ | `<title>` / og:title（検索意図キーワードを入れる） |
| `desc` | ✅ | meta description |
| `landingIntent` | ✅ | `<body data-landing-intent>`（計測用の識別子。重複しない値） |
| `hero` | ✅ | FVヒーロー画像 `{ src, alt, width?, height? }` |
| `ogpImage` | – | og:image。省略時はひな形の値 |
| `refTtl` | – | 「あなたの◯◯、今ならいくら？」。省略時はひな形の値 |
| `faq` | – | `[{ q, a }, ...]`。指定時はFAQ(schema＋表示)を丸ごと差し替え。省略時はひな形のFAQ |
| `overwrite` | – | `true` で既存ファイルを上書き |

**これ以外は一切変わりません**（＝ひな形の最新状態がそのまま反映される）。ひな形を改善すれば、次に作るLPすべてに自動で効きます。

## 手順

1. **FV画像を用意**して `public/images/` に置く（例 `hero-k18-ring.webp`）。
2. **設定ファイルを作成**：`scripts/lp-configs/_example.config.mjs` をコピーして `scripts/lp-configs/<slug>.config.mjs` を作り、値を書き換える。
3. **生成**：
   ```bash
   npm run new-lp -- scripts/lp-configs/<slug>.config.mjs
   # または: node scripts/new-lp.mjs scripts/lp-configs/<slug>.config.mjs
   ```
   → `src/pages/<slug>/index.astro` ができる。
4. **確認**：
   ```bash
   npm run build
   ```
   ビルドが通ればOK。`npm run dev` でプレビュー可。
5. ブランチにコミット＆プッシュ → PR → マージで公開（デプロイは自動）。

## 補足

- `faq` の答えに `{yen(rates.k18)}` のような**動的な相場表示**を入れたい項目は、生成後にその1項目だけ手で調整してください（schema用テキストと表示用の書式が異なるため）。基本は素のテキスト推奨。
- 既存の3ページ（`kin-kihei` / `kihei-30g` / `k18-necklace-30g`）も、この「ひな形＋差し替え」と同じ構成になっています。
- ひな形（LP3 / LP2nd）を編集したときは、既存の各LPにも反映したい内容なら別途各ページへ展開が必要です（新規生成分は次回作成時に自動反映）。
