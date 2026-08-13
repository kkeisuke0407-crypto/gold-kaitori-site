/**
 * PPC Affiliate OS — LPアフィリエイトクリック計測タグ
 *
 * SLVRbullet の pt.min.js とは別に設置する。役割が違う。
 *   SLVRbullet : クリックIDを成果まで引き継ぎ、Googleへ成果をアップロードする
 *   このタグ   : LP来訪 → アフィリンククリック の歩留まりを自分で数える
 *
 * 使い方:
 *   <script>
 *     window.PPC_OS_CONFIG = {
 *       endpoint: 'https://your-tool.example/api/v1/tracking/affiliate-click',
 *       offerId: 'xxxxxxxx'
 *     };
 *   </script>
 *   <script src="/tools/ppc/tracker.js" defer></script>
 *
 *   <a href="..." data-ppc-affiliate-cta="fv_hero">無料査定へ</a>
 *
 * 設計上の注意:
 * - 遷移直前でも確実に送るため sendBeacon を優先する。
 * - 同一セッション・同一CTAの二重送信を抑止する（ダブルクリック対策）。
 * - 広告パラメータは初回着地時に保存し、回遊後のクリックでも失わないようにする。
 * - 例外は握りつぶす。計測タグがLPの導線を壊してはいけない。
 */
(function () {
  'use strict';

  var config = window.PPC_OS_CONFIG || {};
  if (!config.endpoint || !config.offerId) return;

  var SESSION_KEY = 'ppc_os_session_id';
  var PARAM_KEY = 'ppc_os_ad_params';
  var SENT_KEY = 'ppc_os_sent';
  var MAX_LEN = 250;

  function safeStorage(type) {
    try {
      var s = window[type];
      var probe = '__ppc_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) {
      return null;
    }
  }

  var session = safeStorage('sessionStorage');

  function clip(value) {
    if (value === null || value === undefined) return null;
    var text = String(value);
    return text.length > MAX_LEN ? text.slice(0, MAX_LEN) : text;
  }

  function getSessionId() {
    if (!session) return null;
    var value = session.getItem(SESSION_KEY);
    if (!value) {
      value = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : 'ppc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      session.setItem(SESSION_KEY, value);
    }
    return value;
  }

  /** 着地時のURLパラメータを保存する。回遊してクエリが消えても失わないため。 */
  function resolveAdParams() {
    var params = new URLSearchParams(window.location.search);
    var picked = {
      gclid: params.get('gclid'),
      wbraid: params.get('wbraid'),
      gbraid: params.get('gbraid'),
      campaign_id: params.get('campaignid') || params.get('cmp') || params.get('utm_campaign'),
      ad_group_id: params.get('adgroupid') || params.get('agp'),
      keyword: params.get('keyword') || params.get('kw') || params.get('utm_term'),
      match_type: params.get('matchtype') || params.get('mt'),
      device: params.get('device') || params.get('dev')
    };

    var hasNew = false;
    for (var key in picked) {
      if (picked[key]) { hasNew = true; break; }
    }

    if (!session) return picked;

    if (hasNew) {
      try { session.setItem(PARAM_KEY, JSON.stringify(picked)); } catch (e) { /* noop */ }
      return picked;
    }
    try {
      var stored = session.getItem(PARAM_KEY);
      return stored ? JSON.parse(stored) : picked;
    } catch (e) {
      return picked;
    }
  }

  var adParams = resolveAdParams();

  function alreadySent(key) {
    if (!session) return false;
    try {
      var raw = session.getItem(SENT_KEY);
      var sent = raw ? JSON.parse(raw) : {};
      var now = Date.now();
      // 同じCTAの5秒以内の連打だけを抑止する（正当な再クリックは通す）
      if (sent[key] && now - sent[key] < 5000) return true;
      sent[key] = now;
      session.setItem(SENT_KEY, JSON.stringify(sent));
    } catch (e) { /* noop */ }
    return false;
  }

  function send(payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(config.endpoint, blob)) return;
      }
      fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        mode: 'cors'
      })['catch'](function () { /* 計測失敗でLPを壊さない */ });
    } catch (e) { /* noop */ }
  }

  document.addEventListener('click', function (event) {
    try {
      var target = event.target;
      if (!target || !target.closest) return;
      var anchor = target.closest('[data-ppc-affiliate-cta]');
      if (!anchor) return;

      var ctaName = clip(anchor.getAttribute('data-ppc-affiliate-cta')) || 'primary';
      if (alreadySent(ctaName)) return;

      send({
        offer_id: clip(config.offerId),
        session_id: clip(getSessionId()),
        gclid: clip(adParams.gclid),
        wbraid: clip(adParams.wbraid),
        gbraid: clip(adParams.gbraid),
        campaign_id: clip(adParams.campaign_id),
        ad_group_id: clip(adParams.ad_group_id),
        keyword: clip(adParams.keyword),
        match_type: clip(adParams.match_type),
        device: clip(adParams.device),
        landing_page: clip(window.location.href),
        cta_name: ctaName
      });
    } catch (e) { /* noop */ }
  }, true);
})();
