/*
 * 比較記事型LP の config サンプル
 * ------------------------------------------------------------------
 * コピーして scripts/hikaku-configs/<slug>.config.mjs を作り、値を書き換える。
 *   npm run new-hikaku -- scripts/hikaku-configs/<slug>.config.mjs
 *
 * ここでは「金買取／まねきや × おたからや」を例にしている。
 * 実データの完全版は public/manekiya-otakaraya/index.html を見ること
 * （companies は本番では比較する全社ぶん書く。ここでは3社に縮めてある）。
 *
 * ● 文字列は基本的に HTML として埋め込まれる → <strong class="em-mark"> 等が使える
 * ● 強調の使い分け： em-mark=結論／em-green=得・無料／em-red=注意・条件
 * ● 「最も高い」「日本一」は書かない（景表法）。書くのは「確認できること」だけ
 */
export default {
  /* ---------------- 基本 ---------------- */
  slug: "sample-hikaku",
  title: "おたからやとまねきや、結局どっちがいい？金買取を公表情報で徹底比較",
  desc: "金買取の主要9社を公表情報で比較し、最終手取りで選ぶ基準を整理しました。エリア内ならまねきや、それ以外ならおたからや。理由と確認項目まで解説します。",
  item: "金",                            // 商材名。本文の {{ITEM}} に入る
  h1: "金買取、結局どこがいいの？",
  landingIntent: "sample_hikaku",         // 計測用の識別子。既存と重複させない
  researchDate: "2026年7月24日",
  // overwrite: true,                     // 既存ページを作り直すとき

  /* ---------------- 画像（public/<slug>/images/ に置く） ---------------- */
  hero: { src: "images/fv-gold-buyback-v2.webp", alt: "金買取、結局どこがいいの？", width: 1823, height: 863 },
  trend: { src: "images/gold-price-decision.webp", alt: "金1グラムの店頭価格が6年で約4.9倍となり歴史的な高値圏にあることを示す図" },
  map: "images/japan-map.webp",
  flow: { src: "images/flow.webp", alt: "申込から現金化までの流れ" },
  media: {
    img: "images/media-check.webp",
    alt: "第三者メディアによる買取額の比較検証",
    body: "出張買取専門メディアが、同じ品を複数社に出して<strong>相場と並べて</strong>検証しています。",
    source: '<a href="https://example.com/" target="_blank" rel="noopener noreferrer">◯◯（2026年7月確認）</a>',
  },

  /* ---------------- 主推薦社（成果が出る側） ---------------- */
  primary: {
    name: "まねきや",
    key: "manekiya",                      // 計測パラメータ affiliate_key
    url: "https://ad-fam.com/ad/p/r?_site=49248&_article=16522",
    label: "手取り重視なら",               // FV2枚バナーのラベル（順位ではなく役割で書く）
    banner: { src: "images/banner-manekiya.webp", alt: "金・貴金属を売るなら、高価買取専門店まねきやへ" },
    logo: "images/logos/logo-manekiya.svg",
    photo: "images/shop-ginza.webp",
    cap: "株式会社水野／本日の相場を公開",
    hours: "受付 9:00〜21:00／通話無料",
    phoneBadge: "電話での査定予約なら最大30%UP",
    shopUrl: "https://manekiya.shop/shop",
    why: 'スタートが<strong>一般価格じゃなく業者向けの取引価格</strong>。他店なら引かれて終わる<strong>石やデザインの価値も見る</strong>。そのうえ電話申込なら<strong class="em-green">最大30%UP</strong>。',
    strengths: [
      "金の重さだけで終わらせず、石・デザイン・ブランドの価値も確認する方針を公式に示しています。",
      "当日の買取レートと査定根拠を公開しているため、「なんでこの金額？」を数字で聞けます。",
      "公式サイトに当日レートとシミュレーターがあり、行く前に目安が分かります。",
    ],
    categories: ["金・プラチナのアクセサリー", "地金・インゴット・金貨", "刻印のない品・壊れた品"],
    certs: ["古物商許可", "第三者認証（公式サイト記載）"],
    weaknesses: [
      "店舗が全国にあるわけではなく、エリア外だと店頭・出張が使いにくい",
      "最大30%UPは電話申込限定で、地金・金貨・インゴット・金券は対象外",
      "手数料の扱いは「今だけ無料」表示のため、申込時に条件を確認する必要がある",
    ],
    sources: '<a href="https://manekiya.shop/rate" target="_blank" rel="noopener noreferrer">公式レート</a>',
    campaign: {
      type: "monthly",                    // monthly=当月1日〜末日 / weekly=次の日曜まで
      title: "最大30%UPは、電話申込限定です",
      body: "電話で査定予約をした場合に限り、買取金額が最大30%上乗せされる案内が出ています。WEB申込では適用されません。",
      img: "images/info_img2.webp",
      alt: "まねきや 電話申込限定 買取金額最大30%UP（地金・金貨・インゴット・金券は対象外）",
      note: "※ 地金・金貨・インゴット・金券は対象外です。上乗せ率の上限・適用条件があります。",
      short: "最大30%UP",                 // 固定CTAの小さい文字
    },
  },

  /* ---------------- 副推薦社（非成果。主推薦が使えない人の受け皿） ---------------- */
  secondary: {
    name: "おたからや",
    key: "otakaraya",
    host: "otakaraya.jp",                 // ★必須。CV計測で成果/非成果を分ける判定に使う
    url: "https://www.otakaraya.jp/",
    label: "近くで査定なら",
    banner: { src: "images/banner-otakaraya.webp", alt: "おたからや。切れ・変形・変色したお品物もお任せください" },
    logo: "images/logos/logo-otakaraya.png",
    cap: "株式会社いーふらん／世界1,920店舗以上",
    why: '世界約<strong>1,920店舗以上</strong>。<strong class="em-green">出張は全国対応・費用ゼロ</strong>で、自宅に来てもらってその場で現金。<strong class="em-red">返送料や紛失リスクを負う必要がありません。</strong>',
    strengths: [
      "全国に店舗網があり、近い場所から相談を始められます。",
      "査定料・出張料・見積もり費用は無料と案内されています。",
      "キャンペーンは対象品・上限の条件まで確認してから使います。",
    ],
    cautions: [
      "キャンペーンの適用条件・上限は品目ごとに異なる",
      "店舗はFCを含むため、対応は店舗ごとに差が出ることがある",
    ],
    sources: '<a href="https://www.otakaraya.jp/event/" target="_blank" rel="noopener noreferrer">おたからや公式</a>／<a href="https://www.otakaraya.jp/faq/" target="_blank" rel="noopener noreferrer">公式FAQ</a>（2026年7月確認）',
  },

  /* ---------------- 査定額の仕組み ---------------- */
  unitLabel: "1g単価",
  formula: ["当日の買取単価 × 品位 × 正味重量", "石・デザイン・ブランドの評価", "手数料"],
  diffFactors: "買取単価・品位と重量の判定・石やデザインの評価・手数料",
  checks: [
    "今日の<strong>1g単価</strong>と、どの品位で計算したか",
    "<strong>重量</strong>と、石の重さを差し引いたか",
    "<strong>石・デザイン・ブランド</strong>に、いくら価値を付けたか",
  ],
  whySources: '<a href="https://manekiya.shop/gold/af2" target="_blank" rel="noopener noreferrer">まねきや公式（業者用取引価格）</a>／<a href="https://www.otakaraya.jp/gold/d-gold/" target="_blank" rel="noopener noreferrer">おたからや公式（蛍光X線分析）</a>',
  punches: [
    "当日の基準価格 × 品位 × 重量<br>＋ 石・デザインの評価 − 手数料<br>＝ あなたの手取り",
    "相場を知っていれば、<br>買い叩かれようがない。",
  ],

  /* ---------------- 比較表 ----------------
     cmpHead の2列目以降と、各社 cells の数を必ず一致させる。
     各セルに公式ソースへの <a class="cmp9-ref"> を1本入れるのが原則（検証可能性）。 */
  cmpHead: ["店名", "得意分野", "運営基盤・店舗網", "対応できる金", "手数料の扱い", "宅配で断る場合", "受付・現金化の目安", "金を売るなら"],
  companies: [
    {
      name: "まねきや",
      url: "https://ad-fam.com/ad/p/r?_site=49248&_article=16522",
      candidate: true,                    // 推薦社。行が強調され、リンクが成果計測に乗る
      logoText: "まねきや",
      cells: [
        "<strong>金・貴金属</strong>",
        '<strong>株式会社水野／創業2008年</strong><br>2025年売上<strong>50.07億円</strong>／全国<strong>28店舗</strong><small>開店予定を除く公式店舗一覧を数え上げ</small><a class="cmp9-ref" href="https://manekiya.shop/company" target="_blank" rel="noopener noreferrer">会社情報を見る</a>',
        "<strong>K24〜K5</strong><br>詳細不明の品も無料相談",
        '<strong>手数料「今だけ無料」表示</strong><br>分析料は店頭で確認<a class="cmp9-ref" href="https://manekiya.shop/rate" target="_blank" rel="noopener noreferrer">公式レートを見る</a>',
        '<strong>査定後の返送は店側負担</strong><small>宅配は原則無料。品物内容により条件あり</small><a class="cmp9-ref" href="https://manekiya.shop/faq" target="_blank" rel="noopener noreferrer">宅配条件を見る</a>',
        "<strong>電話 9:00〜21:00／LINE 24時間</strong><br>店頭は即日支払いを案内",
        '<b>◎ 最初の査定先</b>レート・査定根拠・電話予約特典を一度に確認できる。<span class="cmp9-strong">まずここで特典後の総額を取る。</span>',
      ],
    },
    {
      name: "おたからや",
      url: "https://www.otakaraya.jp/",
      logoText: "おたからや",
      cells: [
        "<strong>総合買取</strong>",
        '<strong>株式会社いーふらん／設立2000年</strong><br>従業員<strong>1,863名</strong>／世界<strong>1,900店舗以上</strong><small>店舗数は待機店舗を含む公式表記</small><a class="cmp9-ref" href="https://www.otakaraya.jp/first/" target="_blank" rel="noopener noreferrer">会社情報を見る</a>',
        "<strong>金・プラチナ全般</strong><br>切れ・変形・変色品も対応",
        "<strong>査定料・出張料は無料と案内</strong>",
        '<strong>店頭・出張での無料キャンセルを案内</strong><small>主な査定方法は店頭・出張・LINE</small><a class="cmp9-ref" href="https://www.otakaraya.jp/visiting/" target="_blank" rel="noopener noreferrer">出張条件を見る</a>',
        "<strong>電話 9:00〜19:00</strong><br>出張は納得すれば<strong>その場で現金</strong>",
        "<b>○ 近くで受けたいとき</b>店舗網と全国出張で、宅配に頼らず現物を見せられる。",
      ],
    },
    {
      name: "なんぼや",
      url: "https://nanboya.com/",
      logoText: "なんぼや",
      cells: [
        "<strong>ブランド・時計</strong>",
        '<strong>バリュエンスHDグループ</strong><br>東証グロース上場／連結売上<strong>848億円</strong><small>買取店舗188店・14カ国展開</small><a class="cmp9-ref" href="https://www.valuence.inc/" target="_blank" rel="noopener noreferrer">会社情報を見る</a>',
        "<strong>金・プラチナ</strong><br>ブランド品と併せた相談向き",
        "<strong>手数料無料の案内</strong>",
        '<strong>査定額に非承諾なら返送料は店側負担</strong><small>宅配マイページで結果確認</small><a class="cmp9-ref" href="https://nanboya.com/takuhai-kaitori/" target="_blank" rel="noopener noreferrer">宅配条件を見る</a>',
        "<strong>電話 10:00〜21:00</strong><br>宅配は最短当日査定・振込の案内",
        "<b>△ 金単体なら他社と比較</b>ブランド品・時計を一緒に出すなら候補。",
      ],
    },
  ],

  /* ---------------- 2社の会社比較表 ---------------- */
  companyRows: [
    ["運営会社", "株式会社水野", "株式会社いーふらん"],
    ["設立", "2009年7月<br>（創業2008年9月）", "2000年3月"],
    ["資本金", "1億975万円", "4億8,000万円"],
    ["従業員数", "160名", "1,863名"],
    ["売上高", "50億700万円<br>（2025年6月期）", "989億円<br>（26期）"],
    ["本社", "東京・大阪", "横浜みなとみらい"],
    ["店舗網", "関東・東海・関西・中国・四国・九州", "世界約1,920店舗以上"],
  ],

  /* ---------------- エリア・店舗 ---------------- */
  areas: ["東京", "神奈川", "千葉", "埼玉", "茨城", "栃木", "愛知", "静岡", "京都", "大阪", "兵庫", "岡山", "広島", "香川", "福岡", "熊本"],
  shops: [
    { img: "images/shop-ginza.webp", name: "銀座本店", pref: "東京" },
    { img: "images/shop-yokohama.webp", name: "横浜本店", pref: "神奈川" },
    { img: "images/shop-nagoya.webp", name: "名古屋栄本店", pref: "愛知" },
    { img: "images/shop-shinsaibashi.webp", name: "心斎橋本店", pref: "大阪" },
  ],

  /* ---------------- 口コミ（bad を必ず1本混ぜる） ---------------- */
  reviews: [
    { text: "他店で断られた壊れたネックレスも、重さと純度を測って金額を出してもらえました。", name: "40代・女性" },
    { text: "電話予約の特典があると聞いて行きました。明細を見せてもらえたので納得できました。", name: "50代・男性" },
    { text: "店舗が近くになく、宅配を使うか迷いました。エリア内なら店頭が早いと思います。", name: "30代・女性", bad: true },
  ],

  /* ---------------- 損しないコツ（5本） ---------------- */
  tips: [
    { title: "その場で即決しない", body: "金額を聞いてから決めていい。急かす店は、それ自体が判断材料です。" },
    { title: "「重さ」と「純度」を必ず確認する", body: "この2つが分からないと、提示額が妥当かを検算できません。" },
    { title: "可能なら2社に出す", body: "1社の言い値と比べる相手がいるだけで、交渉の土台ができます。" },
    { title: "付属品は、すべて揃えてから出す", body: "箱・保証書・替えのパーツは評価に反映されることがあります。" },
    { title: "金とブランド品は、まとめて出す", body: "両方を扱う店なら、1回の査定で総額を出せます。" },
  ],

  /* ---------------- 悪徳業者の危険信号 ---------------- */
  badSigns: [
    "重さも純度も見せずに、いきなり総額だけ言う",
    "「今日決めてくれたら」と時間で急かす",
    "手数料の内訳を聞いても答えない",
    "身分証の確認をしない（古物営業法違反）",
    "帰ろうとすると態度が変わる",
  ],

  /* ---------------- 申込から現金化までの流れ ---------------- */
  steps: [
    { title: "電話またはWEBで申し込む", body: "品物のジャンルと点数を伝えるだけ。金額は査定後に出ます。" },
    { title: "査定を受ける（店頭・出張・宅配）", body: "重さと純度を測り、明細を出してもらいます。" },
    { title: "金額を聞いて、決める", body: "納得できなければ断ってOK。査定＝売る約束ではありません。" },
    { title: "支払いを受ける", body: "店頭・出張はその場で現金の案内。宅配は振込です。" },
  ],

  /* ---------------- FAQ（10問以上推奨。head の schema にも同内容が入る） ---------------- */
  faq: [
    { q: "査定を頼んだら、売らないといけませんか。", a: "いいえ。店頭・出張の査定は売却の約束ではありません。金額を聞いてから決められます。" },
    { q: "壊れたネックレスや、片方だけのピアスでも売れますか。", a: "はい。金は素材そのものに価値があるため、変形・切れ・片方だけでも重さと純度で査定されます。" },
    { q: "「K18」とは何ですか。", a: "金の純度を表す記号です。K24が純金に近く、K18は金が75%含まれることを示します。" },
    { q: "刻印が見当たりませんが、大丈夫ですか。", a: "はい。X線分析機で純度を測定できる店なら、刻印がなくても数値で確認できます。" },
    { q: "金メッキでも売れますか。", a: "メッキは表面に薄く金を塗ったもので、素材としての価値はごく僅かです。査定額が付かない場合があります。" },
    { q: "手数料はかかりますか。", a: "店頭・出張の査定料や出張料は無料と案内されています。表面の単価ではなく手数料込みの最終手取りで比べてください。" },
    { q: "身分証は必要ですか。", a: "必要です。古物営業法により本人確認が義務付けられています。" },
    { q: "遺品でも売れますか。名義が違いますが。", a: "相続した品物は相続した方の所有物として扱われます。ご本人以外の持ち物の売却は対応できません。" },
    { q: "未成年でも売れますか。", a: "18歳未満の方は、保護者の同伴または同意書が必要です。" },
    { q: "家族や近所に知られたくないのですが。", a: "出張買取は社名ロゴの入っていない車両で訪問する案内があります。申込時に相談してください。" },
  ],

  /* ---------------- まとめ表（「他社」の行を必ず1つ入れる） ---------------- */
  summary: [
    ["店頭・出張でまねきやを利用しやすい", "まねきや", "業者向け価格の案内、石・デザインの評価、電話特典を一度に確認できる"],
    ["近くで査定を受けたい・もう一社見たい", "おたからや", "世界1,920店舗以上。全国出張が無料で、その場で現金"],
    ["買い叩かれるのが不安", "まねきや", "相場公開＋X線測定で、根拠を検算できる"],
    ["夜しか時間が取れない", "まねきや", "電話受付は21時まで。利用前に店舗の営業時間を確認"],
    ["家具・家電も処分したい", "他社", "両社とも家具・家電は対象外"],
  ],

  /* ---------------- 相場計算機（貴金属系のみ。不要なら calc: false） ---------------- */
  calc: {
    baseLabel: "純金(K24)",
    baseKey: "k24",                       // /rates.json のキー
    karats: [
      ["k18", "K18（750）", true],
      ["k24", "K24（純金・999）"],
      ["k22", "K22（916）"],
      ["k14", "K14（585）"],
      ["k10", "K10（417）"],
      ["pt1000", "Pt1000（プラチナ）"],
    ],
  },

  /* ---------------- 税金セクション（不要なら tax: false、独自文なら文字列でHTML） ---------------- */
  tax: `    <h2>金を売ったときの税金｜地金とアクセサリーで扱いが異なります</h2>
    <p>生活用動産（日常的に身につけるアクセサリー類）の売却は原則非課税です。ただし地金・インゴットなど資産性のある品は譲渡所得の対象になります。</p>
    <h3>5年を超えて持っていた物は、さらに有利</h3>
    <p>保有期間が5年を超える場合は長期譲渡所得となり、課税対象になる金額が半分になります。</p>
    <p class="kin-note">※ 一般的な説明です。個別の判断は税務署または税理士にご確認ください。金地金を1回200万円超で売却した場合、買取業者が税務署へ支払調書を提出する制度があります。</p>`,
};
