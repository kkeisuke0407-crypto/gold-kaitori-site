# v0.1 MVP からの変更点と、その理由

`docs/SPEC.md` は元の要件定義（v0.1）をそのまま残してある。
この文書は、実装にあたって **v0.1 から意図的に変えた点** と **その判断根拠** の記録。

---

## 1. 判定ロジック（いちばん重要な変更）

### 1.1 SCALE に統計的な下限条件を足した

**変更前**：`conversions >= 3` かつ `actual_roas >= target × 1.2` なら SCALE。

**問題**：CV3件でROAS 2.0でも、真のCVRが目標を下回る確率は十分にある。
点推定だけで増額すると、運が良かっただけの案件に予算を突っ込むことになる。
PPCアフィリで最も資金を溶かすのがこのパターン。

**変更後**：成果発生率のベイズ信用区間（Beta事後分布, 既定80%区間）の**下限**でも
目標ROASを超えることを SCALE の必須条件にした。
下限が届かない場合は `KEEP` にして「予算据え置きでCVを積む」を出す。

```
下限ROAS = CVR下限 × 成果単価 × 承認率 × アフィクリック数 ÷ 費用
```

増額幅も余裕率に連動させた（下限/目標が1.3以上なら+30%、1.1以上なら+20%、それ未満は+10%）。

実装: `backend/app/domain/stats.py`, `decision_engine.py`

### 1.2 CV0の撤退を統計的に判定できるようにした

**変更前**：`stop_after_zero_cv_clicks` を超えたら STOP、という固定しきい値のみ。

**問題**：必要CVRが1%の案件と8%の案件で、同じ「200クリックでCV0」の意味はまるで違う。
前者は何も分かっていないが、後者はほぼ黒判定できる。固定値では両方を誤る。

**変更後**：成果単価を渡すと、損益分岐に必要なアフィCVR `p` を逆算し、
「`p` が真ならこの連続ゼロが起きる確率 `(1-p)^n`」を計算する。
これが有意水準（既定5%）を下回ったときだけ統計的STOPを出す。
逆に、サンプルが小さいうちは **STOPしない**（`ZERO_CV_NOT_YET_CONCLUSIVE`）。
「撤退確定まであと何クリック必要か」も返す。

固定しきい値も残してあるので、v0.1の挙動は失われていない。

### 1.3 IMPROVE / STOP の分岐を「最小改善経路」に委ねた

**変更前**：`roas_gap <= 1.5` なら IMPROVE、それ以上なら STOP という単一のしきい値。

**変更後**：SPEC 13章の「最小改善経路」を実装した（v0.1では未実装だった）。
CPC・LP→アフィCTR・アフィCVR・広告CTR の各レバーについて
損益分岐までに必要な値と改善幅を出し、レバーごとの動かしやすさ（許容幅）から
実現性スコア0〜100を算出。単独経路に加えて「複数レバーを同時に少しずつ動かす」経路も評価し、
最も現実的な経路のスコアで IMPROVE / STOP を分ける。

- CTR/CVRが100%を超える要求になる経路は実現性0
- 市場の下限入札を割り込むCPC要求も実現性ほぼ0
- アフィCVRは広告主側の指標なので「自分では動かせない」と明示する
- データ量が少ないうちはスコアを割り引く（早すぎる断定を避ける）

実装: `backend/app/domain/improvement.py`

### 1.4 ボトルネックを1つの文字列からランキングに変えた

**変更前**：`"LP_TO_AFFILIATE_CTR"` のような文字列を1つ返すだけ。

**変更後**：SPEC 11章のパターンA〜Eを全て実装し、
各レバーを目安値まで直したときに **ROASギャップの何割を埋められるか** で
順位づけしたリストを返す。パターンE（発生ROASは良いが承認後が悪い）も判定できる。

実装: `backend/app/domain/bottleneck.py`

### 1.5 広告主CVRの確信度を実際に使うようにした

DBには `advertiser_cvr_confidence` があったが、計算では未使用だった。

**変更後**：確信度に応じて広告主CVRの振れ幅を作り、
基準／弱気／強気の3シナリオで採算を出す。**GO判定は弱気シナリオ基準**にした。
確信度1.0（実績値）なら3シナリオは一致するので、v0.1の判定と完全に同じ結果になる。

### 1.6 KWのバケット判定をAIからコードへ移した

**変更前**：CORE / OPPORTUNITY / DISCOVERY / EXCLUDE をAIに出力させていた。

**問題**：SPEC 22.2「AIは意思決定の根拠ではなく補助」に反する。
同じKWでも実行のたびに判定が変わりうるし、採算の数式と結びついていない。

**変更後**：バケットは `keyword_scoring.py` が数式で決める。
AIが出すのは意図・商用度・成約距離・ノイズリスク・想定LP CTR・クラスタ名という**入力**だけ。
さらにクラスタ単位の集計を追加した（SPEC 22.3「検索数0〜10を捨てない」への対応）。

---

## 2. 実装アーキテクチャ

### 2.1 CSV取り込みを一次経路にした（新規）

**理由**：Google Ads API は Developer Token の審査が必要で、申請から利用開始まで時間がかかる。
一方、管理画面からのレポートCSVエクスポートは**今日から使える**。
実績データさえ入れば意思決定エンジンは動くので、CSVを一次経路、APIを高速化手段と位置づけた。

