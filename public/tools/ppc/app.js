/**
 * PPC Affiliate OS — 管理画面
 *
 * 設計方針: ローカルファースト。
 * 判定ロジックは engine.js（backend/app/domain の移植）で完結しているので、
 * サーバもDockerも無しで全機能が使える。データはこのブラウザのlocalStorageにだけ入る。
 *
 * バックエンドURLを設定すると、追加でAIによるKW意図分類とサーバ保存が使えるようになる。
 */
import {
  calculatePreflight,
  evaluateRuntime,
  scoreKeywords,
  aggregateClusters,
} from './engine.js';

// ============================================================ 永続化

const LS_KEY = 'ppc_os_state_v1';

const defaultState = () => ({ offers: [], settings: { apiBase: '', apiKey: '' } });

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...(parsed.settings || {}) } };
  } catch {
    return defaultState();
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    toast('保存に失敗しました（ブラウザの保存容量を確認してください）', true);
  }
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ============================================================ 小道具

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' || typeof c === 'number' ? String(c) : c);
  }
  return node;
}

const yen = (n) => (Number.isFinite(n) ? `¥${Math.round(n).toLocaleString('ja-JP')}` : '—');
const pct = (n, d = 1) => (Number.isFinite(n) ? `${(n * 100).toFixed(d)}%` : '—');
const num = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const int = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('ja-JP') : '—');

let toastTimer;
function toast(message, isError = false) {
  const node = $('#toast');
  node.textContent = message;
  node.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.className = 'toast'; }, 2600);
}

const numberOf = (sel) => {
  const v = parseFloat($(sel).value);
  return Number.isFinite(v) ? v : 0;
};

// ============================================================ CSV

/** 引用符付きCSV/TSVを行×セルへ。Google広告のエクスポート形式に対応。 */
function parseDelimited(text) {
  const head = text.slice(0, 4096);
  const delim = (head.split('\t').length - 1) > (head.split(',').length - 1) ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const MISSING = new Set(['', '--', '—', '-', 'n/a', 'na', 'null']);

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (MISSING.has(text.toLowerCase())) return 0;
  const cleaned = text.replace(/,/g, '').replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const HEADER_ALIASES = {
  keyword: ['キーワード', '検索キーワード', 'keyword', 'search keyword'],
  searches: ['月間平均検索ボリューム', '月間検索ボリューム', '月間検索数', 'avg. monthly searches', 'avg monthly searches'],
  competition: ['競合性 (インデックス値)', '競合性', 'competition (indexed value)', 'competition'],
  low_bid: ['ページ上部に表示された広告の入札単価 (低額帯)', '入札単価 (低額帯)', 'top of page bid (low range)'],
  high_bid: ['ページ上部に表示された広告の入札単価 (高額帯)', '入札単価 (高額帯)', 'top of page bid (high range)'],
  cpc: ['平均クリック単価', 'クリック単価', 'avg. cpc', 'avg cpc', 'cpc'],
  impressions: ['表示回数', 'インプレッション', 'impressions', 'impr.'],
  clicks: ['クリック数', 'クリック', 'clicks'],
  cost: ['費用', 'コスト', 'cost'],
  conversions: ['コンバージョン', 'コンバージョン数', 'conversions', 'conv.'],
  conv_value: ['コンバージョンの価値', 'コンバージョン値', 'conv. value', 'conversion value'],
};

const normHeader = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function buildHeaderIndex(headers) {
  const normalized = headers.map(normHeader);
  const index = {};
  for (const [logical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const a = normHeader(alias);
      const i = normalized.findIndex((h) => h === a || h.startsWith(a));
      if (i >= 0) { index[logical] = i; break; }
    }
  }
  return index;
}

/** プリアンブルを飛ばしてヘッダ行を見つける */
function readGoogleCsv(text, required) {
  const rows = parseDelimited(text);
  for (let i = 0; i < Math.min(15, rows.length); i += 1) {
    const index = buildHeaderIndex(rows[i]);
    if (required.every((k) => k in index)) {
      const out = [];
      for (const row of rows.slice(i + 1)) {
        if (!row.length || row.every((c) => !String(c).trim())) continue;
        const first = normHeader(row[0]);
        if (first.startsWith('合計') || first.startsWith('total')) continue;
        const obj = {};
        for (const [k, j] of Object.entries(index)) obj[k] = row[j] ?? '';
        out.push(obj);
      }
      return { rows: out, index };
    }
  }
  return { rows: [], index: null };
}

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('ファイルを読めませんでした'));
    reader.readAsText(file, 'utf-8');
  });

// ============================================================ 案件

const offerDefaults = () => ({
  id: uid(),
  name: '',
  asp_name: '',
  conversion_point: '',
  payout: 8500,
  approval_rate: 0.95,
  advertiser_cvr: 0.08,
  advertiser_cvr_confidence: 1,
  target_roas: 1.5,
  max_test_budget: 50000,
  min_test_clicks: 100,
  stop_after_zero_cv_clicks: 200,
  negatives: [],
  trademark_allowed: false,
  competitor_allowed: false,
  snapshot: null,
});

const getOffer = (id) => state.offers.find((o) => o.id === id) || null;

function runtimeInputFor(offer, snapshot) {
  const s = snapshot || offer.snapshot || {};
  return {
    impressions: s.impressions || 0,
    clicks: s.clicks || 0,
    cost: s.cost || 0,
    affiliate_clicks: s.affiliate_clicks || 0,
    conversions: s.conversions || 0,
    conversion_value: s.conversion_value || 0,
    approval_rate: offer.approval_rate,
    target_roas: offer.target_roas,
    max_test_budget: offer.max_test_budget,
    min_test_clicks: offer.min_test_clicks,
    stop_after_zero_cv_clicks: offer.stop_after_zero_cv_clicks,
    payout: offer.payout,
    advertiser_cvr: offer.advertiser_cvr,
  };
}

