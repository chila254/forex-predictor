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
 * Show/hide loading state on predict button
 */
function setLoading(isLoading) {
  const btn = document.getElementById('predictBtn');
  const original = btn.textContent;
  
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
 * Show toast notifications (errors, success, info)
 */
function showToast(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  const colors = {
    success: { bg: '#00ff88', text: '#000' },
    error: { bg: '#ff6666', text: '#fff' },
    warning: { bg: '#ffc800', text: '#000' },
    info: { bg: '#00d4ff', text: '#000' }
  };
  
  const color = colors[type] || colors.info;
  
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${color.bg};
    color: ${color.text};
    padding: 15px 20px;
    border-radius: 5px;
    z-index: 10000;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Add CSS animations
 */
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

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
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      showToast(data.error || 'Failed to load price data', 'error');
      return;
    }
    
    updatePriceDisplay(data);
  } catch (error) {
    console.error('Error loading data:', error);
    showToast('Failed to load price data. Check your connection.', 'error');
  } finally {
    setLoading(false);
  }
}

function updatePriceDisplay(data) {
  document.getElementById('currentPrice').textContent = `$${parseFloat(data.price).toFixed(2)}`;
  
  const priceChangeEl = document.getElementById('priceChange');
  const change = ((data.price - data.close) / data.close) * 100;
  priceChangeEl.textContent = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
  priceChangeEl.className = change > 0 ? 'price-change' : 'price-change negative';

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
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const prediction = await response.json();
    
    if (!prediction.success) {
      showToast(prediction.error || 'Failed to generate prediction', 'error');
      return;
    }

    // Update UI
    updateSignalDisplay(prediction);
    updateIndicators(prediction.indicators);
    updatePredictionsTable(prediction.predictions, prediction.currentPrice);
    updateChart(prediction);
    
    // Save to history
    savePredictionToHistory(prediction);
    
    // Show success
    showToast(
      `${prediction.signal.action} signal generated (${Math.round(prediction.signal.confidence * 100)}% confidence)`,
      'success'
    );
    
    // Log response time
    if (prediction.responseTime) {
      console.log(`Prediction generated in ${prediction.responseTime}ms`);
    }
  } catch (error) {
    console.error('Error getting prediction:', error);
    showToast(error.message || 'Failed to generate prediction. Try again.', 'error');
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
  
  signalBox.className = 'signal-box ' + signal.action.toLowerCase();
  signalAction.textContent = signal.action;
  
  const confPercent = Math.round(signal.confidence * 100);
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
  const tbody = document.querySelector('.predictions-table tbody');
  tbody.innerHTML = '';

  predictions.forEach((price, index) => {
    const change = ((price - currentPrice) / currentPrice) * 100;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>Period ${index + 1}</td>
      <td>$${parseFloat(price).toFixed(2)}</td>
      <td>${change > 0 ? '+' : ''}${change.toFixed(2)}%</td>
    `;
    tbody.appendChild(row);
  });
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
          fill: true
        },
        {
          label: 'Predicted Price',
          data: [],
          borderColor: '#00ff88',
          backgroundColor: 'rgba(0, 255, 136, 0.1)',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#fff' }
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(0, 212, 255, 0.1)' },
          ticks: { color: '#888' }
        },
        x: {
          grid: { color: 'rgba(0, 212, 255, 0.1)' },
          ticks: { color: '#888' }
        }
      }
    }
  });
}

function updateChart(prediction) {
  // Mock historical data
  const historical = [];
  for (let i = 20; i > 0; i--) {
    historical.push(prediction.currentPrice - Math.random() * 5);
  }

  const labels = [];
  for (let i = 20; i > 0; i--) {
    labels.push(`-${i}`);
  }
  for (let i = 1; i <= 5; i++) {
    labels.push(`+${i}`);
  }

  chart.data.labels = labels;
  chart.data.datasets[0].data = [...historical, prediction.currentPrice];
  chart.data.datasets[1].data = [
    ...Array(21).fill(null),
    ...prediction.predictions
  ];
  chart.update();
}

/**
 * Prediction History Management
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
    predicted: prediction.predictions[0],
    indicators: prediction.indicators
  };
  
  predictionHistory.unshift(entry); // Add to beginning
  
  // Keep only last 50 predictions
  if (predictionHistory.length > 50) {
    predictionHistory.pop();
  }
  
  // Save to localStorage
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
    container.innerHTML = `
      <div style="text-align: center; color: #aaa; padding: 20px; grid-column: 1/-1;">
        No predictions yet. Make your first prediction!
      </div>
    `;
    return;
  }
  
  const recent = predictionHistory.slice(0, 10);
  const html = recent.map(entry => {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const change = ((entry.predicted - entry.currentPrice) / entry.currentPrice * 100).toFixed(2);
    const signalColor = entry.signal === 'BUY' ? '#00ff88' : entry.signal === 'SELL' ? '#ff6666' : '#ffc800';
    
    return `
      <div style="
        background: rgba(0, 212, 255, 0.05);
        border: 1px solid ${signalColor};
        border-radius: 8px;
        padding: 15px;
        font-size: 0.9em;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <strong style="color: ${signalColor};">${entry.signal}</strong>
          <small style="color: #888;">${time}</small>
        </div>
        <div style="margin: 5px 0; color: #aaa;">
          <small>${entry.asset} (${entry.model})</small>
        </div>
        <div style="margin: 5px 0;">
          <small>Price: $${entry.currentPrice.toFixed(2)}</small><br>
          <small>Predicted: $${entry.predicted.toFixed(2)}</small><br>
          <small style="color: ${change > 0 ? '#00ff88' : '#ff6666'};">
            ${change > 0 ? '+' : ''}${change}%
          </small>
        </div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0, 212, 255, 0.2);">
          <small style="color: ${signalColor};">
            Confidence: ${Math.round(entry.confidence * 100)}%
          </small>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
  
  console.log(`Recent predictions (${predictionHistory.length} total)`);
}

function clearHistory() {
  if (confirm('Are you sure? This will delete all prediction history.')) {
    predictionHistory = [];
    localStorage.removeItem('predictionHistory');
    showToast('Prediction history cleared', 'info');
  }
}
