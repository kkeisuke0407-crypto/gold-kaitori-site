/* Gold appraisal LP tracking and affiliate link injection. */

const AFFILIATE_LINKS = {
  manekiya: "https://ad-fam.com/ad/p/r?_site=49248&_article=16522",
  otakaraya: "https://lp.otakaraya.jp/lp-gold-a/"
};

const MANEKIYA_CAMPAIGN_END = Date.parse("2026-05-31T23:59:59+09:00");
const FORWARDED_AD_PARAMS = new Set([
  "gclid",
  "gbraid",
  "wbraid",
  "gad_source",
  "gad_campaignid",
  "campaignid",
  "keyword",
  "matchtype",
  "device",
  "network",
  "creative"
]);

function isCampaignActive() {
  return Date.now() <= MANEKIYA_CAMPAIGN_END;
}

function shouldForwardParam(name) {
  return FORWARDED_AD_PARAMS.has(name) || name.toLowerCase().indexOf("utm_") === 0;
}

function getAffiliateLink(key) {
  const rawUrl = AFFILIATE_LINKS[key];
  if (!rawUrl || key !== "manekiya") return rawUrl || "#";

  const destination = new URL(rawUrl);
  const incoming = new URLSearchParams(window.location.search);
  incoming.forEach(function (value, name) {
    if (shouldForwardParam(name) && !destination.searchParams.has(name)) {
      destination.searchParams.set(name, value);
    }
  });
  return destination.toString();
}

// 全リンクへ着地URLのクエリパラメーターを転送（タグ発火向上）
window.addEventListener("load", function () {
  var search = window.location.search;
  if (!search) return;
  var incoming = new URLSearchParams(search);
  document.querySelectorAll("a[href]").forEach(function (a) {
    var href = a.getAttribute("href");
    if (!href) return;
    var lower = href.toLowerCase();
    if (lower.charAt(0) === "#" || lower.startsWith("javascript") || lower.startsWith("mailto") || lower.startsWith("tel")) return;
    try {
      var u = new URL(href, window.location.href);
      incoming.forEach(function (v, k) {
        if (!u.searchParams.has(k)) u.searchParams.set(k, v);
      });
      a.setAttribute("href", u.toString());
    } catch (_) {}
  });
});

// ───────────────────────────────────────────────────────────────
// PPC分析基盤：着地時の広告パラメータを捕捉し、全計測イベントに自動付与する。
//   Google Ads 最終ページURLサフィックス（/tools/ でコピー可）で
//   kw={keyword}&mt={matchtype}&cre={creative}&dev={device}&cmp={campaignid}&agp={adgroupid}
//   を付けておくと、GA4でキーワード単位のCTR/CV分析ができる。
//   gclid / utm_* も自動捕捉。セッション中はLP内回遊しても保持される。
// ───────────────────────────────────────────────────────────────
var AD_PARAM_KEYS = ["kw", "mt", "cre", "dev", "cmp", "agp", "gclid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
var adContext = {};
(function captureAdContext() {
  try {
    var stored = sessionStorage.getItem("ad_ctx");
    if (stored) adContext = JSON.parse(stored) || {};
  } catch (_) {}
  try {
    var sp = new URLSearchParams(window.location.search);
    var found = false;
    AD_PARAM_KEYS.forEach(function (k) {
      var v = sp.get(k);
      if (v) { adContext[k] = v; found = true; }
    });
    if (found) {
      adContext.landed_at = adContext.landed_at || new Date().toISOString();
      adContext.landing_page = adContext.landing_page || window.location.pathname;
      try { sessionStorage.setItem("ad_ctx", JSON.stringify(adContext)); } catch (_) {}
    }
  } catch (_) {}
})();

// GA4イベント名はそのまま、パラメータに広告文脈を必ず同梱する
function withAdContext(params) {
  var out = Object.assign({}, params || {});
  if (adContext.kw) out.ad_keyword = adContext.kw;
  else if (adContext.utm_term) out.ad_keyword = adContext.utm_term;
  if (adContext.mt) out.ad_matchtype = adContext.mt;
  if (adContext.cre) out.ad_creative = adContext.cre;
  if (adContext.dev) out.ad_device = adContext.dev;
  if (adContext.cmp) out.ad_campaign_id = adContext.cmp;
  if (adContext.agp) out.ad_adgroup_id = adContext.agp;
  if (adContext.gclid) out.has_gclid = "1";
  if (adContext.utm_campaign) out.utm_campaign = adContext.utm_campaign;
  if (adContext.utm_term) out.utm_term = adContext.utm_term;
  if (adContext.landing_page) out.entry_page = adContext.landing_page;
  return out;
}

function track(eventName, params) {
  var p = withAdContext(params);
  try {
    if (window.dataLayer) window.dataLayer.push({ event: eventName, ...(p || {}) });
    if (typeof gtag === "function") gtag("event", eventName, p || {});
  } catch (_) {}
  try { if (window.__trackDebug) window.__trackDebug(eventName, p); } catch (_) {}
}

// ───────────────────────────────────────────────────────────────
// 計測デバッグHUD：URLに ?debug_track=1 を付けると、発火イベントを画面に表示。
// 本番でタグの発火確認ができる（クリックしても遷移を止めない）。
// ───────────────────────────────────────────────────────────────
(function setupTrackDebug() {
  try {
    if (new URLSearchParams(window.location.search).get("debug_track") !== "1") return;
  } catch (_) { return; }
  var box = null;
  function ensureBox() {
    if (box || !document.body) return box;
    box = document.createElement("div");
    box.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99999;max-width:86vw;max-height:45vh;overflow:auto;background:rgba(17,24,32,.92);color:#9fe8b8;font:11px/1.5 monospace;padding:10px 12px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.4)";
    box.innerHTML = "<b style='color:#fff'>📡 track debug</b> <span style='color:#8aa'>(?debug_track=1)</span><br>ad_ctx: " + JSON.stringify(adContext) + "<hr style='border-color:#345'>";
    document.body.appendChild(box);
    return box;
  }
  window.__trackDebug = function (name, params) {
    var b = ensureBox();
    if (!b) return;
    var line = document.createElement("div");
    line.textContent = "▶ " + name + " " + JSON.stringify(params);
    b.appendChild(line);
    b.scrollTop = b.scrollHeight;
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureBox);
  } else { ensureBox(); }
})();

