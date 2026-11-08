// DOM smoke test: load the real index.html + dashboard.js under jsdom with a
// mocked fetch, and assert the dashboard renders key sections without throwing.
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (e) {
  console.log('dom.smoke: skipped (jsdom not installed)');
  process.exit(0);
}
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');

const html = fs.readFileSync(path.join(__dirname, '../frontend/public/index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../frontend/public/dashboard.js'), 'utf8');

const PRICES = {
  success: true, source: 'live',
  symbol: 'EURUSD', price: 1.1137, high: 1.12, low: 1.10, open: 1.11, close: 1.1095, volume: 0
};

function jsonResponse(obj) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
}

const fetchMock = (url) => {
  if (url.includes('/api/prices/batch')) {
    return jsonResponse({ success: true, prices: { EURUSD: PRICES, XAUUSD: { ...PRICES, symbol: 'XAUUSD', price: 2400, close: 2390 } } });
  }
  if (url.includes('/api/prices/') && url.includes('/history')) {
    return jsonResponse({ success: true, data: Array.from({ length: 60 }, (_, i) => ({ close: 1.1 + i * 0.0001 })) });
  }
  if (url.includes('/api/prices/')) return jsonResponse(PRICES);
  if (url.includes('/api/predictions/')) {
    return jsonResponse({
      success: true, symbol: 'EURUSD', dataSource: 'live', actualTimeframe: 'D', currentPrice: 1.1137,
      predictions: [1.114, 1.1143, 1.1146, 1.1149, 1.1152],
      regime: { regime: 'RANGING' },
      indicators: { rsi: 41.9, macd: 0.0013, bbands: { upper: 1.12, middle: 1.119, lower: 1.112 }, atr: 0.0044, adx: 26, stochastic: 25.5, emaTrend: 'BEAR' },
      signal: { action: 'HOLD', confidence: 0.4, summary: 'Hold', reasons: ['MACD bullish', 'Near support $1.11300'], margins: { entry: 1.1137, stop: 1.1083, target: 1.1203, slPips: 53, tpPips: 66, riskReward: 1.25 } }
    });
  }
  if (url.includes('/api/analysis/multi-timeframe/')) {
    return jsonResponse({ success: true, consensus: 'HOLD', agreement: 50, timeframes: {
      daily: { label: 'Daily', signal: 'HOLD', confidence: 0.4, rsi: 41 },
      h4: { label: '4H', signal: 'BUY', confidence: 0.5, rsi: 55 },
      h1: { label: '1H', signal: 'HOLD', confidence: 0.3, rsi: 48 },
      m15: { label: '15M', signal: 'SELL', confidence: 0.45, rsi: 60 }
    }});
  }
  if (url.includes('/api/analysis/correlation')) {
    const pairs = ['EURUSD', 'GBPUSD', 'USDJPY'];
    const matrix = [[1, 0.6, -0.3], [0.6, 1, -0.2], [-0.3, -0.2, 1]];
    return jsonResponse({ success: true, pairs, matrix });
  }
  if (url.includes('/api/news')) {
    return jsonResponse({ success: true, news: [{ title: '<img src=x onerror=alert(1)>NFP', impact: 'High', country: 'US', date: '2026-11-08' }] });
  }
  if (url.includes('/api/alerts')) return jsonResponse({ success: true, alerts: [] });
  return jsonResponse({ success: true });
};

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
window.fetch = fetchMock;
window.confirm = () => false;
window.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// No THREE global -> the dashboard must still work (init3D guards on THREE_OK).

// Prevent the CDN <script integrity> from blocking; we never load it anyway.
try {
  window.eval(js);
} catch (e) {
  console.error('dashboard.js threw during eval:', e);
  process.exit(1);
}

window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

function tick(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  await tick(120);
  const $ = id => window.document.getElementById(id);

  assert.strictEqual($('currentPrice').textContent, '$1.11370', 'price rendered');
  assert.ok($('dataSourceText').textContent.includes('LIVE'), 'live badge');
  assert.ok($('watchlistGrid').children.length >= 1, 'watchlist rendered');
  assert.ok($('alertsList').innerHTML.length > 0, 'alerts rendered');
  assert.ok($('corrMatrix').innerHTML.includes('EUR'), 'correlation table rendered');

  // News must be escaped, not inject markup
  const newsHtml = $('newsFeed').innerHTML;
  assert.ok(!newsHtml.includes('<img'), 'news markup escaped');
  assert.ok(newsHtml.includes('&lt;img'), 'news shows escaped text');

  // Trigger a prediction
  await window.getPrediction();
  await tick(80);
  assert.ok($('signalAction').textContent.includes('HOLD'), 'signal rendered');
  assert.ok($('entryPrice').textContent.startsWith('$'), 'entry price rendered');
  assert.ok($('predictionsTable').children.length === 5, '5 forecast rows');
  assert.ok($('heroSignal').textContent === 'HOLD', 'hero signal updated');

  // 3D init must be skipped gracefully without THREE
  assert.ok(window.THREE_OK === false, 'THREE_OK false without lib');
  assert.strictEqual(window.scenes.hero, undefined, 'no hero scene without THREE');

  console.log('DOM smoke test PASSED');
})();
