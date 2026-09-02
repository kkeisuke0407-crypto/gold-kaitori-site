# 型番別FV生成素材

## 共通プロンプト方針

- 生成方式：OpenAI ImageGen
- 画角：縦2:3、1024×1536
- 世界観：高級時計メディアの編集写真、暖色の木目、自然な窓光、白・ネイビー・赤のLPになじむ落ち着いたトーン
- 配置：時計を右側へ大きく置き、左上にHTML見出し用の余白を確保
- 禁止：画像内文字、ブランドロゴ、透かし、余計な小物、崩れたブレスレット
- 個別指定：型番ごとの文字盤色、ベゼル素材・配色、日付窓、GMT針、クロノグラフ、ブレスレット、年代感を反映
- 116520は初回の文字盤が明るかったため、黒文字盤と金属ベゼルを明示して再生成

## 実装パス

- `/hikakaku-watch-story/models/rolex-submariner-16610/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-datejust-16233/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-air-king-14000/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-submariner-14060/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-explorer-ii-16570/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-daytona-16520/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-daytona-116520/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-gmt-master-16700/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-daytona-116500ln/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-datejust-16234/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-datejust-16013/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-date-15200/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-submariner-116610ln/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-submariner-124060/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-gmt-master-ii-16710/hero-20260902.webp`
- `/hikakaku-watch-story/models/rolex-submariner-126610ln/hero-20260902.webp`

元のImageGen出力は `C:\Users\user\.codex\generated_images\019ff4c2-1989-7352-9faf-cdfd5e7b16b6\` に残し、実装用のみWebPへ最適化した。
