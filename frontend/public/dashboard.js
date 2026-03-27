// ========== State ==========
let chart = null;
let currentAsset = 'XAUUSD';
let currentModel = 'ensemble';
let currentTimeframe = 'D';
let chartType = 'line';
let predictionHistory = [];
let autoRefreshEnabled = false;
let autoRefreshInterval = null;
let currentDataSource = 'unknown';
let historicalData = [];
let currentPrices = {};
const sessionId = localStorage.getItem('fx_sessionId') || (() => {
  const id = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  localStorage.setItem('fx_sessionId', id);
  return id;
})();

const ASSET_NAMES = {
  XAUUSD: 'Gold (XAU/USD)', EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY', USDCHF: 'USD/CHF', AUDUSD: 'AUD/USD',
  USDCAD: 'USD/CAD', NZDUSD: 'NZD/USD', EURGBP: 'EUR/GBP', EURJPY: 'EUR/JPY'
};

// ========== Init ==========
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initChart();
  loadInitialData();
  loadPredictionHistory();
  loadAlerts();
  loadNews();
});

function setupEventListeners() {
  document.getElementById('assetSelect').addEventListener('change', (e) => {
    currentAsset = e.target.value;
    updateAssetName();
    loadInitialData();
  });
  document.getElementById('modelSelect').addEventListener('change', (e) => {
    currentModel = e.target.value;
  });
  document.getElementById('predictBtn').addEventListener('click', getPrediction);
  document.getElementById('refreshBtn').addEventListener('click', () => loadInitialData());
  document.getElementById('autoRefreshToggle').addEventListener('click', toggleAutoRefresh);
  document.getElementById('addAlertBtn').addEventListener('click', addAlert);
  document.getElementById('refreshNews').addEventListener('click', loadNews);

  document.querySelectorAll('.tf-btn[data-tf]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tf-btn[data-tf]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTimeframe = btn.dataset.tf;
      loadHistoricalData();
    });
  });
}

// ========== Data Source Badge ==========
function updateDataSourceBadge(source, errorMsg) {
  const badge = document.getElementById('dataSourceBadge');
  const dot = document.getElementById('dataSourceDot');
  const text = document.getElementById('dataSourceText');
  const warning = document.getElementById('mockWarning');
  const errorDetail = document.getElementById('mockErrorDetail');

  currentDataSource = source;

  if (source === 'live') {
    badge.style.background = 'rgba(134, 239, 172, 0.1)';
    badge.style.color = '#86efac';
    dot.textContent = '🟢';
    text.textContent = 'LIVE DATA';
    warning.classList.remove('visible');
  } else {
    badge.style.background = 'rgba(252, 165, 165, 0.1)';
    badge.style.color = '#fca5a5';
    dot.textContent = '🔴';
    text.textContent = 'MOCK DATA';
    warning.classList.add('visible');
    if (errorMsg) {
      errorDetail.textContent = '(' + errorMsg + ')';
    }
  }
}

// ========== Loading State ==========
function setLoading(isLoading) {
  const btn = document.getElementById('predictBtn');
  if (isLoading) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Loading...';
    btn.style.opacity = '0.7';
  } else {
    btn.disabled = false;
    btn.innerHTML = '✦ Predict';
    btn.style.opacity = '1';
  }
}

// ========== Toast ==========
function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration || 4000;
  var toast = document.createElement('div');
  var colors = {
    success: 'background:rgba(6,78,59,0.5);color:#86efac;',
    error: 'background:rgba(127,29,29,0.5);color:#fca5a5;',
    warning: 'background:rgba(120,53,15,0.5);color:#fcd34d;',
    info: 'background:rgba(12,74,110,0.5);color:#7dd3fc;',
    alert: 'background:rgba(88,28,135,0.5);color:#d8b4fe;'
  };
  toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:100;padding:12px 20px;border-radius:16px;font-weight:500;font-size:0.875rem;max-width:360px;font-family:Inter,system-ui,sans-serif;' + (colors[type] || colors.info);
  toast.style.animation = 'slideIn 0.3s ease-out';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(function() { toast.remove(); }, 300);
  }, duration);
}

