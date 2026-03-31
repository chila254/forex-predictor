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
    const currentATR = atr.length > 0 ? atr[atr.length - 1] : currentPrice * 0.001;
    const currentRSI = rsi[rsi.length - 1];
    const currentMACD = macd.histogram[macd.histogram.length - 1];
    const prevMACD = macd.histogram.length > 1 ? macd.histogram[macd.histogram.length - 2] : 0;
    const currentBB = bbands[bbands.length - 1];

    // EMA trend: compare short EMA vs long EMA for trend direction
    const ema9 = TechnicalAnalysis.EMA(closes, Math.min(9, closes.length - 1));
    const ema21 = TechnicalAnalysis.EMA(closes, Math.min(21, closes.length - 1));
    const emaTrend = ema9[ema9.length - 1] > ema21[ema21.length - 1] ? 'BULL' : 'BEAR';

    // Stochastic for overbought/oversold confirmation
    const stoch = TechnicalAnalysis.Stochastic(closes, Math.min(14, closes.length - 1));
    const currentStoch = stoch.length > 0 ? stoch[stoch.length - 1] : 50;

    const signal = this.generateSignal(
      priceChange, currentRSI, currentMACD, prevMACD, currentBB,
      currentPrice, currentATR, emaTrend, currentStoch
    );

    return {
      currentPrice,
      predictions: prediction.predictions,
      priceChange: parseFloat(priceChange.toFixed(2)),
      signal,
      indicators: {
        rsi: currentRSI,
        macd: currentMACD,
        bbands: currentBB,
        atr: currentATR,
        stochastic: currentStoch,
        emaTrend
      },
      timestamp: new Date()
    };
  }

  // Generate Buy/Sell signals using multi-indicator scoring
  generateSignal(priceChange, rsi, macdHist, prevMacdHist, bbands, currentPrice, atr, emaTrend, stoch) {
    let score = 0;
    const reasons = [];

    // 1. RSI — continuous scoring, not just extremes
    if (rsi < 20) { score += 1.5; reasons.push('RSI oversold (' + rsi.toFixed(0) + ')'); }
    else if (rsi < 40) { score += 1.0; reasons.push('RSI bullish (' + rsi.toFixed(0) + ')'); }
    else if (rsi < 50) { score += 0.3; reasons.push('RSI lean buy (' + rsi.toFixed(0) + ')'); }
    else if (rsi > 80) { score -= 1.5; reasons.push('RSI overbought (' + rsi.toFixed(0) + ')'); }
    else if (rsi > 60) { score -= 1.0; reasons.push('RSI bearish (' + rsi.toFixed(0) + ')'); }
    else if (rsi >= 50) { score -= 0.3; reasons.push('RSI lean sell (' + rsi.toFixed(0) + ')'); }

    // 2. MACD — crossovers are strong, but direction always counts
    if (macdHist > 0 && prevMacdHist <= 0) { score += 1.5; reasons.push('MACD bullish crossover'); }
    else if (macdHist < 0 && prevMacdHist >= 0) { score -= 1.5; reasons.push('MACD bearish crossover'); }
    else if (macdHist > 0) { score += 0.75; reasons.push('MACD bullish'); }
    else if (macdHist < 0) { score -= 0.75; reasons.push('MACD bearish'); }

    // 3. Bollinger Bands — where price sits in the range
    const bbRange = bbands.upper - bbands.lower;
    const bbPos = bbRange > 0 ? (currentPrice - bbands.lower) / bbRange : 0.5;
    if (bbPos <= 0.1) { score += 1.0; reasons.push('Price at lower BB'); }
    else if (bbPos <= 0.35) { score += 0.5; reasons.push('Price in lower BB zone'); }
    else if (bbPos >= 0.9) { score -= 1.0; reasons.push('Price at upper BB'); }
    else if (bbPos >= 0.65) { score -= 0.5; reasons.push('Price in upper BB zone'); }

    // 4. EMA trend — always contributes
    if (emaTrend === 'BULL') { score += 1.0; reasons.push('EMA uptrend'); }
    else { score -= 1.0; reasons.push('EMA downtrend'); }

    // 5. Stochastic — wider zones
    if (stoch < 25) { score += 0.75; reasons.push('Stoch oversold'); }
    else if (stoch < 45) { score += 0.25; reasons.push('Stoch low'); }
    else if (stoch > 75) { score -= 0.75; reasons.push('Stoch overbought'); }
    else if (stoch > 55) { score -= 0.25; reasons.push('Stoch high'); }

    // 6. Model prediction direction
    if (priceChange > 0.01) { score += 0.75; reasons.push('Model predicts up'); }
    else if (priceChange < -0.01) { score -= 0.75; reasons.push('Model predicts down'); }

    // Determine action — threshold at ±0.5 so most conditions produce a signal
    const maxScore = 6.5;
    let action = 'HOLD';
    let confidence = 0;

    if (score >= 0.5) {
      action = 'BUY';
      confidence = Math.min(0.3 + (score / maxScore) * 0.65, 0.95);
    } else if (score <= -0.5) {
      action = 'SELL';
      confidence = Math.min(0.3 + (Math.abs(score) / maxScore) * 0.65, 0.95);
    } else {
      action = 'HOLD';
      confidence = 0.5;
    }

    // ATR-based stop loss and take profit (tight, realistic margins)
    // SL = 1.5x ATR, TP = 2x ATR (1:1.33 R:R minimum)
    const slDistance = atr * 1.5;
    const tpDistance = atr * 2.0;

    let stop, target;
    if (action === 'BUY') {
      stop = currentPrice - slDistance;
      target = currentPrice + tpDistance;
    } else if (action === 'SELL') {
      stop = currentPrice + slDistance;
      target = currentPrice - tpDistance;
    } else {
      stop = currentPrice - slDistance;
      target = currentPrice + tpDistance;
    }

    const summary = action === 'BUY'
      ? `Buy — price expected to rise. Enter at $${currentPrice.toFixed(currentPrice > 100 ? 2 : 5)}, stop at $${stop.toFixed(currentPrice > 100 ? 2 : 5)}, target $${target.toFixed(currentPrice > 100 ? 2 : 5)} (R:R 1:${(tpDistance / slDistance).toFixed(1)})`
      : action === 'SELL'
      ? `Sell — price expected to drop. Enter at $${currentPrice.toFixed(currentPrice > 100 ? 2 : 5)}, stop at $${stop.toFixed(currentPrice > 100 ? 2 : 5)}, target $${target.toFixed(currentPrice > 100 ? 2 : 5)} (R:R 1:${(tpDistance / slDistance).toFixed(1)})`
      : `Hold — no strong directional bias. Wait for clearer entry signal.`;

    return {
      action,
      confidence: parseFloat(confidence.toFixed(3)),
      summary,
      margins: {
        entry: currentPrice,
        stop: parseFloat(stop.toFixed(currentPrice > 100 ? 2 : 5)),
        target: parseFloat(target.toFixed(currentPrice > 100 ? 2 : 5)),
        slPips: parseFloat((slDistance * (currentPrice > 100 ? 10 : 10000)).toFixed(1)),
        tpPips: parseFloat((tpDistance * (currentPrice > 100 ? 10 : 10000)).toFixed(1)),
        riskReward: parseFloat((tpDistance / slDistance).toFixed(2))
      },
      score: parseFloat(score.toFixed(2)),
      reasons
    };
  }
}

module.exports = new PredictionEngine();