// 適正額チェッカーのファネル計測（共通の付帯情報を載せる）
function fireFunnel(name, extra) {
  track(name, Object.assign({
    fv_variant: document.body.getAttribute("data-fv-variant") || "",
    landing_intent: document.body.getAttribute("data-landing-intent") || "general"
  }, extra || {}));
}

// FV見出しの3パターンABテスト（A/B/C をランダム割当・localStorageで固定）
function setupFvAbTest() {
  const el = document.querySelector("[data-fv-headline]");
  if (!el) return;
  const variants = {
    A: 'この指輪、<br /><span class="rep-h1-em">いくらくらいで売れる？</span>',
    B: 'その買取金額、<br /><span class="rep-h1-em">安すぎないか心配</span>…',
    C: 'よく分からないまま売って、<br /><span class="rep-h1-em">損したくない。</span>'
  };
  const keys = ["A", "B", "C"];
  let v = null;
  try { v = localStorage.getItem("fv_variant"); } catch (_) {}
  if (!v || !variants[v]) {
    v = keys[Math.floor(Math.random() * keys.length)];
    try { localStorage.setItem("fv_variant", v); } catch (_) {}
  }
  el.innerHTML = variants[v];
  document.body.setAttribute("data-fv-variant", v);
  track("fv_variant_assigned", { fv_variant: v });
}

function wireTrackedLink(el) {
  el.addEventListener("click", function (event) {
    const affiliateKey = el.getAttribute("data-affiliate") || "";
    const destination = el.getAttribute("href") || "";

    // ファネル計測：電話クリック / まねきや送客クリック
    const trackName = el.getAttribute("data-track") || "";
    // ヒーロー画像タップは誤タップが多く、CV最適化を濁すので“送客CV”には数えない（エンゲージメント扱い）。
    const isHero = trackName === "fv_hero";
    // CVイベント名：ヒーローだけ別イベントにして、Adsのコンバージョン(gold_kaitori_affiliate_click)から除外。
    const convEvent = isHero ? "gold_kaitori_hero_click" : "gold_kaitori_affiliate_click";
    if (trackName.indexOf("phone") >= 0) {
      fireFunnel("phone_click", { track_name: trackName });
    } else if (affiliateKey === "manekiya" && !isHero) {
      fireFunnel("manekiya_click", { track_name: trackName });
    }
    const params = {
      track_name: el.getAttribute("data-track") || "",
      affiliate_key: affiliateKey,
      landing_intent: document.body.getAttribute("data-landing-intent") || "general",
      link_url: destination
    };

    if (!affiliateKey) {
      track("gold_kaitori_engagement_click", params);
      return;
    }

    track("cta_click", params);

    const isPrimaryClick = !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0;
    const isOutboundLink = el.tagName === "A" && destination && destination !== "#";

    if (isPrimaryClick && isOutboundLink) {
      event.preventDefault();
      let didNavigate = false;
      const navigate = function () {
        if (didNavigate) return;
        didNavigate = true;
        window.location.href = destination;
      };

      track(convEvent, {
        ...params,
        event_callback: navigate,
        event_timeout: 300
      });
      window.setTimeout(navigate, 300);
      return;
    }

    track(convEvent, params);
  });
}

const AI_ITEM_LABELS = {
  necklace: "金・プラチナのネックレス",
  ring: "指輪・リング",
  earring: "片方ピアス・イヤリング",
  coin: "金貨・インゴット",
  tooth: "金歯・金板・破片",
  unknown: "よく分からない貴金属"
};

const AI_MARK_LABELS = {
  k18: "K18 / 750",
  k24: "K24 / 純金",
  pt900: "Pt900 / Pt950",
  pt850: "Pt850",
  unknown: "刻印が読めない",
  plated: "GP / GF / メッキかも"
};

const AI_WEIGHT_LABELS = {
  unknown: "重さは不明",
  light: "5g未満",
  middle: "5〜20gくらい",
  heavy: "20g以上",
  many: "複数点あり"
};

const AI_CONDITION_LABELS = {
  normal: "目立つ破損はない",
  broken: "切れ・石取れ・片方だけ",
  old: "古い・変色・刻印が薄い",
  high: "高額品なので持ち歩きが不安"
};

const OCR_MARK_PATTERNS = [
  { value: "pt900", label: "Pt900 / Pt950", pattern: /\b(Pt|PT|P)\s*(900|950)\b/i },
  { value: "pt850", label: "Pt850", pattern: /\b(Pt|PT|P)\s*850\b/i },
  { value: "k24", label: "K24 / 純金", pattern: /\b(K|KT)\s*24\b|\b24\s*K\b|\b999(?:\.9)?\b|純金/i },
  { value: "k18", label: "K18 / 750", pattern: /\b(K|KT)\s*18\b|\b18\s*K\b|\b750\b/i },
  { value: "plated", label: "GP / GF / メッキかも", pattern: /\b(GP|GF|GEP|HGE|RGP)\b|メッキ/i }
];

