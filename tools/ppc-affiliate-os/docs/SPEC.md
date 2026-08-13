# PPC Affiliate OS v0.1 開発仕様書

更新日: 2026-08-13

## 1. 目的

PPCアフィリエイト案件について、以下を一つのツールで行う。

1. 出稿前の案件判定
2. キーワード候補の収集・分類・採算判定
3. 運用中のボトルネック診断と改善提案
4. SCALE / KEEP / IMPROVE / TEST / STOP の意思決定
5. 撤退ラインの定量判定

本ツールは「AIが勝てるKWを断定する」のではなく、案件情報・Google Ads市場データ・実運用データを統合し、損失を限定しながら勝ちKWを発見・育成する意思決定エンジンを目指す。

---

## 2. v0.1 の前提

### 2.1 広告媒体
- Google検索広告を対象とする。
- Performance Max、Yahoo!広告、Microsoft広告はv0.1対象外。

### 2.2 ASP / 成果連携
- SLVRbulletを使用する。
- SLVRbulletのGoogle広告連携により、Google広告流入時の `gclid` / `wbraid` / `gbraid` を記事LPからSLVRbullet広告リンクへ引き継ぎ、発生成果をGoogle広告のオフラインコンバージョンとして反映する。
- 自作ツールはSLVRbulletの成果そのものを直接取得することを必須としない。Google Ads APIから、SLVRbulletが連携した対象コンバージョンアクションの実績を取得する。
- 承認/否認・確定売上はGoogle広告の発生成果とは別管理とする。案件マスターの承認率を期待値として使用し、承認結果CSV/APIが取得できる場合は実績値で上書きする。

### 2.3 LP計測
- LP閲覧からアフィリエイトリンククリックまでを自前計測する。
- SLVRbulletのパラメータ引き継ぎタグはLPへ別途設置する。
- 自前トラッカーは、CTAクリック時に `gclid/wbraid/gbraid`、キャンペーン、広告グループ、設定KW、LP、デバイス等を保存する。

### 2.4 AI
- OpenAI APIを必須AIプロバイダとする。
- Claude APIはオプション。プロバイダ抽象化を行い後から切り替え可能にする。
- 数式・ROAS・撤退判定など、再現性が必要なロジックはAIではなくコードで算出する。
- AIはKW分類、意味クラスタ、検索意図評価、仮説生成、改善案、レビューを担当する。

---

## 3. ゴール / 非ゴール

### 3.1 v0.1 ゴール
- 案件を登録できる。
- 案件条件から採算ラインを逆算できる。
- KWP相当のGoogle Ads APIデータを取り込める設計になっている。
- KW候補をAIで分類し、CORE / OPPORTUNITY / DISCOVERY / EXCLUDEに仕分けできる。
- Google Adsの実績を日次同期できる設計になっている。
- LP→アフィクリックを自前計測できる。
- 実績からボトルネックを特定できる。
- SCALE / KEEP / IMPROVE / TEST / STOPを自動提案できる。
- 撤退理由を数値で説明できる。

### 3.2 v0.1 非ゴール
- Google広告の入札・予算・KWを自動変更しない。
- SLVRbullet側設定を自動操作しない。
- ASP全社APIを統合しない。
- 最終承認成果の完全自動取得を必須としない。
- MLによる高度な予測モデルはまだ作らない。

---

## 4. システム全体像

```text
案件登録
  ↓
Offer Master
  ↓
AI Seed生成
  ↓
Google Ads Keyword Planning
  ├─ Keyword Ideas
  ├─ Historical Metrics
  └─ Forecast Metrics
  ↓
AI 意図分類 / クラスタリング
  ↓
Preflight採算判定
  ↓
Google広告出稿
  ↓
┌─────────────────────┐
│ Google Ads API       │
│ - cost/clicks/cpc    │
│ - keyword/searchterm │
│ - SLVRbullet CV      │
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│ 自前LPクリック計測   │
│ - LP→Affiliate CTR   │
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│ 運用データDB          │
└─────────┬───────────┘
          ↓
Decision Engine
  ├─ SCALE
  ├─ KEEP
  ├─ IMPROVE
  ├─ TEST
  └─ STOP
          ↓
AI改善提案
```

