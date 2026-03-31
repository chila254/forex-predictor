// ========== State ==========
var chart = null;
var currentAsset = 'EURUSD';
var currentModel = 'ensemble';
var currentTimeframe = 'D';
var predictionHistory = [];
var autoRefreshEnabled = false;
var autoRefreshInterval = null;
var currentDataSource = 'unknown';
var currentPrices = {};
var sessionId = localStorage.getItem('fx_sessionId') || (function() {
  var id = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  localStorage.setItem('fx_sessionId', id);
  return id;
})();

var ASSET_NAMES = {
  XAUUSD:'Gold (XAU/USD)', EURUSD:'EUR/USD', GBPUSD:'GBP/USD', USDJPY:'USD/JPY',
  USDCHF:'USD/CHF', AUDUSD:'AUD/USD', USDCAD:'USD/CAD', NZDUSD:'NZD/USD',
  EURGBP:'EUR/GBP', EURJPY:'EUR/JPY'
};

var TV_SYMBOLS = {
  EURUSD:'FX:EURUSD', GBPUSD:'FX:GBPUSD', USDJPY:'FX:USDJPY', USDCHF:'FX:USDCHF',
  AUDUSD:'FX:AUDUSD', USDCAD:'FX:USDCAD', NZDUSD:'FX:NZDUSD', XAUUSD:'OANDA:XAUUSD',
  EURGBP:'FX:EURGBP', EURJPY:'FX:EURJPY'
};

var TV_INTERVALS = { '5M':'5', '15M':'15', '1H':'60', '4H':'240', 'D':'D' };

// ========== Init ==========
document.addEventListener('DOMContentLoaded', function() {
  loadTheme();
  checkNotifState();
  setupEventListeners();
  initTradingView();
  loadInitialData();
  loadPredictionHistory();
  loadAlerts();
  loadNews();
  loadWatchlist();
  loadJournal();
  loadCorrelation();
});

function setupEventListeners() {
  document.getElementById('assetSelect').addEventListener('change', function(e) {
    currentAsset = e.target.value;
    updateAssetName();
    loadInitialData();
    initTradingView();
  });
  document.getElementById('modelSelect').addEventListener('change', function(e) { currentModel = e.target.value; });
  document.getElementById('predictBtn').addEventListener('click', getPrediction);
  document.getElementById('refreshBtn').addEventListener('click', function() { loadInitialData(); loadWatchlist(); });
  document.getElementById('autoRefreshToggle').addEventListener('click', toggleAutoRefresh);
  document.getElementById('addAlertBtn').addEventListener('click', addAlert);
  document.getElementById('refreshNews').addEventListener('click', loadNews);
  document.getElementById('refreshMtfBtn').addEventListener('click', loadMultiTimeframe);
  document.getElementById('refreshCorrBtn').addEventListener('click', loadCorrelation);

  document.querySelectorAll('.tf-btn[data-tf]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tf-btn[data-tf]').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentTimeframe = btn.dataset.tf;
      initTradingView();
    });
  });
}

// ========== Theme ==========
function loadTheme() {
  var saved = localStorage.getItem('fx_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeToggle').innerHTML = '<span class="mi mi-sm">' + (saved === 'dark' ? 'dark_mode' : 'light_mode') + '</span>';
}

function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme') || 'dark';
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('fx_theme', next);
  document.getElementById('themeToggle').innerHTML = '<span class="mi mi-sm">' + (next === 'dark' ? 'dark_mode' : 'light_mode') + '</span>';
  initTradingView();
}

// ========== TradingView Chart (iframe embed) ==========
function initTradingView() {
  var theme = document.documentElement.getAttribute('data-theme') || 'dark';
  var container = document.getElementById('tradingview_chart');
  if (!container) return;

  var symbol = encodeURIComponent(TV_SYMBOLS[currentAsset] || 'FX:EURUSD');
  var interval = TV_INTERVALS[currentTimeframe] || 'D';
  var tvTheme = theme === 'light' ? 'light' : 'dark';

  var url = 'https://s.tradingview.com/widgetembed/?hideideas=1&overrides=&enabled_features=&disabled_features=&locale=en'
    + '#%7B%22symbol%22%3A%22' + symbol + '%22'
    + '%2C%22frameElementId%22%3A%22tradingview_chart%22'
    + '%2C%22interval%22%3A%22' + interval + '%22'
    + '%2C%22theme%22%3A%22' + tvTheme + '%22'
    + '%2C%22style%22%3A%221%22'
    + '%2C%22timezone%22%3A%22Etc%2FUTC%22'
    + '%2C%22withdateranges%22%3A%221%22'
    + '%2C%22hide_side_toolbar%22%3A%220%22'
    + '%2C%22allow_symbol_change%22%3A%220%22'
    + '%2C%22save_image%22%3A%220%22'
    + '%2C%22utm_source%22%3A%22forex-predictor%22'
    + '%2C%22utm_medium%22%3A%22widget_new%22%7D';

  container.innerHTML = '<iframe src="' + url + '" style="width:100%;height:100%;border:none;" allowtransparency="true" allowfullscreen></iframe>';
}

