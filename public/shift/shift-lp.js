const SHIFT_AFFILIATE_LINKS = {
  manekiya: "https://ad-fam.com/ad/p/r?_site=49248&_article=16522"
};

const SHIFT_TRACK_KEYS = /^(utm_|gclid|gbraid|wbraid|gad_|campaignid|keyword|matchtype|device|network|creative)/i;

function shiftWithSearchParams(url) {
  try {
    const next = new URL(url);
    new URLSearchParams(window.location.search).forEach((value, key) => {
      if (SHIFT_TRACK_KEYS.test(key) && !next.searchParams.has(key)) next.searchParams.set(key, value);
    });
    return next.toString();
  } catch (_) {
    return url;
  }
}

function shiftContext(extra = {}) {
  const body = document.body;
  const slug = body.dataset.lpSlug || "";
  return {
    slug,
    lp_slug: slug,
    intent_group: body.dataset.intentGroup || "",
    primary_keyword: body.dataset.primaryKeyword || "",
    page_location: window.location.href,
    ...extra
  };
}

function shiftTrack(eventName, params = {}) {
  const payload = shiftContext(params);
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, ...payload });
    if (typeof window.gtag === "function") window.gtag("event", eventName, payload);
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", () => {
  shiftTrack("page_view", { page_title: document.title });
  shiftTrack("gold_shift_lp_open");

  document.querySelectorAll("[data-inpage-cta]").forEach((link) => {
    link.addEventListener("click", () => {
      const params = {
        cta_position: link.dataset.ctaPosition || "unknown",
        cta_text: link.dataset.ctaText || link.textContent.trim(),
        link_url: link.href
      };
      shiftTrack("cta_click", params);
      shiftTrack("gold_shift_inpage_click", params);
    });
  });

  document.querySelectorAll("[data-affiliate]").forEach((link) => {
    const key = link.dataset.affiliate || "";
    const rawHref = SHIFT_AFFILIATE_LINKS[key];
    const href = rawHref ? shiftWithSearchParams(rawHref) : "#";
    link.setAttribute("href", href);

    link.addEventListener("click", (event) => {
      const params = {
        affiliate_key: key,
        cta_position: link.dataset.ctaPosition || "unknown",
        cta_text: link.dataset.ctaText || link.textContent.trim(),
        link_url: href
      };
      shiftTrack("cta_click", params);
      shiftTrack("gold_kaitori_cta_click", params);
      shiftTrack("gold_kaitori_affiliate_click", params);
      shiftTrack("affiliate_click", params);
      if (!rawHref) event.preventDefault();
    });
  });

  document.querySelectorAll("[data-company]").forEach((link) => {
    link.addEventListener("click", () => {
      shiftTrack("gold_comparison_official_click", {
        company: link.dataset.company || "",
        cta_position: link.dataset.ctaPosition || "comparison_official",
        link_url: link.href
      });
    });
  });

  const sticky = document.querySelector("[data-sticky]");
  const stages = [
    { selector: "[data-funnel-stage='quick_answer']", event: "quick_answer_view" },
    { selector: "[data-funnel-stage='bridge']", event: "bridge_view", revealSticky: true },
    { selector: "[data-funnel-stage='comparison']", event: "comparison_view" },
    { selector: "[data-funnel-stage='manekiya']", event: "manekiya_view" }
  ];

  if ("IntersectionObserver" in window) {
    const seen = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.24) return;
        const stage = stages.find((item) => document.querySelector(item.selector) === entry.target);
        if (!stage || seen.has(stage.event)) return;
        seen.add(stage.event);
        shiftTrack(stage.event);
        if (stage.revealSticky && sticky) sticky.hidden = false;
        observer.unobserve(entry.target);
      });
    }, { threshold: [0.24, 0.4], rootMargin: "0px 0px -12%" });

    stages.forEach((stage) => {
      const element = document.querySelector(stage.selector);
      if (element) observer.observe(element);
    });
  }
});