function normalizeOcrText(text) {
  return String(text || "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (char) {
      return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
    })
    .replace(/[｜|]/g, "I")
    .replace(/[‐‑‒–—ー]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function detectMarkFromText(text) {
  const normalized = normalizeOcrText(text);
  for (const item of OCR_MARK_PATTERNS) {
    if (item.pattern.test(normalized)) {
      return { ...item, text: normalized };
    }
  }
  return { value: "", label: "", text: normalized };
}

function setOcrStatus(el, message, state) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove("is-reading", "is-found", "is-missed");
  if (state) el.classList.add(state);
}

function resizeImageForOcr(file) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = function () {
      const maxSize = 1400;
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };
    img.src = url;
  });
}

async function runMarkOcr(file, markSelect, statusEl) {
  if (!file || !window.Tesseract) {
    setOcrStatus(statusEl, "OCRを読み込めませんでした。刻印は手動で選択してください。", "is-missed");
    return;
  }

  setOcrStatus(statusEl, "刻印候補を読み取り中です。K18、750、Pt900などを探しています。", "is-reading");
  try {
    const source = await resizeImageForOcr(file);
    const result = await window.Tesseract.recognize(source, "eng", {
      logger: function () {}
    });
    const rawText = result && result.data ? result.data.text : "";
    const detected = detectMarkFromText(rawText);
    if (detected.value && markSelect) {
      markSelect.value = detected.value;
      markSelect.dispatchEvent(new Event("change", { bubbles: true }));
      setOcrStatus(statusEl, "刻印候補「" + detected.label + "」を検出しました。違う場合は手動で変更してください。", "is-found");
      track("gold_kaitori_ai_ocr_detected", { detected_mark: detected.value });
      return;
    }
    setOcrStatus(statusEl, "刻印候補は読み取れませんでした。刻印が小さい場合は、手動選択のままで問題ありません。", "is-missed");
    track("gold_kaitori_ai_ocr_missed", {});
  } catch (_) {
    setOcrStatus(statusEl, "刻印OCRに失敗しました。写真の明るさやピントを変えるか、手動で選択してください。", "is-missed");
    track("gold_kaitori_ai_ocr_error", {});
  }
}

function getAiRoute(data) {
  if (data.condition === "high" || data.weight === "heavy" || data.weight === "many" || data.item === "coin") {
    return {
      label: "出張査定も見ておくとよさそうです",
      reason: "点数が多い品物や高額品は、持ち歩かずに見てもらえるか、入金方法や本人確認も先に聞いておくと安心です。"
    };
  }
  if (data.preference === "fast") {
    return {
      label: "店頭査定が合いそうです",
      reason: "対面で説明を聞きたい場合は、営業時間や予約が必要か、本人確認書類を先に見ておくとスムーズです。"
    };
  }
  if (data.preference === "private") {
    return {
      label: "宅配査定も見ておくとよさそうです",
      reason: "外出しにくい、人に見られたくない場合は、送料・返送料・キャンセル時の費用を見てから進めると安心です。"
    };
  }
  return {
    label: "無料査定予約の内容を先に見てみましょう",
    reason: "売却を決める前に、査定額・費用・キャンセル時の扱いを見ておく流れが合っています。"
  };
}

function buildAiPoints(data) {
  const points = [];

  if (data.mark === "k18") {
    points.push("K18/750は金の割合を見る目安です。重さが分かると、相談するときに話が早いです。");
  } else if (data.mark === "k24") {
    points.push("K24や純金表記は金額が大きくなりやすい品物です。持ち運びや入金方法も一緒に聞いておくと安心です。");
  } else if (data.mark === "pt900" || data.mark === "pt850") {
    points.push("プラチナはPt900/Pt850などで金額が変わります。刻印と重さを実物で見てもらいましょう。");
  } else if (data.mark === "plated") {
    points.push("GP/GFはメッキ系の可能性があります。売れるかどうかは、実物を見てもらうのが確実です。");
  } else {
    points.push("刻印が読めない場合でも、実物を見れば分かることがあります。写真だけで決めず、一度見てもらいましょう。");
  }

  if (data.condition === "broken") {
    points.push("切れたチェーン、石取れ、片方だけのピアスでも、金やプラチナとして値段が付く場合があります。");
  } else if (data.condition === "old") {
    points.push("古い品物や変色がある品物は、刻印・重量・付属品の有無をまとめて相談すると話が早くなります。");
  } else if (data.condition === "high") {
    points.push("高額になりそうな品物は、査定方法、本人確認、支払い方法、キャンセル時の費用を先に見ておくと安心です。");
  } else {
    points.push("目立つ破損がない場合も、石やデザイン部分の扱いで査定額が変わることがあります。");
  }

  if (data.weight === "unknown") {
    points.push("重さが分からなくても相談できます。分かる場合は家庭用スケールで概算を控えておくと便利です。");
  } else if (data.weight === "many") {
    points.push("複数点ある場合は、まとめて見てもらえるか、出張で来てもらえるかを聞くと進めやすいです。");
  } else {
    points.push("重さの目安があると、当日の相場を見たときにざっくりイメージしやすくなります。");
  }

  points.push("ここで分かるのは、相談前の整理です。実際の査定額や手数料、対応エリアは申し込み先で確認してください。");
  return points;
}