// ============================================================ ルーティング

const VIEWS = ['dashboard', 'offers', 'preflight', 'keywords', 'diagnosis', 'setup'];

function route() {
  const hash = (location.hash || '#/dashboard').replace('#/', '');
  const name = VIEWS.includes(hash) ? hash : 'dashboard';
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${name}`));
  renderers[name]?.();
  window.scrollTo({ top: 0 });
}

// ============================================================ ダッシュボード

function renderDashboard() {
  const cards = {
    cost: 0, revenue: 0, approved: 0, profit: 0, conversions: 0, affiliate_clicks: 0,
  };
  const board = { SCALE: [], KEEP: [], IMPROVE: [], TEST: [], STOP: [] };
  const rows = [];

  for (const offer of state.offers) {
    let result;
    try {
      result = evaluateRuntime(runtimeInputFor(offer));
    } catch {
      continue;
    }
    const s = offer.snapshot || {};
    cards.cost += s.cost || 0;
    cards.revenue += s.conversion_value || 0;
    cards.approved += result.expected_approved_revenue;
    cards.profit += result.profit;
    cards.conversions += s.conversions || 0;
    cards.affiliate_clicks += s.affiliate_clicks || 0;
    const row = { offer, result };
    rows.push(row);
    board[result.decision].push(row);
  }

  const roas = cards.cost ? cards.revenue / cards.cost : 0;
  const approvedRoas = cards.cost ? cards.approved / cards.cost : 0;

  const stat = (k, v, note, mod = '') =>
    el('div', { class: `stat ${mod}` }, [
      el('div', { class: 'k' }, k),
      el('div', { class: `v ${String(v).length > 9 ? 'sm' : ''}` }, v),
      note ? el('div', { class: 'n' }, note) : null,
    ]);

  const stats = $('#dashStats');
  stats.replaceChildren(
    stat('総広告費', yen(cards.cost)),
    stat('発生売上', yen(cards.revenue), `ROAS ${pct(roas, 0)}`),
    stat('期待承認売上', yen(cards.approved), `承認ROAS ${pct(approvedRoas, 0)}`),
    stat('期待利益', yen(cards.profit), null, cards.profit >= 0 ? 'good' : 'bad'),
    stat('SCALE候補', String(board.SCALE.length), '増額できる案件', board.SCALE.length ? 'good' : ''),
    stat('STOP候補', String(board.STOP.length), '撤退を検討', board.STOP.length ? 'bad' : ''),
  );

  const boardEl = $('#dashBoard');
  boardEl.replaceChildren(
    ...Object.entries(board).map(([key, items]) =>
      el('div', { class: 'col' }, [
        el('h3', {}, [
          el('span', { class: `badge ${key}` }, key),
          el('span', { style: 'color:var(--ink-3)' }, String(items.length)),
        ]),
        ...items.map(({ offer, result }) =>
          el('div', {
            class: 'item',
            onclick: () => { location.hash = '#/diagnosis'; setTimeout(() => selectDiagnosisOffer(offer.id), 30); },
          }, [
            el('strong', {}, offer.name || '(名称未設定)'),
            el('span', {}, `承認ROAS ${pct(result.expected_approved_roas, 0)}`),
          ])
        ),
        items.length ? null : el('div', { style: 'color:var(--ink-3);font-size:11.5px' }, '該当なし'),
      ])
    )
  );

  const table = $('#dashTable');
  if (!rows.length) {
    table.replaceChildren(
      el('tbody', {}, el('tr', {}, el('td', {},
        el('div', { class: 'empty' }, '案件がまだありません。「案件」タブから登録してください。'))))
    );
    return;
  }
  table.replaceChildren(
    el('thead', {}, el('tr', {}, [
      el('th', {}, '案件'), el('th', {}, '判定'),
      el('th', { class: 'num' }, '広告費'), el('th', { class: 'num' }, '発生売上'),
      el('th', { class: 'num' }, '承認ROAS'), el('th', { class: 'num' }, '期待利益'),
      el('th', {}, '最大ボトルネック'), el('th', { class: 'wrap' }, '次のアクション'),
    ])),
    el('tbody', {}, rows.map(({ offer, result }) =>
      el('tr', {}, [
        el('td', {}, offer.name || '(名称未設定)'),
        el('td', {}, el('span', { class: `badge ${result.decision}` }, result.decision)),
        el('td', { class: 'num' }, yen((offer.snapshot || {}).cost || 0)),
        el('td', { class: 'num' }, yen((offer.snapshot || {}).conversion_value || 0)),
        el('td', { class: 'num' }, pct(result.expected_approved_roas, 0)),
        el('td', { class: 'num', style: result.profit < 0 ? 'color:var(--stop)' : '' }, yen(result.profit)),
        el('td', {}, result.bottlenecks.length ? result.bottlenecks[0].label : '—'),
        el('td', { class: 'wrap' }, result.recommendations[0] || '—'),
      ])
    ))
  );
}

// ============================================================ 案件画面

function fillOfferForm(offer) {
  const o = offer || offerDefaults();
  $('#offerId').value = offer ? o.id : '';
  $('#offerName').value = o.name;
  $('#offerAsp').value = o.asp_name;
  $('#offerPoint').value = o.conversion_point;
  $('#offerPayout').value = o.payout;
  $('#offerApproval').value = o.approval_rate;
  $('#offerCvr').value = o.advertiser_cvr;
  $('#offerCvrConf').value = o.advertiser_cvr_confidence;
  $('#offerRoas').value = o.target_roas;
  $('#offerBudget').value = o.max_test_budget;
  $('#offerMinClicks').value = o.min_test_clicks;
  $('#offerZeroStop').value = o.stop_after_zero_cv_clicks;
  $('#offerNegatives').value = (o.negatives || []).join(', ');
  $('#offerTrademark').value = o.trademark_allowed ? '1' : '0';
  $('#offerCompetitor').value = o.competitor_allowed ? '1' : '0';
  $('#offerFormTitle').textContent = offer ? `案件を編集: ${o.name}` : '案件を登録';
}

function renderOffers() {
  const list = $('#offerList');
  if (!state.offers.length) {
    list.replaceChildren(el('div', { class: 'empty' }, 'まだ案件がありません。'));
    return;
  }
  list.replaceChildren(
    el('div', { class: 'table-wrap' },
      el('table', {}, [
        el('thead', {}, el('tr', {}, [
          el('th', {}, '案件'), el('th', { class: 'num' }, '成果単価'),
          el('th', { class: 'num' }, '承認率'), el('th', { class: 'num' }, 'CVR'),
          el('th', { class: 'num' }, '目標ROAS'), el('th', {}, ''),
        ])),
        el('tbody', {}, state.offers.map((o) =>
          el('tr', {}, [
            el('td', {}, [
              el('div', {}, o.name || '(名称未設定)'),
              o.asp_name ? el('span', { class: 'tag' }, o.asp_name) : null,
            ]),
            el('td', { class: 'num' }, yen(o.payout)),
            el('td', { class: 'num' }, pct(o.approval_rate, 0)),
            el('td', { class: 'num' }, pct(o.advertiser_cvr, 1)),
            el('td', { class: 'num' }, pct(o.target_roas, 0)),
            el('td', {}, el('div', { style: 'display:flex;gap:6px' }, [
              el('button', { class: 'ghost small', onclick: () => fillOfferForm(o) }, '編集'),
              el('button', {
                class: 'danger small',
                onclick: () => {
                  if (!confirm(`「${o.name}」を削除しますか？`)) return;
                  state.offers = state.offers.filter((x) => x.id !== o.id);
                  saveState();
                  renderOffers();
                  refreshPickers();
                  toast('削除しました');
                },
              }, '削除'),
            ])),
          ])
        )),
      ])
    )
  );
}

function bindOfferForm() {
  $('#offerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('#offerId').value;
    const existing = id ? getOffer(id) : null;
    const offer = existing || offerDefaults();
    Object.assign(offer, {
      name: $('#offerName').value.trim(),
      asp_name: $('#offerAsp').value.trim(),
      conversion_point: $('#offerPoint').value.trim(),
      payout: numberOf('#offerPayout'),
      approval_rate: numberOf('#offerApproval'),
      advertiser_cvr: numberOf('#offerCvr'),
      advertiser_cvr_confidence: numberOf('#offerCvrConf'),
      target_roas: numberOf('#offerRoas') || 1.5,
      max_test_budget: numberOf('#offerBudget'),
      min_test_clicks: numberOf('#offerMinClicks'),
      stop_after_zero_cv_clicks: numberOf('#offerZeroStop'),
      negatives: $('#offerNegatives').value.split(',').map((s) => s.trim()).filter(Boolean),
      trademark_allowed: $('#offerTrademark').value === '1',
      competitor_allowed: $('#offerCompetitor').value === '1',
    });
    if (!existing) state.offers.push(offer);
    saveState();
    fillOfferForm(null);
    renderOffers();
    refreshPickers();
    toast(existing ? '更新しました' : '登録しました');
  });

  $('#offerReset').addEventListener('click', () => fillOfferForm(null));

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `ppc-os-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await readFile(file));
      if (!Array.isArray(parsed.offers)) throw new Error('offers 配列がありません');
      state = { ...defaultState(), ...parsed };
      saveState();
      renderOffers();
      refreshPickers();
      toast(`${state.offers.length}件の案件を読み込みました`);
    } catch (err) {
      toast(`読み込みに失敗: ${err.message}`, true);
    }
    e.target.value = '';
  });
}

