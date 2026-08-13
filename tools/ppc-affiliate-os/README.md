# PPC Affiliate OS v0.2

PPCアフィリエイトの **案件判定 / KW選定 / 運用診断 / 撤退判断** を一つにする意思決定エンジン。

「赤字だからやめる」ではなく、**損益分岐までに必要な改善幅を分解して、それが現実的かどうかで決める**。
数式・統計・撤退判定はすべてコード側にあり、AIが止まっても動く。

---

## いちばん速い使い方（サーバ不要）

管理画面はブラウザだけで完結する。判定ロジックはJSにも移植済みで、
データはそのブラウザのlocalStorageにだけ入る。

- 公開後: `https://<あなたのサイト>/tools/ppc/`
- ローカル: リポジトリ直下で `npx serve public` などを実行し `/tools/ppc/` を開く

できること:

| 画面 | 内容 |
|---|---|
| ダッシュボード | 全案件のROAS・利益と Stop/Scale ボード |
| 案件 | 成果単価・承認率・広告主CVR・撤退条件の登録 |
| 出稿前判定 | 上限CPC・必要LP CTR・CPC余裕率の逆算。弱気シナリオ込み |
| KWエクスプローラ | KW別の採算判定とCORE/OPPORTUNITY/DISCOVERY/EXCLUDE分類。CSV読込・書出 |
| 運用診断 | ボトルネックのランキング、最小改善経路、撤退の統計的根拠 |
| 計測セットアップ | LPに貼るタグ一式の生成 |

バックエンドを立てると、追加で **LPクリックの自動計測** と **AIによるKW意図分類** が使える。

---

## バックエンドを動かす

外部サービス不要。SQLiteに保存する。

```bash
cd tools/ppc-affiliate-os/backend
pip install -r requirements.txt
cp ../.env.example ../.env        # 必要なら編集
uvicorn app.main:app --reload
```

- API ドキュメント: http://localhost:8000/docs
- 管理画面: http://localhost:8000/ui/ （`public/tools/ppc/` を配信）
- ヘルスチェック: http://localhost:8000/health

Docker を使う場合:

```bash
cd tools/ppc-affiliate-os
docker compose up
```

---

## テスト

```bash
# バックエンド（91テスト / 標準ライブラリのみでも大半が動く）
cd tools/ppc-affiliate-os/backend
PYTHONPATH=. python3 -m unittest discover -s tests -v

# ブラウザ版エンジンの一致検証
node --test tools/ppc-affiliate-os/tests-js/run.mjs
```

`docs/golden-cases.json` が Python版とJS版の**共通の正解表**になっている。
どちらかの数式がズレたらテストが落ちる。

---

## 設計の要点

### 判定はコード、AIは入力の供給だけ

SCALE / STOP を最終的に決めるのは数値ルール。AIの理由文だけで停止も増額もしない（SPEC 22.2）。
AIが担当するのはシードKW生成とKW意図分類のみで、出力は JSON Schema で検証する。
AIキーが未設定でも採算計算・運用診断・撤退判定はすべて動く。

### SCALEは「運が良かっただけ」を弾く

実績ROASが目標を超えているだけではSCALEしない。
成果発生率のベイズ信用区間の**下限**でも目標を超えている場合だけ増額を提案する。
下限が届かないときは KEEP（予算据え置きでCVを積む）。

### 撤退は「必要CVRを棄却できたか」で決める

CV0が続いたとき、固定クリック数ではなく
「損益分岐に必要なCVRが真なら、この連続ゼロが起きる確率」で判断する。
サンプルが小さいうちは撤退しない。撤退確定まであと何クリック必要かも出す。

### 最小改善経路

損益分岐まで、CPC・LP CTR・アフィCVR・広告CTR をそれぞれ何%動かす必要があるかを分解し、
レバーごとの動かしやすさから実現性スコアを出す。
複数レバーを同時に少しずつ動かす経路も評価する（たいていこれが一番現実的）。

### Google Ads APIは必須ではない

Developer Token の審査を待たずに使えるよう、管理画面のCSVエクスポート取り込みを一次経路にした。
API連携は同期を速くするための手段。**変更系APIは一切持たない**（入札・予算の自動変更はしない）。

---

## LPへ設置するもの

2つ必要。役割が違うので両方入れる。

```html
<!-- 1. SLVRbullet: クリックIDを成果まで引き継ぐ -->
<script src="https://js.slvrbullet.com/pt.min.js"></script>

<!-- 2. 自前計測: LP→アフィクリックの歩留まりを数える -->
<script>
  window.PPC_OS_CONFIG = {
    endpoint: 'https://your-tool.example/api/v1/tracking/affiliate-click',
    offerId: '<案件ID>'
  };
</script>
<script src="/tools/ppc/tracker.js" defer></script>
```

計測したいアフィリエイトリンクに目印を付ける:

```html
<a href="..." data-ppc-affiliate-cta="fv_hero">無料査定へ</a>
```

管理画面の「計測セットアップ」で案件IDを差し込んだタグを生成できる。

---

## ディレクトリ

```
tools/ppc-affiliate-os/
├── docs/
│   ├── SPEC.md              要件定義（v0.1原文）
│   ├── CHANGELOG-v0.2.md    v0.1からの変更点と判断根拠
│   ├── golden-cases.json    Python/JS共通の正解表
│   └── schema.postgres.sql  PostgreSQL版スキーマ
├── backend/
│   ├── app/
│   │   ├── domain/          数式・統計・判定（外部依存ゼロ）
│   │   │   ├── stats.py            ベータ分布 / 信用区間 / ゼロ事象検定
│   │   │   ├── economics.py        採算計算（SPEC 8章）
│   │   │   ├── bottleneck.py       ボトルネック診断（SPEC 11章）
│   │   │   ├── improvement.py      最小改善経路（SPEC 13章）
│   │   │   ├── keyword_scoring.py  KW採算判定（SPEC 9章）
│   │   │   └── decision_engine.py  SCALE/KEEP/IMPROVE/TEST/STOP
│   │   ├── db/              SQLiteリポジトリ
│   │   ├── api/             FastAPI ルート・スキーマ・認証
│   │   └── integrations/    AI / Google Ads / CSV / SLVRbullet
│   └── tests/
└── tests-js/run.mjs         ブラウザ版エンジンの一致検証

public/tools/ppc/            管理画面（ビルド不要・依存ゼロ）
├── index.html
├── engine.js                判定ロジック（domain/ の移植）
├── app.js
├── styles.css
└── tracker.js               LPに貼る計測タグ
```

---

## 次にやると効くこと

1. **Google Ads Developer Token の申請**（承認まで日数がかかるので早めに）
2. 承認結果CSVの定期取り込み（承認率が期待値から実績値に切り替わり、判定精度が上がる）
3. KeywordPlanIdeaService 連携（現在はシードKW生成とCSV取り込みまで）
4. 日次バッチ（`/api/v1/offers/{id}/diagnosis` を毎日叩いて decisions に履歴を残す）