// ========== Notifications ==========
function enableNotifications() {
  if (!('Notification' in window)) {
    showToast('Your browser does not support notifications', 'warning');
    return;
  }
  if (Notification.permission === 'denied') {
    showToast('Notifications were blocked. Go to your browser settings → Site permissions → Notifications → Allow for this site, then refresh.', 'error', 8000);
    return;
  }
  if (Notification.permission === 'granted') {
    showToast('Notifications already enabled!', 'success');
    document.getElementById('notifBtn').innerHTML = '<span class="mi mi-sm">notifications_active</span>';
    return;
  }
  Notification.requestPermission().then(function(perm) {
    if (perm === 'granted') {
      showToast('Notifications enabled!', 'success');
      document.getElementById('notifBtn').innerHTML = '<span class="mi mi-sm">notifications_active</span>';
      playAlertSound();
    } else if (perm === 'denied') {
      showToast('Notifications blocked. You can enable them in browser settings → Site permissions.', 'error', 6000);
    } else {
      showToast('Notification permission dismissed. Click again to retry.', 'warning');
    }
  });
}

function checkNotifState() {
  if ('Notification' in window && Notification.permission === 'granted') {
    document.getElementById('notifBtn').innerHTML = '<span class="mi mi-sm">notifications_active</span>';
  }
}

function playAlertSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 800; gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

function sendBrowserNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: body });
  }
}

// ========== Data Source Badge ==========
function updateDataSourceBadge(source, errorMsg) {
  var badge = document.getElementById('dataSourceBadge');
  var dot = document.getElementById('dataSourceDot');
  var text = document.getElementById('dataSourceText');
  var warning = document.getElementById('mockWarning');
  var errorDetail = document.getElementById('mockErrorDetail');
  currentDataSource = source;
  if (source === 'live') {
    badge.style.background = 'rgba(134,239,172,0.1)'; badge.style.color = '#86efac';
    dot.textContent = 'circle'; text.textContent = 'LIVE DATA';
    warning.classList.remove('visible');
  } else {
    badge.style.background = 'rgba(252,165,165,0.1)'; badge.style.color = '#fca5a5';
    dot.textContent = 'circle'; text.textContent = 'MOCK DATA';
    warning.classList.add('visible');
    if (errorMsg) errorDetail.textContent = '(' + errorMsg + ')';
  }
}

// ========== Loading & Toast ==========
function setLoading(isLoading) {
  var btn = document.getElementById('predictBtn');
  btn.disabled = isLoading;
  btn.innerHTML = isLoading ? '<span class="mi mi-sm">hourglass_empty</span> Loading...' : '<span class="mi mi-sm">auto_awesome</span> Predict';
  btn.style.opacity = isLoading ? '0.7' : '1';
}

function showToast(message, type, duration) {
  type = type || 'info'; duration = duration || 4000;
  var toast = document.createElement('div');
  var colors = { success:'background:rgba(6,78,59,0.5);color:#86efac;', error:'background:rgba(127,29,29,0.5);color:#fca5a5;', warning:'background:rgba(120,53,15,0.5);color:#fcd34d;', info:'background:rgba(12,74,110,0.5);color:#7dd3fc;', alert:'background:rgba(88,28,135,0.5);color:#d8b4fe;' };
  toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:100;padding:12px 20px;border-radius:16px;font-weight:500;font-size:0.875rem;max-width:360px;font-family:Inter,system-ui,sans-serif;backdrop-filter:blur(8px);' + (colors[type] || colors.info);
  toast.style.animation = 'slideIn 0.3s ease-out';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() { toast.style.animation = 'slideOut 0.3s ease-out'; setTimeout(function() { toast.remove(); }, 300); }, duration);
}

// ========== Auto Refresh ==========
function toggleAutoRefresh() {
  var btn = document.getElementById('autoRefreshToggle');
  autoRefreshEnabled = !autoRefreshEnabled;
  if (autoRefreshEnabled) {
    btn.innerHTML = '<span class="mi mi-sm">sync</span> ON'; btn.style.color = '#86efac';
    autoRefreshInterval = setInterval(function() { loadInitialData(true); loadWatchlist(); checkAlerts(); checkPredictionAccuracy(); }, 30000);
    showToast('Auto-refresh enabled (30s)', 'success');
  } else {
    btn.innerHTML = '<span class="mi mi-sm">sync_disabled</span> OFF'; btn.style.color = '';
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    showToast('Auto-refresh disabled', 'info');
  }
}

function updateAssetName() {
  document.getElementById('assetName').textContent = ASSET_NAMES[currentAsset] || currentAsset;
}