// ============================================================ 出稿前判定

function renderPreflight() {
  let result;
  try {
    result = calculatePreflight({
      payout: numberOf('#pfPayout'),
      approval_rate: numberOf('#pfApproval'),
      advertiser_cvr: numberOf('#pfCvr'),
      target_roas: numberOf('#pfRoas') || 1.5,
      market_cpc: numberOf('#pfCpc'),
      estimated_lp_ctr: numberOf('#pfLpCtr'),
      advertiser_cvr_confidence: numberOf('#pfCvrConf'),
      expected_monthly_clicks: numberOf('#pfClicks'),
    });
  } catch (err) {
    $('#pfResult').replaceChildren(el('div', { class: 'empty' }, `入力エラー: ${err.message}`));
    $('#pfScenarioCard').hidden = true;
    return;
  }

  const impossible = result.required_lp_ctr > 1;
  $('#pfResult').replaceChildren(
    el('div', { class: `verdict ${result.decision}` }, [
      el('div', {}, [
        el('div', { class: 'big' }, result.decision),
        el('div', { class: 'why' }, result.notes[0] || ''),
      ]),
    ]),
    el('div', { class: 'grid stats' }, [
      el('div', { class: 'stat' }, [
        el('div', { class: 'k' }, 'アフィ1クリック期待値'),
        el('div', { class: 'v sm' }, yen(result.affiliate_click_epc)),
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k' }, '損益分岐CPC'),
        el('div', { class: 'v sm' }, yen(result.break_even_cpc)),
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k' }, '上限CPC（目標ROAS時）'),
        el('div', { class: 'v sm' }, yen(result.target_cpc)),
      ]),
      el('div', { class: `stat ${impossible ? 'bad' : ''}` }, [
        el('div', { class: 'k' }, '必要LP→アフィCTR'),
        el('div', { class: 'v sm' }, pct(result.required_lp_ctr)),
        el('div', { class: 'n' }, impossible ? '100%超＝構造的に不可能' : `想定 ${pct(numberOf('#pfLpCtr'), 0)}`),
      ]),
      el('div', { class: `stat ${result.cpc_headroom >= 1 ? 'good' : 'bad'}` }, [
        el('div', { class: 'k' }, 'CPC余裕率'),
        el('div', { class: 'v sm' }, num(result.cpc_headroom)),
        el('div', { class: 'n' }, '1.0以上で採算圏'),
      ]),
      el('div', { class: `stat ${result.monthly_profit_potential >= 0 ? 'good' : 'bad'}` }, [
        el('div', { class: 'k' }, '月間利益ポテンシャル'),
        el('div', { class: 'v sm' }, yen(result.monthly_profit_potential)),
      ]),
    ]),
    result.notes.length > 1
      ? el('ul', { class: 'notes' }, result.notes.slice(1).map((n) => el('li', {}, n)))
      : null,
    el('div', { style: 'margin-top:10px' },
      result.reason_codes.map((c) => el('span', { class: 'tag' }, c))),
  );

  const scenarios = [['弱気', result.downside], ['基準', result.base], ['強気', result.upside]];
  $('#pfScenarioCard').hidden = numberOf('#pfCvrConf') >= 1;
  $('#pfScenarios').replaceChildren(
    el('thead', {}, el('tr', {}, [
      el('th', {}, 'シナリオ'), el('th', { class: 'num' }, '広告主CVR'),
      el('th', { class: 'num' }, 'アフィEPC'), el('th', { class: 'num' }, '上限CPC'),
      el('th', { class: 'num' }, '必要LP CTR'), el('th', { class: 'num' }, 'CPC余裕率'),
    ])),
    el('tbody', {}, scenarios.map(([label, s]) =>
      el('tr', {}, [
        el('td', {}, label),
        el('td', { class: 'num' }, pct(s.advertiser_cvr, 2)),
        el('td', { class: 'num' }, yen(s.affiliate_click_epc)),
        el('td', { class: 'num' }, yen(s.target_cpc)),
        el('td', { class: 'num' }, pct(s.required_lp_ctr)),
        el('td', { class: 'num', style: s.cpc_headroom >= 1 ? 'color:var(--scale)' : 'color:var(--stop)' },
          num(s.cpc_headroom)),
      ])
    ))
  );
}

