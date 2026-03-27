const TechnicalAnalysis = require('./technicalAnalysis');

class PredictionEngine {
  
  constructor() {
    this.models = {
      linear: this.linearRegression.bind(this),
      exponential: this.exponentialRegression.bind(this),
      arima: this.arimaModel.bind(this),
      ensemble: this.ensembleModel.bind(this)
    };
  }

  // Linear Regression
  linearRegression(prices) {
    const n = prices.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += prices[i];
      sumXY += i * prices[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predict next 5 prices
    const predictions = [];
    for (let i = 1; i <= 5; i++) {
      predictions.push(slope * (n + i - 1) + intercept);
    }

    return { slope, intercept, predictions };
  }

  // Exponential Regression
  exponentialRegression(prices) {
    // Using log transform for exponential curve fitting
    const logPrices = prices.map(p => Math.log(Math.max(p, 0.01))); // Avoid log(0)
    const { slope, intercept, predictions: logPredictions } = this.linearRegression(logPrices);

    const predictions = logPredictions.map(p => Math.exp(p));
    return { slope, intercept, predictions };
  }

  // Simple ARIMA Model (p=1, d=1, q=0)
  arimaModel(prices) {
    // Differencing (d=1)
    const diff = [];
    for (let i = 1; i < prices.length; i++) {
      diff.push(prices[i] - prices[i - 1]);
    }

    // AR(1) - AutoRegressive
    const { slope, intercept } = this.linearRegression(diff);
    
    // Reconstruct predictions
    const predictions = [];
    let lastPrice = prices[prices.length - 1];
    let lastDiff = diff[diff.length - 1];

    for (let i = 0; i < 5; i++) {
      const nextDiff = slope * i + intercept;
      const nextPrice = lastPrice + nextDiff;
      predictions.push(nextPrice);
      lastPrice = nextPrice;
    }

    return { predictions, diff };
  }

  // Ensemble Model combining multiple predictions
  ensembleModel(prices) {
    const linear = this.linearRegression(prices).predictions;
    const exponential = this.exponentialRegression(prices).predictions;
    const arima = this.arimaModel(prices).predictions;

    const predictions = [];
    for (let i = 0; i < 5; i++) {
      // Weighted average: Linear 40%, Exponential 30%, ARIMA 30%
      const avg = (linear[i] * 0.4 + exponential[i] * 0.3 + arima[i] * 0.3);
      predictions.push(avg);
    }

    return { predictions, models: { linear, exponential, arima } };
  }

  // Main prediction function
  predict(priceData, model = 'ensemble') {
    if (!priceData || priceData.length < 14) {
      return { error: 'Insufficient data for prediction' };
    }

    const closes = priceData.map(d => d.close);
    const highs = priceData.map(d => d.high);
    const lows = priceData.map(d => d.low);

    // Calculate technical indicators
    const rsi = TechnicalAnalysis.RSI(closes, 14);
    const macd = TechnicalAnalysis.MACD(closes);
    const bbands = TechnicalAnalysis.BollingerBands(closes, 20);
    const atr = TechnicalAnalysis.ATR(highs, lows, closes, 14);

    // Get predictions
    const prediction = this.models[model](closes);

    // Generate signals
    const currentPrice = closes[closes.length - 1];
    const nextPrice = prediction.predictions[0];
    const priceChange = ((nextPrice - currentPrice) / currentPrice) * 100;

    const signal = this.generateSignal(
      priceChange,
      rsi[rsi.length - 1],
      macd.histogram[macd.histogram.length - 1],
      bbands[bbands.length - 1],
      currentPrice
    );

    return {
      currentPrice,
      predictions: prediction.predictions,
      priceChange: parseFloat(priceChange.toFixed(2)),
      signal,
      indicators: {
        rsi: rsi[rsi.length - 1],
        macd: macd.histogram[macd.histogram.length - 1],
        bbands: bbands[bbands.length - 1],
        atr: atr[atr.length - 1]
      },
      timestamp: new Date()
    };
  }

  // Generate Buy/Sell signals
  generateSignal(priceChange, rsi, macdHist, bbands, currentPrice) {
    let signal = { action: 'HOLD', confidence: 0, margins: { entry: currentPrice, stop: 0, target: 0 } };

    // RSI signals: < 30 (oversold, buy), > 70 (overbought, sell)
    let rsiSignal = null;
    if (rsi < 30) rsiSignal = 'BUY';
    else if (rsi > 70) rsiSignal = 'SELL';

    // MACD signals: positive histogram (bullish), negative (bearish)
    let macdSignal = null;
    if (macdHist > 0) macdSignal = 'BUY';
    else if (macdHist < 0) macdSignal = 'SELL';

    // Bollinger Bands: touch lower band (buy), upper band (sell)
    let bbSignal = null;
    const volatility = (bbands.upper - bbands.lower) / bbands.middle;
    if (currentPrice <= bbands.lower * 1.02) bbSignal = 'BUY';
    else if (currentPrice >= bbands.upper * 0.98) bbSignal = 'SELL';

    // Consensus
    let buyCount = 0, sellCount = 0;
    if (rsiSignal === 'BUY') buyCount++;
    if (rsiSignal === 'SELL') sellCount++;
    if (macdSignal === 'BUY') buyCount++;
    if (macdSignal === 'SELL') sellCount++;
    if (bbSignal === 'BUY') buyCount++;
    if (bbSignal === 'SELL') sellCount++;

    if (buyCount > sellCount) {
      signal.action = 'BUY';
      signal.confidence = buyCount / 3;
      signal.margins.stop = currentPrice * 0.98;  // 2% stop loss
      signal.margins.target = currentPrice * 1.03; // 3% take profit
    } else if (sellCount > buyCount) {
      signal.action = 'SELL';
      signal.confidence = sellCount / 3;
      signal.margins.stop = currentPrice * 1.02;  // 2% stop loss
      signal.margins.target = currentPrice * 0.97; // 3% take profit
    }

    return signal;
  }
}

module.exports = new PredictionEngine();
