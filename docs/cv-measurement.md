# CV計測設計（LP公開前の必須前提）

> 戦略レポート(`docs/lp-strategy.md`)の失敗リスク(E)「CV計測の不備」を潰すための設計。
> **このLPはアフィリLP＝最終購入は遷移先で起きる。よって当サイトで測れる"CV"の実体は「アフィリ先への送客クリック」**。
> 既存実装（`public/app.js` / `src/pages/index.astro`）に既にある計測を一次資源として活用し、不足だけ足す。

---

## 1. 計測スタック（既存・確認済み）
| ツール | ID | 用途 |
|---|---|---|
| GA4 | `G-DMCWVLP3E3` | イベント収集・ファネル分析・セグメント |
| Google Ads | `AW-18129603657` | コンバージョン最適化（入札） |
| Microsoft Clarity | `wxnujpnscp` | ヒートマップ・録画（離脱箇所の質的把握） |

広告パラメータ（`gclid/gbraid/wbraid/utm_*/keyword/matchtype/device` 等）は `app.js` の `FORWARDED_AD_PARAMS` でアフィリ先へ転送済み＝**遷移先計測との突合が可能**。

---

## 2. コンバージョン定義（3層）

### 主CV（Primary／Google Adsの入札最適化に使う）
- **`gold_kaitori_affiliate_click`**（=アフィリ先への送客クリック）。
  - 既に `app.js` がbeaconで発火。`affiliate_key`(manekiya/otakaraya)・`track_name`・`landing_intent`・`link_url` を付与。
  - **これをGoogle Adsのコンバージョンに設定**（GA4キーイベント→Google Adsインポート、またはAds側で同イベントをCV化）。
  - 戦略の「CV語句が特定できない」問題は、これを主CVに据え `keyword/matchtype` 転送と合わせることで**語句別CVが追える**ようになる。

### 補助CV（Secondary／質の高い意図シグナル。観測・将来の最適化候補）
- `cta_click`（CTA押下。affiliate_clickの一段手前）
- **`calc_estimate`**（その場概算の計算実行＝新規。下記4で追加）
- `gold_kaitori_ai_check_complete`（査定前チェック完了）
- `comparison_view`（比較ブロック到達）

### 非CV（計測はするが、CVには数えない）
- **`gold_kaitori_source_click`**（＝出典・根拠リンクと、成果が付かない公式直リンクのクリック）。
  - `link_role: "source"` が付く。CTAは `link_role: "cta"`。
  - 比較記事型LP（`/manekiya-otakaraya/` 系）で使用。出典リンクをCVに混ぜると
    非成果クリックが水増しされて2社のクリック比率が歪むため、別イベントに分けている。
  - **アフィリを経由しない公式直リンク**（例 `manekiya.shop`）もここに入る。
    成果にならない流出量を把握するための軸。

### マイクロCV（Micro／LPの中間KPI。ABテストの判定補助）
- `scroll_50` / `scroll_75`（スクロール深度）
- `gold_kaitori_ai_message_copy`（相談文コピー）
- `gold_kaitori_scroll_click`（セクション内回遊）

> **役割分担**：入札最適化＝主CVのみ。ABテストの勝敗判定＝主CV＋補助CV。離脱診断＝マイクロCV＋Clarity。

---

## 3. セグメント設計（"今回データを語らせる"ための軸）
全イベントに付与済み/付与すべきパラメータ：
- **`landing_intent`**（platinum / fee / k18 / unmarked / general）← LP/広告グループ別の勝敗を分離。
- **`affiliate_key`**（manekiya / otakaraya）← STEP6の導線が機能しているか。
- **`track_name`**（hero_phone_primary / calc_cta / compare_phone …）← **CTA位置別のCV貢献**＝STEP7/8の判定軸。
- **転送広告パラメータ**（keyword / matchtype / device）← 語句別・デバイス別CV。

**必須レポート（GA4 探索）**
1. landing_intent × 主CV率（プラチナLPが他intentより上か）
2. track_name × 主CV（FV / 概算直下 / 手数料直下 / 比較 / 終盤 のどのCTAが効くか）
3. keyword × 主CV（pt900/pt950/18金 など語句別）※matchtype併記
4. device × 主CV（モバイル偏重のはず＝モバイルFV最優先の裏取り）
5. ファネル：表示→scroll_50→calc_estimate→cta_click→affiliate_click（離脱段の特定）

---

## 4. 実装で足すもの（不足分）

| 項目 | 内容 | 対応 |
|---|---|---|
| **`calc_estimate` イベント** | その場概算の計算実行を補助CVとして計測（純度・重さ・概算額を付与） | `app.js` にcalculatorを追加（本コミットで実装） |
| **CTA位置の命名統一** | プラチナLPの各CTAに一意な `data-track`（`platinum_hero_phone` 等）を付与 | LP①実装時に付与（本コミット） |
| **Google Ads CV登録** | `gold_kaitori_affiliate_click` をAds側でコンバージョン化（GA4インポート推奨） | **Google Ads管理画面で手動設定（コード外）** |
| **電話タップ計測** | 遷移先で電話する導線が主。当サイトは"送客クリック"までしか測れない点を明記 | 遷移先(まねきや)側のCV連携が取れる場合は突合。当面は送客クリックを主CVとする |

> ⚠️ **コード外で必須の作業**：Google Adsで `gold_kaitori_affiliate_click` をコンバージョンアクションとして登録し、対象キャンペーンの最適化目標に設定する。これをやらないと入札最適化が効かず、ABテストの母数も貯まらない。

---

## 5. データ確度に関する運用ルール（戦略リスクA対応）
- 現状は1日100表示規模。**主CVが各バリアントで最低30〜50件貯まるまで勝敗を確定しない**。
- 母数が貯まらない初期は、主CVではなく**補助CV（cta_click / calc_estimate）でLPの方向性を先に読む**。
- Clarity録画で「FVで離脱」「概算で止まる」等の質的兆候を併用し、定量が貯まる前の意思決定を補助。

---

## 6. まとめ（着手順の前提）
1. 本コミットで `calc_estimate` 計測とCTA命名を実装（コード側）。
2. **公開前にGoogle Ads側で主CV(`gold_kaitori_affiliate_click`)を登録**（コード外・必須）。
3. その上でLP①公開 → セグメント別レポート(第3節)を即日確認できる状態にする。