function bindPreflight() {
  ['#pfPayout', '#pfApproval', '#pfCvr', '#pfCvrConf', '#pfRoas', '#pfCpc', '#pfLpCtr', '#pfClicks']
    .forEach((sel) => $(sel).addEventListener('input', renderPreflight));

  $('#pfOfferPicker').addEventListener('change', (e) => {
    const offer = getOffer(e.target.value);
    if (!offer) return;
    $('#pfPayout').value = offer.payout;
    $('#pfApproval').value = offer.approval_rate;
    $('#pfCvr').value = offer.advertiser_cvr;
    $('#pfCvrConf').value = offer.advertiser_cvr_confidence;
    $('#pfRoas').value = offer.target_roas;
    renderPreflight();
  });
}

// ============================================================ KWエクスプローラ

let lastKeywordScores = [];

function collectKeywordRows() {
  const defaultCtr = numberOf('#kwDefaultCtr') || 0.4;
  const text = $('#kwPaste').value.trim();
  if (!text) return [];
  return text.split('\n').map((line) => {
    const cells = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').trim());
    const [keyword, searches, cpc, intent, ctr, cluster] = cells;
    if (!keyword) return null;
    return {
      keyword,
      avg_monthly_searches: parseNumber(searches),
      forecast_cpc: parseNumber(cpc),
      commercial_intent: cells.length > 3 ? parseNumber(intent) : 50,
      estimated_lp_ctr: cells.length > 4 && parseNumber(ctr) > 0 ? parseNumber(ctr) : defaultCtr,
      cluster: cluster || '',
      ai_confidence: cells.length > 3 ? 0.7 : 0.5,
    };
  }).filter(Boolean);
}