function buildAiMessage(data, route) {
  const item = AI_ITEM_LABELS[data.item] || AI_ITEM_LABELS.unknown;
  const mark = AI_MARK_LABELS[data.mark] || AI_MARK_LABELS.unknown;
  const weight = AI_WEIGHT_LABELS[data.weight] || AI_WEIGHT_LABELS.unknown;
  const condition = AI_CONDITION_LABELS[data.condition] || AI_CONDITION_LABELS.normal;

  return [
    item + "の査定をお願いしたいです。",
    "刻印は「" + mark + "」で、重さは「" + weight + "」です。",
    "状態は「" + condition + "」です。",
    "売却するかは査定額と費用を見てから決めたいです。",
    route.label + "と表示されたため、査定方法・費用・キャンセル時の扱いも相談したいです。"
  ].join("\n");
}

function setupAiConcierge() {
  const form = document.querySelector("[data-ai-form]");
  const result = document.querySelector("[data-ai-result]");
  if (!form || !result) return;

  const photoInput = form.querySelector("[data-ai-photo]");
  const markSelect = form.querySelector('select[name="mark"]');
  const photoPreview = document.querySelector("[data-ai-photo-preview]");
  const photoImg = document.querySelector("[data-ai-photo-img]");
  const ocrStatus = document.querySelector("[data-ocr-status]");
  const title = result.querySelector("[data-ai-title]");
  const summary = result.querySelector("[data-ai-summary]");
  const routeBox = result.querySelector("[data-ai-route]");
  const pointsList = result.querySelector("[data-ai-points]");
  const message = result.querySelector("[data-ai-message]");
  const copyButton = result.querySelector("[data-ai-copy]");
  let photoUrl = "";

  function suppressStickyCta() {
    const sticky = document.querySelector(".sticky-cta");
    if (!sticky) return;
    sticky.classList.add("suppressed");
    window.setTimeout(function () {
      sticky.classList.remove("suppressed");
    }, 12000);
  }

  if (photoInput && photoPreview && photoImg) {
    photoInput.addEventListener("change", function () {
      const file = photoInput.files && photoInput.files[0];
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      if (!file) {
        photoPreview.hidden = true;
        return;
      }
      photoUrl = URL.createObjectURL(file);
      photoImg.src = photoUrl;
      photoPreview.hidden = false;
      setOcrStatus(ocrStatus, "写真を確認中です。刻印が写っていれば自動で候補を探します。", "is-reading");
      track("gold_kaitori_ai_photo_selected", { file_type: file.type || "unknown" });
      runMarkOcr(file, markSelect, ocrStatus);
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const formData = new FormData(form);
    const data = {
      item: String(formData.get("item") || "unknown"),
      mark: String(formData.get("mark") || "unknown"),
      weight: String(formData.get("weight") || "unknown"),
      condition: String(formData.get("condition") || "normal"),
      preference: String(formData.get("preference") || "price")
    };
    const route = getAiRoute(data);
    const points = buildAiPoints(data);
    const itemLabel = AI_ITEM_LABELS[data.item] || AI_ITEM_LABELS.unknown;
    const markLabel = AI_MARK_LABELS[data.mark] || AI_MARK_LABELS.unknown;

    title.textContent = itemLabel + "は一度見てもらう価値があります";
    summary.textContent = markLabel + "、状態、重さをもとに、相談前に見ておきたい点を整理しました。";
    routeBox.innerHTML = "<span>おすすめの進め方</span>" + route.label + "<br><small>" + route.reason + "</small>";
    pointsList.innerHTML = points.map(function (point) { return "<li>" + point + "</li>"; }).join("");
    message.value = buildAiMessage(data, route);
    result.hidden = false;
    suppressStickyCta();
    window.setTimeout(function () {
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
    track("gold_kaitori_ai_check_complete", data);
  });

  if (copyButton && message) {
    copyButton.addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(message.value);
        copyButton.textContent = "コピーしました";
        window.setTimeout(function () { copyButton.textContent = "相談文をコピー"; }, 1800);
        track("gold_kaitori_ai_message_copy", {});
      } catch (_) {
        message.focus();
        message.select();
      }
    });
  }
}