// ========== Auto Refresh ==========
function toggleAutoRefresh() {
  var btn = document.getElementById('autoRefreshToggle');
  autoRefreshEnabled = !autoRefreshEnabled;

  if (autoRefreshEnabled) {
    btn.innerHTML = '↻ Auto: ON';
    btn.classList.remove('m3-btn-primary');
    btn.classList.add('m3-btn-secondary');
    autoRefreshInterval = setInterval(function() {
      loadInitialData(true);
      checkAlerts();
    }, 30000);
    showToast('Auto-refresh enabled (30s)', 'success');
  } else {
    btn.innerHTML = '↻ Auto: OFF';
    btn.classList.remove('m3-btn-secondary');
    btn.classList.add('m3-btn-primary');
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    showToast('Auto-refresh disabled', 'info');
  }
}

// ========== Asset Name ==========
function updateAssetName() {
  document.getElementById('assetName').textContent = ASSET_NAMES[currentAsset] || currentAsset;
}

// ========== Load Price Data ==========
async function loadInitialData(silent) {
  try {
    if (!silent) setLoading(true);
    var response = await fetch('/api/prices/' + currentAsset);

    if (!response.ok) throw new Error('API error: ' + response.status);

    var data = await response.json();

    if (!data.success) {
      showToast(data.error || 'Failed to load price data', 'error');
      return;
    }

    updateDataSourceBadge(data.source, data.sourceError);
    updatePriceDisplay(data);
    currentPrices[currentAsset] = data.price;
    loadHistoricalData();
  } catch (error) {
    console.error('Error loading data:', error);
    if (!silent) showToast('Failed to load price data: ' + error.message, 'error');
  } finally {
    if (!silent) setLoading(false);
  }
}

function updatePriceDisplay(data) {
  document.getElementById('currentPrice').textContent = '$' + parseFloat(data.price).toFixed(2);

  var priceChangeEl = document.getElementById('priceChange');
  var change = ((data.price - data.close) / data.close) * 100;
  priceChangeEl.textContent = (change > 0 ? '+' : '') + change.toFixed(2) + '%';
  if (change > 0) {
    priceChangeEl.className = 'md-label-medium px-3 py-1 rounded-lg';
    priceChangeEl.style.background = 'rgba(134,239,172,0.15)';
    priceChangeEl.style.color = '#86efac';
  } else {
    priceChangeEl.className = 'md-label-medium px-3 py-1 rounded-lg';
    priceChangeEl.style.background = 'rgba(252,165,165,0.15)';
    priceChangeEl.style.color = '#fca5a5';
  }

  document.getElementById('dayHigh').textContent = parseFloat(data.high).toFixed(2);
  document.getElementById('dayLow').textContent = parseFloat(data.low).toFixed(2);
  document.getElementById('openPrice').textContent = parseFloat(data.open).toFixed(2);
  document.getElementById('volumeValue').textContent = (data.volume || 0).toLocaleString();
  document.getElementById('lastUpdated').textContent = 'Updated: ' + new Date().toLocaleTimeString();
}

// ========== Historical Data ==========
async function loadHistoricalData() {
  try {
    var response = await fetch('/api/prices/' + currentAsset + '/history?timeframe=' + currentTimeframe);
    if (!response.ok) throw new Error('History API error: ' + response.status);

    var result = await response.json();
    if (!result.success) {
      showToast(result.error || 'Failed to load history', 'error');
      return;
    }

    if (result.source) {
      updateDataSourceBadge(result.source, result.sourceError);
    }

    historicalData = result.data;
    renderChart();
  } catch (error) {
    console.error('Error loading historical data:', error);
    showToast('Failed to load chart data', 'error');
  }
}

// ========== Chart ==========
function initChart() {
  var ctx = document.getElementById('priceChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Price',
        data: [],
        borderColor: '#7dd3fc',
        backgroundColor: 'rgba(125, 211, 252, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 5
      }, {
        label: 'Predicted',
        data: [],
        borderColor: '#86efac',
        backgroundColor: 'rgba(134, 239, 172, 0.05)',
        borderWidth: 2,
        borderDash: [5, 5],
        tension: 0.3,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 12 } } },
        tooltip: {
          backgroundColor: '#1e2433',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(148, 163, 184, 0.2)',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(148, 163, 184, 0.06)' },
          ticks: { color: '#64748b', font: { size: 11 } }
        },
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.06)' },
          ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 15 }
        }
      }
    }
  });
}

