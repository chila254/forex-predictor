// ========== State ==========
var currentAsset = 'EURUSD';
var currentModel = 'ensemble';
var currentTimeframe = 'D';
var predictionHistory = [];
var autoRefreshEnabled = false;
var autoRefreshInterval = null;
var currentDataSource = 'unknown';
var currentPrices = {};
var lastPrediction = null;
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

var COLORS = { up:'#34e59b', down:'#ff6b81', warn:'#ffd166', accent:'#5b8cff', accent2:'#22d3ee', dim:'#8b9ab8' };

// Escape untrusted strings (news titles, notes, provider fields) before
// interpolating into innerHTML.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ========== Init ==========
document.addEventListener('DOMContentLoaded', function() {
  loadTheme();
  checkNotifState();
  setupEventListeners();
  init3D();
  loadInitialData();
  loadPredictionHistory();
  loadAlerts();
  loadNews();
  loadWatchlist();
  loadJournal();
  loadCorrelation();
  loadHistoryChart();
});

function setupEventListeners() {
  document.getElementById('assetSelect').addEventListener('change', function(e) {
    currentAsset = e.target.value;
    updateAssetName();
    loadInitialData();
    loadHistoryChart();
  });
  document.getElementById('modelSelect').addEventListener('change', function(e) { currentModel = e.target.value; });
  document.getElementById('predictBtn').addEventListener('click', getPrediction);
  document.getElementById('refreshBtn').addEventListener('click', function() { loadInitialData(); loadWatchlist(); });
  document.getElementById('autoRefreshToggle').addEventListener('click', toggleAutoRefresh);
  document.getElementById('addAlertBtn').addEventListener('click', addAlert);
  document.getElementById('refreshNews').addEventListener('click', loadNews);
  document.getElementById('refreshMtfBtn').addEventListener('click', loadMultiTimeframe);
  document.getElementById('refreshCorrBtn').addEventListener('click', loadCorrelation);
  var btBtn = document.getElementById('refreshBacktestBtn');
  if (btBtn) btBtn.addEventListener('click', function() { loadBacktest(true); });

  document.querySelectorAll('.tf-btn[data-tf]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tf-btn[data-tf]').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentTimeframe = btn.dataset.tf;
      loadHistoryChart();
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
  // Rebuild 3D with new palette
  setTimeout(function() { rebuild3DColors(); }, 60);
}

// ========== Notifications ==========
function enableNotifications() {
  if (!('Notification' in window)) { showToast('Notifications unsupported in this browser', 'warning'); return; }
  if (Notification.permission === 'denied') {
    showToast('Notifications blocked. Enable in browser settings → site permissions → notifications.', 'error', 8000);
    return;
  }
  if (Notification.permission === 'granted') {
    showToast('Notifications already enabled', 'success');
    document.getElementById('notifBtn').innerHTML = '<span class="mi mi-sm">notifications_active</span>';
    return;
  }
  Notification.requestPermission().then(function(perm) {
    if (perm === 'granted') {
      showToast('Notifications enabled', 'success');
      document.getElementById('notifBtn').innerHTML = '<span class="mi mi-sm">notifications_active</span>';
      playAlertSound();
    } else if (perm === 'denied') {
      showToast('Notifications blocked', 'error', 6000);
    } else {
      showToast('Notification permission dismissed', 'warning');
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
    dot.classList.remove('off');
    text.textContent = 'LIVE DATA';
    warning.classList.remove('visible');
  } else {
    dot.classList.add('off');
    text.textContent = 'OFFLINE';
    warning.classList.add('visible');
    if (errorMsg) errorDetail.textContent = errorMsg;
  }
}

// ========== Loading & Toast ==========
function setLoading(isLoading) {
  var btn = document.getElementById('predictBtn');
  btn.disabled = isLoading;
  btn.innerHTML = isLoading ? '<span class="mi mi-sm">hourglass_empty</span> Loading…' : '<span class="mi mi-sm">auto_awesome</span> Predict';
}

function showToast(message, type, duration) {
  type = type || 'info'; duration = duration || 4000;
  var stack = document.getElementById('toastStack');
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(function() { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(function() { toast.remove(); }, 300); }, duration);
}

// ========== Auto Refresh ==========
function toggleAutoRefresh() {
  var label = document.getElementById('autoRefreshLabel');
  autoRefreshEnabled = !autoRefreshEnabled;
  if (autoRefreshEnabled) {
    label.textContent = 'ON';
    label.style.color = COLORS.up;
    autoRefreshInterval = setInterval(function() { loadInitialData(true); loadWatchlist(); checkAlerts(); checkPredictionAccuracy(); }, 30000);
    showToast('Auto-refresh enabled (30s)', 'success');
  } else {
    label.textContent = 'OFF';
    label.style.color = '';
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    showToast('Auto-refresh disabled', 'info');
  }
}

function updateAssetName() {
  document.getElementById('assetName').textContent = ASSET_NAMES[currentAsset] || currentAsset;
}

function fmtPrice(p) {
  var dp = p > 100 ? 2 : (p > 10 ? 4 : 5);
  return parseFloat(p).toFixed(dp);
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
      var cc = change >= 0 ? COLORS.up : COLORS.down;
      var cb = change >= 0 ? 'rgba(52,229,155,0.12)' : 'rgba(255,107,129,0.12)';
      currentPrices[sym] = p.price;
      html += '<div class="watch-chip" onclick="selectWatchlistPair(\'' + sym + '\')">' +
        '<div class="wc-top"><span class="wc-sym">' + sym.slice(0,3) + '/' + sym.slice(3) + '</span>' +
        '<span class="wc-chg" style="color:' + cc + ';background:' + cb + '">' + (change >= 0 ? '+' : '') + change.toFixed(2) + '%</span></div>' +
        '<div class="wc-price" style="color:' + (change >= 0 ? COLORS.up : COLORS.down) + '">' + fmtPrice(p.price) + '</div>' +
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
  loadHistoryChart();
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
    document.getElementById('heroPrice').textContent = '$' + fmtPrice(data.price);
    document.getElementById('heroPriceLabel').textContent = ASSET_NAMES[currentAsset] || currentAsset;
  } catch (error) {
    console.error('Error:', error);
    if (!silent) showToast('Failed: ' + error.message, 'error');
  } finally {
    if (!silent) setLoading(false);
  }
}

function updatePriceDisplay(data) {
  document.getElementById('currentPrice').textContent = '$' + fmtPrice(data.price);
  var el = document.getElementById('priceChange');
  var change = ((data.price - data.close) / data.close) * 100;
  el.textContent = (change > 0 ? '▲ ' : change < 0 ? '▼ ' : '') + change.toFixed(2) + '%';
  el.className = 'chg-badge ' + (change >= 0 ? 'chg-up' : 'chg-down');
  document.getElementById('dayHigh').textContent = fmtPrice(data.high);
  document.getElementById('dayLow').textContent = fmtPrice(data.low);
  document.getElementById('openPrice').textContent = fmtPrice(data.open);
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
    lastPrediction = prediction;

    var tfNames = {'5M':'5 Min','15M':'15 Min','1H':'1 Hour','4H':'4 Hour','D':'Daily'};
    var actualTf = prediction.actualTimeframe || currentTimeframe;
    var tfLabel = tfNames[actualTf] || tfNames[currentTimeframe] || 'Daily';
    var badge = document.getElementById('predTfBadge');
    badge.textContent = tfLabel;
    if (actualTf !== currentTimeframe) {
      badge.textContent = tfLabel + ' (fallback)';
      badge.style.background = 'rgba(255,107,129,0.16)';
      badge.style.color = COLORS.down;
    } else {
      badge.style.background = 'rgba(91,140,255,0.16)';
      badge.style.color = COLORS.accent;
    }
    if (prediction.warnings && prediction.warnings.length > 0) {
      showToast('⚠ ' + prediction.warnings[0], 'warning', 6000);
    }
    updateSignalDisplay(prediction);
    updateIndicators(prediction.indicators);
    updatePredictionsTable(prediction.predictions, prediction.currentPrice);
    updateHeroMetrics(prediction);
    update3DPriceChart(prediction);
    update3DGauges(prediction.indicators);
    savePredictionToHistory(prediction);
    loadMultiTimeframe();
    loadBacktest();
    var tt = prediction.signal.action === 'BUY' ? 'success' : prediction.signal.action === 'SELL' ? 'error' : 'info';
    showToast(prediction.signal.action + ' · ' + Math.round(prediction.signal.confidence * 100) + '% confidence', tt);
  } catch (error) {
    showToast('Prediction failed: ' + error.message, 'error');
  } finally { setLoading(false); }
}