// ========== Watchlist ==========
async function loadWatchlist() {
  try {
    var response = await fetch('/api/prices/batch');
    var data = await response.json();
    if (!data.success) return;
    var container = document.getElementById('watchlistGrid');
    var html = '';
    Object.keys(data.prices).forEach(function(sym) {
      var p = data.prices[sym];
      var change = ((p.price - p.close) / p.close * 100);
      var cc = change >= 0 ? '#86efac' : '#fca5a5';
      var cb = change >= 0 ? 'rgba(134,239,172,0.08)' : 'rgba(252,165,165,0.08)';
      currentPrices[sym] = p.price;
      var dp = p.price > 100 ? 2 : (p.price > 10 ? 4 : 5);
      html += '<div class="m3-card" style="padding:14px;cursor:pointer;" onclick="selectWatchlistPair(\'' + sym + '\')">' +
        '<div class="flex justify-between items-center mb-1">' +
        '<span class="md-label-large" style="color:var(--md-on-surface);">' + sym.slice(0,3) + '/' + sym.slice(3) + '</span>' +
        '<span class="md-label-small px-2 py-0.5 rounded" style="background:' + cb + ';color:' + cc + ';">' + (change >= 0 ? '+' : '') + change.toFixed(2) + '%</span>' +
        '</div>' +
        '<div class="md-headline-small" style="color:var(--md-primary);">' + parseFloat(p.price).toFixed(dp) + '</div>' +
        '<div class="md-label-small mt-1" style="color:' + (p.source === 'live' ? '#86efac' : '#fca5a5') + ';"><span class="mi mi-xs">circle</span></div>' +
        '</div>';
    });
    container.innerHTML = html;
  } catch(e) { console.error('Watchlist error:', e); }
}

function selectWatchlistPair(sym) {
  currentAsset = sym;
  document.getElementById('assetSelect').value = sym;
  updateAssetName();
  loadInitialData();
  initTradingView();
}

// ========== Load Price Data ==========
async function loadInitialData(silent) {
  try {
    if (!silent) setLoading(true);
    var response = await fetch('/api/prices/' + currentAsset);
    if (!response.ok) throw new Error('API error: ' + response.status);
    var data = await response.json();
    if (!data.success) { showToast(data.error || 'Failed to load', 'error'); return; }
    updateDataSourceBadge(data.source, data.sourceError);
    updatePriceDisplay(data);
    currentPrices[currentAsset] = data.price;
  } catch (error) {
    console.error('Error:', error);
    if (!silent) showToast('Failed: ' + error.message, 'error');
  } finally {
    if (!silent) setLoading(false);
  }
}

function updatePriceDisplay(data) {
  var dp = data.price > 100 ? 2 : (data.price > 10 ? 4 : 5);
  document.getElementById('currentPrice').textContent = '$' + parseFloat(data.price).toFixed(dp);
  var el = document.getElementById('priceChange');
  var change = ((data.price - data.close) / data.close) * 100;
  el.textContent = (change > 0 ? '+' : '') + change.toFixed(2) + '%';
  el.style.background = change > 0 ? 'rgba(134,239,172,0.15)' : 'rgba(252,165,165,0.15)';
  el.style.color = change > 0 ? '#86efac' : '#fca5a5';
  document.getElementById('dayHigh').textContent = parseFloat(data.high).toFixed(dp);
  document.getElementById('dayLow').textContent = parseFloat(data.low).toFixed(dp);
  document.getElementById('openPrice').textContent = parseFloat(data.open).toFixed(dp);
  document.getElementById('volumeValue').textContent = (data.volume || 0).toLocaleString();
  document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
}

// ========== Prediction ==========
async function getPrediction() {
  setLoading(true);
  try {
    var response = await fetch('/api/predictions/' + currentAsset, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: currentModel, timeframe: currentTimeframe })
    });
    if (!response.ok) throw new Error('API error: ' + response.status);
    var prediction = await response.json();
    if (!prediction.success) { showToast(prediction.error || 'Failed', 'error'); return; }
    if (prediction.dataSource) updateDataSourceBadge(prediction.dataSource, null);
    var tfNames = {'5M':'5 Min','15M':'15 Min','1H':'1 Hour','4H':'4 Hour','D':'Daily'};
    document.getElementById('predTfBadge').textContent = tfNames[currentTimeframe] || 'Daily';
    updateSignalDisplay(prediction);
    updateIndicators(prediction.indicators);
    updatePredictionsTable(prediction.predictions, prediction.currentPrice);
    savePredictionToHistory(prediction);
    loadMultiTimeframe();
    var tt = prediction.signal.action === 'BUY' ? 'success' : prediction.signal.action === 'SELL' ? 'warning' : 'info';
    showToast(prediction.signal.action + ' (' + Math.round(prediction.signal.confidence * 100) + '% confidence)', tt);
  } catch (error) {
    showToast('Prediction failed: ' + error.message, 'error');
  } finally { setLoading(false); }
}