---

## 5. 外部連携

## 5.1 Google Ads API

### 用途A: KW候補生成
- KeywordPlanIdeaService.GenerateKeywordIdeas
- Seed:
  - AI生成キーワード
  - LP URL
  - 案件公式URL
- 地域・言語を案件条件に合わせる。

### 用途B: Historical Metrics
取得候補:
- avg_monthly_searches
- monthly_search_volumes
- competition
- competition_index
- low_top_of_page_bid_micros
- high_top_of_page_bid_micros

### 用途C: Forecast Metrics
Historical Metricsで候補を絞った後に使用する。
取得候補:
- impressions
- clicks
- ctr
- average_cpc
- cost
- conversions系予測値（利用可能な範囲）

### 用途D: 運用実績
GAQLで主に以下を同期する。

キャンペーン/広告グループ/KW:
- impressions
- clicks
- cost_micros
- average_cpc
- ctr
- conversions
- conversions_value
- all_conversions
- all_conversions_value

検索語句:
- search_term_view
- search_term
- campaign / ad_group
- impressions / clicks / cost / conversions

### 認証
- Google Ads manager account / MCC
- Developer Token
- Google Cloud project
- OAuth 2.0 credentials
- login_customer_id
- customer_id

### 実装上の注意
- Keyword Planning系は通常レポート系よりレート制限が厳しいため、キャッシュとバッチ処理を前提にする。
- 検索語句レポートはGoogleが公開する行に限定される。完全な全検索語句取得を前提にしない。
- v0.1は検索広告中心のため `search_term_view` を利用する。

---

## 5.2 SLVRbullet

### 役割
- Google広告のクリックIDを成果まで保持する橋渡し。
- SLVRbullet側で発生成果をGoogle広告コンバージョンアクションへアップロードする。

### LP側必須事項
SLVRbullet指定のパラメータ引き継ぎタグをLP下部へ設置する。

```html
<script src="https://js.slvrbullet.com/pt.min.js"></script>
```

### 本ツールとの責務分離
SLVRbullet:
- 発生成果 → Google Ads

本ツール:
- Google Adsから発生成果実績を読む
- LP→アフィクリックを自前計測
- 承認率・確定売上を別管理
- 意思決定を行う

### 注意
- SLVRbullet公開マニュアル上は「発生した成果」のGoogle連携を確認できる。
- 承認/否認をGoogle側へ後から反映する仕様はv0.1では前提にしない。
- 発生成果と確定利益を区別する。

---

## 5.3 OpenAI API

### 役割
1. シードKW生成
2. KW検索意図分類
3. 商用意図 / 成約距離 / ノイズリスク評価
4. KWクラスタ名生成
5. 穴KW・ずらしKW生成
6. 実績の文章診断
7. 改善施策提案

### API設計
- Responses APIを利用する。
- Structured OutputsでJSON Schema準拠の出力を強制する。
- 大量KWの意味クラスタリングが必要になったらEmbeddingsを追加する。
- モデル名は環境変数 `OPENAI_MODEL` で指定し、コードに強く固定しない。

### KW分類出力例
```json
{
  "intent": "査定検討",
  "conversion_distance": 84,
  "commercial_intent": 91,
  "noise_risk": 12,
  "cluster": "ロレックス査定",
  "bucket": "CORE",
  "estimated_lp_click_rate": 0.48,
  "reason": "売却前の査定行動に近い"
}
```

---

## 5.4 Claude API（オプション）

### 役割
- 複雑な案件レビュー
- 撤退/継続判断のセカンドオピニオン
- LPと検索意図のズレ分析
- 改善戦略の文章化

### 実装
- `AIProvider` インターフェースを用意する。
- `OpenAIProvider` をv0.1標準実装。
- `AnthropicProvider` は後から追加可能にする。
- Claudeを利用する場合はNative Messages APIを使用し、必要に応じてStructured Outputs / Prompt Cachingを使う。

---

## 6. 必要な案件情報