function setupCampaignExpiryPresentation() {
  if (isCampaignActive()) return;

  const heroAlert = document.querySelector(".hero-alert");
  if (heroAlert) {
    heroAlert.innerHTML = "<span>査定前に確認</span><strong>査定額と費用を確認 <small>売却判断はその後でOK</small></strong>";
  }

  const heroPoints = document.querySelectorAll(".hero-points li");
  if (heroPoints.length >= 2) {
    heroPoints[0].textContent = "査定額を見てから売却判断";
    heroPoints[1].textContent = "電話・WEBで査定予約を確認";
  }

  const intentCondition = document.querySelector(".intent-list div:last-child span");
  if (intentCondition) intentCondition.textContent = "査定方法・費用・キャンセル時の扱い";

  const proofText = document.querySelector("#manekiya-reason .proof-layout > div:first-child p");
  if (proofText) {
    proofText.innerHTML = '公式サイトでは、買取単価、専門査定、他店で断られた品の相談、高額取引への対応が強く打ち出されています。金額だけでなく、宝石・デザイン価値まで見てもらえるかで手取りは変わります。';
  }

  const proofPromoCard = document.querySelector("#manekiya-reason .proof-grid article:nth-child(2)");
  if (proofPromoCard) {
    const heading = proofPromoCard.querySelector("h3");
    const text = proofPromoCard.querySelector("p");
    if (heading) heading.textContent = "鑑定スペシャリストが査定";
    if (text) text.textContent = "素材だけでなく、宝石やデザイン価値まで含めて正しく見てもらえる点が強みです。";
  }

  const readyPoints = document.querySelectorAll(".ready-box li");
  if (readyPoints.length >= 2) {
    readyPoints[1].textContent = "電話相談またはWEB査定予約で金額と条件を確認できる";
  }

  const campaignRow = document.querySelector(".comparison-board .comparison-row:nth-child(2)");
  if (campaignRow) {
    const cells = campaignRow.querySelectorAll("div");
    if (cells.length >= 3) {
      cells[0].textContent = "査定前に確認できること";
      cells[1].innerHTML = "<span>◎</span>金額・費用・方法を確認";
      cells[2].innerHTML = "<span>○</span>条件はリンク先で確認";
    }
  }

  const winnerText = document.querySelector(".winner-box p");
  if (winnerText) winnerText.textContent = "査定額と費用を見てから判断したい方が、最初に条件を確認しやすい内容です。";

  const attention = document.querySelector(".rank-primary .fact-grid div:last-child dd");
  if (attention) attention.textContent = "査定額や対象品、対応方法の最新条件はリンク先で確認";

  const sellHeading = document.querySelector(".sell-now-section .section-head h2");
  const sellIntro = document.querySelector(".sell-now-section .section-head p");
  if (sellHeading) sellHeading.innerHTML = '<span class="manekiya-pop">まねきや</span>を先に見るなら、査定前の確認はここ';
  if (sellIntro) sellIntro.textContent = "比較で候補を絞ったら、次は費用・査定方法・対象品を確認。査定予約後に金額を確認して、売却判断は後でできます。";

  const promoMain = document.querySelector(".promo-main");
  if (promoMain) {
    promoMain.innerHTML = '<div class="promo-corner">まず確認</div><span>売却を決める前に</span><strong>査定額と費用を確認</strong><p>査定方法や対象品を見てから、売却するかどうかを判断できます。</p>';
  }

  const promoLast = document.querySelector(".promo-board .promo-sub:last-child");
  if (promoLast) promoLast.innerHTML = "<span>判断</span><strong>査定後でOK</strong>";

  const sellButton = document.querySelector('[data-track="sell_now_manekiya"]');
  const campaignNote = document.querySelector(".campaign-note");
  if (sellButton) sellButton.textContent = "電話相談の条件を見る";
  if (campaignNote) campaignNote.textContent = "※査定対象、費用、対応方法などの最新の内容はリンク先で確認してください。";
}