function updateSignalDisplay(prediction) {
  var signal = prediction.signal;
  var confPercent = Math.round(signal.confidence * 100);
  var styles = {
    BUY: { bg:'rgba(134,239,172,0.06)', border:'rgba(134,239,172,0.3)', color:'#86efac' },
    SELL: { bg:'rgba(252,165,165,0.06)', border:'rgba(252,165,165,0.3)', color:'#fca5a5' },
    HOLD: { bg:'rgba(253,224,71,0.06)', border:'rgba(253,224,71,0.3)', color:'#fde047' }
  };
  var s = styles[signal.action] || styles.HOLD;
  var box = document.getElementById('signalBox');
  box.style.background = s.bg; box.style.borderColor = s.border;
  var act = document.getElementById('signalAction');
  act.textContent = signal.action; act.style.color = s.color;
  document.getElementById('confidenceBar').style.width = confPercent + '%';
  document.getElementById('confidenceBar').style.background = s.color;
  document.getElementById('confidencePercent').textContent = confPercent + '%';
  // Show signal reasons
  var reasonsEl = document.getElementById('signalReasons');
  if (reasonsEl && signal.reasons && signal.reasons.length) {
    reasonsEl.innerHTML = signal.reasons.map(function(r) {
      return '<span class="md-label-small px-2 py-0.5 rounded" style="background:var(--md-sch);color:var(--md-on-sv);">' + r + '</span>';
    }).join(' ');
    reasonsEl.style.display = 'flex';
  }
  var summaryEl = document.getElementById('signalSummary');
  if (summaryEl && signal.summary) {
    summaryEl.textContent = signal.summary;
    summaryEl.style.display = 'block';
    summaryEl.style.color = s.color;
  }
  // Margins with pip values
  var dp = signal.margins.entry > 100 ? 2 : 5;
  document.getElementById('entryPrice').textContent = '$' + parseFloat(signal.margins.entry).toFixed(dp);
  var slText = '$' + parseFloat(signal.margins.stop).toFixed(dp);
  var tpText = '$' + parseFloat(signal.margins.target).toFixed(dp);
  if (signal.margins.slPips) slText += ' (' + signal.margins.slPips + ' pips)';
  if (signal.margins.tpPips) tpText += ' (' + signal.margins.tpPips + ' pips)';
  document.getElementById('stopLoss').textContent = slText;
  document.getElementById('takeProfit').textContent = tpText;
  // Risk:Reward
  var rrEl = document.getElementById('riskRewardRatio');
  if (rrEl && signal.margins.riskReward) {
    rrEl.textContent = '1:' + signal.margins.riskReward;
  }
}

function updateIndicators(indicators) {
  var rsiEl = document.getElementById('rsiValue');
  rsiEl.textContent = indicators.rsi.toFixed(2);
  rsiEl.style.color = indicators.rsi > 70 ? '#fca5a5' : indicators.rsi < 30 ? '#86efac' : 'var(--md-primary)';
  document.getElementById('macdValue').textContent = indicators.macd.toFixed(4);
  document.getElementById('bbandsValue').textContent = indicators.bbands.middle.toFixed(2);
  document.getElementById('atrValue').textContent = indicators.atr.toFixed(2);
}

var TF_LABELS = {
  '5M':  ['5 min', '10 min', '15 min', '20 min', '25 min'],
  '15M': ['15 min', '30 min', '45 min', '1 hr', '1h 15m'],
  '1H':  ['1 hr', '2 hrs', '3 hrs', '4 hrs', '5 hrs'],
  '4H':  ['4 hrs', '8 hrs', '12 hrs', '16 hrs', '20 hrs'],
  'D':   ['1 day', '2 days', '3 days', '4 days', '5 days']
};

function updatePredictionsTable(predictions, currentPrice) {
  var dp = currentPrice > 100 ? 2 : 5;
  var tbody = document.getElementById('predictionsTable');
  var labels = TF_LABELS[currentTimeframe] || TF_LABELS['D'];
  var rows = predictions.map(function(price, i) {
    var change = ((price - currentPrice) / currentPrice) * 100;
    var cc = change > 0 ? '#86efac' : '#fca5a5';
    return '<div class="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl" style="border-bottom:1px solid var(--md-outline);">' +
      '<div class="text-sm">' + labels[i] + '</div>' +
      '<div class="text-sm">$' + parseFloat(price).toFixed(dp) + '</div>' +
      '<div class="text-sm font-semibold" style="color:' + cc + ';">' + (change > 0 ? '+' : '') + change.toFixed(2) + '%</div></div>';
  }).join('');
  tbody.innerHTML = rows || '<div class="text-center py-4" style="color:var(--md-on-sv);">No predictions</div>';
}

// ========== Alerts ==========
async function addAlert() {
  var symbol = document.getElementById('alertSymbol').value;
  var condition = document.getElementById('alertCondition').value;
  var targetPrice = document.getElementById('alertPrice').value;
  if (!targetPrice) { showToast('Enter a target price', 'warning'); return; }
  try {
    var response = await fetch('/api/alerts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, symbol: symbol, condition: condition, targetPrice: targetPrice })
    });
    var data = await response.json();
    if (data.success) {
      document.getElementById('alertPrice').value = '';
      showToast('Alert: ' + symbol + ' ' + condition + ' $' + parseFloat(targetPrice).toFixed(2), 'success');
      loadAlerts();
    }
  } catch(e) { showToast('Failed to create alert', 'error'); }
}

