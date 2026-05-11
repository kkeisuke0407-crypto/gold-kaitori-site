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

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("[data-affiliate]").forEach(function (el) {
    const key = el.getAttribute("data-affiliate");
    if (AFFILIATE_LINKS[key]) el.setAttribute("href", AFFILIATE_LINKS[key]);
  });

  document.querySelectorAll("[data-track]").forEach(wireTrackedLink);

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