キーワードレポート / 検索語句レポート / ASP承認結果CSV に対応。
Google Ads CSV特有の癖（プリアンブル行、UTF-16/BOM/Shift_JIS混在、`--` 欠損値、
桁区切り、末尾の合計行、日英の列名ゆれ）を吸収する。

実装: `backend/app/integrations/csv_import.py`

### 2.2 既定DBをPostgreSQLからSQLiteへ

**理由**：v0.1はイベントをメモリ配列に積むだけで、再起動すると消えていた。
かといってPostgreSQL必須にするとDocker前提になり、起動の敷居が上がる。

**変更後**：標準ライブラリの `sqlite3` だけでリポジトリ層を実装し、外部依存ゼロで永続化。
PostgreSQL用スキーマ（`docs/schema.postgres.sql`）は列構成を揃えて残してあるので、
規模が大きくなったら差し替えられる。

### 2.3 Claude プロバイダを実装（v0.1はスタブ）

`AnthropicProvider` を実装し、既定プロバイダにした（`AI_PROVIDER` で切替可）。

- Structured Outputs（`output_config.format`）でJSON Schema準拠を強制
- システムプロンプトに `cache_control` を付けてプロンプトキャッシュを効かせる
- `stop_reason == "refusal"` を content 参照前にチェック
- 例外を `AIProviderError` に正規化し、APIは503を返す（数式側の機能は生きたまま）

OpenAI側も、ユーザーメッセージに `str(dict)` を渡していた箇所を明示的なプロンプト整形に直した。

### 2.4 セキュリティ（SPEC 17章の実装）

v0.1は CORS が `*` 固定・認証なし・レート制限なしだった。

- 管理APIに `X-API-Key` 認証（`ADMIN_API_KEY`）。未設定の開発環境では素通しするが起動時に警告
- 公開エンドポイント（LPトラッカー）にプロセス内レート制限
- CORSは環境変数で許可オリジンを指定。**本番で未設定なら閉じる**（設定漏れで全開放にしない）
- トラッカーのペイロードは全フィールドに長さ上限。IPは生値を保存せずハッシュのみ

---

## 3. 追加した画面（SPEC 16章の実装）

v0.1のフロントは Preflight フォーム1枚だけだった。
6画面（ダッシュボード / 案件 / 出稿前判定 / KWエクスプローラ / 運用診断 / 計測セットアップ）を実装した。

**大きな判断：管理画面をブラウザ完結にした。**

判定ロジックを JavaScript にも移植し（`public/tools/ppc/engine.js`）、
サーバもDockerも無しで全機能が使えるようにした。データはlocalStorageに入る。
バックエンドURLを設定すると、追加でAI分類とサーバ保存が使える。

**数式が二重実装になるリスクへの対策**：
`docs/golden-cases.json` を単一の正解表とし、Python版とJS版の両方がこれを検証する。

| 実装 | テスト |
|---|---|
| Python | `backend/tests/test_golden.py` |
| JavaScript | `tests-js/run.mjs` |

どちらかの数式がズレたらテストが落ちる。

---

## 4. v0.1 受入基準（SPEC 20章）の充足状況

| # | 基準 | 状態 | 検証箇所 |
|---|---|---|---|
| 1 | 8,500円/CVR8%/LP CTR50%/ROAS150% → Target CPC 約226.67円 | ✅ | `test_economics.py::test_spec_acceptance_case_1` |
| 2 | 必要LP CTR>100%のKWをNO-GO扱いできる | ✅ | `test_economics.py::test_spec_acceptance_case_2...` |
| 3 | LP affiliate click を記録できる | ✅ | `test_store.py::test_record_and_count` |
| 4 | Google AdsのKW別 cost/click/conversion を保存できる | ✅ | `test_store.py::AdStatsTests` |
| 5 | SLVRbullet連携CVを特定のconversion actionとして集計できる設計 | ✅ | `google_ads.py::CONVERSION_ACTION_QUERY` |
| 6 | 実績からLP CTR・アフィCVR・ROASを算出できる | ✅ | `test_decision_engine.py::MetricTests` |
| 7 | 最大テスト予算超過かつCV0でSTOPを返せる | ✅ | `test_decision_engine.py::test_stop_when_budget_exceeded...` |
| 8 | 黒字かつCV十分でSCALE候補を返せる | ✅ | `test_decision_engine.py::test_scale_when_evidence_is_strong` |
| 9 | AI障害時でも数式・撤退判定は動作する | ✅ | 判定はAIを一切importしない。`test_api.py::test_classify_without_ai_key_returns_503` |
| 10 | AIの出力はJSON Schemaで検証する | ✅ | `ai_provider.py::CLASSIFICATION_SCHEMA` + Structured Outputs |

---

## 5. 意図的に実装していないもの

SPEC 3.2「v0.1 非ゴール」を守っている。

- Google広告の入札・予算・KWの**自動変更はしない**。アダプタに変更系メソッドを一切置いていない
- SLVRbullet側設定の自動操作はしない
- ASP全社APIの統合はしない
- 成果のGoogleへのアップロードは SLVRbullet に任せる（SPEC 22.1）
- MLによる予測モデルは作らない。統計は解析的に解ける範囲（ベータ分布・二項検定）に留めた