function renderChart() {
  if (!chart || !historicalData.length) return;

  if (chartType === 'candlestick') {
    renderCandlestickChart();
  } else {
    renderLineChart();
  }
}

function formatDateLabel(d) {
  var date = new Date(d.date);
  if (currentTimeframe === 'D') {
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
}

function renderLineChart() {
  var labels = historicalData.map(formatDateLabel);
  var closes = historicalData.map(function(d) { return d.close; });

  chart.config.type = 'line';
  chart.data.labels = labels;
  chart.data.datasets = [{
    label: 'Price',
    data: closes,
    borderColor: '#7dd3fc',
    backgroundColor: 'rgba(125, 211, 252, 0.05)',
    borderWidth: 2,
    tension: 0.3,
    fill: true,
    pointRadius: 0,
    pointHoverRadius: 5,
    type: 'line'
  }, {
    label: 'Predicted',
    data: [],
    borderColor: '#86efac',
    borderWidth: 2,
    borderDash: [5, 5],
    tension: 0.3,
    fill: false,
    pointRadius: 4,
    pointHoverRadius: 6,
    type: 'line'
  }];

  chart.options.scales.y = {
    grid: { color: 'rgba(148, 163, 184, 0.06)' },
    ticks: { color: '#64748b', font: { size: 11 } }
  };
  chart.update();
}

function renderCandlestickChart() {
  var labels = historicalData.map(formatDateLabel);

  var bodyData = historicalData.map(function(d) {
    return [Math.min(d.open, d.close), Math.max(d.open, d.close)];
  });

  var colors = historicalData.map(function(d) {
    return d.close >= d.open ? 'rgba(134, 239, 172, 0.8)' : 'rgba(252, 165, 165, 0.8)';
  });
  var borderColors = historicalData.map(function(d) {
    return d.close >= d.open ? '#86efac' : '#fca5a5';
  });

  chart.data.labels = labels;
  chart.data.datasets = [{
    label: 'OHLC',
    data: bodyData,
    backgroundColor: colors,
    borderColor: borderColors,
    borderWidth: 1,
    type: 'bar',
    barPercentage: 0.6,
    categoryPercentage: 0.8
  }, {
    label: 'High',
    data: historicalData.map(function(d) { return d.high; }),
    borderColor: 'rgba(148, 163, 184, 0.3)',
    borderWidth: 1,
    pointRadius: 0,
    type: 'line',
    fill: false,
    borderDash: [2, 2]
  }, {
    label: 'Low',
    data: historicalData.map(function(d) { return d.low; }),
    borderColor: 'rgba(148, 163, 184, 0.3)',
    borderWidth: 1,
    pointRadius: 0,
    type: 'line',
    fill: false,
    borderDash: [2, 2]
  }];

  chart.options.scales.y = {
    grid: { color: 'rgba(148, 163, 184, 0.06)' },
    ticks: { color: '#64748b', font: { size: 11 } }
  };
  chart.update();
}

function setChartType(type) {
  chartType = type;
  document.getElementById('chartTypeLine').classList.toggle('active', type === 'line');
  document.getElementById('chartTypeCandlestick').classList.toggle('active', type === 'candlestick');
  renderChart();
}

function updateChartWithPrediction(prediction) {
  if (!historicalData.length || chartType !== 'line') return;

  var labels = historicalData.map(formatDateLabel);
  for (var i = 1; i <= prediction.predictions.length; i++) {
    labels.push('+' + i);
  }

  var closes = historicalData.map(function(d) { return d.close; });
  var predData = new Array(closes.length).fill(null);
  predData[closes.length - 1] = closes[closes.length - 1];
  prediction.predictions.forEach(function(p) { predData.push(p); });

  chart.data.labels = labels;
  chart.data.datasets[0].data = closes;
  if (chart.data.datasets.length >= 2) {
    chart.data.datasets[1].data = predData;
  }
  chart.update();
}

// ========== Prediction ==========
async function getPrediction() {
  setLoading(true);
  try {
    var response = await fetch('/api/predictions/' + currentAsset, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: currentModel })
    });

    if (!response.ok) throw new Error('API error: ' + response.status);

    var prediction = await response.json();

    if (!prediction.success) {
      showToast(prediction.error || 'Failed to generate prediction', 'error');
      return;
    }

    if (prediction.dataSource) {
      updateDataSourceBadge(prediction.dataSource, null);
    }

    updateSignalDisplay(prediction);
    updateIndicators(prediction.indicators);
    updatePredictionsTable(prediction.predictions, prediction.currentPrice);
    updateChartWithPrediction(prediction);
    savePredictionToHistory(prediction);

    var toastType = prediction.signal.action === 'BUY' ? 'success' : prediction.signal.action === 'SELL' ? 'warning' : 'info';
    showToast(prediction.signal.action + ' signal (' + Math.round(prediction.signal.confidence * 100) + '% confidence)', toastType);
  } catch (error) {
    console.error('Error getting prediction:', error);
    showToast('Prediction failed: ' + error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function updateSignalDisplay(prediction) {
  var signalBox = document.getElementById('signalBox');
  var signalAction = document.getElementById('signalAction');
  var confidenceBar = document.getElementById('confidenceBar');
  var confidencePercent = document.getElementById('confidencePercent');

  var signal = prediction.signal;
  var confPercent = Math.round(signal.confidence * 100);

  var styles = {
    BUY: { bg: 'rgba(134, 239, 172, 0.06)', border: 'rgba(134, 239, 172, 0.3)', color: '#86efac' },
    SELL: { bg: 'rgba(252, 165, 165, 0.06)', border: 'rgba(252, 165, 165, 0.3)', color: '#fca5a5' },
    HOLD: { bg: 'rgba(253, 224, 71, 0.06)', border: 'rgba(253, 224, 71, 0.3)', color: '#fde047' }
  };
  var s = styles[signal.action] || styles.HOLD;

  signalBox.style.background = s.bg;
  signalBox.style.borderColor = s.border;
  signalAction.textContent = signal.action;
  signalAction.style.color = s.color;

  confidenceBar.style.width = confPercent + '%';
  confidencePercent.textContent = confPercent + '%';

  document.getElementById('entryPrice').textContent = '$' + parseFloat(signal.margins.entry).toFixed(2);
  document.getElementById('stopLoss').textContent = '$' + parseFloat(signal.margins.stop).toFixed(2);
  document.getElementById('takeProfit').textContent = '$' + parseFloat(signal.margins.target).toFixed(2);
}

function updateIndicators(indicators) {
  var rsiEl = document.getElementById('rsiValue');
  var rsi = indicators.rsi;
  rsiEl.textContent = rsi.toFixed(2);
  rsiEl.style.color = rsi > 70 ? '#fca5a5' : rsi < 30 ? '#86efac' : '#7dd3fc';

  document.getElementById('macdValue').textContent = indicators.macd.toFixed(4);
  document.getElementById('bbandsValue').textContent = indicators.bbands.middle.toFixed(2);
  document.getElementById('atrValue').textContent = indicators.atr.toFixed(2);
}

function updatePredictionsTable(predictions, currentPrice) {
  var tbody = document.getElementById('predictionsTable');
  var rows = predictions.map(function(price, index) {
    var change = ((price - currentPrice) / currentPrice) * 100;
    var changeColor = change > 0 ? 'color:#86efac' : 'color:#fca5a5';
    return '<div class="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl" style="border-bottom:1px solid var(--md-sys-color-outline);transition:background 200ms;">' +
      '<div class="text-sm">Period ' + (index + 1) + '</div>' +
      '<div class="text-sm">$' + parseFloat(price).toFixed(2) + '</div>' +
      '<div class="text-sm font-semibold" style="' + changeColor + '">' + (change > 0 ? '+' : '') + change.toFixed(2) + '%</div>' +
      '</div>';
  }).join('');
  tbody.innerHTML = rows || '<div class="text-center py-4" style="color:var(--md-sys-color-on-surface-variant);">No predictions</div>';
}

// ========== Alerts ==========
async function addAlert() {
  var symbol = document.getElementById('alertSymbol').value;
  var condition = document.getElementById('alertCondition').value;
  var targetPrice = document.getElementById('alertPrice').value;

  if (!targetPrice) {
    showToast('Please enter a target price', 'warning');
    return;
  }

  try {
    var response = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, symbol: symbol, condition: condition, targetPrice: targetPrice })
    });
    var data = await response.json();
    if (data.success) {
      document.getElementById('alertPrice').value = '';
      showToast('Alert set: ' + symbol + ' ' + condition + ' $' + parseFloat(targetPrice).toFixed(2), 'success');
      loadAlerts();
    } else {
      showToast(data.error || 'Failed to create alert', 'error');
    }
  } catch (error) {
    showToast('Failed to create alert', 'error');
  }
}