async function loadAlerts() {
  try {
    var response = await fetch('/api/alerts?sessionId=' + sessionId);
    var data = await response.json();
    if (data.success) renderAlerts(data.alerts);
  } catch(e) {}
}

function renderAlerts(alerts) {
  var c = document.getElementById('alertsList');
  if (!alerts || !alerts.length) { c.innerHTML = '<p class="md-body-medium text-center py-3" style="color:var(--md-on-sv);">No alerts set</p>'; return; }
  c.innerHTML = alerts.map(function(a) {
    var icon = a.condition === 'above' ? 'trending_up' : 'trending_down';
    var iconColor = a.condition === 'above' ? '#86efac' : '#fca5a5';
    return '<div class="m3-stat-row' + (a.triggered ? ' opacity-50' : '') + '">' +
      '<div class="flex items-center gap-2"><span class="mi mi-sm" style="color:' + iconColor + ';">' + icon + '</span><span class="md-body-medium">' + a.symbol + ' ' + a.condition + ' $' + a.targetPrice.toFixed(2) + '</span>' +
      (a.triggered ? '<span class="mi mi-xs" style="color:#fcd34d;">check_circle</span>' : '') + '</div>' +
      '<button onclick="deleteAlert(\'' + a.id + '\')" style="color:#fca5a5;cursor:pointer;background:none;border:none;"><span class="mi mi-sm">close</span></button></div>';
  }).join('');
}

async function deleteAlert(id) {
  await fetch('/api/alerts/' + id + '?sessionId=' + sessionId, { method: 'DELETE' });
  loadAlerts();
}

async function checkAlerts() {
  try {
    var response = await fetch('/api/alerts/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, prices: currentPrices })
    });
    var data = await response.json();
    if (data.success && data.triggered.length > 0) {
      data.triggered.forEach(function(a) {
        var msg = '🚨 ' + a.symbol + ' ' + a.condition + ' $' + a.targetPrice + ' (now $' + a.currentPrice.toFixed(2) + ')';
        showToast(msg, 'alert', 8000);
        playAlertSound();
        sendBrowserNotification('Price Alert!', msg);
      });
      loadAlerts();
    }
  } catch(e) {}
}

// ========== News ==========
async function loadNews() {
  var c = document.getElementById('newsFeed');
  try {
    var response = await fetch('/api/news');
    var data = await response.json();
    if (data.success && data.news.length > 0) {
      c.innerHTML = data.news.map(function(item) {
        var ic = item.impact === 'High' ? 'news-impact-high' : item.impact === 'Medium' ? 'news-impact-medium' : 'news-impact-low';
        var dotColor = item.impact === 'High' ? '#fca5a5' : item.impact === 'Medium' ? '#fcd34d' : '#86efac';
        var dot = '<span class="mi mi-xs" style="color:' + dotColor + ';">circle</span>';
        return '<div class="m3-stat-row"><div style="flex:1;min-width:0;">' +
          '<div class="flex items-center gap-2" style="margin-bottom:2px;"><span class="text-xs">' + dot + '</span><span class="md-label-medium ' + ic + '">' + (item.impact || 'Low') + '</span><span class="md-label-small" style="color:var(--md-on-sv);">' + (item.country || '') + '</span></div>' +
          '<p class="md-body-medium" style="color:var(--md-on-surface);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + item.title + '</p>' +
          '<div class="flex gap-3" style="margin-top:4px;"><span class="md-label-small" style="color:var(--md-on-sv);">' + (item.date || '') + ' ' + (item.time || '') + '</span>' +
          (item.forecast ? '<span class="md-label-small" style="color:var(--md-on-sv);">F:' + item.forecast + '</span>' : '') +
          (item.previous ? '<span class="md-label-small" style="color:var(--md-on-sv);">P:' + item.previous + '</span>' : '') +
          (item.actual ? '<span class="md-label-small" style="color:var(--md-primary);">A:' + item.actual + '</span>' : '') +
          '</div></div></div>';
      }).join('');
    } else {
      c.innerHTML = '<p class="md-body-medium text-center py-3" style="color:var(--md-on-sv);">No news available</p>';
    }
  } catch(e) { c.innerHTML = '<p class="md-body-medium text-center py-3" style="color:var(--md-tertiary);">Failed to load news</p>'; }
}

// ========== Accuracy Tracker ==========
function updateAccuracy() {
  var valid = predictionHistory.filter(function(p) { return p.actualPrice !== undefined; });
  if (!valid.length) {
    document.getElementById('accuracyPercent').textContent = '--';
    document.getElementById('accuracyBar').style.width = '0%';
    document.getElementById('accuracyCount').textContent = '0';
    return;
  }
  var correct = valid.filter(function(p) {
    return (p.predicted > p.currentPrice) === (p.actualPrice > p.currentPrice);
  }).length;
  var pct = Math.round((correct / valid.length) * 100);
  document.getElementById('accuracyPercent').textContent = pct + '%';
  document.getElementById('accuracyBar').style.width = pct + '%';
  document.getElementById('accuracyBar').style.backgroundColor = pct >= 60 ? '#86efac' : pct >= 40 ? '#fcd34d' : '#fca5a5';
  document.getElementById('accuracyCount').textContent = valid.length + ' tracked';
}