### 必須
- offer_id
- 案件名
- ASP名
- 成果単価
- 成果地点
- 承認率
- 広告主CVR（不明なら推定値＋confidence）
- 商標KW可否
- 競合KW可否
- リスティング可否
- NG KW / NG表現
- 地域制限
- 年齢制限
- デバイス制限
- 月間上限 / 件数上限
- LP/CR確認要否

### 任意
- 公式LP URL
- ASP案件ページURL
- 成果Cookie期間
- 過去EPC
- 過去CTR
- 過去承認率
- 季節性
- メモ

### テスト条件
- target_roas
- max_test_budget
- min_test_clicks
- min_test_conversions
- stop_after_zero_cv_clicks
- scale_roas_multiplier

---

## 7. KW発見パイプライン

### Step 1: AIでSeed生成
入力:
- 案件概要
- 成果地点
- ターゲット
- NG条件
- LP URL

生成カテゴリ例:
- 商品/サービス名
- 売却/申込行動
- 比較
- 査定
- 相場
- 問題/悩み
- 状況
- 競合
- 地域
- ずらし
- 周辺需要

### Step 2: Google Keyword Ideasで拡張
- AI seedをGoogle Ads APIへ投入。
- URL seedも併用。
- 重複を正規化。

### Step 3: Historical Metrics付与
各KWに以下を付与:
- 月間検索数
- 月別検索数
- 競合
- CPC下限目安
- CPC上限目安

### Step 4: AI分類
各KWを以下へ分類:
- CORE
- OPPORTUNITY
- DISCOVERY
- EXCLUDE

意図ラベル例:
- 購入/申込直前
- 査定/見積
- 比較
- 相場/価格
- 情報収集
- 問題解決
- ずらし
- ノイズ

### Step 5: クラスタリング
単体検索数が小さいKWを意味単位でまとめる。

例:
```text
運送会社 資金繰り
燃料代 払えない
トラック会社 資金不足
運送業 キャッシュフロー
```

→ `運送業資金不足` クラスター

評価は単体検索数ではなくクラスター総検索数/総クリックポテンシャルも見る。

### Step 6: Forecast
CORE / OPPORTUNITY中心にForecast Metricsを取得する。

### Step 7: 事前採算判定
必要LP→アフィCTR等を逆算して出稿優先度を決める。

---

## 8. 採算計算式

### 8.1 アフィリンク1クリック期待値

```text
Affiliate Click EPC
= payout × approval_rate × advertiser_cvr
```

例:
```text
8,500 × 1.00 × 0.08 = 680円
```

### 8.2 広告1クリック期待売上

```text
Ad Click EPC
= Affiliate Click EPC × LP_to_affiliate_ctr
```

### 8.3 損益分岐CPC

```text
Break-even CPC = Ad Click EPC
```

### 8.4 目標ROAS時の上限CPC

```text
Target CPC
= Ad Click EPC / target_roas
```

`target_roas=1.5` は150%。

### 8.5 必要LP→アフィCTR

```text
Required LP CTR
= market_cpc × target_roas
  / (payout × approval_rate × advertiser_cvr)
```

### 8.6 CPC余裕率

```text
CPC Headroom
= Target CPC / market_cpc
```

目安:
- >= 1.30: 強い
- 1.00-1.29: テスト価値高い
- 0.80-0.99: 改善前提
- < 0.80: 原則弱い

### 8.7 月間利益ポテンシャル

```text
Monthly Profit Potential
= expected_monthly_clicks × (Ad Click EPC - market_cpc)
```

---

## 9. KW事前判定

### CORE
条件例:
- 商用意図が高い
- Required LP CTR <= AI想定LP CTR
- CPC Headroom >= 1.0
- 一定のクリックポテンシャルあり

### OPPORTUNITY
条件例:
- 意図は中程度だがCPCが安い
- 検索量が大きい
- 必要CTRが低い
- ずらしKWで採算余地がある

### DISCOVERY
- AIの確信度は低い
- 実績データがない
- 少額で検証する価値がある