async function loadAlerts() {
  try {
    var response = await fetch('/api/alerts?sessionId=' + sessionId);
    var data = await response.json();
    if (data.success) {
      renderAlerts(data.alerts);
    }
  } catch (error) {
    console.error('Failed to load alerts:', error);
  }
}

function renderAlerts(alerts) {
  var container = document.getElementById('alertsList');
  if (!alerts || alerts.length === 0) {
    container.innerHTML = '<p class="md-body-medium text-center py-3" style="color:var(--md-sys-color-on-surface-variant);">No alerts set</p>';
    return;
  }

  container.innerHTML = alerts.map(function(a) {
    var statusClass = a.triggered ? 'opacity-50' : '';
    var condIcon = a.condition === 'above' ? '📈' : '📉';
    return '<div class="m3-stat-row ' + statusClass + '">' +
      '<div class="flex items-center gap-2">' +
      '<span>' + condIcon + '</span>' +
      '<span class="md-body-medium">' + a.symbol + ' ' + a.condition + ' $' + a.targetPrice.toFixed(2) + '</span>' +
      (a.triggered ? '<span class="text-xs" style="color:#fcd34d;">✓ Triggered</span>' : '') +
      '</div>' +
      '<button onclick="deleteAlert(\'' + a.id + '\')" class="text-sm px-2" style="color:#fca5a5;cursor:pointer;background:none;border:none;">✕</button>' +
      '</div>';
  }).join('');
}