function updateHeroMetrics(p) {
  var c = p.signal.action === 'BUY' ? COLORS.up : p.signal.action === 'SELL' ? COLORS.down : COLORS.warn;
  document.getElementById('heroSignal').textContent = p.signal.action;
  document.getElementById('heroSignal').style.color = c;
  document.getElementById('heroConf').textContent = Math.round(p.signal.confidence * 100) + '%';
  var rn = { TRENDING_UP:'Uptrend', TRENDING_DOWN:'Downtrend', RANGING:'Ranging' };
  document.getElementById('heroRegime').textContent = rn[p.regime.regime] || p.regime.regime;
}

function updateSignalDisplay(prediction) {
  var signal = prediction.signal;
  var confPercent = Math.round(signal.confidence * 100);
  var styles = {
    BUY: { bg:'rgba(52,229,155,0.06)', border:'rgba(52,229,155,0.35)', color:COLORS.up },
    SELL: { bg:'rgba(255,107,129,0.06)', border:'rgba(255,107,129,0.35)', color:COLORS.down },
    HOLD: { bg:'rgba(255,209,102,0.06)', border:'rgba(255,209,102,0.35)', color:COLORS.warn }
  };
  var s = styles[signal.action] || styles.HOLD;
  var regimeLabel = '';
  if (prediction.regime && prediction.regime.regime) {
    var regimeColors = { TRENDING_UP: COLORS.up, TRENDING_DOWN: COLORS.down, RANGING: COLORS.warn };
    var regimeNames = { TRENDING_UP: '↑ Uptrend', TRENDING_DOWN: '↓ Downtrend', RANGING: '↔ Ranging' };
    regimeLabel = '<div style="display:inline-block;font-size:0.68rem;padding:3px 10px;border-radius:8px;margin-bottom:10px;background:rgba(255,255,255,0.06);color:' + (regimeColors[prediction.regime.regime] || COLORS.dim) + '">' + (regimeNames[prediction.regime.regime] || prediction.regime.regime) + '</div>';
  }
  var box = document.getElementById('signalBox');
  box.style.background = s.bg; box.style.borderColor = s.border;
  var act = document.getElementById('signalAction');
  act.innerHTML = regimeLabel + '<div>' + signal.action + '</div>'; act.style.color = s.color;
  var bar = document.getElementById('confidenceBar');
  bar.style.width = confPercent + '%'; bar.style.background = s.color;
  var pctEl = document.getElementById('confidencePercent');
  var srcBadge = signal.confidenceSource === 'empirical'
    ? '<span class="conf-src" title="Win-rate from the backtest calibration (' + (signal.confidenceSamples || 0) + ' samples)">empirical</span>'
    : '<span class="conf-src" style="background:rgba(255,255,255,0.06);color:var(--text-faint)" title="Arithmetic estimate, not a calibrated probability">formula</span>';
  pctEl.innerHTML = confPercent + '% ' + srcBadge;

  var reasonsEl = document.getElementById('signalReasons');
  if (reasonsEl && signal.reasons && signal.reasons.length) {
    reasonsEl.innerHTML = signal.reasons.map(function(r) { return '<span class="reason-chip">' + esc(r) + '</span>'; }).join(' ');
    reasonsEl.style.display = 'flex';
  }
  var summaryEl = document.getElementById('signalSummary');
  if (summaryEl && signal.summary) {
    summaryEl.textContent = signal.summary;
    summaryEl.style.display = 'block';
  }

  var dp = signal.margins.entry > 100 ? 2 : 5;
  document.getElementById('entryPrice').textContent = '$' + parseFloat(signal.margins.entry).toFixed(dp);
  var slText = '$' + parseFloat(signal.margins.stop).toFixed(dp);
  var tpText = '$' + parseFloat(signal.margins.target).toFixed(dp);
  if (signal.margins.slPips) slText += ' · ' + signal.margins.slPips + ' pips';
  if (signal.margins.tpPips) tpText += ' · ' + signal.margins.tpPips + ' pips';
  document.getElementById('stopLoss').textContent = slText;
  document.getElementById('takeProfit').textContent = tpText;
  var rrEl = document.getElementById('riskRewardRatio');
  if (rrEl && signal.margins.riskReward) rrEl.textContent = '1 : ' + signal.margins.riskReward;
}