function checkPredictionAccuracy() {
  var updated = false;
  for (var i = 0; i < predictionHistory.length; i++) {
    var p = predictionHistory[i];
    if (p.actualPrice !== undefined) continue;
    if (Date.now() - new Date(p.timestamp).getTime() < 3600000) continue;
    if (currentPrices[p.asset]) {
      predictionHistory[i].actualPrice = currentPrices[p.asset];
      updated = true;
    }
  }
  if (updated) {
    try { localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory)); } catch(e) {}
    updateAccuracy();
  }
}

// ========== Prediction History ==========
function savePredictionToHistory(prediction) {
  predictionHistory.unshift({
    id: Date.now(), timestamp: new Date().toISOString(), asset: currentAsset,
    model: currentModel, signal: prediction.signal.action, confidence: prediction.signal.confidence,
    currentPrice: prediction.currentPrice, predicted: prediction.predictions[0],
    dataSource: prediction.dataSource || currentDataSource
  });
  if (predictionHistory.length > 50) predictionHistory.pop();
  try { localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory)); } catch(e) {}
  updateHistoryDisplay();
}

function loadPredictionHistory() {
  try {
    var stored = localStorage.getItem('predictionHistory');
    if (stored) { predictionHistory = JSON.parse(stored); updateHistoryDisplay(); }
  } catch(e) {}
  updateAccuracy();
  checkPredictionAccuracy();
}

function updateHistoryDisplay() {
  var c = document.getElementById('historyContainer');
  if (!predictionHistory.length) {
    c.innerHTML = '<div class="col-span-full text-center py-8" style="color:var(--md-on-sv);">No predictions yet</div>';
    updateStats(); return;
  }
  c.innerHTML = predictionHistory.slice(0, 12).map(function(entry) {
    var time = new Date(entry.timestamp).toLocaleTimeString();
    var change = ((entry.predicted - entry.currentPrice) / entry.currentPrice * 100).toFixed(2);
    var sb = entry.signal === 'BUY' ? 'rgba(134,239,172,0.2)' : entry.signal === 'SELL' ? 'rgba(252,165,165,0.2)' : 'rgba(253,224,71,0.2)';
    var sc = entry.signal === 'BUY' ? '#86efac' : entry.signal === 'SELL' ? '#fca5a5' : '#fde047';
    var src = entry.dataSource === 'live' ? '<span style="color:#86efac;font-size:0.7rem;">● Live</span>' : '<span style="color:#fca5a5;font-size:0.7rem;">● Mock</span>';
    var acc = '';
    if (entry.actualPrice !== undefined) {
      var correct = (entry.predicted > entry.currentPrice) === (entry.actualPrice > entry.currentPrice);
      acc = '<div class="flex justify-between"><span style="color:var(--md-on-sv);">Result:</span><span style="color:' + (correct ? '#86efac' : '#fca5a5') + ';">' + (correct ? '✓ Correct' : '✗ Wrong') + '</span></div>';
    }
    return '<div class="rounded-2xl p-4" style="border:1px solid ' + sb + ';background:var(--md-sc);">' +
      '<div class="flex justify-between items-start mb-2"><span style="font-weight:700;color:' + sc + ';">' + entry.signal + '</span><div style="text-align:right;"><div style="font-size:0.7rem;color:var(--md-on-sv);">' + time + '</div>' + src + '</div></div>' +
      '<div style="font-size:0.7rem;color:var(--md-on-sv);margin-bottom:6px;">' + entry.asset + ' · ' + entry.model + '</div>' +
      '<div style="font-size:0.75rem;">' +
      '<div class="flex justify-between"><span style="color:var(--md-on-sv);">Price:</span><span>$' + entry.currentPrice.toFixed(2) + '</span></div>' +
      '<div class="flex justify-between"><span style="color:var(--md-on-sv);">Predicted:</span><span>$' + entry.predicted.toFixed(2) + '</span></div>' +
      '<div class="flex justify-between"><span style="color:var(--md-on-sv);">Change:</span><span style="font-weight:600;color:' + (change > 0 ? '#86efac' : '#fca5a5') + ';">' + (change > 0 ? '+' : '') + change + '%</span></div>' +
      acc + '</div></div>';
  }).join('');
  updateStats();
  updateAccuracy();
}

function updateStats() {
  document.getElementById('totalPredictions').textContent = predictionHistory.length;
  document.getElementById('buyCount').textContent = predictionHistory.filter(function(p) { return p.signal === 'BUY'; }).length;
  document.getElementById('sellCount').textContent = predictionHistory.filter(function(p) { return p.signal === 'SELL'; }).length;
  document.getElementById('holdCount').textContent = predictionHistory.filter(function(p) { return p.signal === 'HOLD'; }).length;
}

function clearHistory() {
  if (confirm('Delete all prediction history?')) {
    predictionHistory = [];
    localStorage.removeItem('predictionHistory');
    updateHistoryDisplay();
    showToast('History cleared', 'info');
  }
}

