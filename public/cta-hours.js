/*
 * 電話受付時間外の電話CTA自動差し替え
 * 受付時間：毎日 9:00〜21:00（JST）。時間外は電話CTAボタンを
 * 「まずは公式サイトを確認する」に自動変更する。
 * 端末のタイムゾーンに依存しないようJST(UTC+9)で判定。
 */
// CTA連打対策の共通スタイル（押下フィードバック＋多重入力防止）。全ページで1回だけ注入。
(function injectCtaBusyStyle() {
  try {
    var st = document.createElement("style");
    st.textContent =
      ".cta-busy{opacity:.55!important;pointer-events:none!important;filter:saturate(.85);transition:opacity .08s ease;position:relative;}" +
      ".cta-busy::after{content:'';position:absolute;top:50%;right:14px;width:14px;height:14px;margin-top:-7px;border:2px solid rgba(255,255,255,.5);border-top-color:#fff;border-radius:50%;animation:ctaSpin .6s linear infinite;}" +
      "@keyframes ctaSpin{to{transform:rotate(360deg);}}";
    (document.head || document.documentElement).appendChild(st);
  } catch (_) {}
})();

(function () {
  var OPEN_HOUR = 9;   // 9:00 から受付
  var CLOSE_HOUR = 21; // 21:00 で受付終了（21:00以降は時間外）
  var OFF_LABEL = "まずは公式サイトを確認する";

  function jstHour() {
    var now = new Date();
    var utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utcMs + 9 * 3600000).getHours();
  }

  function isClosed() {
    var h = jstHour();
    return h < OPEN_HOUR || h >= CLOSE_HOUR;
  }

  function apply() {
    var closed = isClosed();
    // 電話CTA＝data-track に "phone" を含むリンク（inline版／app.js版どちらも対象）
    var nodes = document.querySelectorAll('[data-track*="phone"]');
    Array.prototype.forEach.call(nodes, function (el) {
      var swapped = el.getAttribute("data-cta-swapped") === "1";
      if (closed) {
        if (swapped) return;
        el.setAttribute("data-cta-orig", el.innerHTML);
        el.setAttribute("data-cta-swapped", "1");
        el.textContent = OFF_LABEL; // ☎アイコン・サブ文言も含め一本化
        el.classList.add("cta-offhours");
      } else if (swapped) {
        // 受付時間に戻ったら元の文言を復元（開きっぱなしのタブ対策）
        el.innerHTML = el.getAttribute("data-cta-orig") || el.innerHTML;
        el.removeAttribute("data-cta-swapped");
        el.removeAttribute("data-cta-orig");
        el.classList.remove("cta-offhours");
      }
    });
  }

  function init() {
    apply();
    // 受付開始/終了の境界をまたいでも追従できるよう1分ごとに再判定
    setInterval(apply, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