function updateIndicators(indicators) {
  var rsiEl = document.getElementById('rsiValue');
  rsiEl.textContent = indicators.rsi.toFixed(1);
  rsiEl.style.color = indicators.rsi > 70 ? COLORS.down : indicators.rsi < 30 ? COLORS.up : COLORS.accent;
  document.getElementById('macdValue').textContent = indicators.macd.toFixed(4);
  document.getElementById('bbandsValue').textContent = indicators.bbands.middle.toFixed(2);
  document.getElementById('atrValue').textContent = indicators.atr.toFixed(4);
  var adxEl = document.getElementById('adxValue');
  if (adxEl && indicators.adx !== undefined) {
    adxEl.textContent = indicators.adx.toFixed(1);
    adxEl.style.color = indicators.adx > 25 ? COLORS.up : indicators.adx < 15 ? COLORS.down : COLORS.accent;
  }
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
  var labels = TF_LABELS[currentTimeframe] || TF_LABELS['D'];
  var rows = predictions.map(function(price, i) {
    var change = ((price - currentPrice) / currentPrice) * 100;
    var cc = change > 0 ? COLORS.up : change < 0 ? COLORS.down : COLORS.dim;
    return '<div class="pred-row"><span class="dim">' + labels[i] + '</span>' +
      '<span>$' + parseFloat(price).toFixed(dp) + '</span>' +
      '<span style="font-weight:700;color:' + cc + '">' + (change > 0 ? '+' : '') + change.toFixed(2) + '%</span></div>';
  }).join('');
  document.getElementById('predictionsTable').innerHTML = rows || '<div class="center dim" style="padding:20px 0">No predictions</div>';
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
      showToast('Alert set: ' + symbol + ' ' + condition + ' ' + fmtPrice(targetPrice), 'success');
      loadAlerts();
    } else { showToast(data.error || 'Failed to create alert', 'error'); }
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
  if (!alerts || !alerts.length) { c.innerHTML = '<p class="center dim" style="padding:12px 0;font-size:0.8rem">No alerts set</p>'; return; }
  c.innerHTML = alerts.map(function(a) {
    var icon = a.condition === 'above' ? 'trending_up' : 'trending_down';
    var iconColor = a.condition === 'above' ? COLORS.up : COLORS.down;
    return '<div class="row" style="' + (a.triggered ? 'opacity:0.5' : '') + '">' +
      '<div class="flex items-c gap-2"><span class="mi mi-sm" style="color:' + iconColor + '">' + icon + '</span>' +
      '<span style="font-size:0.82rem">' + esc(a.symbol) + ' ' + esc(a.condition) + ' ' + fmtPrice(a.targetPrice) + '</span>' +
      (a.triggered ? '<span class="mi mi-xs warn">check_circle</span>' : '') + '</div>' +
      '<button onclick="deleteAlert(\'' + a.id + '\')" style="color:var(--down);cursor:pointer;background:none;border:none"><span class="mi mi-sm">close</span></button></div>';
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
      body: JSON.stringify({ sessionId: sessionId })
    });
    var data = await response.json();
    if (data.success && data.triggered.length > 0) {
      data.triggered.forEach(function(a) {
        var msg = a.symbol + ' ' + a.condition + ' ' + fmtPrice(a.targetPrice) + ' (now ' + fmtPrice(a.currentPrice) + ')';
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
        var dotColor = item.impact === 'High' ? COLORS.down : item.impact === 'Medium' ? COLORS.warn : COLORS.up;
        return '<div class="row"><div style="flex:1;min-width:0">' +
          '<div class="flex items-c gap-2" style="margin-bottom:3px">' +
          '<span class="mi mi-xs" style="color:' + dotColor + '">circle</span>' +
          '<span style="font-size:0.68rem;font-weight:700;color:' + dotColor + '">' + esc(item.impact || 'Low') + '</span>' +
          '<span class="dim" style="font-size:0.66rem">' + esc(item.country || '') + '</span></div>' +
          '<p style="font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(item.title) + '</p>' +
          '<div class="flex gap-3" style="margin-top:3px">' +
          '<span class="dim" style="font-size:0.64rem">' + esc((item.date || '') + ' ' + (item.time || '')) + '</span>' +
          (item.forecast ? '<span class="dim" style="font-size:0.64rem">F: ' + esc(item.forecast) + '</span>' : '') +
          (item.previous ? '<span class="dim" style="font-size:0.64rem">P: ' + esc(item.previous) + '</span>' : '') +
          (item.actual ? '<span style="font-size:0.64rem;color:var(--accent)">A: ' + esc(item.actual) + '</span>' : '') +
          '</div></div></div>';
      }).join('');
    } else {
      c.innerHTML = '<p class="center dim" style="padding:12px 0;font-size:0.8rem">No news available</p>';
    }
  } catch(e) { c.innerHTML = '<p class="center down" style="padding:12px 0;font-size:0.8rem">Failed to load news</p>'; }
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
  var bar = document.getElementById('accuracyBar');
  bar.style.width = pct + '%';
  bar.style.background = pct >= 60 ? COLORS.up : pct >= 40 ? COLORS.warn : COLORS.down;
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
    c.innerHTML = '<div class="center dim" style="padding:30px 0;font-size:0.82rem;grid-column:1/-1">No predictions yet</div>';
    updateStats(); return;
  }
  c.innerHTML = predictionHistory.slice(0, 12).map(function(entry) {
    var time = new Date(entry.timestamp).toLocaleTimeString();
    var change = ((entry.predicted - entry.currentPrice) / entry.currentPrice * 100).toFixed(2);
    var sc = entry.signal === 'BUY' ? COLORS.up : entry.signal === 'SELL' ? COLORS.down : COLORS.warn;
    var border = entry.signal === 'BUY' ? 'rgba(52,229,155,0.3)' : entry.signal === 'SELL' ? 'rgba(255,107,129,0.3)' : 'rgba(255,209,102,0.3)';
    var src = entry.dataSource === 'live' ? '<span style="color:var(--up);font-size:0.66rem">● Live</span>' : '<span style="color:var(--down);font-size:0.66rem">● Offline</span>';
    var acc = '';
    if (entry.actualPrice !== undefined) {
      var correct = (entry.predicted > entry.currentPrice) === (entry.actualPrice > entry.currentPrice);
      acc = '<div class="flex between" style="margin-top:3px"><span class="dim">Result</span><span style="color:' + (correct ? COLORS.up : COLORS.down) + ';font-weight:700">' + (correct ? '✓ Correct' : '✗ Wrong') + '</span></div>';
    }
    return '<div style="border:1px solid ' + border + ';border-radius:14px;padding:14px;background:var(--glass)">' +
      '<div class="flex between items-c" style="margin-bottom:6px"><span style="font-weight:800;color:' + sc + '">' + entry.signal + '</span>' +
      '<div style="text-align:right"><div class="dim" style="font-size:0.64rem">' + time + '</div>' + src + '</div></div>' +
      '<div class="dim" style="font-size:0.66rem;margin-bottom:6px">' + entry.asset + ' · ' + entry.model + '</div>' +
      '<div style="font-size:0.74rem">' +
      '<div class="flex between"><span class="dim">Price</span><span>' + fmtPrice(entry.currentPrice) + '</span></div>' +
      '<div class="flex between"><span class="dim">Predicted</span><span>' + fmtPrice(entry.predicted) + '</span></div>' +
      '<div class="flex between"><span class="dim">Change</span><span style="font-weight:700;color:' + (change > 0 ? COLORS.up : COLORS.down) + '">' + (change > 0 ? '+' : '') + change + '%</span></div>' +
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
    var tfs = data.timeframes;
    var html = '';
    ['daily', 'h4', 'h1', 'm15'].forEach(function(key) {
      var tf = tfs[key];
      if (!tf) return;
      var sc = tf.signal === 'BUY' ? COLORS.up : tf.signal === 'SELL' ? COLORS.down : COLORS.warn;
      var confPct = Math.round((tf.confidence || 0) * 100);
      html += '<div class="ind-card"><div class="il">' + tf.label + '</div>' +
        '<div style="font-size:1.2rem;font-weight:800;color:' + sc + ';margin-bottom:6px">' + tf.signal + '</div>' +
        (tf.isFallback ? '<div class="warn" style="font-size:0.62rem;margin-bottom:4px">⚠ Fallback data</div>' : '') +
        '<div class="mini-track" style="height:4px;margin-bottom:6px"><div class="mini-fill" style="width:' + confPct + '%;background:' + sc + '"></div></div>' +
        '<div class="dim" style="font-size:0.66rem">' + confPct + '%' + (tf.rsi ? ' · RSI ' + tf.rsi.toFixed(1) : '') + '</div></div>';
    });
    document.getElementById('mtfGrid').innerHTML = html;
    var cc = data.consensus === 'BUY' ? COLORS.up : data.consensus === 'SELL' ? COLORS.down : COLORS.warn;
    document.getElementById('mtfConsensus').innerHTML = '<span style="color:' + cc + '">' + data.consensus + '</span>';
    document.getElementById('mtfAgreement').textContent = data.agreement + '% agreement';
  } catch(e) { console.error('MTF error:', e); }
}