// ========== Multi-Timeframe Analysis ==========
async function loadMultiTimeframe() {
  try {
    var response = await fetch('/api/analysis/multi-timeframe/' + currentAsset);
    var data = await response.json();
    if (!data.success) return;
    var grid = document.getElementById('mtfGrid');
    var tfs = data.timeframes;
    var html = '';
    var keys = ['short', 'medium', 'long', 'daily'];
    keys.forEach(function(key) {
      var tf = tfs[key];
      var sc = tf.signal === 'BUY' ? '#86efac' : tf.signal === 'SELL' ? '#fca5a5' : '#fde047';
      var confPct = Math.round(tf.confidence * 100);
      html += '<div class="m3-indicator-card">' +
        '<p class="md-label-medium mb-1" style="color:var(--md-on-sv);">' + tf.label + '</p>' +
        '<div class="text-xl font-bold mb-1" style="color:' + sc + ';">' + tf.signal + '</div>' +
        '<div class="m3-progress-track mb-1" style="height:4px;"><div class="m3-progress-fill" style="width:' + confPct + '%;background:' + sc + ';height:100%;"></div></div>' +
        '<p class="md-label-small" style="color:var(--md-on-sv);">' + confPct + '% · RSI ' + tf.rsi.toFixed(1) + '</p>' +
        '</div>';
    });
    grid.innerHTML = html;
    var cc = data.consensus === 'BUY' ? '#86efac' : data.consensus === 'SELL' ? '#fca5a5' : '#fde047';
    document.getElementById('mtfConsensus').innerHTML = '<span style="color:' + cc + ';">' + data.consensus + '</span>';
    document.getElementById('mtfAgreement').textContent = data.agreement + '% agreement';
  } catch(e) { console.error('MTF error:', e); }
}

// ========== Correlation Matrix ==========
async function loadCorrelation() {
  try {
    var response = await fetch('/api/analysis/correlation');
    var data = await response.json();
    if (!data.success) return;
    var pairs = data.pairs;
    var matrix = data.matrix;
    var html = '<table style="width:100%;border-collapse:collapse;font-size:0.75rem;">';
    html += '<tr><th style="padding:6px;"></th>';
    pairs.forEach(function(p) {
      html += '<th style="padding:6px;color:var(--md-on-sv);font-weight:500;">' + p.slice(0,3) + '<br>' + p.slice(3) + '</th>';
    });
    html += '</tr>';
    for (var i = 0; i < pairs.length; i++) {
      html += '<tr><td style="padding:6px;font-weight:600;color:var(--md-on-surface);">' + pairs[i].slice(0,3) + '/' + pairs[i].slice(3) + '</td>';
      for (var j = 0; j < pairs.length; j++) {
        var val = matrix[i][j];
        var color = val > 0.5 ? '#86efac' : val < -0.5 ? '#fca5a5' : val > 0.2 ? 'rgba(134,239,172,0.5)' : val < -0.2 ? 'rgba(252,165,165,0.5)' : 'var(--md-on-sv)';
        var bg = i === j ? 'var(--md-sch)' : 'transparent';
        html += '<td style="padding:6px;text-align:center;color:' + color + ';background:' + bg + ';border-radius:4px;font-weight:' + (Math.abs(val) > 0.7 ? '700' : '400') + ';">' + (i === j ? '1.00' : val.toFixed(2)) + '</td>';
      }
      html += '</tr>';
    }
    html += '</table>';
    document.getElementById('corrMatrix').innerHTML = html;
  } catch(e) { console.error('Correlation error:', e); }
}

// ========== Risk Calculator ==========
function calculateRisk() {
  var balance = parseFloat(document.getElementById('riskBalance').value) || 10000;
  var riskPct = parseFloat(document.getElementById('riskPercent').value) || 2;
  var stopPips = parseFloat(document.getElementById('riskStopPips').value) || 30;
  var pair = document.getElementById('riskPair').value;

  var riskAmount = balance * (riskPct / 100);
  // Pip value depends on pair - for most USD pairs, 1 standard lot = $10/pip
  // For JPY pairs, pip value is different
  var pipValue = 10; // $ per pip per standard lot
  if (pair === 'USDJPY' || pair === 'EURJPY') pipValue = 100 / 150; // approximate for JPY pairs
  if (pair === 'XAUUSD') pipValue = 1; // Gold: 1 pip = $0.01, lot = 100oz, so $1/pip

  var lots = riskAmount / (stopPips * pipValue);
  var units = Math.round(lots * 100000);
  var reward = riskAmount * 2; // 1:2 risk reward

  document.getElementById('riskResults').style.display = 'block';
  document.getElementById('riskAmount').textContent = '$' + riskAmount.toFixed(2);
  document.getElementById('riskLots').textContent = lots.toFixed(2) + ' lots';
  document.getElementById('riskUnits').textContent = units.toLocaleString();
  document.getElementById('riskReward').textContent = '$' + reward.toFixed(2);
  showToast('Risk calculated: ' + lots.toFixed(2) + ' lots', 'success');
}