### EXCLUDE
- NG規約
- 明確な無関係
- 必要LP CTR > 100%
- 構造的に採算不可能

---

## 10. 運用計測ファネル

```text
Impression
  ↓
Google Ad Click
  ↓
LP Session
  ↓
Affiliate Link Click
  ↓
SLVRbullet 発生成果
  ↓
Approved Conversion（取得可能時）
```

主要指標:

```text
Ad CTR = clicks / impressions
LP→Affiliate CTR = affiliate_clicks / ad_clicks
Affiliate CVR = google_final_conversions / affiliate_clicks
Ad→Final CVR = google_final_conversions / ad_clicks
Expected Approved CV = final_cv × approval_rate
Actual ROAS = conversion_value / cost
Expected Approved ROAS = expected_approved_revenue / cost
```

---

## 11. ボトルネック診断

### パターンA
広告CTR低い
- KWと広告文の関連性
- 検索意図ズレ
- 広告訴求

### パターンB
広告CTR良好 / LP→Affiliate CTR低い
- LP問題の可能性大
- FV
- CTA
- 比較軸
- 検索意図とLP内容

### パターンC
LP→Affiliate CTR高い / 最終CVR低い
- KWの質
- 遷移前後の期待値ズレ
- 広告主LPとのミスマッチ
- CTAを煽りすぎている可能性

### パターンD
CVR高い / 赤字
- CPCが高すぎる
- 成果単価不足
- 承認率不足

### パターンE
発生ROAS良好 / 承認ROAS悪い
- 承認率問題
- 成果条件とのミスマッチ
- KW品質またはユーザー属性

---

## 12. 意思決定エンジン

### TEST
- クリック数が `min_test_clicks` 未満
- データ不足
- DISCOVERY KW

### SCALE
初期ルール例:
- conversions >= 3
- actual_roas >= target_roas × 1.20
- expected_approved_roas >= target_roas
- 直近7日でも急激な悪化なし

提案:
- 日予算 +20〜30%
- 強いKWクラスター拡張

### KEEP
- actual_roas >= target_roas
- ただしCV数が少ない、または変動が大きい

### IMPROVE
- 構造上は損益分岐到達可能
- 主要指標の改善必要幅が現実的

例:
```text
LP CTR 現在28%
必要36%
改善幅 +28.6%
```

→ LP改善候補

### STOP
以下のいずれか:
- max_test_budget超過 + CV 0
- stop_after_zero_cv_clicks超過 + CV 0
- Required LP CTR > 100%
- 必要CPC低下幅が極端で市場CPCとかけ離れている
- LP CTR / CVR双方を非現実的に改善しないと採算に届かない
- 承認率反映後に構造赤字

---

## 13. 撤退判断の考え方

「赤字だからSTOP」ではなく、損益分岐までに必要な改善幅を分解する。

例:

| 指標 | 現在 | 必要 | 改善幅 |
|---|---:|---:|---:|
| CPC | 210円 | 190円 | -9.5% |
| LP→Affiliate CTR | 28% | 42% | +50% |
| Affiliate CVR | 7% | 8% | +14.3% |

ツールは最小改善経路を算出する。

### Improvement Feasibility Score
0〜100。

考慮:
- 必要CPC改善率
- 必要LP CTR改善率
- 必要CVR改善率
- 過去同カテゴリ改善実績
- データ量
- 検索市場のCPC分布

v0.1ではルールベース。将来はベイズ更新/統計モデルへ拡張。

---

## 14. データベース

### offers
- id
- name
- asp_name
- payout
- approval_rate
- advertiser_cvr
- advertiser_cvr_confidence
- conversion_point
- target_roas
- max_test_budget
- min_test_clicks
- stop_after_zero_cv_clicks
- status
- created_at

### offer_rules
- offer_id
- trademark_allowed
- competitor_allowed
- listing_allowed
- geo_rules_json
- age_rules_json
- device_rules_json
- negative_rules_json
- notes

### keyword_candidates
- id
- offer_id
- keyword
- normalized_keyword
- match_type
- intent
- cluster
- bucket
- conversion_distance
- commercial_intent
- noise_risk
- ai_estimated_lp_ctr
- ai_confidence