function renderKeywords() {
  const offer = {
    payout: numberOf('#kwPayout'),
    approval_rate: numberOf('#kwApproval'),
    advertiser_cvr: numberOf('#kwCvr'),
    target_roas: numberOf('#kwRoas') || 1.5,
  };
  const rows = collectKeywordRows();
  const container = $('#kwResults');
  if (!rows.length) {
    container.replaceChildren(el('div', { class: 'card' },
      el('div', { class: 'empty' }, 'キーワードを貼り付けるか、CSVを読み込んでください。')));
    return;
  }

  const scores = scoreKeywords(rows, offer);
  lastKeywordScores = scores;
  const clusters = aggregateClusters(scores);
  const counts = scores.reduce((acc, s) => { acc[s.bucket] = (acc[s.bucket] || 0) + 1; return acc; }, {});
  const totalProfit = scores.reduce((a, s) => a + s.expected_monthly_profit, 0);
  const epc = offer.payout * offer.approval_rate * offer.advertiser_cvr;
  const maxProfit = Math.max(1, ...scores.map((s) => Math.abs(s.expected_monthly_profit)));

  container.replaceChildren(
    el('div', { class: 'card' }, [
      el('h2', {}, 'サマリ'),
      el('div', { class: 'grid stats' }, [
        el('div', { class: 'stat' }, [el('div', { class: 'k' }, 'KW数'), el('div', { class: 'v' }, String(scores.length))]),
        ...['CORE', 'OPPORTUNITY', 'DISCOVERY', 'EXCLUDE'].map((b) =>
          el('div', { class: 'stat' }, [
            el('div', { class: 'k' }, b),
            el('div', { class: 'v' }, String(counts[b] || 0)),
          ])
        ),
        el('div', { class: `stat ${totalProfit >= 0 ? 'good' : 'bad'}` }, [
          el('div', { class: 'k' }, '月間利益ポテンシャル計'),
          el('div', { class: 'v sm' }, yen(totalProfit)),
          el('div', { class: 'n' }, `アフィEPC ${yen(epc)}`),
        ]),
      ]),
    ]),

    el('div', { class: 'card' }, [
      el('h2', {}, ['クラスタ別', el('span', { class: 'hint' }, '検索数が小さいKWは束ねて市場性を見る')]),
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, el('tr', {}, [
          el('th', {}, 'クラスタ'), el('th', { class: 'num' }, 'KW数'),
          el('th', { class: 'num' }, '採用可'), el('th', { class: 'num' }, '月間見込クリック'),
          el('th', { class: 'num' }, '加重CPC'), el('th', { class: 'num' }, '月間利益'),
          el('th', { class: 'wrap' }, '代表KW'),
        ])),
        el('tbody', {}, clusters.map((c) =>
          el('tr', {}, [
            el('td', {}, c.cluster),
            el('td', { class: 'num' }, String(c.keyword_count)),
            el('td', { class: 'num' }, String(c.actionable_count)),
            el('td', { class: 'num' }, int(c.expected_monthly_clicks)),
            el('td', { class: 'num' }, yen(c.weighted_market_cpc)),
            el('td', { class: 'num', style: c.expected_monthly_profit < 0 ? 'color:var(--stop)' : '' },
              yen(c.expected_monthly_profit)),
            el('td', { class: 'wrap' }, c.top_keywords.join('、')),
          ])
        )),
      ])),
    ]),

    el('div', { class: 'card' }, [
      el('h2', {}, ['キーワード別', el('span', { class: 'hint' }, '優先度スコア順')]),
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, el('tr', {}, [
          el('th', {}, 'キーワード'), el('th', {}, '判定'), el('th', {}, 'クラスタ'),
          el('th', { class: 'num' }, '市場CPC'), el('th', { class: 'num' }, '必要CTR'),
          el('th', { class: 'num' }, '想定CTR'), el('th', { class: 'num' }, '余裕率'),
          el('th', { class: 'num' }, '月間クリック'), el('th', { class: 'num' }, '月間利益'),
          el('th', { class: 'num' }, '優先度'), el('th', { class: 'wrap' }, '根拠'),
        ])),
        el('tbody', {}, scores.map((s) =>
          el('tr', {}, [
            el('td', {}, s.keyword),
            el('td', {}, el('span', { class: `badge ${s.bucket}` }, s.bucket)),
            el('td', {}, s.cluster),
            el('td', { class: 'num' }, yen(s.market_cpc)),
            el('td', { class: 'num', style: s.required_lp_ctr > 1 ? 'color:var(--stop)' : '' },
              pct(s.required_lp_ctr)),
            el('td', { class: 'num' }, pct(s.estimated_lp_ctr, 0)),
            el('td', { class: 'num', style: s.cpc_headroom >= 1 ? 'color:var(--scale)' : '' },
              num(s.cpc_headroom)),
            el('td', { class: 'num' }, int(s.expected_monthly_clicks)),
            el('td', {
              class: 'num',
              style: s.expected_monthly_profit < 0 ? 'color:var(--stop)' : '',
            }, [
              yen(s.expected_monthly_profit),
              el('div', {
                class: 'bar',
                style: `width:${Math.max(2, (Math.abs(s.expected_monthly_profit) / maxProfit) * 60)}px;` +
                  (s.expected_monthly_profit < 0 ? 'background:var(--stop)' : ''),
              }),
            ]),
            el('td', { class: 'num' }, num(s.priority_score, 1)),
            el('td', { class: 'wrap' }, s.reasons.join(' ')),
          ])
        )),
      ])),
    ]),
  );
}