// ========== Trade Journal ==========
var tradeJournal = [];

function loadJournal() {
  try {
    var stored = localStorage.getItem('tradeJournal');
    if (stored) { tradeJournal = JSON.parse(stored); renderJournal(); }
  } catch(e) {}
}

function addJournalEntry() {
  var pair = document.getElementById('journalPair').value;
  var action = document.getElementById('journalAction').value;
  var entry = parseFloat(document.getElementById('journalEntry').value);
  var exit = parseFloat(document.getElementById('journalExit').value);
  var lots = parseFloat(document.getElementById('journalLots').value) || 0.1;
  var notes = document.getElementById('journalNotes').value;

  if (!entry || !exit) { showToast('Enter both entry and exit prices', 'warning'); return; }

  var pipDiff;
  if (pair === 'USDJPY' || pair === 'EURJPY') {
    pipDiff = (exit - entry) * 100;
  } else if (pair === 'XAUUSD') {
    pipDiff = (exit - entry) * 10;
  } else {
    pipDiff = (exit - entry) * 10000;
  }
  if (action === 'SELL') pipDiff = -pipDiff;

  var pipValue = 10;
  if (pair === 'USDJPY' || pair === 'EURJPY') pipValue = 100 / 150;
  if (pair === 'XAUUSD') pipValue = 1;

  var pnl = pipDiff * lots * pipValue;

  tradeJournal.unshift({
    id: Date.now(),
    date: new Date().toISOString(),
    pair: pair,
    action: action,
    entry: entry,
    exit: exit,
    lots: lots,
    pips: pipDiff,
    pnl: pnl,
    notes: notes
  });

  try { localStorage.setItem('tradeJournal', JSON.stringify(tradeJournal)); } catch(e) {}
  document.getElementById('journalEntry').value = '';
  document.getElementById('journalExit').value = '';
  document.getElementById('journalNotes').value = '';
  showToast((pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2) + ' (' + pipDiff.toFixed(1) + ' pips)', pnl >= 0 ? 'success' : 'error');
  renderJournal();
}

function renderJournal() {
  var list = document.getElementById('journalList');
  var stats = document.getElementById('journalStats');
  if (!tradeJournal.length) {
    list.innerHTML = '<p class="md-body-medium text-center py-3" style="color:var(--md-on-sv);">No trades logged</p>';
    stats.style.display = 'none';
    return;
  }
  stats.style.display = 'grid';
  var totalPnl = tradeJournal.reduce(function(s, t) { return s + t.pnl; }, 0);
  var wins = tradeJournal.filter(function(t) { return t.pnl > 0; }).length;
  var winRate = Math.round((wins / tradeJournal.length) * 100);
  document.getElementById('journalPnl').textContent = (totalPnl >= 0 ? '+$' : '-$') + Math.abs(totalPnl).toFixed(2);
  document.getElementById('journalPnl').style.color = totalPnl >= 0 ? '#86efac' : '#fca5a5';
  document.getElementById('journalWinRate').textContent = winRate + '%';
  document.getElementById('journalWinRate').style.color = winRate >= 50 ? '#86efac' : '#fca5a5';
  document.getElementById('journalCount').textContent = tradeJournal.length;

  list.innerHTML = tradeJournal.slice(0, 20).map(function(t) {
    var d = new Date(t.date);
    var dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    var ac = t.action === 'BUY' ? '#86efac' : '#fca5a5';
    var pc = t.pnl >= 0 ? '#86efac' : '#fca5a5';
    return '<div class="m3-stat-row" style="flex-wrap:wrap;gap:4px;">' +
      '<div class="flex items-center gap-2" style="flex:1;min-width:120px;">' +
      '<span class="md-label-medium" style="color:' + ac + ';">' + t.action + '</span>' +
      '<span class="md-body-medium">' + t.pair + '</span>' +
      '</div>' +
      '<div style="text-align:right;">' +
      '<span class="md-label-large" style="color:' + pc + ';">' + (t.pnl >= 0 ? '+' : '') + '$' + t.pnl.toFixed(2) + '</span>' +
      '<span class="md-label-small block" style="color:var(--md-on-sv);">' + t.pips.toFixed(1) + ' pips · ' + dateStr + '</span>' +
      '</div>' +
      '<button onclick="deleteJournalEntry(' + t.id + ')" style="color:#fca5a5;cursor:pointer;background:none;border:none;"><span class="mi mi-xs">close</span></button>' +
      '</div>';
  }).join('');
}

function deleteJournalEntry(id) {
  tradeJournal = tradeJournal.filter(function(t) { return t.id !== id; });
  try { localStorage.setItem('tradeJournal', JSON.stringify(tradeJournal)); } catch(e) {}
  renderJournal();
}

function clearJournal() {
  if (confirm('Delete all trade journal entries?')) {
    tradeJournal = [];
    localStorage.removeItem('tradeJournal');
    renderJournal();
    showToast('Journal cleared', 'info');
  }
}