// ========== Correlation Matrix ==========
async function loadCorrelation() {
  try {
    var response = await fetch('/api/analysis/correlation');
    var data = await response.json();
    if (!data.success) return;
    var pairs = data.pairs, matrix = data.matrix;
    var html = '<table class="tbl"><tr><th></th>';
    pairs.forEach(function(p) { html += '<th class="center">' + p.slice(0,3) + '/' + p.slice(3) + '</th>'; });
    html += '</tr>';
    for (var i = 0; i < pairs.length; i++) {
      html += '<tr><td style="font-weight:600">' + pairs[i].slice(0,3) + '/' + pairs[i].slice(3) + '</td>';
      for (var j = 0; j < pairs.length; j++) {
        var val = matrix[i][j];
        var color = (val === null) ? COLORS.dim : val > 0.5 ? COLORS.up : val < -0.5 ? COLORS.down : val > 0.2 ? 'rgba(52,229,155,0.7)' : val < -0.2 ? 'rgba(255,107,129,0.7)' : COLORS.dim;
        var bg = i === j ? 'rgba(255,255,255,0.05)' : 'transparent';
        html += '<td class="center" style="color:' + color + ';background:' + bg + ';font-weight:' + (val !== null && Math.abs(val) > 0.7 ? '700' : '400') + '">' + (val === null ? '–' : val.toFixed(2)) + '</td>';
      }
      html += '</tr>';
    }
    html += '</table>';
    document.getElementById('corrMatrix').innerHTML = html;
    update3DCorrelation(pairs, matrix);
  } catch(e) { console.error('Correlation error:', e); }
}