function bindKeywords() {
  $('#kwRun').addEventListener('click', renderKeywords);

  $('#kwOfferPicker').addEventListener('change', (e) => {
    const offer = getOffer(e.target.value);
    if (!offer) return;
    $('#kwPayout').value = offer.payout;
    $('#kwApproval').value = offer.approval_rate;
    $('#kwCvr').value = offer.advertiser_cvr;
    $('#kwRoas').value = offer.target_roas;
  });

  $('#kwSample').addEventListener('click', () => {
    $('#kwPaste').value = [
      'ロレックス 買取 相場\t2400\t180\t85\t0.5\tロレックス査定',
      'ロレックス デイトナ 買取\t880\t260\t90\t0.55\tロレックス査定',
      'オメガ 買取 店舗\t1300\t150\t80\t0.45\tオメガ査定',
      '時計 買取 おすすめ\t3600\t210\t70\t0.4\t比較検討',
      '時計 処分 方法\t260\t280\t45\t0.45\t処分整理',
      '遺品 時計 売りたい\t90\t120\t75\t0.5\t遺品整理',
      '腕時計\t90000\t500\t20\t0.2\t一般語',
      '時計 修理 安い\t1900\t190\t15\t0.15\tノイズ',
    ].join('\n');
    renderKeywords();
  });

  $('#kwFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFile(file);
      const { rows, index } = readGoogleCsv(text, ['keyword']);
      if (!index) throw new Error('「キーワード」列が見つかりませんでした');
      const defaultCtr = numberOf('#kwDefaultCtr') || 0.4;
      $('#kwPaste').value = rows.map((r) => {
        const cpc = parseNumber(r.cpc) ||
          (parseNumber(r.low_bid) + (parseNumber(r.high_bid) - parseNumber(r.low_bid)) * 0.6);
        return [r.keyword, parseNumber(r.searches), Math.round(cpc), '', defaultCtr, ''].join('\t');
      }).join('\n');
      renderKeywords();
      toast(`${rows.length}件のKWを読み込みました`);
    } catch (err) {
      toast(`読み込みに失敗: ${err.message}`, true);
    }
    e.target.value = '';
  });

  $('#kwCsvOut').addEventListener('click', () => {
    if (!lastKeywordScores.length) { toast('先に判定してください', true); return; }
    const header = ['keyword', 'bucket', 'cluster', 'market_cpc', 'required_lp_ctr',
      'estimated_lp_ctr', 'cpc_headroom', 'expected_monthly_clicks',
      'expected_monthly_profit', 'priority_score'];
    const lines = [header.join(',')];
    for (const s of lastKeywordScores) {
      lines.push(header.map((k) => {
        const v = String(s[k] ?? '');
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'keyword-scores.csv' });
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

// ============================================================ 運用診断

function selectDiagnosisOffer(offerId) {
  $('#dgOfferPicker').value = offerId;
  $('#dgOfferPicker').dispatchEvent(new Event('change'));
  runDiagnosis();
}

function currentDiagnosisInput() {
  return {
    impressions: numberOf('#dgImpr'),
    clicks: numberOf('#dgClicks'),
    cost: numberOf('#dgCost'),
    affiliate_clicks: numberOf('#dgAff'),
    conversions: numberOf('#dgConv'),
    conversion_value: numberOf('#dgValue'),
    approval_rate: numberOf('#dgApproval'),
    target_roas: numberOf('#dgRoas') || 1.5,
    max_test_budget: numberOf('#dgBudget'),
    min_test_clicks: numberOf('#dgMinClicks'),
    stop_after_zero_cv_clicks: numberOf('#dgZeroStop'),
    payout: numberOf('#dgPayout') || null,
  };
}

function runDiagnosis() {
  let r;
  try {
    r = evaluateRuntime(currentDiagnosisInput());
  } catch (err) {
    $('#dgVerdict').replaceChildren(el('div', { class: 'empty' }, `入力エラー: ${err.message}`));
    $('#dgDetails').replaceChildren();
    return;
  }

  $('#dgVerdict').replaceChildren(
    el('div', { class: `verdict ${r.decision}` }, [
      el('div', {}, [
        el('div', { class: 'big' }, r.decision),
        el('div', { class: 'why' }, r.recommendations[0] || ''),
      ]),
    ]),
    el('div', { class: 'grid stats' }, [
      el('div', { class: 'stat' }, [
        el('div', { class: 'k' }, '承認後ROAS'),
        el('div', { class: 'v sm' }, pct(r.expected_approved_roas, 0)),
        el('div', { class: 'n' }, `発生 ${pct(r.actual_roas, 0)}`),
      ]),
      el('div', { class: `stat ${r.profit >= 0 ? 'good' : 'bad'}` }, [
        el('div', { class: 'k' }, '期待利益'),
        el('div', { class: 'v sm' }, yen(r.profit)),
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k' }, 'ROAS信用区間'),
        el('div', { class: 'v sm' }, `${num(r.roas_credible_low)} – ${num(r.roas_credible_high)}`),
        el('div', { class: 'n' }, `${pct(r.evidence.credible_level, 0)}区間`),
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k' }, '実現性スコア'),
        el('div', { class: 'v sm' }, num(r.improvement.feasibility_score, 0)),
        el('div', { class: 'n' }, `データ充足 ${pct(r.improvement.evidence_level, 0)}`),
      ]),
    ]),
    el('ul', { class: 'notes' }, r.recommendations.map((x) => el('li', {}, x))),
    el('div', { style: 'margin-top:10px' }, r.reason_codes.map((c) => el('span', { class: 'tag' }, c))),
  );

  const funnel = [
    ['広告CTR', r.ad_ctr, 0.05],
    ['LP→アフィCTR', r.lp_to_affiliate_ctr, 0.35],
    ['アフィCVR', r.affiliate_cvr, 0.05],
    ['広告→成果CVR', r.ad_to_final_cvr, null],
  ];

  const details = [];

  details.push(el('div', { class: 'card' }, [
    el('h2', {}, ['ファネル', el('span', { class: 'hint' }, `CPC ${yen(r.actual_cpc)} / 成果単価 ${yen(r.value_per_conversion)}`)]),
    el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, [
        el('th', {}, '指標'), el('th', { class: 'num' }, '現在'),
        el('th', { class: 'num' }, '目安'), el('th', {}, '判定'),
      ])),
      el('tbody', {}, funnel.map(([label, value, bench]) =>
        el('tr', {}, [
          el('td', {}, label),
          el('td', { class: 'num' }, pct(value, 2)),
          el('td', { class: 'num' }, bench === null ? '—' : pct(bench, 0)),
          el('td', {}, bench === null ? '—'
            : el('span', { class: `badge ${value >= bench ? 'KEEP' : 'IMPROVE'}` },
              value >= bench ? '目安以上' : '目安未満')),
        ])
      )),
    ])),
  ]));

  if (r.bottlenecks.length) {
    details.push(el('div', { class: 'card' }, [
      el('h2', {}, ['ボトルネック', el('span', { class: 'hint' }, 'ROASギャップを埋められる割合の順')]),
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, el('tr', {}, [
          el('th', {}, '指標'), el('th', {}, 'パターン'), el('th', { class: 'num' }, '現在'),
          el('th', { class: 'num' }, '目安'), el('th', { class: 'num' }, 'ギャップ寄与'),
          el('th', { class: 'wrap' }, '対処'),
        ])),
        el('tbody', {}, r.bottlenecks.map((b) =>
          el('tr', {}, [
            el('td', {}, b.label),
            el('td', {}, b.pattern),
            el('td', { class: 'num' }, b.code === 'APPROVAL_RATE' ? num(b.current) : pct(b.current, 2)),
            el('td', { class: 'num' }, b.code === 'APPROVAL_RATE' ? num(b.benchmark) : pct(b.benchmark, 2)),
            el('td', { class: 'num' }, pct(b.gap_closed_ratio, 0)),
            el('td', { class: 'wrap' }, b.message),
          ])
        )),
      ])),
    ]));
  }

  const plan = r.improvement;
  if (plan.levers && plan.levers.length) {
    details.push(el('div', { class: 'card' }, [
      el('h2', {}, [
        '最小改善経路',
        el('span', { class: 'hint' },
          `損益分岐まで必要な改善倍率 ${Number.isFinite(plan.required_gap) ? `${num(plan.required_gap)}倍` : '算出不能'}`),
      ]),
      plan.best_path
        ? el('div', { class: 'verdict IMPROVE', style: 'margin-bottom:12px' }, [
          el('div', {}, [
            el('div', { style: 'font-weight:800' }, `最有力: ${plan.best_path.name}`),
            el('div', { class: 'why' }, plan.best_path.description),
          ]),
        ])
        : null,
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, el('tr', {}, [
          el('th', {}, 'レバー'), el('th', { class: 'num' }, '現在'),
          el('th', { class: 'num' }, '必要'), el('th', { class: 'num' }, '改善幅'),
          el('th', { class: 'num' }, '実現性'), el('th', {}, '自分で動かせるか'),
        ])),
        el('tbody', {}, plan.levers.map((lv) =>
          el('tr', {}, [
            el('td', {}, lv.label),
            el('td', { class: 'num' }, lv.key === 'cpc' ? yen(lv.current) : pct(lv.current, 2)),
            el('td', { class: 'num' }, lv.key === 'cpc' ? yen(lv.required) : pct(lv.required, 2)),
            el('td', { class: 'num' },
              `${lv.direction === 'down' ? '-' : '+'}${(lv.change_ratio * 100).toFixed(1)}%`),
            el('td', { class: 'num' }, [
              num(lv.feasibility, 0),
              el('div', {
                class: 'bar',
                style: `width:${Math.max(2, lv.feasibility * 0.6)}px;` +
                  (lv.feasibility < 25 ? 'background:var(--stop)' : lv.feasibility < 50 ? 'background:var(--improve)' : ''),
              }),
            ]),
            el('td', {}, lv.controllable ? '自分で可' : '広告主側'),
          ])
        )),
      ])),
      plan.notes.length ? el('ul', { class: 'notes' }, plan.notes.map((n) => el('li', {}, n))) : null,
    ]));
  }

  const zero = r.evidence.zero_cv;
  if (zero && zero.applicable) {
    details.push(el('div', { class: 'card' }, [
      el('h2', {}, 'CV0の統計的評価'),
      el('div', { class: 'grid stats' }, [
        el('div', { class: 'stat' }, [
          el('div', { class: 'k' }, '損益分岐に必要なアフィCVR'),
          el('div', { class: 'v sm' }, pct(zero.required_affiliate_cvr, 2)),
        ]),
        el('div', { class: 'stat' }, [
          el('div', { class: 'k' }, 'それが真ならCV0になる確率'),
          el('div', { class: 'v sm' }, pct(zero.p_zero_given_required, 1)),
        ]),
        el('div', { class: `stat ${zero.significant ? 'bad' : ''}` }, [
          el('div', { class: 'k' }, '撤退の統計的根拠'),
          el('div', { class: 'v sm' }, zero.significant ? '成立' : '不足'),
          el('div', { class: 'n' }, `必要アフィクリック ${int(zero.clicks_needed)}件`),
        ]),
      ]),
    ]));
  }

  $('#dgDetails').replaceChildren(...details);
}