async function deleteAlert(id) {
  try {
    await fetch('/api/alerts/' + id + '?sessionId=' + sessionId, { method: 'DELETE' });
    loadAlerts();
  } catch (error) {
    showToast('Failed to delete alert', 'error');
  }
}

async function checkAlerts() {
  try {
    var response = await fetch('/api/alerts/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, prices: currentPrices })
    });
    var data = await response.json();
    if (data.success && data.triggered.length > 0) {
      data.triggered.forEach(function(a) {
        showToast('🚨 Alert: ' + a.symbol + ' is now ' + a.condition + ' $' + a.targetPrice + ' (current: $' + a.currentPrice.toFixed(2) + ')', 'alert', 8000);
      });
      loadAlerts();
    }
  } catch (error) {
    console.error('Alert check failed:', error);
  }
}

// ========== News ==========
async function loadNews() {
  var container = document.getElementById('newsFeed');
  try {
    var response = await fetch('/api/news');
    var data = await response.json();

    if (data.success && data.news.length > 0) {
      container.innerHTML = data.news.map(function(item) {
        var impactClass = item.impact === 'High' ? 'news-impact-high' :
          item.impact === 'Medium' ? 'news-impact-medium' : 'news-impact-low';
        var impactDot = item.impact === 'High' ? '🔴' :
          item.impact === 'Medium' ? '🟡' : '🟢';

        return '<div class="m3-stat-row">' +
          '<div style="flex:1;min-width:0;">' +
          '<div class="flex items-center gap-2" style="margin-bottom:2px;">' +
          '<span class="text-xs">' + impactDot + '</span>' +
          '<span class="md-label-medium ' + impactClass + '">' + (item.impact || 'Low') + '</span>' +
          '<span class="md-label-small" style="color:var(--md-sys-color-on-surface-variant);">' + (item.country || '') + '</span>' +
          '</div>' +
          '<p class="md-body-medium" style="color:var(--md-sys-color-on-surface);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + item.title + '</p>' +
          '<div class="flex gap-3" style="margin-top:4px;">' +
          '<span class="md-label-small" style="color:var(--md-sys-color-on-surface-variant);">' + (item.date || '') + ' ' + (item.time || '') + '</span>' +
          (item.forecast ? '<span class="md-label-small" style="color:var(--md-sys-color-on-surface-variant);">F: ' + item.forecast + '</span>' : '') +
          (item.previous ? '<span class="md-label-small" style="color:var(--md-sys-color-on-surface-variant);">P: ' + item.previous + '</span>' : '') +
          (item.actual ? '<span class="md-label-small" style="color:var(--md-sys-color-primary);">A: ' + item.actual + '</span>' : '') +
          '</div></div></div>';
      }).join('');

      if (data.source === 'fallback') {
        showToast('News feed unavailable, showing fallback', 'warning');
      }
    } else {
      container.innerHTML = '<p class="md-body-medium text-center py-3" style="color:var(--md-sys-color-on-surface-variant);">No news available</p>';
    }
  } catch (error) {
    console.error('Error loading news:', error);
    container.innerHTML = '<p class="md-body-medium text-center py-3" style="color:var(--md-sys-color-tertiary);">Failed to load news</p>';
  }
}

