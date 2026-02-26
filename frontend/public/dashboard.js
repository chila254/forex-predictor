let chart = null;
let currentAsset = 'XAUUSD';
let currentModel = 'ensemble';
let predictionHistory = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initChart();
  loadInitialData();
  loadPredictionHistory();
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
  document.getElementById('refreshBtn').addEventListener('click', loadInitialData);
}

/**
 * Loading state management
 */
function setLoading(isLoading) {
  const btn = document.getElementById('predictBtn');
  if (isLoading) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Predicting...';
    btn.style.opacity = '0.6';
  } else {
    btn.disabled = false;
    btn.innerHTML = '🔮 Predict Now';
    btn.style.opacity = '1';
  }
}

/**
 * Toast notifications
 */
function showToast(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  
  const colors = {
    success: { bg: 'bg-green-600', text: 'text-green-100' },
    error: { bg: 'bg-red-600', text: 'text-red-100' },
    warning: { bg: 'bg-yellow-600', text: 'text-yellow-100' },
    info: { bg: 'bg-blue-600', text: 'text-blue-100' }
  };
  
  const color = colors[type] || colors.info;
  
  toast.className = `fixed top-4 right-4 z-50 ${color.bg} ${color.text} px-6 py-3 rounded-lg font-semibold shadow-lg`;
  toast.textContent = message;
  toast.style.animation = 'slideIn 0.3s ease-out';
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function updateAssetName() {
  const names = {
    XAUUSD: 'Gold (XAU/USD)',
    EURUSD: 'EUR/USD',
    GBPUSD: 'GBP/USD',
    USDJPY: 'USD/JPY'
  };
  document.getElementById('assetName').textContent = names[currentAsset];
}

async function loadInitialData() {
  try {
    setLoading(true);
    const response = await fetch(`/api/prices/${currentAsset}`);
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const data = await response.json();
    
    if (!data.success) {
      showToast(data.error || 'Failed to load price data', 'error');
      return;
    }
    
    updatePriceDisplay(data);
  } catch (error) {
    console.error('Error loading data:', error);
    showToast('Failed to load price data', 'error');
  } finally {
    setLoading(false);
  }
}

function updatePriceDisplay(data) {
  document.getElementById('currentPrice').textContent = `$${parseFloat(data.price).toFixed(2)}`;
  
  const priceChangeEl = document.getElementById('priceChange');
  const change = ((data.price - data.close) / data.close) * 100;
  priceChangeEl.textContent = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
  priceChangeEl.className = change > 0 
    ? 'px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-semibold'
    : 'px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-semibold';

  document.getElementById('dayHigh').textContent = parseFloat(data.high).toFixed(2);
  document.getElementById('dayLow').textContent = parseFloat(data.low).toFixed(2);
  document.getElementById('openPrice').textContent = parseFloat(data.open).toFixed(2);
}

async function getPrediction() {
  setLoading(true);
  
  try {
    const response = await fetch(`/api/predictions/${currentAsset}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: currentModel })
    });
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const prediction = await response.json();
    
    if (!prediction.success) {
      showToast(prediction.error || 'Failed to generate prediction', 'error');
      return;
    }

    updateSignalDisplay(prediction);
    updateIndicators(prediction.indicators);
    updatePredictionsTable(prediction.predictions, prediction.currentPrice);
    updateChart(prediction);
    savePredictionToHistory(prediction);
    
    showToast(
      `${prediction.signal.action} signal (${Math.round(prediction.signal.confidence * 100)}% confidence)`,
      'success'
    );
  } catch (error) {
    console.error('Error getting prediction:', error);
    showToast(error.message || 'Failed to generate prediction', 'error');
  } finally {
    setLoading(false);
  }
}

function updateSignalDisplay(prediction) {
  const signalBox = document.getElementById('signalBox');
  const signalAction = document.getElementById('signalAction');
  const confidenceBar = document.getElementById('confidenceBar');
  const confidencePercent = document.getElementById('confidencePercent');

  const signal = prediction.signal;
  const confPercent = Math.round(signal.confidence * 100);
  
  signalBox.className = `rounded-lg p-6 text-center space-y-3 border-2 ${
    signal.action === 'BUY' ? 'bg-green-900/20 border-green-500' :
    signal.action === 'SELL' ? 'bg-red-900/20 border-red-500' :
    'bg-yellow-900/20 border-yellow-500'
  }`;
  
  signalAction.textContent = signal.action;
  signalAction.className = `text-4xl font-bold ${
    signal.action === 'BUY' ? 'text-green-400' :
    signal.action === 'SELL' ? 'text-red-400' :
    'text-yellow-400'
  }`;
  
  confidenceBar.style.width = confPercent + '%';
  confidencePercent.textContent = confPercent + '%';

  document.getElementById('entryPrice').textContent = `$${parseFloat(signal.margins.entry).toFixed(2)}`;
  document.getElementById('stopLoss').textContent = `$${parseFloat(signal.margins.stop).toFixed(2)}`;
  document.getElementById('takeProfit').textContent = `$${parseFloat(signal.margins.target).toFixed(2)}`;
}

function updateIndicators(indicators) {
  document.getElementById('rsiValue').textContent = indicators.rsi.toFixed(2);
  document.getElementById('macdValue').textContent = indicators.macd.toFixed(4);
  document.getElementById('bbandsValue').textContent = indicators.bbands.middle.toFixed(2);
  document.getElementById('atrValue').textContent = indicators.atr.toFixed(2);
}

function updatePredictionsTable(predictions, currentPrice) {
  const tbody = document.getElementById('predictionsTable');
  const rows = predictions.map((price, index) => {
    const change = ((price - currentPrice) / currentPrice) * 100;
    const changeColor = change > 0 ? 'text-green-400' : 'text-red-400';
    
    return `
      <div class="grid grid-cols-3 gap-2 py-2 border-b border-cyan-900/20 hover:bg-cyan-900/10 px-2 rounded">
        <div class="text-sm">Period ${index + 1}</div>
        <div class="text-sm">$${parseFloat(price).toFixed(2)}</div>
        <div class="text-sm font-semibold ${changeColor}">${change > 0 ? '+' : ''}${change.toFixed(2)}%</div>
      </div>
    `;
  }).join('');
  
  tbody.innerHTML = rows || '<div class="text-center text-gray-400 py-4">No predictions</div>';
}

function initChart() {
  const ctx = document.getElementById('predictionChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Historical Price',
          data: [],
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0, 212, 255, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 6
        },
        {
          label: 'Predicted Price',
          data: [],
          borderColor: '#00ff88',
          backgroundColor: 'rgba(0, 255, 136, 0.1)',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#888', font: { size: 12 } }
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(0, 212, 255, 0.05)' },
          ticks: { color: '#888', font: { size: 11 } }
        },
        x: {
          grid: { color: 'rgba(0, 212, 255, 0.05)' },
          ticks: { color: '#888', font: { size: 11 } }
        }
      }
    }
  });
}

function updateChart(prediction) {
  const historical = [];
  for (let i = 20; i > 0; i--) {
    historical.push(prediction.currentPrice - Math.random() * 5);
  }

  const labels = [];
  for (let i = 20; i > 0; i--) labels.push(`-${i}`);
  for (let i = 1; i <= 5; i++) labels.push(`+${i}`);

  chart.data.labels = labels;
  chart.data.datasets[0].data = [...historical, prediction.currentPrice];
  chart.data.datasets[1].data = [...Array(21).fill(null), ...prediction.predictions];
  chart.update();
}

/**
 * Prediction History
 */
function savePredictionToHistory(prediction) {
  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    asset: currentAsset,
    model: currentModel,
    signal: prediction.signal.action,
    confidence: prediction.signal.confidence,
    currentPrice: prediction.currentPrice,
    predicted: prediction.predictions[0]
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
    const stored = localStorage.getItem('predictionHistory');
    if (stored) {
      predictionHistory = JSON.parse(stored);
      updateHistoryDisplay();
    }
  } catch (err) {
    console.warn('Failed to load history:', err);
  }
}

function updateHistoryDisplay() {
  const container = document.getElementById('historyContainer');
  
  if (predictionHistory.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center text-gray-400 py-8">No predictions yet</div>';
    updateStats();
    return;
  }
  
  const html = predictionHistory.slice(0, 12).map(entry => {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const change = ((entry.predicted - entry.currentPrice) / entry.currentPrice * 100).toFixed(2);
    const signalBg = entry.signal === 'BUY' ? 'bg-green-900/20 border-green-500' : 
                     entry.signal === 'SELL' ? 'bg-red-900/20 border-red-500' : 
                     'bg-yellow-900/20 border-yellow-500';
    const signalColor = entry.signal === 'BUY' ? 'text-green-400' : 
                        entry.signal === 'SELL' ? 'text-red-400' : 
                        'text-yellow-400';
    
    return `
      <div class="glass rounded-lg p-4 border-2 ${signalBg}">
        <div class="flex justify-between items-start mb-2">
          <span class="font-bold ${signalColor}">${entry.signal}</span>
          <span class="text-xs text-gray-400">${time}</span>
        </div>
        <div class="text-xs text-gray-400 mb-2">${entry.asset} • ${entry.model}</div>
        <div class="space-y-1 text-xs">
          <div class="flex justify-between">
            <span class="text-gray-400">Price:</span>
            <span class="text-gray-200">$${entry.currentPrice.toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Predicted:</span>
            <span class="text-gray-200">$${entry.predicted.toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Change:</span>
            <span class="font-semibold" style="color: ${change > 0 ? '#00ff88' : '#ff6666'}">${change > 0 ? '+' : ''}${change}%</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Confidence:</span>
            <span class="${signalColor}">${Math.round(entry.confidence * 100)}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
  updateStats();
}

function updateStats() {
  document.getElementById('totalPredictions').textContent = predictionHistory.length;
  const buyCount = predictionHistory.filter(p => p.signal === 'BUY').length;
  const sellCount = predictionHistory.filter(p => p.signal === 'SELL').length;
  const holdCount = predictionHistory.filter(p => p.signal === 'HOLD').length;
  
  document.getElementById('buyCount').textContent = buyCount;
  document.getElementById('sellCount').textContent = sellCount;
  document.getElementById('holdCount').textContent = holdCount;
}

function clearHistory() {
  if (confirm('Delete all prediction history?')) {
    predictionHistory = [];
    localStorage.removeItem('predictionHistory');
    updateHistoryDisplay();
    showToast('History cleared', 'info');
  }
}