function bindDiagnosis() {
  $('#dgRun').addEventListener('click', runDiagnosis);

  $('#dgOfferPicker').addEventListener('change', (e) => {
    const offer = getOffer(e.target.value);
    if (!offer) return;
    $('#dgApproval').value = offer.approval_rate;
    $('#dgRoas').value = offer.target_roas;
    $('#dgPayout').value = offer.payout;
    $('#dgBudget').value = offer.max_test_budget;
    $('#dgMinClicks').value = offer.min_test_clicks;
    $('#dgZeroStop').value = offer.stop_after_zero_cv_clicks;
    const s = offer.snapshot;
    if (s) {
      $('#dgImpr').value = s.impressions || 0;
      $('#dgClicks').value = s.clicks || 0;
      $('#dgCost').value = s.cost || 0;
      $('#dgAff').value = s.affiliate_clicks || 0;
      $('#dgConv').value = s.conversions || 0;
      $('#dgValue').value = s.conversion_value || 0;
    }
  });

  $('#dgSaveSnapshot').addEventListener('click', () => {
    const offer = getOffer($('#dgOfferPicker').value);
    if (!offer) { toast('先に案件を選んでください', true); return; }
    const i = currentDiagnosisInput();
    offer.snapshot = {
      impressions: i.impressions, clicks: i.clicks, cost: i.cost,
      affiliate_clicks: i.affiliate_clicks, conversions: i.conversions,
      conversion_value: i.conversion_value, updated_at: new Date().toISOString(),
    };
    saveState();
    toast('案件に保存しました。ダッシュボードに反映されます。');
  });

  $('#dgFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFile(file);
      const { rows, index } = readGoogleCsv(text, ['clicks']);
      if (!index) throw new Error('「クリック数」列が見つかりませんでした');
      const totals = rows.reduce((acc, r) => ({
        impressions: acc.impressions + parseNumber(r.impressions),
        clicks: acc.clicks + parseNumber(r.clicks),
        cost: acc.cost + parseNumber(r.cost),
        conversions: acc.conversions + parseNumber(r.conversions),
        conversion_value: acc.conversion_value + parseNumber(r.conv_value),
      }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversion_value: 0 });
      $('#dgImpr').value = totals.impressions;
      $('#dgClicks').value = totals.clicks;
      $('#dgCost').value = totals.cost;
      $('#dgConv').value = totals.conversions;
      $('#dgValue').value = totals.conversion_value;
      runDiagnosis();
      toast(`${rows.length}行を集計しました（アフィクリック数は自前計測から手入力）`);
    } catch (err) {
      toast(`読み込みに失敗: ${err.message}`, true);
    }
    e.target.value = '';
  });
}