function setupLandingIntent() {
  const requestedIntent = new URLSearchParams(window.location.search).get("intent") || "";
  const variants = {
    fee: {
      eyebrow: "金を売る前に、費用条件を確認したい方へ",
      title: "金の買取、<br />手数料まで<span class=\"no-break\">確認</span>。",
      lead: "高く見えても、手数料を差し引いたら受取額が変わることがあります。まねきやは公式に査定料・キャンセル料・手数料がかからないと案内しています。まず査定額を確認してから判断しましょう。",
      primary: "手数料0円か電話で確認",
      stripKicker: "手取りで比較",
      stripTitle: "査定額から引かれる費用を、先に確認",
      stripLead: "買取価格だけを見て決める前に、費用条件まで確認しておくと安心です。まねきや公式では、査定料・キャンセル料・手数料は一切かからないと案内されています。",
      factors: [
        ["査定額", "品位と重量を見た実際の提示額"],
        ["査定料", "公式案内では無料"],
        ["キャンセル料", "公式案内では不要"],
        ["方法", "店頭・出張・宅配の条件を確認"]
      ],
      proofTitle: "手数料で迷うなら、<span class=\"manekiya-pop\">まねきや</span>を先に確認",
      proofLead: "まねきや公式では査定料・キャンセル料・手数料が一切かからないと案内されています。査定予約で金額を確認してから、納得できる場合だけ売却を判断できます。",
      conclusionTitle: "手数料を引かれたくないなら、<span class=\"manekiya-pop\">まねきや</span>で査定額を確認"
    },
    unmarked: {
      eyebrow: "刻印が見えない金製品をお持ちの方へ",
      title: "刻印がなくても、<br />査定で<span class=\"no-break\">確認</span>。",
      lead: "古い指輪やアクセサリーは、刻印が薄い・読めないことがあります。自分で価値を決めて処分せず、まずは査定方法と対象品の条件を確認しましょう。",
      primary: "刻印なし品を電話で相談",
      stripKicker: "捨てる前に確認",
      stripTitle: "刻印が読めない品も、見た目だけで判断しない",
      stripLead: "刻印が薄い、見当たらない、素材が分からない品物は、品位を確認できる査定先へ相談することが第一歩です。",
      factors: [
        ["刻印", "見えない・薄い・読めない品物も相談"],
        ["品目", "指輪・ネックレス・古いアクセサリー"],
        ["状態", "傷・変色があってもまず確認"],
        ["判断", "査定額を聞いてから売却を決める"]
      ],
      proofTitle: "素材が分からない品も、<span class=\"manekiya-pop\">まねきや</span>へ相談しやすい",
      proofLead: "素材が分からないまま処分してしまう前に、査定対象かどうかを確認しましょう。まねきや公式FAQでは、詳細不明の品物も無料査定と案内されています。",
      conclusionTitle: "刻印が読めない品なら、<span class=\"manekiya-pop\">まねきや</span>で査定対象を確認"
    },
    k18: {
      eyebrow: "K18ネックレスの査定を検討中の方へ",
      title: "K18なら、<br />まず無料<span class=\"no-break\">査定</span>。",
      lead: "切れたネックレスや古い18金アクセサリーも、金として値段が付く場合があります。売却を決める前に、電話相談またはWEB査定予約で金額と条件を確認しましょう。",
      primary: "K18を電話で査定相談"
    },
    platinum: {
      eyebrow: "プラチナ指輪の査定を検討中の方へ",
      title: "プラチナなら、<br />まず無料<span class=\"no-break\">査定</span>。",
      lead: "Pt900やPt850の指輪・ネックレスは、刻印や重さで査定額が変わります。古い品物でも、まず電話相談またはWEB査定予約で条件を確認しましょう。",
      primary: "プラチナ指輪を電話相談"
    }
  };
  const variant = variants[requestedIntent];
  const intent = variant ? requestedIntent : "general";
  document.body.setAttribute("data-landing-intent", intent);
  track("gold_kaitori_landing_intent", { landing_intent: intent });
  if (!variant) return;

  const eyebrow = document.querySelector("[data-intent-eyebrow]");
  const title = document.querySelector("[data-intent-title]");
  const lead = document.querySelector("[data-intent-lead]");
  const primary = document.querySelector("[data-intent-primary]");
  if (eyebrow) eyebrow.textContent = variant.eyebrow;
  if (title) title.innerHTML = variant.title;
  if (lead) lead.textContent = variant.lead;
  if (primary) primary.textContent = variant.primary;

  if (variant.stripTitle) {
    const stripKicker = document.querySelector("[data-intent-strip-kicker]");
    const stripTitle = document.querySelector("[data-intent-strip-title]");
    const stripLead = document.querySelector("[data-intent-strip-lead]");
    const proofTitle = document.querySelector("[data-intent-proof-title]");
    const proofLead = document.querySelector("[data-intent-proof-lead]");
    const conclusionTitle = document.querySelector("[data-intent-conclusion-title]");
    if (stripKicker) stripKicker.textContent = variant.stripKicker;
    if (stripTitle) stripTitle.textContent = variant.stripTitle;
    if (stripLead) stripLead.textContent = variant.stripLead;
    if (proofTitle) proofTitle.innerHTML = variant.proofTitle;
    if (proofLead) proofLead.textContent = variant.proofLead;
    if (conclusionTitle) conclusionTitle.innerHTML = variant.conclusionTitle;
    variant.factors.forEach(function (factor, index) {
      const label = document.querySelector('[data-intent-factor-label="' + index + '"]');
      const copy = document.querySelector('[data-intent-factor-copy="' + index + '"]');
      if (label) label.textContent = factor[0];
      if (copy) copy.textContent = factor[1];
    });
  }
}