### keyword_metrics
- keyword_candidate_id
- avg_monthly_searches
- competition
- competition_index
- low_bid
- high_bid
- forecast_impressions
- forecast_clicks
- forecast_cpc
- forecast_cost
- fetched_at

### campaigns
- id
- offer_id
- google_customer_id
- google_campaign_id
- name
- conversion_action_resource

### ad_stats_daily
- date
- campaign_id
- ad_group_id
- criterion_id
- keyword_text
- impressions
- clicks
- cost
- conversions
- conversion_value

### search_terms_daily
- date
- campaign_id
- ad_group_id
- search_term
- impressions
- clicks
- cost
- conversions
- conversion_value

### lp_click_events
- id
- occurred_at
- offer_id
- session_id
- gclid
- wbraid
- gbraid
- campaign_id
- ad_group_id
- keyword
- device
- landing_page
- cta_name

### approvals
- id
- offer_id
- conversion_date
- count
- approved_count
- rejected_count
- approved_revenue
- source

### decisions
- id
- entity_type
- entity_id
- decision
- reason_code
- metrics_snapshot_json
- recommendation_json
- created_at

---

## 15. API設計 v0.1

### Health
`GET /health`

### Offer
`POST /api/v1/offers`
`GET /api/v1/offers`
`GET /api/v1/offers/{id}`

### Preflight
`POST /api/v1/decision/preflight`

入力:
```json
{
  "payout": 8500,
  "approval_rate": 1.0,
  "advertiser_cvr": 0.08,
  "target_roas": 1.5,
  "market_cpc": 180,
  "estimated_lp_ctr": 0.50
}
```

出力:
```json
{
  "affiliate_click_epc": 680,
  "ad_click_epc": 340,
  "break_even_cpc": 340,
  "target_cpc": 226.67,
  "required_lp_ctr": 0.3971,
  "cpc_headroom": 1.259,
  "decision": "GO"
}
```

### Runtime
`POST /api/v1/decision/runtime`

入力:
- impressions
- clicks
- cost
- affiliate_clicks
- conversions
- conversion_value
- approval_rate
- target_roas
- max_test_budget
- min_test_clicks
- stop_after_zero_cv_clicks

出力:
- ROAS
- expected approved ROAS
- LP CTR
- affiliate CVR
- bottleneck
- decision
- reason codes

### LP Tracker
`POST /api/v1/tracking/affiliate-click`

ブラウザから送信。

### Keyword classification
`POST /api/v1/keywords/classify`

v0.1はOpenAI adapterに接続。

### Google Sync
`POST /api/v1/google/sync`

MVPでは手動トリガー可。将来cron。

---

## 16. 画面仕様

### 16.1 Dashboard
カード:
- 総広告費
- 発生売上
- 期待承認売上
- ROAS
- 利益
- SCALE件数
- STOP候補件数

案件一覧:
```text
時計一括査定    TEST/IMPROVE/SCALE
Cost            ¥31,420
Revenue         ¥42,500
Expected ROAS   118%
Max bottleneck  LP→ASP CTR
Action          FV改善
```

### 16.2 案件詳細
タブ:
1. Summary
2. Keywords
3. Search Terms
4. Funnel
5. Decisions
6. Settings

### 16.3 Keyword Explorer
列:
- Keyword
- Cluster
- Bucket
- Intent
- Search Volume
- Forecast CPC
- Required LP CTR
- AI estimated LP CTR
- CPC Headroom
- Forecast Profit
- Decision

### 16.4 Runtime Diagnosis
表示:
```text
最大ボトルネック: LP→Affiliate CTR
現在: 24.0%
必要: 38.2%
改善幅: +59.2%
判定: IMPROVE
```

### 16.5 Stop/Scale Board
- SCALE
- KEEP
- IMPROVE
- TEST
- STOP
の5カラム。

---

## 17. セキュリティ