// ========== Prediction History ==========
function savePredictionToHistory(prediction) {
  var entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    asset: currentAsset,
    model: currentModel,
    signal: prediction.signal.action,
    confidence: prediction.signal.confidence,
    currentPrice: prediction.currentPrice,
    predicted: prediction.predictions[0],
    dataSource: prediction.dataSource || currentDataSource
  };

  predictionHistory.unshift(entry);
  if (predictionHistory.length > 50) predictionHistory.pop();

  try {
    localStorage.setItem('predictionHistory', JSON.stringify(predictionHistory));
  } catch (err) {
    console.warn('Failed to save to localStorage:', err);
  }

  updateHistoryDisplay();
}

function loadPredictionHistory() {
  try {
    var stored = localStorage.getItem('predictionHistory');
    if (stored) {
      predictionHistory = JSON.parse(stored);
      updateHistoryDisplay();
    }
  } catch (err) {
    console.warn('Failed to load history:', err);
  }
}

function updateHistoryDisplay() {
  var container = document.getElementById('historyContainer');

  if (predictionHistory.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center py-8" style="color:var(--md-sys-color-on-surface-variant);">No predictions yet</div>';
    updateStats();
    return;
  }

  var html = predictionHistory.slice(0, 12).map(function(entry) {
    var time = new Date(entry.timestamp).toLocaleTimeString();
    var change = ((entry.predicted - entry.currentPrice) / entry.currentPrice * 100).toFixed(2);
    var signalBorder = entry.signal === 'BUY' ? 'rgba(134,239,172,0.2)' :
      entry.signal === 'SELL' ? 'rgba(252,165,165,0.2)' : 'rgba(253,224,71,0.2)';
    var signalColor = entry.signal === 'BUY' ? '#86efac' :
      entry.signal === 'SELL' ? '#fca5a5' : '#fde047';
    var srcBadge = entry.dataSource === 'live'
      ? '<span style="color:#86efac;font-size:0.75rem;">● Live</span>'
      : '<span style="color:#fca5a5;font-size:0.75rem;">● Mock</span>';

    return '<div class="rounded-2xl p-4" style="border:1px solid ' + signalBorder + ';background:var(--md-sys-color-surface-container);transition:all 200ms;">' +
      '<div class="flex justify-between items-start" style="margin-bottom:8px;">' +
      '<span style="font-weight:700;color:' + signalColor + ';">' + entry.signal + '</span>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">' +
      '<span style="font-size:0.75rem;color:var(--md-sys-color-on-surface-variant);">' + time + '</span>' +
      srcBadge +
      '</div></div>' +
      '<div style="font-size:0.75rem;color:var(--md-sys-color-on-surface-variant);margin-bottom:8px;">' + entry.asset + ' · ' + entry.model + '</div>' +
      '<div style="font-size:0.75rem;">' +
      '<div class="flex justify-between"><span style="color:var(--md-sys-color-on-surface-variant);">Price:</span><span>$' + entry.currentPrice.toFixed(2) + '</span></div>' +
      '<div class="flex justify-between"><span style="color:var(--md-sys-color-on-surface-variant);">Predicted:</span><span>$' + entry.predicted.toFixed(2) + '</span></div>' +
      '<div class="flex justify-between"><span style="color:var(--md-sys-color-on-surface-variant);">Change:</span><span style="font-weight:600;color:' + (change > 0 ? '#86efac' : '#fca5a5') + ';">' + (change > 0 ? '+' : '') + change + '%</span></div>' +
      '<div class="flex justify-between"><span style="color:var(--md-sys-color-on-surface-variant);">Confidence:</span><span style="color:' + signalColor + ';">' + Math.round(entry.confidence * 100) + '%</span></div>' +
      '</div></div>';
  }).join('');

  container.innerHTML = html;
  updateStats();
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
