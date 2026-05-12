/* Gold appraisal LP tracking and affiliate link injection.
 * Replace the placeholder URLs after ASP link URLs are issued.
 */

const AFFILIATE_LINKS = {
  manekiya: "https://manekiya.shop/gold/af2",
  otakaraya: "https://lp.otakaraya.jp/lp-gold-a/"
};

function track(eventName, params) {
  try {
    if (window.dataLayer) window.dataLayer.push({ event: eventName, ...(params || {}) });
    if (typeof gtag === "function") gtag("event", eventName, params || {});
  } catch (_) {}
}

function wireTrackedLink(el) {
  el.addEventListener("click", function (event) {
    const affiliateKey = el.getAttribute("data-affiliate") || "";
    const destination = el.getAttribute("href") || "";
    const params = {
      track_name: el.getAttribute("data-track") || "",
      affiliate_key: affiliateKey,
      link_url: destination,
      transport_type: "beacon"
    };

    if (!affiliateKey) {
      track("gold_kaitori_engagement_click", params);
      return;
    }

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

      track("gold_kaitori_affiliate_click", {
        ...params,
        event_callback: navigate,
        event_timeout: 1800
      });
      window.setTimeout(navigate, 1800);
      return;
    }

    track("gold_kaitori_affiliate_click", params);
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
    setOcrStatus(statusEl, "刻印候補は読み取れませんでした。刻印が小さい場合は、手動選択のままで大丈夫です。", "is-missed");
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
    label: "無料査定だけ先に見てみましょう",
    reason: "売るか決める前に、査定額・費用・キャンセル時の扱いを見ておく流れが合っています。"
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
    "売るかは査定額と費用を見てから決めたいです。",
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

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("[data-affiliate]").forEach(function (el) {
    const key = el.getAttribute("data-affiliate");
    if (AFFILIATE_LINKS[key]) el.setAttribute("href", AFFILIATE_LINKS[key]);
  });

  document.querySelectorAll("[data-track]").forEach(wireTrackedLink);

  setupAiConcierge();

  document.querySelectorAll("[data-scroll-to]").forEach(function (el) {
    el.addEventListener("click", function (event) {
      const target = document.querySelector(el.getAttribute("data-scroll-to"));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      track("gold_kaitori_scroll_click", {
        track_name: el.getAttribute("data-track") || "",
        target: el.getAttribute("data-scroll-to")
      });
    });
  });

  document.querySelectorAll(".faq-item").forEach(function (item) {
    const button = item.querySelector(".faq-q");
    if (!button) return;
    button.addEventListener("click", function () {
      item.classList.toggle("open");
      track("gold_kaitori_faq_toggle", { question: button.textContent.trim() });
    });
  });

  const sticky = document.createElement("div");
  sticky.className = "sticky-cta";
  sticky.innerHTML =
    '<span>無料なら金額だけ聞いてみる</span>' +
    '<a class="btn btn-primary" href="' + AFFILIATE_LINKS.manekiya + '" data-affiliate="manekiya" data-track="sticky_manekiya" rel="nofollow sponsored">今すぐ見る</a>' +
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