// ============================================================ セットアップ

function renderSetup() {
  const offer = getOffer($('#setupOfferPicker').value);
  const endpoint = $('#setupEndpoint').value.trim() ||
    (state.settings.apiBase ? `${state.settings.apiBase.replace(/\/$/, '')}/api/v1/tracking/affiliate-click` : '');
  const container = $('#setupSteps');

  if (!offer) {
    container.replaceChildren(el('div', { class: 'card' },
      el('div', { class: 'empty' }, '案件を選ぶと、その案件IDが入ったタグを生成します。')));
    return;
  }

  const steps = [
    {
      title: '1. SLVRbullet パラメータ引き継ぎタグ',
      detail: 'LPの </body> 直前に設置。gclid / wbraid / gbraid をアフィリンクへ引き継ぎます。',
      code: '<script src="https://js.slvrbullet.com/pt.min.js"></script>',
    },
    {
      title: '2. 自前クリック計測タグ',
      detail: 'LP→アフィクリックを自分で数えるためのタグ。SLVRbulletとは別に必要です。',
      code: `<script>
  window.PPC_OS_CONFIG = {
    endpoint: '${endpoint || 'https://your-tool.example/api/v1/tracking/affiliate-click'}',
    offerId: '${offer.id}'
  };
</script>
<script src="/tools/ppc/tracker.js" defer></script>`,
    },
    {
      title: '3. CTAへの目印',
      detail: '計測したいアフィリエイトリンクに data-ppc-affiliate-cta を付けます。値は設置位置名。',
      code: '<a href="..." data-ppc-affiliate-cta="fv_hero">無料査定へ</a>',
    },
    {
      title: '4. Google広告 最終ページURLサフィックス',
      detail: 'アカウント設定 → トラッキング に1回入れるだけ。全クリックにKW等が付与されます。',
      code: 'utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&mt={matchtype}&dev={device}&agp={adgroupid}',
    },
  ];

  container.replaceChildren(...steps.map((s) =>
    el('div', { class: 'card' }, [
      el('h2', {}, s.title),
      el('p', { style: 'margin:0;color:var(--ink-2);font-size:12.5px' }, s.detail),
      el('div', { class: 'codeblock' }, s.code),
      el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'ghost small',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(s.code);
              toast('コピーしました');
            } catch {
              toast('コピーできませんでした。手動で選択してください。', true);
            }
          },
        }, 'コピー'),
      ]),
    ])
  ));

  if (!endpoint) {
    container.prepend(el('div', { class: 'card' }, [
      el('h2', {}, '⚠ 計測エンドポイントが未設定'),
      el('p', { style: 'margin:0;color:var(--ink-2);font-size:12.5px' },
        'クリック計測にはバックエンドが必要です。上の入力欄にURLを入れるか、右上の「ローカル」ボタンからサーバURLを設定してください。'
        + 'バックエンドを立てない場合は、アフィクリック数をGA4などから手入力しても診断は動きます。'),
    ]));
  }
}

function bindSetup() {
  $('#setupOfferPicker').addEventListener('change', renderSetup);
  $('#setupEndpoint').addEventListener('input', renderSetup);
}

// ============================================================ サーバ接続

async function checkConnection() {
  const chip = $('#modeChip');
  const label = $('#modeLabel');
  const base = state.settings.apiBase;
  if (!base) {
    chip.classList.remove('online');
    label.textContent = 'ローカル';
    return;
  }
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, { headers: apiHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    chip.classList.add('online');
    label.textContent = `サーバ接続中 v${body.version}`;
  } catch {
    chip.classList.remove('online');
    label.textContent = 'サーバ未接続';
  }
}

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (state.settings.apiKey) h['X-API-Key'] = state.settings.apiKey;
  return h;
}

function bindModeChip() {
  $('#modeChip').addEventListener('click', () => {
    const base = prompt(
      'バックエンドのURLを入力してください（空にするとローカルのみで動作します）\n例: http://localhost:8000',
      state.settings.apiBase
    );
    if (base === null) return;
    state.settings.apiBase = base.trim();
    if (state.settings.apiBase) {
      const key = prompt('管理APIキー（ADMIN_API_KEY）。未設定なら空のままでOK', state.settings.apiKey);
      state.settings.apiKey = (key || '').trim();
    }
    saveState();
    checkConnection();
    toast(state.settings.apiBase ? 'サーバURLを設定しました' : 'ローカルモードに戻しました');
  });
}

// ============================================================ 起動

function refreshPickers() {
  const options = state.offers.map((o) => `<option value="${o.id}">${o.name || '(名称未設定)'}</option>`).join('');
  for (const [sel, placeholder] of [
    ['#pfOfferPicker', '（手入力）'],
    ['#kwOfferPicker', '（手入力）'],
    ['#dgOfferPicker', '（手入力）'],
    ['#setupOfferPicker', '（案件を選択）'],
  ]) {
    const node = $(sel);
    const current = node.value;
    node.innerHTML = `<option value="">${placeholder}</option>${options}`;
    if (state.offers.some((o) => o.id === current)) node.value = current;
  }
}

const renderers = {
  dashboard: renderDashboard,
  offers: renderOffers,
  preflight: renderPreflight,
  keywords: () => {},
  diagnosis: () => {},
  setup: renderSetup,
};

function init() {
  bindOfferForm();
  bindPreflight();
  bindKeywords();
  bindDiagnosis();
  bindSetup();
  bindModeChip();
  refreshPickers();
  fillOfferForm(null);
  window.addEventListener('hashchange', route);
  route();
  checkConnection();
}

init();