function setupPlatinumCalculator() {
  const form = document.querySelector("[data-platinum-calc]");
  const result = document.querySelector("[data-calc-result]");
  if (!form || !result) return;

  const puritySelect = form.querySelector("[data-calc-purity]");
  const weightInput = form.querySelector("[data-calc-weight]");
  const amountEl = result.querySelector("[data-calc-amount]");
  const noteEl = result.querySelector("[data-calc-note]");

  const PURITY_LABELS = {
    pt1000: "Pt1000",
    pt950: "Pt950",
    pt900: "Pt900",
    pt850: "Pt850",
    k18: "K18 / 金とのコンビ"
  };

  function rateFor(purity) {
    const value = Number(form.getAttribute("data-rate-" + purity));
    return Number.isFinite(value) ? value : 0;
  }

  function estimate(event) {
    if (event) event.preventDefault();
    const purity = String(puritySelect.value || "pt900");
    const weight = parseFloat(weightInput.value);
    if (!Number.isFinite(weight) || weight <= 0) {
      result.hidden = false;
      amountEl.textContent = "重さを入れてください";
      noteEl.textContent = "指輪の重さが分からない場合は、3〜5gを目安に入れてみてください。";
      weightInput.focus();
      return;
    }
    const rate = rateFor(purity);
    const high = Math.round(rate * weight);
    const low = Math.round(rate * weight * 0.9);
    amountEl.textContent = "約 " + low.toLocaleString("ja-JP") + "〜" + high.toLocaleString("ja-JP") + "円";
    noteEl.textContent =
      (PURITY_LABELS[purity] || "プラチナ") + " " + weight + "g × 当日単価 " + rate.toLocaleString("ja-JP") + "円/g での目安です。宝石・デザイン部分や状態で実額は変わります。";
    result.hidden = false;
    window.setTimeout(function () {
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 40);
    track("calc_estimate", {
      landing_intent: document.body.getAttribute("data-landing-intent") || "general",
      purity: purity,
      weight_g: weight,
      estimate_high: high
    });
  }

  form.addEventListener("submit", estimate);
}

function setupAppraisalReport() {
  const form = document.querySelector("[data-appraisal]");
  const report = document.querySelector("[data-appraisal-report]");
  if (!form || !report) return;

  const puritySelect = form.querySelector("[data-appraisal-purity]");
  const weightInput = form.querySelector("[data-appraisal-weight]");
  const rangeEl = report.querySelector("[data-report-range]");
  const labelEl = report.querySelector("[data-report-label]");
  const rateEl = report.querySelector("[data-report-rate]");
  const weightEl = report.querySelector("[data-report-weight]");
  const floorEl = report.querySelector("[data-report-floor]");
  const noteEl = report.querySelector("[data-report-note]");
  const lineEl = report.querySelector("[data-report-line]");
  const rangeBar = report.querySelector("[data-report-rangebar]");
  const lowZone = report.querySelector(".rep-zone-low");
  const lossEl = report.querySelector("[data-report-loss]");
  const lossBox = report.querySelector("[data-report-loss-box]");
  const echoEl = document.querySelector("[data-report-echo]");
  const memoEl = document.querySelector("[data-report-memo]");

  const PURITY_LABELS = { pt1000: "Pt1000", pt950: "Pt950", pt900: "Pt900", pt850: "Pt850", k18: "K18 / 金とのコンビ" };
  // ものさしの軸：地金額の70%〜100%を可視化
  const AXIS_MIN = 0.70, AXIS_MAX = 1.00;
  const FLOOR = 0.80;      // これ以下は安すぎ（下限）
  const BOUNDARY = 0.85;   // 買い叩き/適正の境
  const FAIR_LOW = 0.88, FAIR_HIGH = 1.00;
  const yenLabel = function (v) { return Math.round(v).toLocaleString("ja-JP") + "円"; };
  const toX = function (frac) {
    const x = (frac - AXIS_MIN) / (AXIS_MAX - AXIS_MIN);
    return Math.max(0, Math.min(1, x)) * 100;
  };

  function rateFor(purity) {
    const value = Number(form.getAttribute("data-rate-" + purity));
    return Number.isFinite(value) ? value : 0;
  }
  function stoneValue() {
    const checked = form.querySelector("[data-appraisal-stone]:checked");
    return checked ? checked.value : "none";
  }

  function generate(event) {
    if (event) event.preventDefault();
    const purity = String(puritySelect.value || "pt900");
    const weight = parseFloat(weightInput.value);
    if (!Number.isFinite(weight) || weight <= 0) {
      report.hidden = false;
      labelEl.textContent = "重さを入れてください";
      rangeEl.textContent = "—";
      noteEl.textContent = "指輪の重さが分からない場合は、3〜5gを目安に入れてみてください。";
      weightInput.focus();
      return;
    }
    const rate = rateFor(purity);
    const gross = rate * weight;
    const fairLow = Math.round(gross * FAIR_LOW);
    const fairHigh = Math.round(gross * FAIR_HIGH);
    const floor = Math.round(gross * FLOOR);
    const loss = Math.max(0, fairHigh - floor);
    const hasStone = stoneValue() === "stone";

    labelEl.textContent = "だいたいこのくらいで売れそう";
    rangeEl.textContent = "約 " + fairLow.toLocaleString("ja-JP") + "〜" + fairHigh.toLocaleString("ja-JP") + "円";
    rateEl.textContent = yenLabel(rate) + "/g（" + (PURITY_LABELS[purity] || "プラチナ") + "）";
    weightEl.textContent = weight + "g";
    floorEl.textContent = "約 " + floor.toLocaleString("ja-JP") + "円";
    if (lossEl) lossEl.textContent = loss.toLocaleString("ja-JP") + "円";
    if (lossBox) lossBox.hidden = false;
    if (echoEl) echoEl.textContent = "約" + fairHigh.toLocaleString("ja-JP") + "円";
    if (memoEl) {
      memoEl.textContent = "「" + (PURITY_LABELS[purity] || "プラチナ") + "・" + weight +
        "gの指輪です。今日の値段だと約" + fairLow.toLocaleString("ja-JP") +
        "〜" + fairHigh.toLocaleString("ja-JP") + "円くらいって見たんですが、これ以上出せますか？」";
    }
    noteEl.textContent = hasStone
      ? "石やデザインが付いているので、上の金額より高くなることもあります。お店で見せたとき、この金額より大きく下がらないか確認してみてください。"
      : "金属だけの金額の目安です。これより大きく下がるとき、特にいちばん下の金額を切るときは、今日の1gの値段を聞いてみましょう。";

    // ものさし描画
    if (lowZone) lowZone.style.flexBasis = toX(BOUNDARY) + "%";
    if (lineEl) lineEl.style.left = toX(FLOOR) + "%";
    if (rangeBar) {
      const left = toX(FAIR_LOW);
      rangeBar.style.left = left + "%";
      rangeBar.style.width = (toX(FAIR_HIGH) - left) + "%";
    }

    report.hidden = false;
    window.setTimeout(function () { report.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 40);
    fireFunnel("appraisal_complete", {
      purity: purity,
      weight_g: weight,
      stone: hasStone ? 1 : 0,
      fair_high: fairHigh,
      loss_max: loss
    });
  }

  let started = false;
  function markStart() {
    if (started) return;
    started = true;
    track("appraisal_start", { landing_intent: document.body.getAttribute("data-landing-intent") || "general" });
  }
  if (weightInput) weightInput.addEventListener("focus", markStart);
  if (puritySelect) puritySelect.addEventListener("change", markStart);

  // ②重さ入力（最初の入力で1回だけ計測）
  let weightFired = false;
  if (weightInput) weightInput.addEventListener("input", function () {
    if (weightFired) return;
    weightFired = true;
    fireFunnel("weight_input");
  });

  form.addEventListener("submit", generate);
}

function setupStickyCta() {
  const bar = document.querySelector("[data-sticky-cta]");
  const heroActions = document.querySelector(".platinum-hero .hero-actions, .rep-hero .rep-hero-actions");
  if (!bar || !heroActions) return;

  // FVのCTAが画面外に出たら固定バーを表示（離脱直前の受け皿）
  if ("IntersectionObserver" in window) {
    let shown = false;
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        bar.hidden = entry.isIntersecting;
        if (!entry.isIntersecting && !shown) {
          shown = true;
          track("sticky_cta_show", {
            landing_intent: document.body.getAttribute("data-landing-intent") || "general"
          });
        }
      });
    }, { threshold: 0 });
    observer.observe(heroActions);
  } else {
    bar.hidden = false;
  }
}