- APIキーをフロントへ出さない。
- `.env` はGit管理しない。
- Google OAuth refresh tokenを暗号化して保存する。
- 本番ではSecret Managerを利用する。
- LP Trackerは公開エンドポイントのためレート制限を入れる。
- Tracker payloadを信用せず、可能な限りGoogle Ads実績と照合する。
- 管理画面は認証必須。

---

## 18. 定期ジョブ

### 毎日
- Google Ads実績同期
- 検索語句同期
- 日次意思決定再計算

### 週次
- KWクラスタ評価
- OPPORTUNITY抽出
- 除外KW候補生成
- SCALE/STOPレビュー

### 必要時
- Keyword Planning更新
- Forecast更新

---

## 19. v0.1 開発順序

### Sprint 1: Core Logic
- Preflight calculator
- Runtime calculator
- Decision engine
- Unit tests

### Sprint 2: DB + Offer CRUD
- PostgreSQL
- Offer master
- Rule settings

### Sprint 3: LP Tracking
- affiliate-click endpoint
- JS snippet
- Funnel metrics

### Sprint 4: Google Ads Read Integration
- OAuth
- campaign/keyword stats
- search term stats
- conversion action segmentation

### Sprint 5: Keyword Planning
- GenerateKeywordIdeas
- Historical metrics
- Forecast metrics
- caching

### Sprint 6: OpenAI
- seed generation
- keyword classification
- structured JSON
- improvement explanation

### Sprint 7: Dashboard
- offer list
- keyword explorer
- runtime diagnosis
- stop/scale board

### Sprint 8: Approval import
- CSV upload
- expected revenue → actual approved revenue

---

## 20. v0.1 受入基準

1. 8,500円 / CVR8% / LP CTR50% / ROAS150%を入れるとTarget CPC約226.67円を返す。
2. 必要LP CTRが100%を超えるKWはNO-GO扱いできる。
3. LP affiliate clickを記録できる。
4. Google AdsのKW別cost/click/conversionを保存できる設計である。
5. SLVRbullet連携CVを特定のGoogle conversion actionとして集計できる設計である。
6. 実績からLP CTR・Affiliate CVR・ROASを算出できる。
7. 最大テスト予算を超え、CV0の場合STOPを返せる。
8. 黒字かつCV数十分ならSCALE候補を返せる。
9. AI障害時でも数式・撤退判定は動作する。
10. OpenAIの出力はJSON Schemaで検証する。

---

## 21. 今後の拡張

### v0.2
- Claude provider
- Embeddingsクラスタリング
- ASP承認CSVの汎用マッピング
- A/B LP variant管理
- デバイス別診断
- 地域別診断

### v0.3
- Google広告変更提案
- 除外KWワンクリック反映
- CPC/予算変更ワンクリック反映
- 実績学習によるAI estimated LP CTR補正

### v1.0
- 複数ASP / 複数媒体
- 自動予算配分
- ベイズ推定による小標本判断
- 案件横断の「勝ちパターン」学習

---

## 22. 重要な実装判断

### 22.1 Googleへの成果アップロード
v0.1ではSLVRbulletに任せる。

もし将来SLVRbulletを使わず自前でGoogleへオフライン成果を送る場合、2026年6月15日以降の新規実装ではGoogleの最新仕様を再確認し、Data Manager APIを第一候補とする。Google Ads APIの従来のUploadClickConversionには新規利用条件の変更があるため、古い実装記事をそのまま採用しない。

### 22.2 AIは意思決定の根拠ではなく補助
最終的なSCALE/STOPは数値ルールが主。
AIの理由文だけで自動停止しない。

### 22.3 検索数0〜10を捨てない
ロングテールはクラスター単位で市場性を見る。

### 22.4 発生CVと承認売上を混同しない
Google最適化用CVと経営判断用利益を分離する。

---

## 23. 公式仕様確認先

- SLVRbullet Portal: Google API連携
- Google Ads API: Keyword Planning / Historical Metrics / Forecast Metrics
- Google Ads API: Search Term View / Conversion Reporting
- Google Ads API: OAuth / Developer Token
- OpenAI API: Structured Outputs / Embeddings / Responses API
- Anthropic API: Messages / Prompt Caching / Structured Outputs