// ========== Risk Calculator ==========
function calculateRisk() {
  var balance = parseFloat(document.getElementById('riskBalance').value) || 10000;
  var riskPct = parseFloat(document.getElementById('riskPercent').value) || 2;
  var stopPips = parseFloat(document.getElementById('riskStopPips').value) || 30;
  var pair = document.getElementById('riskPair').value;
  var riskAmount = balance * (riskPct / 100);
  var pipValue = 10;
  if (pair === 'USDJPY' || pair === 'EURJPY') pipValue = 100 / 150;
  if (pair === 'XAUUSD') pipValue = 1;
  var lots = riskAmount / (stopPips * pipValue);
  var units = Math.round(lots * 100000);
  var reward = riskAmount * 2;
  document.getElementById('riskResults').style.display = 'block';
  document.getElementById('riskAmount').textContent = '$' + riskAmount.toFixed(2);
  document.getElementById('riskLots').textContent = lots.toFixed(2) + ' lots';
  document.getElementById('riskUnits').textContent = units.toLocaleString();
  document.getElementById('riskReward').textContent = '$' + reward.toFixed(2);
  showToast('Position size: ' + lots.toFixed(2) + ' lots', 'success');
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
  if (pair === 'USDJPY' || pair === 'EURJPY') pipDiff = (exit - entry) * 100;
  else if (pair === 'XAUUSD') pipDiff = (exit - entry) * 10;
  else pipDiff = (exit - entry) * 10000;
  if (action === 'SELL') pipDiff = -pipDiff;

  var pipValue = 10;
  if (pair === 'USDJPY' || pair === 'EURJPY') pipValue = 100 / 150;
  if (pair === 'XAUUSD') pipValue = 1;
  var pnl = pipDiff * lots * pipValue;

  tradeJournal.unshift({ id: Date.now(), date: new Date().toISOString(), pair: pair, action: action, entry: entry, exit: exit, lots: lots, pips: pipDiff, pnl: pnl, notes: notes });
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
    list.innerHTML = '<p class="center dim" style="padding:12px 0;font-size:0.8rem">No trades logged</p>';
    stats.style.display = 'none';
    return;
  }
  stats.style.display = 'grid';
  var totalPnl = tradeJournal.reduce(function(s, t) { return s + t.pnl; }, 0);
  var wins = tradeJournal.filter(function(t) { return t.pnl > 0; }).length;
  var winRate = Math.round((wins / tradeJournal.length) * 100);
  document.getElementById('journalPnl').textContent = (totalPnl >= 0 ? '+$' : '-$') + Math.abs(totalPnl).toFixed(2);
  document.getElementById('journalPnl').style.color = totalPnl >= 0 ? COLORS.up : COLORS.down;
  document.getElementById('journalWinRate').textContent = winRate + '%';
  document.getElementById('journalWinRate').style.color = winRate >= 50 ? COLORS.up : COLORS.down;
  document.getElementById('journalCount').textContent = tradeJournal.length;

  list.innerHTML = tradeJournal.slice(0, 20).map(function(t) {
    var d = new Date(t.date);
    var dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    var ac = t.action === 'BUY' ? COLORS.up : COLORS.down;
    var pc = t.pnl >= 0 ? COLORS.up : COLORS.down;
    return '<div class="row" style="flex-wrap:wrap;gap:4px">' +
      '<div class="flex items-c gap-2" style="flex:1;min-width:110px">' +
      '<span style="font-weight:800;color:' + ac + '">' + t.action + '</span>' +
      '<span style="font-size:0.82rem">' + t.pair + '</span></div>' +
      '<div style="text-align:right"><span style="font-weight:700;color:' + pc + '">' + (t.pnl >= 0 ? '+' : '') + '$' + t.pnl.toFixed(2) + '</span>' +
      '<span class="dim" style="display:block;font-size:0.62rem">' + t.pips.toFixed(1) + ' pips · ' + dateStr + '</span></div>' +
      '<button onclick="deleteJournalEntry(' + t.id + ')" style="color:var(--down);cursor:pointer;background:none;border:none"><span class="mi mi-xs">close</span></button></div>';
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

// ================= 3D VISUALISATION (Three.js) =================
// Three independent scenes: hero particle orb, price surface, gauge dials,
// and a correlation landscape. Each is lazily created and guarded so the
// dashboard still works if WebGL/Three is unavailable.

var THREE_OK = typeof THREE !== 'undefined';
var scenes = {};

function palette() {
  return {
    up: getComputedStyle(document.documentElement).getPropertyValue('--up').trim() || '#34e59b',
    down: getComputedStyle(document.documentElement).getPropertyValue('--down').trim() || '#ff6b81',
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5b8cff',
    accent2: getComputedStyle(document.documentElement).getPropertyValue('--accent2').trim() || '#22d3ee',
    warn: getComputedStyle(document.documentElement).getPropertyValue('--warn').trim() || '#ffd166'
  };
}

function makeRenderer(canvas) {
  var r = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  return r;
}

function sizeRenderer(renderer, canvas) {
  var w = canvas.clientWidth || canvas.parentElement && canvas.parentElement.clientWidth || 600;
  var h = canvas.clientHeight || canvas.parentElement && canvas.parentElement.clientHeight || 400;
  renderer.setSize(w, h, false);
}

function init3D() {
  if (!THREE_OK) return;
  // Each scene is isolated: a failure in one (bad WebGL context, zero-size
  // canvas, etc.) must not abort the others or take down the dashboard.
  [['hero', initHero3D], ['price', initPriceScene], ['gauge', initGaugeScene], ['corr', initCorrScene]]
    .forEach(function(pair) {
      try { pair[1](); } catch (e) { console.warn('3D scene "' + pair[0] + '" failed to init:', e); }
    });
  window.addEventListener('resize', onResize);
}

function onResize() {
  if (!THREE_OK) return;
  ['hero', 'price', 'gauge', 'corr'].forEach(function(k) {
    var s = scenes[k];
    if (s && s.renderer && s.canvas) {
      sizeRenderer(s.renderer, s.canvas);
      s.camera.aspect = (s.canvas.clientWidth || 600) / (s.canvas.clientHeight || 400);
      s.camera.updateProjectionMatrix();
    }
  });
}

function animate(k) {
  var s = scenes[k];
  if (!s) return;
  requestAnimationFrame(function() { animate(k); });
  if (s.update) {
    try { s.update(); } catch (e) { console.warn('3D scene "' + k + '" update failed:', e); s.update = null; }
  }
  s.renderer.render(s.scene, s.camera);
}

// ---- Hero: rotating particle globe / price wave ----
function initHero3D() {
  var canvas = document.getElementById('hero3d');
  if (!canvas) return;
  var renderer = makeRenderer(canvas);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 1.4, 6.2);
  camera.lookAt(0, 0, 0);

  var pal = palette();
  // Wave grid of points forming a 3D price surface
  var cols = 40, rows = 26;
  var geo = new THREE.BufferGeometry();
  var positions = new Float32Array(cols * rows * 3);
  var colors = new Float32Array(cols * rows * 3);
  var cA = new THREE.Color(pal.accent), cB = new THREE.Color(pal.accent2);
  var idx = 0;
  for (var x = 0; x < cols; x++) {
    for (var z = 0; z < rows; z++) {
      positions[idx * 3] = (x - cols / 2) * 0.16;
      positions[idx * 3 + 1] = 0;
      positions[idx * 3 + 2] = (z - rows / 2) * 0.16;
      var t = x / cols;
      var col = cA.clone().lerp(cB, t);
      colors[idx * 3] = col.r; colors[idx * 3 + 1] = col.g; colors[idx * 3 + 2] = col.b;
      idx++;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  var mat = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.9 });
  var points = new THREE.Points(geo, mat);
  scene.add(points);

  scenes.hero = {
    renderer: renderer, scene: scene, camera: camera, canvas: canvas,
    update: function() {
      var t = performance.now() * 0.0008;
      var pos = geo.attributes.position.array;
      for (var x = 0; x < cols; x++) {
        for (var z = 0; z < rows; z++) {
          var i = (x * rows + z) * 3;
          pos[i + 1] = Math.sin(x * 0.35 + t * 2) * 0.22 + Math.cos(z * 0.4 + t * 1.4) * 0.22;
        }
      }
      geo.attributes.position.needsUpdate = true;
      scene.rotation.y = Math.sin(t * 0.4) * 0.25;
      camera.lookAt(0, 0, 0);
    }
  };
  sizeRenderer(renderer, canvas);
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  animate('hero');
}

// ---- Price history + forecast scene: TradingView-style candlesticks in 3D ----
// A literal TradingView embed is impossible here (it is an external iframe and
// its canvas cannot be read into WebGL), so this reimplements the core of its
// look: OHLC candles, price lattice with ticks, candle colours by direction,
// a floating current-price line, and a forecast ribbon projected to the right.

function priceDecimals(p) { return p >= 100 ? 2 : p >= 10 ? 4 : 5; }

// Build OHLC bars from server records. Frankfurter returns close-only rows
// where open===high===low===close; for those we derive open from the previous
// close and draw the wick across the close-to-close range so the chart shows
// the actual session move instead of flat dojis. True OHLC (TwelveData/gold)
// passes through untouched.
function toCandles(records, startPrice) {
  var out = [];
  var prev = startPrice;
  records.forEach(function(d, i) {
    var close = parseFloat(d.close);
    if (!isFinite(close)) return;
    var o = parseFloat(d.open), h = parseFloat(d.high), l = parseFloat(d.low);
    var flat = !isFinite(o) || (o === h && h === l && l === close);
    var open = isFinite(o) && !flat ? o : (prev == null ? close : prev);
    var high, low;
    if (isFinite(h) && isFinite(l) && !flat) {
      high = h; low = l;
    } else {
      var body = Math.abs(close - open);
      high = Math.max(open, close) + body * 0.12;
      low = Math.min(open, close) - body * 0.12;
    }
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);
    var t = d.date ? new Date(d.date) : null;
    out.push({ open: open, high: high, low: low, close: close, t: t, i: i });
    prev = close;
  });
  return out;
}

function disposeGroup(group) {
  while (group.children.length) {
    var c = group.children.pop();
    if (c && c.geometry) c.geometry.dispose();
    if (c && c.material) {
      if (Array.isArray(c.material)) c.material.forEach(function(m) { m.dispose(); });
      else c.material.dispose();
    }
  }
  group.rotation.set(0, 0, 0);
  group.scale.set(1, 1, 1);
  group.position.set(0, 0, 0);
}

// Shared layout constants in local units. Local X spans roughly [-X_MAX, X_MAX].
var CANDLE = { halfWidth: 0.34, bodyDepth: 0.7, pitch: 0.86, yMax: 10, yMin: -8, zBack: -4.5, zFront: 4.5 };

