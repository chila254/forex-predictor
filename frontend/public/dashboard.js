const socket = io();
let chart = null;
let currentAsset = 'XAUUSD';
let currentModel = 'ensemble';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initChart();
  loadInitialData();
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

  // Subscribe to real-time updates
  socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('subscribe', currentAsset);
  });

  socket.on('priceUpdate', (data) => {
    if (data.symbol === currentAsset) {
      updatePriceDisplay(data);
    }
  });
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
    const response = await fetch(`/api/prices/${currentAsset}`);
    const data = await response.json();
    updatePriceDisplay(data);
  } catch (error) {
    console.error('Error loading data:', error);
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
  try {
    const response = await fetch(`/api/predictions/${currentAsset}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: currentModel })
    });
    const prediction = await response.json();
    
    if (prediction.error) {
      alert('Error: ' + prediction.error);
      return;
    }

    updateSignalDisplay(prediction);
    updateIndicators(prediction.indicators);
    updatePredictionsTable(prediction.predictions, prediction.currentPrice);
    updateChart(prediction);
  } catch (error) {
    console.error('Error getting prediction:', error);
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
