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

function getAiRoute(data) {
  if (data.condition === "high" || data.weight === "heavy" || data.weight === "many" || data.item === "coin") {
    return {
      label: "出張査定の条件確認が向いています",
      reason: "点数が多い品物や高額品は、持ち歩きの不安・入金方法・本人確認を先に確認すると判断しやすくなります。"
    };
  }
  if (data.preference === "fast") {
    return {
      label: "店頭査定の予約条件確認が向いています",
      reason: "対面で説明を聞きたい場合は、営業時間・予約要否・本人確認書類を先に見るとスムーズです。"
    };
  }
  if (data.preference === "private") {
    return {
      label: "宅配査定の条件確認が向いています",
      reason: "外出しにくい、人に見られたくない場合は、送料・返送料・キャンセル時の扱いを確認してから進めるのが安心です。"
    };
  }
  return {
    label: "まずは無料査定の相談条件を確認",
    reason: "売るかを決める前に、査定額・費用条件・キャンセル時の扱いを見て判断材料を作る流れが合っています。"
  };
}

function buildAiPoints(data) {
  const points = [];

  if (data.mark === "k18") {
    points.push("K18/750は金の含有率が査定の目安になります。重さと当日の相場を合わせて確認しましょう。");
  } else if (data.mark === "k24") {
    points.push("K24や純金表記は高額になりやすい品物です。持ち運びや入金方法も含めて確認しましょう。");
  } else if (data.mark === "pt900" || data.mark === "pt850") {
    points.push("プラチナはPt900/Pt850など品位で見方が変わります。刻印と重量を実物で確認してもらいましょう。");
  } else if (data.mark === "plated") {
    points.push("GP/GFはメッキ系の可能性があります。買取可否や扱いは公式査定で確認してください。");
  } else {
    points.push("刻印が読めない場合でも、素材判定は査定で確認できます。写真ではなく実物確認が大切です。");
  }

  if (data.condition === "broken") {
    points.push("切れたチェーン、石取れ、片方だけのピアスでも、素材として価値が残る場合があります。");
  } else if (data.condition === "old") {
    points.push("古い品物や変色がある品物は、刻印・重量・付属品の有無をまとめて相談すると話が早くなります。");
  } else if (data.condition === "high") {
    points.push("高額品は査定方法、本人確認、支払い方法、キャンセル条件を先に確認しておくと安心です。");
  } else {
    points.push("目立つ破損がない場合も、石やデザイン部分の扱いで査定額が変わることがあります。");
  }

  if (data.weight === "unknown") {
    points.push("重さが分からなくても相談できます。分かる場合は家庭用スケールで概算を控えておくと便利です。");
  } else if (data.weight === "many") {
    points.push("複数点ある場合は、まとめて査定できるか、出張対応の有無を確認しましょう。");
  } else {
    points.push("重さの目安があると、公式の当日相場を見たときに相談前のイメージを作りやすくなります。");
  }

  points.push("表示内容は査定前の整理です。実際の査定額、手数料、対応エリア、買取可否は公式サイトで確認してください。");
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
    "売却するかは査定額と条件を確認してから判断したいです。",
    route.label + "と表示されたため、査定方法・費用条件・キャンセル時の扱いも相談したいです。"
  ].join("\n");
}

function setupAiConcierge() {
  const form = document.querySelector("[data-ai-form]");
  const result = document.querySelector("[data-ai-result]");
  if (!form || !result) return;

  const photoInput = form.querySelector("[data-ai-photo]");
  const photoPreview = document.querySelector("[data-ai-photo-preview]");
  const photoImg = document.querySelector("[data-ai-photo-img]");
  const title = result.querySelector("[data-ai-title]");
  const summary = result.querySelector("[data-ai-summary]");
  const routeBox = result.querySelector("[data-ai-route]");
  const pointsList = result.querySelector("[data-ai-points]");
  const message = result.querySelector("[data-ai-message]");
  const copyButton = result.querySelector("[data-ai-copy]");
  let photoUrl = "";

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
      track("gold_kaitori_ai_photo_selected", { file_type: file.type || "unknown" });
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

    title.textContent = itemLabel + "は査定相談の候補です";
    summary.textContent = markLabel + "、状態、重さの情報をもとに、公式査定で確認すべき点を整理しました。";
    routeBox.innerHTML = "<span>おすすめの進め方</span>" + route.label + "<br><small>" + route.reason + "</small>";
    pointsList.innerHTML = points.map(function (point) { return "<li>" + point + "</li>"; }).join("");
    message.value = buildAiMessage(data, route);
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "start" });
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
    '<span>売るか迷うなら査定額だけ確認</span>' +
    '<a class="btn btn-primary" href="' + AFFILIATE_LINKS.manekiya + '" data-affiliate="manekiya" data-track="sticky_manekiya" rel="nofollow sponsored">無料査定予約へ</a>' +
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
  window.addEventListener("scroll", function () {
    if (dismissed) return;
    const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
    const ctaTop = ctaSection ? ctaSection.getBoundingClientRect().top : window.innerHeight + 1;
    if (heroBottom < 0 && ctaTop > window.innerHeight) {
      sticky.classList.add("visible");
    } else {
      sticky.classList.remove("visible");
    }
  }, { passive: true });
});