function buildPriceScene(state, canvas) {
  var group = state.group;
  disposeGroup(group);
  state.needsRebuild = false;
  var raw = state.raw;
  var pal = palette();
  var candles = (raw && raw.candles) || [];
  var forecast = (raw && raw.forecast) || [];
  if (!candles.length && !forecast.length) {
    drawEmptyState(state, pal);
    return;
  }

  var n = candles.length;
  var fp = forecast.map(function(v) { return parseFloat(v); }).filter(function(v) { return isFinite(v); });

  var lo = Infinity, hi = -Infinity;
  candles.forEach(function(c) { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); });
  fp.forEach(function(v) { lo = Math.min(lo, v); hi = Math.max(hi, v); });
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-9) { hi += 0.001; lo -= 0.001; }
  var pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;

  var totalSlots = Math.max(n + fp.length + 1, 2);
  var pitch = Math.min(CANDLE.pitch, (CANDLE.yMax * 2) / totalSlots);
  var xStart = -((totalSlots - 1) * pitch) / 2;
  function xAt(i) { return xStart + i * pitch; }
  function yAt(p) { return CANDLE.yMin + ((p - lo) / (hi - lo)) * (CANDLE.yMax - CANDLE.yMin); }
  var maxBody = pitch * 0.78;
  var halfW = Math.min(CANDLE.halfWidth, maxBody / 2);

  var upMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.up) });
  var downMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.down) });

  // Candle body + wick builder. Bodies sit at z=0 extruded by bodyDepth.
  var bodyGeoUp = new THREE.BoxGeometry(1, 1, 1);
  var wickGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
  function addCandle(candle, x, opts) {
    opts = opts || {};
    var rising = candle.close >= candle.open;
    var mat = opts.mat || (rising ? upMat : downMat);
    var top = yAt(Math.max(candle.open, candle.close));
    var bot = yAt(Math.min(candle.open, candle.close));
    var bodyH = Math.max(top - bot, 0.06);
    var body = new THREE.Mesh(bodyGeoUp, mat);
    body.scale.set(halfW * 2, bodyH, CANDLE.bodyDepth);
    body.position.set(x, (top + bot) / 2, 0);
    group.add(body);

    var wy1 = yAt(candle.low), wy2 = yAt(candle.high);
    var wickH = Math.max(wy2 - wy1, 0.06);
    var wick = new THREE.Mesh(wickGeo, mat);
    wick.scale.set(1, wickH, 1);
    wick.position.set(x, (wy1 + wy2) / 2, 0);
    group.add(wick);
  }

  candles.forEach(function(c, i) { addCandle(c, xAt(i)); });

  // Forecast: outline-only (wireframe) candles in warning colour so they read as
  // "projected, not observed", plus a connecting dotted line back to the last close.
  var fcColor = new THREE.Color(pal.warn);
  var prevClose = n ? candles[n - 1].close : fp[0];
  var fcLinePts = [];
  if (n) fcLinePts.push(new THREE.Vector3(xAt(n - 1), yAt(prevClose), 0));
  fp.forEach(function(v, j) {
    var idx = n + j;
    var o = j === 0 ? prevClose : fp[j - 1];
    var top = yAt(Math.max(o, v)), bot = yAt(Math.min(o, v));
    var bodyH = Math.max(top - bot, 0.06);
    var edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(halfW * 2, bodyH, CANDLE.bodyDepth));
    var box = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: fcColor, transparent: true, opacity: 0.9 }));
    box.position.set(xAt(idx), (top + bot) / 2, 0);
    group.add(box);
    var mid = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.11, pitch * 0.16), 10, 10), new THREE.MeshBasicMaterial({ color: fcColor }));
    mid.position.set(xAt(idx), yAt(v), 0);
    group.add(mid);
    fcLinePts.push(new THREE.Vector3(xAt(idx), yAt(v), 0));
  });
  if (fcLinePts.length > 1) {
    var fcGeo = new THREE.BufferGeometry().setFromPoints(fcLinePts);
    var fcLine = new THREE.Line(fcGeo, new THREE.LineDashedMaterial({ color: fcColor, dashSize: 0.28, gapSize: 0.18, transparent: true, opacity: 0.85 }));
    fcLine.computeLineDistances();
    group.add(fcLine);
  }

  // ---- Lattice (horizontal price gridlines) + right-edge price labels ----
  var TICKS = 6;
  var latticePts = [];
  var latticePtsMinor = [];
  var labelGroup = state.group; // same group; labels are sprites
  var xMin = xStart - pitch, xMax = xAt(totalSlots) + pitch * 2.2;
  var labelX = xMax + pitch * 1.4;
  var dec = priceDecimals(hi);
  function makeLabel(text, x, y, color) {
    if (typeof document === 'undefined' || !document.createElement) return;
    var el = document.createElement('canvas');
    var ctx = el.getContext && el.getContext('2d');
    if (!ctx) return;
    el.width = 240; el.height = 64;
    ctx.font = '600 34px ui-monospace,Menlo,Consolas,monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 228, 34);
    var tex = new THREE.CanvasTexture(el);
    if (tex && tex.colorSpace !== undefined && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.scale.set(3.6, 0.96, 1);
    spr.position.set(x, y, CANDLE.zFront + 0.2);
    labelGroup.add(spr);
  }
  var gridColor = new THREE.Color(pal.accent);
  for (var t = 0; t <= TICKS; t++) {
    var price = lo + (hi - lo) * (t / TICKS);
    var y = yAt(price);
    if (t % 2 === 0) {
      latticePts.push(xMin, y, CANDLE.zBack, xMax, y, CANDLE.zBack);
      makeLabel(price.toFixed(dec), labelX, y, pal.accent2);
    } else {
      latticePtsMinor.push(xMin, y, CANDLE.zBack, xMax, y, CANDLE.zBack);
    }
  }
  // Depth lines from back to front at each end so the lattice reads as a floor.
  [xMin, xMax].forEach(function(x) {
    latticePts.push(x, CANDLE.yMin, CANDLE.zBack, x, CANDLE.yMin, CANDLE.zFront);
    latticePts.push(x, CANDLE.yMax, CANDLE.zBack, x, CANDLE.yMax, CANDLE.zFront);
  });
  if (latticePts.length) {
    var lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(latticePts, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: gridColor, transparent: true, opacity: 0.28 })));
  }
  if (latticePtsMinor.length) {
    var lgm = new THREE.BufferGeometry();
    lgm.setAttribute('position', new THREE.Float32BufferAttribute(latticePtsMinor, 3));
    group.add(new THREE.LineSegments(lgm, new THREE.LineBasicMaterial({ color: gridColor, transparent: true, opacity: 0.1 })));
  }

  // ---- Current price line (TradingView's dotted "last" crosshair) ----
  var lastClose = n ? candles[n - 1].close : (fp.length ? fp[fp.length - 1] : null);
  if (lastClose != null && isFinite(lastClose)) {
    var ly = yAt(lastClose);
    var lastGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(xMin - pitch * 0.4, ly, 0),
      new THREE.Vector3(xAt(n > 0 ? n - 1 : 0), ly, 0)
    ]);
    var lastLine = new THREE.Line(lastGeo, new THREE.LineDashedMaterial({ color: new THREE.Color(pal.accent2), dashSize: 0.22, gapSize: 0.16 }));
    lastLine.computeLineDistances();
    group.add(lastLine);
    var marker = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.18, pitch * 0.24), 12, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.accent2) }));
    marker.position.set(xAt(n > 0 ? n - 1 : 0), ly, 0);
    group.add(marker);
    makeLabel(lastClose.toFixed(dec), labelX, ly, pal.warn);
  }

  state.bounds = { xMin: xMin - pitch, xMax: labelX + 0.5, yMin: CANDLE.yMin - 0.6, yMax: CANDLE.yMax + 0.6 };
  if (state.autoFrame) {
    state.autoFrame(canvas, (xMin + labelX) / 2, (CANDLE.yMin + CANDLE.yMax) / 2, (labelX - xMin) * 1.05);
    state.autoFrame = null;
  }
}

function drawEmptyState(state, pal) {
  var g = new THREE.BufferGeometry();
  var pts = [];
  for (var i = -10; i <= 10; i++) { pts.push(i, 0, -4, i, 0, 4); pts.push(-10, 0, i * 0.4, 10, 0, i * 0.4); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  state.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(pal.accent), transparent: true, opacity: 0.12 })));
}