function setupFunnelMeasurement() {
  const comparison = document.querySelector("#compare");
  if (comparison && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        track("comparison_view", {
          landing_intent: document.body.getAttribute("data-landing-intent") || "general"
        });
        fireFunnel("step3_view");
        observer.disconnect();
      });
    }, { threshold: 0.25 });
    observer.observe(comparison);
  }

  const recordedDepths = new Set();
  window.addEventListener("scroll", function () {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return;
    const rate = window.scrollY / maxScroll;
    [0.5, 0.75].forEach(function (threshold) {
      if (rate < threshold || recordedDepths.has(threshold)) return;
      recordedDepths.add(threshold);
      track(threshold === 0.5 ? "scroll_50" : "scroll_75", {
        landing_intent: document.body.getAttribute("data-landing-intent") || "general"
      });
    });
  }, { passive: true });
}

document.addEventListener("DOMContentLoaded", function () {
  setupCampaignExpiryPresentation();
  setupLandingIntent();
  setupFvAbTest();
  fireFunnel("fv_view"); // ①FV表示

  document.querySelectorAll("[data-affiliate]").forEach(function (el) {
    const key = el.getAttribute("data-affiliate");
    if (AFFILIATE_LINKS[key]) el.setAttribute("href", getAffiliateLink(key));
  });

  document.querySelectorAll("[data-track]").forEach(wireTrackedLink);

  setupAiConcierge();
  setupPlatinumCalculator();
  setupAppraisalReport();
  setupStickyCta();
  setupFunnelMeasurement();

  // ⑦相談メモのコピー
  const copyBtn = document.querySelector("[data-report-copy]");
  if (copyBtn) {
    copyBtn.addEventListener("click", async function () {
      const memo = document.querySelector("[data-report-memo]");
      const text = memo ? memo.textContent.trim() : "";
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "コピーしました";
        window.setTimeout(function () { copyBtn.textContent = "この文をコピーする"; }, 1800);
      } catch (_) {}
      fireFunnel("copy_click");
    });
  }

  document.querySelectorAll("[data-scroll-to]").forEach(function (el) {
    el.addEventListener("click", function (event) {
      const target = document.querySelector(el.getAttribute("data-scroll-to"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      track("gold_kaitori_scroll_click", {
        track_name: el.getAttribute("data-track") || "",
        target: el.getAttribute("data-scroll-to"),
        landing_intent: document.body.getAttribute("data-landing-intent") || "general"
      });
    });
  });

  document.querySelectorAll(".faq-item").forEach(function (item) {
    const button = item.querySelector(".faq-q");
    if (!button) return;
    button.addEventListener("click", function () {
      item.classList.toggle("open");
      track("gold_kaitori_faq_toggle", {
        question: button.textContent.trim(),
        landing_intent: document.body.getAttribute("data-landing-intent") || "general"
      });
    });
  });

  const sticky = document.createElement("div");
  sticky.className = "sticky-cta";
  const landingIntent = document.body.getAttribute("data-landing-intent") || "general";
  const stickyLabels = {
    fee: "手数料を電話で確認",
    unmarked: "刻印なし品を電話相談",
    platinum: "プラチナを電話相談",
    k18: "K18を電話相談"
  };
  sticky.innerHTML =
    '<div class="sticky-copy"><span>電話相談へ</span><strong>公式で電話番号を確認</strong><small>' + (isCampaignActive() ? "電話申し込み限定 最大30%UP" : "査定額を見てから売却判断") + '</small></div>' +
    '<a class="btn btn-primary btn-phone-primary" href="' + getAffiliateLink("manekiya") + '" data-affiliate="manekiya" data-track="sticky_phone" rel="nofollow sponsored">' + (stickyLabels[landingIntent] || "電話相談へ進む") + '</a>' +
    '<button class="sticky-close" type="button" aria-label="閉じる">x</button>';
  document.body.appendChild(sticky);

  const stickyLink = sticky.querySelector("[data-track]");
  if (stickyLink) wireTrackedLink(stickyLink);

  let dismissed = false;
  sticky.querySelector(".sticky-close").addEventListener("click", function () {
    dismissed = true;
    sticky.classList.remove("visible");
  });

  const hero = document.querySelector(".hero");
  const ctaSection = document.querySelector(".cta-section");
  const aiResult = document.querySelector("[data-ai-result]");
  window.addEventListener("scroll", function () {
    if (dismissed) return;
    if (aiResult && !aiResult.hidden) {
      const aiRect = aiResult.getBoundingClientRect();
      if (aiRect.top < window.innerHeight && aiRect.bottom > 0) {
        sticky.classList.remove("visible");
        return;
      }
    }
    const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
    const ctaTop = ctaSection ? ctaSection.getBoundingClientRect().top : window.innerHeight + 1;
    if (heroBottom < 0 && ctaTop > window.innerHeight) {
      sticky.classList.add("visible");
    } else {
      sticky.classList.remove("visible");
    }
  }, { passive: true });
});
