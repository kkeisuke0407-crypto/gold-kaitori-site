# ヒカカク時計 MODEL_VALUE派生LP：調査材料

- 基準LP: https://kaitori.hakobu-family.com/hikakaku-watch/story/
- 確認日: 2026-09-01
- 検索意図: モデル名 + 買取価格 / 買取相場。一般相場ではなく「自分の時計でいくらになるか」を知りたい層
- 実装先: `C:\Users\user\Documents\gold-kaitori-site`
- 出稿先URL・計測URL: 現行 `story/` のSLVRbullet計測URLを継承
- ASP条件・CR承認: [公式確認]（今回の作業では再確認していない）

## 基準LPで固定する部分

| 固定要素 | 理由 |
|---|---|
| PR表示、白・ネイビー・赤の配色、縦1列のストーリー構成 | 現行LPの認知・読了リズムを維持するため |
| 「相場を知る → 自分の時計で査定 → 複数社比較 → 業者も確認 → 売却判断」の導線 | MODEL_VALUE検索を査定行動へ接続する中核 |
| 冒頭・中盤・終盤のCTA位置 | 比較の理由を理解した時点で遷移できるようにするため |
| 一括査定の説明、最大20社の注意、事前査定は確定額ではない説明 | サービス理解と誤認防止のため |
| FAQ、モデルストーリー表示、非保証表示 | 不安解消と金額表示の適正化 |
| GA4・Clarity・SLVRbulletの計測 | 現行計測を崩さないため |

## モデルごとに差し替える部分

| 差し替え要素 | 実装内容 |
|---|---|
| URL・title・description・計測intent | モデルslugから生成 |
| FVのモデル名、型番、査定差額、時計画像 | モデルデータと専用生成画像から出力 |
| 検索文脈・保有ストーリー | 各モデルを検索する人に自然な文脈へ変更 |
| 査定時に確認されやすい4要素 | 型番・文字盤・ベゼル・ブレス・付属品などモデル別に変更 |
| 入力画面画像 | モデル名・型番・状態を画像内に文字入りで生成 |
| A〜D社のモデルケース、現物確認後の額、差額 | 公開査定例の範囲を参考にモデル別データ化 |
| 参考URL・確認日 | モデル別のヒカカク！公開査定実績へリンク |
| CTA文言 | 「自分のサブマリーナ」などモデル名入りに変更 |

## 公開査定例の確認結果

| モデル | 代表型番 | 確認した公開例 | LPのモデルケース | 出典 |
|---|---|---:|---:|---|
| サブマリーナ | 14060M | 中古品・使用感あり 1,200,000円 / 1,400,000円（2026-04-24） | 1,200,000〜1,400,000円 | https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/submariner-men/assessment_achievements/ |
| デイトジャスト | 116234 ホワイト ローマ | ヒカカク！公開査定例に加え、ブラリバの2026年8月公開参考相場（ホワイト文字盤 1,043,000円）を確認 | 960,000〜1,050,000円 | https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/datejust-mens/assessment_achievements/ ／ https://brandrevalue.com/cat/watch/rolex/rolex-datejust/116234 |
| デイトナ | 116500LN ブラック | ヒカカク！公開査定例に加え、2026年8月の黒文字盤公開参考相場（なんぼや 4,254,000円 / ブラリバ 4,380,000円）を確認。白文字盤の高値は採用しない | 4,050,000〜4,380,000円 | https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/daytona-men/assessment_achievements/ ／ https://nanboya.com/tokei-kaitori/price-list/rolex/daytona/ref-116500ln/ ／ https://brandrevalue.com/cat/watch/rolex/rolex-daytona/116500ln |
| GMTマスターII | 116710LN | ヒカカク！公開査定例に加え、なんぼやの2026年8月公開参考相場（1,757,000円）と中古買取実績（1,482,388〜1,820,000円）を確認 | 1,600,000〜1,820,000円 | https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/gmt-master-ii-men/assessment_achievements/ ／ https://nanboya.com/tokei-kaitori/price-list/rolex/gmt-master/ref-116710ln/ |
| エクスプローラーI | 214270 | 中古美品 950,000〜1,200,000円の掲載例を確認 | 950,000〜1,200,000円 | https://hikakaku.com/category/all-category/watch/high_brand_watch/rolex-men/explorer-i-men/assessment_achievements/ |

## 数値の扱い

- デイトジャスト・デイトナ・GMTマスターIIは、ヒカカク！の公開査定例に加え、2026年8月時点の同型番・文字盤を確認できる公開買取相場を併用する。LP内の「参考」表記にもすべての根拠URLを掲載する。
- 公開ページには状態・時期の違いに加え、桁違いに見える外れ値もあるため、外れ値は採用しない。特にデイトナ116500LNはブラック文字盤とホワイト文字盤を混在させない。
- LPのA〜D社は実際の一括査定結果ではなく、公開査定例の範囲を参考に再構成したモデルケース。
- 各ページのFV直下、価格表下、最終査定、フッターで「非保証」「変動要因」「モデルケース」を明示する。
- 実際の市場相場を断定せず、訪問者自身の時計で比較査定する必要性へつなげる。