function initPriceScene() {
  var canvas = document.getElementById('price3d');
  if (!canvas) return;
  var renderer = makeRenderer(canvas);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

  // Soft lighting so box faces shade slightly differently and candles read as 3D.
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  var dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(-6, 14, 16);
  scene.add(dir);

  var state = {
    group: new THREE.Group(),
    needsRebuild: false,
    raw: null,
    autoFrame: null
  };
  scene.add(state.group);

  // Orbit controls: horizontal drag rotates, vertical drag tilts, wheel zooms.
  var target = new THREE.Vector3(0, 1, 0);
  var theta = -0.42, phi = 0.32, radius = 30;
  var drag = false, px = 0, py = 0;
  canvas.addEventListener('mousedown', function(e) { drag = true; px = e.clientX; py = e.clientY; canvas.style.cursor = 'grabbing'; });
  window.addEventListener('mouseup', function() { drag = false; canvas.style.cursor = 'grab'; });
  window.addEventListener('mousemove', function(e) {
    if (!drag) return;
    theta -= (e.clientX - px) * 0.006;
    phi = Math.max(0.06, Math.min(1.2, phi + (e.clientY - py) * 0.004));
    px = e.clientX; py = e.clientY;
  });
  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    radius = Math.max(12, Math.min(90, radius + e.deltaY * 0.03));
  }, { passive: false });
  canvas.style.cursor = 'grab';

  function frameCamera() {
    var cx = target.x, cy = target.y, cz = target.z;
    camera.position.set(
      cx + radius * Math.sin(theta) * Math.cos(phi),
      cy + radius * Math.sin(phi),
      cz + radius * Math.cos(theta) * Math.cos(phi)
    );
    camera.lookAt(cx, cy, cz);
  }

  scenes.price = {
    renderer: renderer, scene: scene, camera: camera, canvas: canvas, state: state,
    update: function() {
      if (state.needsRebuild) { buildPriceScene(state, canvas); }
      frameCamera();
    }
  };

  // Choose a default view that fits the chart width after data arrives.
  state.autoFrame = function(cv, cx, cy, spanX) {
    target.set(cx, cy, 0);
    var aspect = (cv.clientWidth || 900) / (cv.clientHeight || 460);
    var fovY = camera.fov * Math.PI / 180;
    var distY = (spanX * 0.5 * 1.15) / (Math.tan(fovY / 2) * Math.max(aspect, 0.5));
    radius = Math.max(16, Math.min(80, distY / Math.cos(phi)));
    phi = 0.30; theta = -0.38;
  };

  sizeRenderer(renderer, canvas);
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  frameCamera();
  animate('price');
}

async function loadHistoryChart() {
  try {
    var res = await fetch('/api/prices/' + currentAsset + '/history?timeframe=' + currentTimeframe);
    var data = await res.json();
    if (!data.success || !Array.isArray(data.data)) return;
    var records = data.data.slice(currentTimeframe === 'D' ? -90 : -120);
    var candles = toCandles(records, null);
    if (scenes.price) {
      scenes.price.state.raw = {
        candles: candles,
        forecast: lastPrediction && lastPrediction.predictions ? lastPrediction.predictions : []
      };
      scenes.price.state.needsRebuild = true;
    }
  } catch(e) { console.error('History chart error:', e); }
}

function update3DPriceChart(prediction) {
  if (!scenes.price) return;
  var raw = scenes.price.state.raw || {};
  scenes.price.state.raw = {
    candles: raw.candles || [],
    forecast: (prediction && prediction.predictions) || []
  };
  scenes.price.state.needsRebuild = true;
  if (!raw.candles || !raw.candles.length) loadHistoryChart();
}

// ========== Backtest & Signal Quality ==========
async function loadBacktest(refresh) {
  var el = document.getElementById('btVerdict');
  if (!el) return;
  try {
    var url = '/api/backtest/' + currentAsset + '?timeframe=' + currentTimeframe + (refresh ? '&refresh=1' : '');
    var res = await fetch(url);
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Backtest failed');
    renderBacktest(data);
  } catch (e) {
    el.className = 'bt-verdict bt-pending';
    el.textContent = 'Backtest unavailable: ' + e.message;
  }
}

function btSet(id, text, color) {
  var n = document.getElementById(id);
  if (!n) return;
  n.textContent = text;
  if (color) n.style.color = color;
}

function renderBacktest(data) {
  var el = document.getElementById('btVerdict');
  if (!data.summary) {
    el.className = 'bt-verdict bt-pending';
    el.textContent = data.reason || 'Not enough history to backtest this pair.';
    ['btTrades','btHitRate','btExpectancy','btProfitFactor','btDrawdown','btSpread'].forEach(function(id) { btSet(id, '--'); });
    var wEl = document.getElementById('btWeights'); if (wEl) wEl.innerHTML = '';
    document.getElementById('btLimitations').innerHTML = (data.limitations || []).map(esc).join('<br>');
    return;
  }
  var s = data.summary;
  var positive = s.expectancyPips > 0;
  el.className = 'bt-verdict ' + (positive ? 'bt-good' : 'bt-bad');
  el.textContent = positive
    ? '✓ Positive cost-adjusted expectancy: ' + s.expectancyPips + ' pips/trade over ' + s.trades + ' trades.'
    : '✗ No edge after spread: ' + s.expectancyPips + ' pips/trade over ' + s.trades + ' trades (profit factor ' + s.profitFactor + ').';

  btSet('btTrades', s.trades);
  btSet('btHitRate', Math.round(s.hitRate * 100) + '%');
  btSet('btExpectancy', (s.expectancyPips > 0 ? '+' : '') + s.expectancyPips + ' pips', positive ? COLORS.up : COLORS.down);
  btSet('btProfitFactor', s.profitFactor, s.profitFactor >= 1 ? COLORS.up : COLORS.down);
  btSet('btDrawdown', s.maxDrawdownPips + ' pips');
  btSet('btSpread', data.cost ? data.cost.spreadPips + ' pips' : '--');

  // Indicator contribution bars, centred at zero.
  var marginal = (data.weights && data.weights.marginal) || [];
  var maxAbs = marginal.reduce(function(m, x) { return Math.max(m, Math.abs(x.expectancyDeltaPips || 0)); }, 1) || 1;
  document.getElementById('btWeights').innerHTML = marginal.map(function(m) {
    var d = m.expectancyDeltaPips || 0;
    var pct = Math.min(50, Math.abs(d) / maxAbs * 50);
    var fill = d >= 0
      ? 'left:50%;width:' + pct + '%;background:' + COLORS.up
      : 'right:50%;width:' + pct + '%;background:' + COLORS.down;
    return '<div class="bt-bar-row">' +
      '<span class="lbl">' + esc(m.indicator) + '</span>' +
      '<span class="bt-bar-track"><span class="bt-bar-center"></span><span class="bt-bar-fill" style="' + fill + '"></span></span>' +
      '<span class="bt-bar-val" style="color:' + (d >= 0 ? COLORS.up : COLORS.down) + '">' + (d > 0 ? '+' : '') + d + '</span></div>';
  }).join('');

  var rec = data.weights && data.weights.recommendation;
  var recEl = document.getElementById('btCalibration');
  var calRows = (data.confidenceCalibration || []).filter(function(r) { return r.samples >= 8; }).slice(0, 8);
  var calHtml = calRows.length
    ? calRows.map(function(r) {
        return '<div class="bt-bar-row"><span class="lbl">' + esc(r.regime.replace('TRENDING_', 'T-')) + ' ' + esc(r.action.slice(0, 1)) + '</span>' +
          '<span class="bt-bar-track"><span class="bt-bar-fill" style="left:0;width:' + (r.winRate * 100) + '%;background:' + (r.winRate >= 0.5 ? COLORS.up : COLORS.down) + '"></span></span>' +
          '<span class="bt-bar-val">' + Math.round(r.winRate * 100) + '%</span></div>';
      }).join('')
    : '<div class="dim" style="font-size:0.7rem">No bucket has ≥8 samples yet — live confidence stays on the formula.</div>';
  var recNote = rec
    ? '<div class="dim" style="margin-top:8px;font-size:0.66rem">Weights: ' + esc(rec.confidence) + ' confidence · ' + (rec.apply ? 'auto-applied' : 'defaults kept') + ' — ' + esc(rec.reason) + '</div>'
    : '';
  if (recEl) recEl.innerHTML = calHtml + recNote;

  var lim = (data.limitations || []).slice();
  if (data.dataQuality === 'close_only') lim.unshift('Data is close-only (no OHLC): SL/TP checked on close only.');
  document.getElementById('btLimitations').innerHTML = lim.map(function(l) { return '⚠ ' + esc(l); }).join('<br>');
}

