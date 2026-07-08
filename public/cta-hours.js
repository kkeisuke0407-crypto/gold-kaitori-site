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
    // 【停止中】21時で広告配信を止める運用のため、時間外の電話CTA差し替え（→「公式サイト確認」）は無効化。
    //   電話CTAは終日そのまま表示する。再開する場合は下の判定を有効化する。
    return false;
    // var h = jstHour();
    // return h < OPEN_HOUR || h >= CLOSE_HOUR;
  }

  function apply() {
    var closed = isClosed();
    // 電話CTA＝data-track に "phone" を含むリンク（inline版／app.js版どちらも対象）。
    // 加えて、文言が電話前提の point_official / faq_official も時間外は公式確認版へ切替。
    var nodes = document.querySelectorAll('[data-track*="phone"], [data-track="point_official"], [data-track="faq_official"]');
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

// おたからやのキャンペーン期限を自動更新：毎週日曜まで（1週間ごとに更新される）。
// 「次の日曜（今日が日曜なら今日）」をJSTで算出して .otakara-cp-end に反映。
(function () {
  function jstNow() {
    var now = new Date();
    return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000);
  }
  function upcomingSundayMD() {
    var d = jstNow();
    var add = (7 - d.getDay()) % 7; // 日曜まであと何日（今日が日曜なら0）
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);
    return (t.getMonth() + 1) + "/" + t.getDate();
  }
  function apply() {
    try {
      var md = upcomingSundayMD();
      var nodes = document.querySelectorAll(".otakara-cp-end");
      Array.prototype.forEach.call(nodes, function (el) { el.textContent = md; });
    } catch (_) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();

// 電話受付ステータスバッジ：受付時間内(9〜21時 JST)は「ただいま電話受付中」を
// 大きめの電話CTA直後に表示して、電話行動を後押しする（50-60代向けの安心表示）。
// 表内の小ボタン(.sm)と下部固定バー(.sticky)内はレイアウト都合で対象外。
(function () {
  var OPEN_HOUR = 9, CLOSE_HOUR = 21;
  function jstHour() {
    var now = new Date();
    return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000).getHours();
  }
  function ensureStyle() {
    if (document.getElementById("call-open-style")) return;
    var st = document.createElement("style");
    st.id = "call-open-style";
    st.textContent =
      ".call-open-badge{display:block;margin:7px auto 0;text-align:center;font-size:13.5px;font-weight:800;line-height:1.4;}" +
      ".call-open-badge.is-open{color:#0B8276;}" +
      ".call-open-badge.is-open .cob-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#12B886;margin-right:6px;box-shadow:0 0 0 0 rgba(18,184,134,.7);animation:cobPulse 1.6s ease-out infinite;}" +
      ".call-open-badge.is-closed{color:#8B98A1;}" +
      "@keyframes cobPulse{70%{box-shadow:0 0 0 8px rgba(18,184,134,0);}100%{box-shadow:0 0 0 0 rgba(18,184,134,0);}}" +
      "@media (prefers-reduced-motion:reduce){.call-open-badge.is-open .cob-dot{animation:none;}}";
    (document.head || document.documentElement).appendChild(st);
  }
  function apply() {
    ensureStyle();
    var h = jstHour();
    var open = h >= OPEN_HOUR && h < CLOSE_HOUR;
    var ctas = document.querySelectorAll("a.btn-phone:not(.sm)");
    Array.prototype.forEach.call(ctas, function (a) {
      if (a.closest && a.closest(".sticky")) return;
      // ボタンが .cta-pair(電話/WEB横並び)内ならペアの直後に置いてグリッド崩れを防ぐ
      var anchor = (a.closest && a.closest(".cta-pair")) || a;
      var b = anchor.nextElementSibling;
      if (!(b && b.classList && b.classList.contains("call-open-badge"))) {
        b = document.createElement("span");
        b.className = "call-open-badge";
        anchor.insertAdjacentElement("afterend", b);
      }
      b.classList.toggle("is-open", open);
      b.classList.toggle("is-closed", !open);
      b.innerHTML = open
        ? '<i class="cob-dot"></i>ただいま電話受付中（9時〜21時・年中無休）'
        : '電話受付は毎日9時〜21時です（朝9時からつながります）';
    });
  }
  function init(){ apply(); setInterval(apply, 60000); }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init); } else { init(); }
})();