// ---- 3D gauges: three torus dials for RSI / ADX / Stochastic ----
function initGaugeScene() {
  var canvas = document.getElementById('gauges3d');
  if (!canvas) return;
  var renderer = makeRenderer(canvas);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 3.2, 9);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  var pal = palette();
  var dials = [];
  var specs = [
    { x: -3, color: pal.accent, label: 'RSI' },
    { x: 0, color: pal.accent2, label: 'ADX' },
    { x: 3, color: pal.up, label: 'STOCH' }
  ];
  specs.forEach(function(spec) {
    var grp = new THREE.Group();
    grp.position.x = spec.x;
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.09, 12, 60),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.color), metalness: 0.4, roughness: 0.3, emissive: new THREE.Color(spec.color), emissiveIntensity: 0.25 })
    );
    grp.add(ring);
    var needleGeo = new THREE.BoxGeometry(0.08, 1.1, 0.08);
    needleGeo.translate(0, 0.55, 0);
    var needle = new THREE.Mesh(needleGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(spec.color), emissiveIntensity: 0.6 }));
    grp.add(needle);
    var hub = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.color) }));
    grp.add(hub);
    scene.add(grp);
    dials.push({ grp: grp, needle: needle, value: 50, target: 50 });
  });

  scenes.gauge = {
    renderer: renderer, scene: scene, camera: camera, canvas: canvas, dials: dials,
    update: function() {
      dials.forEach(function(d) {
        // smooth toward target
        d.value += (d.target - d.value) * 0.12;
        // 0..100 mapped to -135deg..135deg
        var ang = ((d.value / 100) * 270 - 135) * Math.PI / 180;
        d.needle.rotation.z = -ang;
        d.grp.rotation.y = Math.sin(performance.now() * 0.0005 + d.grp.position.x) * 0.25;
      });
    }
  };
  sizeRenderer(renderer, canvas);
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  animate('gauge');
}

function update3DGauges(ind) {
  if (!scenes.gauge) return;
  scenes.gauge.dials[0].target = Math.max(0, Math.min(100, ind.rsi));
  scenes.gauge.dials[1].target = Math.max(0, Math.min(100, ind.adx || 0));
  scenes.gauge.dials[2].target = Math.max(0, Math.min(100, ind.stochastic || 50));
}

// ---- 3D correlation landscape ----
function initCorrScene() {
  var canvas = document.getElementById('corr3d');
  if (!canvas) return;
  var renderer = makeRenderer(canvas);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  camera.position.set(6, 9, 12);
  camera.lookAt(0, 1, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  var dl = new THREE.DirectionalLight(0xffffff, 1);
  dl.position.set(8, 14, 6);
  scene.add(dl);

  var state = { group: new THREE.Group(), needsRebuild: false, data: null };
  scene.add(state.group);

  var theta = 0.55, phi = 0.55, radius = 17, drag = false, px = 0, py = 0;
  canvas.addEventListener('mousedown', function(e) { drag = true; px = e.clientX; py = e.clientY; });
  window.addEventListener('mouseup', function() { drag = false; });
  window.addEventListener('mousemove', function(e) {
    if (!drag) return;
    theta -= (e.clientX - px) * 0.008;
    phi = Math.max(0.15, Math.min(1.3, phi - (e.clientY - py) * 0.006));
    px = e.clientX; py = e.clientY;
  });
  canvas.addEventListener('wheel', function(e) { e.preventDefault(); radius = Math.max(9, Math.min(30, radius + e.deltaY * 0.02)); }, { passive: false });

  scenes.corr = {
    renderer: renderer, scene: scene, camera: camera, canvas: canvas, state: state,
    update: function() {
      if (state.needsRebuild) buildCorrGeometry(state);
      camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
      camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
      camera.position.y = radius * Math.sin(phi);
      camera.lookAt(0, 0.5, 0);
    }
  };
  sizeRenderer(renderer, canvas);
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  animate('corr');
}

function buildCorrGeometry(state) {
  state.needsRebuild = false;
  var pal = palette();
  while (state.group.children.length) {
    var c = state.group.children.pop();
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
  }
  var data = state.data;
  if (!data) return;
  var pairs = data.pairs, matrix = data.matrix;
  var n = pairs.length;
  var maxY = 3;
  var upgrade = new THREE.Color(pal.up), downColor = new THREE.Color(pal.down);
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < n; j++) {
      var val = matrix[i][j];
      if (val === null || i === j) continue;
      var h = Math.abs(val) * maxY + 0.05;
      var box = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, h, 0.7),
        new THREE.MeshStandardMaterial({ color: val >= 0 ? upgrade : downColor, metalness: 0.35, roughness: 0.35, transparent: true, opacity: 0.9, emissive: (val >= 0 ? upgrade : downColor), emissiveIntensity: 0.18 })
      );
      box.position.set((i - n / 2) * 0.9, h / 2, (j - n / 2) * 0.9);
      state.group.add(box);
    }
  }
  var grid = new THREE.GridHelper(n * 1.1, n, 0x2a3a55, 0x16233a);
  state.group.add(grid);
}

function update3DCorrelation(pairs, matrix) {
  if (!scenes.corr) return;
  scenes.corr.state.data = { pairs: pairs, matrix: matrix };
  scenes.corr.state.needsRebuild = true;
}

function rebuild3DColors() {
  // Recolour existing scenes on theme flip by forcing a rebuild where we can.
  if (scenes.corr && scenes.corr.state.data) scenes.corr.state.needsRebuild = true;
  if (scenes.price && scenes.price.state.raw) scenes.price.state.needsRebuild = true;
}
