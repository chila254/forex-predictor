const TechnicalAnalysis = require('./technicalAnalysis');
const { getSpreadConfig } = require('../config/tradingCosts');

// Hand-picked default indicator weights. The backtest/weight validator may
// override these at runtime via applyWeights() once out-of-sample evidence is
// stable; these values remain the reference for shrink-to-default.
const DEFAULT_WEIGHTS = {
  rsi: 1.5, macd: 1.5, bb: 1.0, ema: 1.0, stoch: 0.75,
  adx: 0.5, sr: 0.5, model: 0.75, trendBias: 0.5
};
// Sum of every positive maximum contribution; used to normalise confidence.
const MAX_SCORE = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);

class PredictionEngine {
  
  constructor() {
    this.models = {
      linear: this.linearRegression.bind(this),
      exponential: this.exponentialRegression.bind(this),
      arima: this.arimaModel.bind(this),
      naive: this.naiveModel.bind(this),
      ensemble: this.adaptiveEnsemble.bind(this)
    };
    // Walk-forward weights are O(n²); cache them per distinct series.
    this._weightCache = new Map();
    this._weightCacheMax = 64;
    this._activeWeights = null; // runtime override set by applyWeights()
  }

  getActiveWeights() {
    return this._activeWeights || DEFAULT_WEIGHTS;
  }

  // Auto-apply validated weights. Passing null restores the defaults.
  applyWeights(weights) {
    this._activeWeights = weights || null;
  }

  _seriesKey(prices) {
    // Length + last three closes uniquely identify a refreshed series.
    const n = prices.length;
    const tail = prices.slice(-3).map(p => p.toFixed(6)).join(',');
    return `${n}|${tail}`;
  }

  // Naive model (random walk baseline) — next price = last price
  naiveModel(prices) {
    const last = prices[prices.length - 1];
    return { predictions: Array(5).fill(last) };
  }

  // Linear Regression on recent window (last 30 bars, not full history)
  linearRegression(prices) {
    const window = Math.min(30, prices.length);
    const recent = prices.slice(-window);
    const n = recent.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += recent[i];
      sumXY += i * recent[i];
      sumX2 += i * i;
    }

    const denom = n * sumX2 - sumX * sumX;
    const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const predictions = [];
    for (let i = 1; i <= 5; i++) {
      predictions.push(slope * (n + i - 1) + intercept);
    }

    return { slope, intercept, predictions };
  }

  // Exponential Regression (capped to prevent explosion)
  exponentialRegression(prices) {
    const window = Math.min(30, prices.length);
    const recent = prices.slice(-window);
    const logPrices = recent.map(p => Math.log(Math.max(p, 0.01)));
    const n = logPrices.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += logPrices[i];
      sumXY += i * logPrices[i];
      sumX2 += i * i;
    }

    const denom = n * sumX2 - sumX * sumX;
    const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const predictions = [];
    const lastPrice = prices[prices.length - 1];
    for (let i = 1; i <= 5; i++) {
      let pred = Math.exp(slope * (n + i - 1) + intercept);
      // Cap to prevent explosion: max 5% move per step
      const maxMove = lastPrice * 0.05 * i;
      pred = Math.max(lastPrice - maxMove, Math.min(lastPrice + maxMove, pred));
      predictions.push(pred);
    }

    return { slope, intercept, predictions };
  }

  // ARIMA(1,1,0) on log returns (more stable for forex)
  arimaModel(prices) {
    if (prices.length < 3) {
      return { predictions: Array(5).fill(prices[prices.length - 1]) };
    }

    // Compute log returns
    const logReturns = [];
    for (let i = 1; i < prices.length; i++) {
      logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }

    if (logReturns.length < 2) {
      return { predictions: Array(5).fill(prices[prices.length - 1]) };
    }

    // AR(1): regress return[t] on return[t-1]
    const x = logReturns.slice(0, -1);
    const y = logReturns.slice(1);

    const meanX = x.reduce((a, b) => a + b, 0) / x.length;
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;

    let num = 0, den = 0;
    for (let i = 0; i < x.length; i++) {
      num += (x[i] - meanX) * (y[i] - meanY);
      den += (x[i] - meanX) ** 2;
    }

    const phi = den === 0 ? 0 : Math.max(-0.99, Math.min(0.99, num / den));
    const c = meanY - phi * meanX;

    const predictions = [];
    let lastPrice = prices[prices.length - 1];
    let lastReturn = logReturns[logReturns.length - 1];

    for (let i = 0; i < 5; i++) {
      lastReturn = c + phi * lastReturn;
      lastPrice = lastPrice * Math.exp(lastReturn);
      predictions.push(lastPrice);
    }

    return { predictions, phi, c };
  }

  // Walk-forward backtest to compute model weights
  computeAdaptiveWeights(prices) {
    const cacheKey = this._seriesKey(prices);
    const cached = this._weightCache.get(cacheKey);
    if (cached) return cached;

    const weights = this._computeWeightsUncached(prices);

    if (this._weightCache.size >= this._weightCacheMax) {
      // Evict oldest entry (Map preserves insertion order).
      this._weightCache.delete(this._weightCache.keys().next().value);
    }
    this._weightCache.set(cacheKey, weights);
    return weights;
  }

  _computeWeightsUncached(prices) {
    const testWindow = Math.min(30, Math.floor(prices.length * 0.3));
    const trainEnd = prices.length - testWindow;

    if (trainEnd < 20) {
      // Not enough data for walk-forward, use equal weights
      return { linear: 0.3, arima: 0.4, exponential: 0.15, naive: 0.15 };
    }

    const modelNames = ['linear', 'arima', 'exponential', 'naive'];
    const scores = {};

    for (const name of modelNames) {
      let hits = 0;
      let totalError = 0;
      let count = 0;

      for (let i = trainEnd; i < prices.length - 1; i++) {
        const trainData = prices.slice(0, i);
        try {
          const result = this.models[name](trainData);
          const predicted = result.predictions[0];
          const actual = prices[i];

          // Directional accuracy
          const predictedDir = predicted > trainData[trainData.length - 1] ? 1 : -1;
          const actualDir = actual > trainData[trainData.length - 1] ? 1 : -1;
          if (predictedDir === actualDir) hits++;

          totalError += Math.abs(predicted - actual);
          count++;
        } catch (e) {
          // Model failed, skip
        }
      }

      if (count > 0) {
        const hitRate = hits / count;
        const mae = totalError / count;
        const epsilon = prices[prices.length - 1] * 0.0001;
        scores[name] = hitRate / (mae + epsilon);
      } else {
        scores[name] = 0;
      }
    }

    // Normalize weights
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    const weights = {};
    for (const name of modelNames) {
      weights[name] = total > 0 ? Math.min(0.6, scores[name] / total) : 0.25;
    }

    // Re-normalize after capping
    const capTotal = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const name of modelNames) {
      weights[name] = capTotal > 0 ? weights[name] / capTotal : 0.25;
    }

    return weights;
  }

  // Adaptive Ensemble — replaces fixed 40/30/30
  adaptiveEnsemble(prices) {
    const weights = this.computeAdaptiveWeights(prices);
    const modelNames = ['linear', 'arima', 'exponential', 'naive'];
    const results = {};

    for (const name of modelNames) {
      try {
        results[name] = this.models[name](prices).predictions;
      } catch (e) {
        results[name] = Array(5).fill(prices[prices.length - 1]);
      }
    }

    const predictions = [];
    for (let i = 0; i < 5; i++) {
      let weighted = 0;
      for (const name of modelNames) {
        weighted += (results[name][i] || prices[prices.length - 1]) * (weights[name] || 0);
      }
      predictions.push(weighted);
    }

    return { predictions, weights, models: results };
  }

  // Detect market regime
  detectRegime(closes) {
    const ema20 = TechnicalAnalysis.EMA(closes, Math.min(20, closes.length - 1));
    const ema50 = TechnicalAnalysis.EMA(closes, Math.min(50, closes.length - 1));

    const currentEma20 = ema20[ema20.length - 1];
    const currentEma50 = ema50[ema50.length - 1];
    const prevEma20 = ema20.length > 5 ? ema20[ema20.length - 6] : currentEma20;

    // EMA20 slope as % of price
    const emaSlope = (currentEma20 - prevEma20) / prevEma20;
    const emaSeparation = (currentEma20 - currentEma50) / currentEma50;

    // Trend strength from linear regression R²
    const window = Math.min(20, closes.length);
    const recent = closes.slice(-window);
    const n = recent.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i; sumY += recent[i]; sumXY += i * recent[i];
      sumX2 += i * i; sumY2 += recent[i] * recent[i];
    }
    const ssXY = n * sumXY - sumX * sumY;
    const ssXX = n * sumX2 - sumX * sumX;
    const ssYY = n * sumY2 - sumY * sumY;
    const rSquared = (ssXX > 0 && ssYY > 0) ? (ssXY * ssXY) / (ssXX * ssYY) : 0;

    let regime = 'RANGING';
    let trendStrength = rSquared;

    if (rSquared > 0.4 && emaSlope > 0.001 && emaSeparation > 0.001) {
      regime = 'TRENDING_UP';
    } else if (rSquared > 0.4 && emaSlope < -0.001 && emaSeparation < -0.001) {
      regime = 'TRENDING_DOWN';
    }

    return { regime, trendStrength, emaSlope, emaSeparation, rSquared };
  }

  // Main prediction function
  predict(priceData, model = 'ensemble', opts = {}) {
    return this.predictWithLivePrice(priceData, null, model, opts);
  }

  // Prediction anchored to live price when available.
  // opts: { symbol, weights, confidenceTable, sessionMultiplier, spreadPrice,
  //         newsBlocked, now } — all optional; omitting them preserves the
  //         original behaviour exactly.
  predictWithLivePrice(priceData, livePrice, model = 'ensemble', opts = {}) {
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
    const adx = TechnicalAnalysis.ADX(highs, lows, closes, 14);
    const sr = TechnicalAnalysis.SupportResistance(closes);

    // Detect regime
    const regimeInfo = this.detectRegime(closes);

    // Get predictions
    const modelFn = this.models[model] || this.models.ensemble;
    const prediction = modelFn(closes);

    // Anchor predictions to live price if available
    const histPrice = closes[closes.length - 1];
    const anchorPrice = livePrice || histPrice;
    let predictions = prediction.predictions;

    if (livePrice && livePrice !== histPrice) {
      // Compute predicted returns from historical, apply to live price
      predictions = prediction.predictions.map(p => {
        const returnPct = (p - histPrice) / histPrice;
        return anchorPrice * (1 + returnPct);
      });
    }

    // Generate signals
    const currentPrice = anchorPrice;
    const nextPrice = predictions[0];
    const priceChange = ((nextPrice - currentPrice) / currentPrice) * 100;
    const currentATR = atr.length > 0 ? atr[atr.length - 1] : currentPrice * 0.001;
    const currentRSI = rsi.length > 0 ? rsi[rsi.length - 1] : 50;
    const currentMACD = macd.histogram.length > 0 ? macd.histogram[macd.histogram.length - 1] : 0;
    const prevMACD = macd.histogram.length > 1 ? macd.histogram[macd.histogram.length - 2] : 0;
    const currentBB = bbands.length > 0 ? bbands[bbands.length - 1] : { upper: currentPrice, middle: currentPrice, lower: currentPrice };
    const currentADX = adx.length > 0 ? adx[adx.length - 1] : 0;

    // EMA trend
    const ema9 = TechnicalAnalysis.EMA(closes, Math.min(9, closes.length - 1));
    const ema21 = TechnicalAnalysis.EMA(closes, Math.min(21, closes.length - 1));
    const emaTrend = ema9[ema9.length - 1] > ema21[ema21.length - 1] ? 'BULL' : 'BEAR';

    // Stochastic
    const stoch = TechnicalAnalysis.Stochastic(closes, Math.min(14, closes.length - 1));
    const currentStoch = stoch.length > 0 ? stoch[stoch.length - 1] : 50;

    const signal = this.generateSignal(
      priceChange, currentRSI, currentMACD, prevMACD, currentBB,
      currentPrice, currentATR, emaTrend, currentStoch,
      regimeInfo, currentADX, sr, predictions, opts
    );

    return {
      currentPrice,
      predictions,
      priceChange: parseFloat(priceChange.toFixed(2)),
      signal,
      regime: regimeInfo,
      indicators: {
        rsi: currentRSI,
        macd: currentMACD,
        bbands: currentBB,
        atr: currentATR,
        adx: currentADX,
        stochastic: currentStoch,
        emaTrend
      },
      supportResistance: sr,
      modelWeights: prediction.weights || null,
      timestamp: new Date()
    };
  }

  // Regime-aware signal generation with tradeability filter.
  // opts is backward-compatible: {} reproduces the original output exactly.
  generateSignal(priceChange, rsi, macdHist, prevMacdHist, bbands, currentPrice, atr, emaTrend, stoch, regime, adx, sr, predictions, opts = {}) {
    const w = opts.weights || this.getActiveWeights();
    const spreadPrice = opts.spreadPrice || 0;
    const sessionMult = opts.sessionMultiplier == null ? 1 : opts.sessionMultiplier;
    const pip = opts.symbol ? getSpreadConfig(opts.symbol).pip : (currentPrice > 100 ? 0.1 : 0.0001);

    let score = 0;
    const reasons = [];
    const regimeType = regime.regime;

    // 1. RSI — regime-conditioned scoring
    if (regimeType === 'TRENDING_UP') {
      if (rsi < 35) { score += w.rsi; reasons.push('RSI oversold in uptrend (' + rsi.toFixed(0) + ')'); }
      else if (rsi < 50) { score += w.rsi * 0.667; reasons.push('RSI dip-buy zone (' + rsi.toFixed(0) + ')'); }
      else if (rsi <= 70) { score += w.rsi * 0.133; reasons.push('RSI healthy uptrend (' + rsi.toFixed(0) + ')'); }
      else if (rsi > 80) { score -= w.rsi * 0.667; reasons.push('RSI extended (' + rsi.toFixed(0) + ')'); }
    } else if (regimeType === 'TRENDING_DOWN') {
      if (rsi > 65) { score -= w.rsi; reasons.push('RSI overbought in downtrend (' + rsi.toFixed(0) + ')'); }
      else if (rsi > 50) { score -= w.rsi * 0.667; reasons.push('RSI bounce-sell zone (' + rsi.toFixed(0) + ')'); }
      else if (rsi >= 30) { score -= w.rsi * 0.133; reasons.push('RSI healthy downtrend (' + rsi.toFixed(0) + ')'); }
      else if (rsi < 20) { score += w.rsi * 0.667; reasons.push('RSI extreme oversold (' + rsi.toFixed(0) + ')'); }
    } else {
      // Ranging — classic mean-reversion RSI
      if (rsi < 25) { score += w.rsi; reasons.push('RSI oversold (' + rsi.toFixed(0) + ')'); }
      else if (rsi < 40) { score += w.rsi * 0.533; reasons.push('RSI low (' + rsi.toFixed(0) + ')'); }
      else if (rsi > 75) { score -= w.rsi; reasons.push('RSI overbought (' + rsi.toFixed(0) + ')'); }
      else if (rsi > 60) { score -= w.rsi * 0.533; reasons.push('RSI high (' + rsi.toFixed(0) + ')'); }
    }

    // 2. MACD — crossovers are strong
    if (macdHist > 0 && prevMacdHist <= 0) { score += w.macd; reasons.push('MACD bullish crossover'); }
    else if (macdHist < 0 && prevMacdHist >= 0) { score -= w.macd; reasons.push('MACD bearish crossover'); }
    else if (macdHist > 0) { score += w.macd * 0.5; reasons.push('MACD bullish'); }
    else if (macdHist < 0) { score -= w.macd * 0.5; reasons.push('MACD bearish'); }

    // 3. Bollinger Bands — regime-conditioned
    const bbRange = bbands.upper - bbands.lower;
    const bbPos = bbRange > 0 ? (currentPrice - bbands.lower) / bbRange : 0.5;
    if (regimeType === 'RANGING') {
      // Mean reversion works in ranges
      if (bbPos <= 0.1) { score += w.bb; reasons.push('Price at lower BB (range)'); }
      else if (bbPos <= 0.3) { score += w.bb * 0.5; reasons.push('Price in lower BB zone'); }
      else if (bbPos >= 0.9) { score -= w.bb; reasons.push('Price at upper BB (range)'); }
      else if (bbPos >= 0.7) { score -= w.bb * 0.5; reasons.push('Price in upper BB zone'); }
    } else {
      // In trends, BB walk is continuation not reversal
      if (bbPos <= 0.15 && regimeType === 'TRENDING_UP') { score += w.bb * 0.8; reasons.push('BB pullback in uptrend'); }
      else if (bbPos >= 0.85 && regimeType === 'TRENDING_DOWN') { score -= w.bb * 0.8; reasons.push('BB pullback in downtrend'); }
    }

    // 4. EMA trend
    if (emaTrend === 'BULL') { score += w.trendBias; reasons.push('EMA uptrend'); }
    else { score -= w.trendBias; reasons.push('EMA downtrend'); }

    // 5. Stochastic
    if (stoch < 25) { score += w.stoch; reasons.push('Stoch oversold'); }
    else if (stoch > 75) { score -= w.stoch; reasons.push('Stoch overbought'); }

    // 6. ADX — trend strength modifier
    if (adx > 25) {
      reasons.push('Strong trend (ADX ' + adx.toFixed(0) + ')');
      // Amplify trend signals when ADX confirms strong trend
      if (regimeType === 'TRENDING_UP') score += w.adx;
      else if (regimeType === 'TRENDING_DOWN') score -= w.adx;
    } else if (adx < 15) {
      reasons.push('Weak trend (ADX ' + adx.toFixed(0) + ')');
    }

    // 7. Support/Resistance proximity
    if (sr && sr.resistance.length > 0) {
      const nearestRes = sr.resistance.reduce((nearest, r) =>
        Math.abs(r.price - currentPrice) < Math.abs(nearest.price - currentPrice) ? r : nearest
      );
      if (nearestRes.price > currentPrice && (nearestRes.price - currentPrice) < atr * 0.5) {
        score -= w.sr;
        reasons.push('Near resistance $' + nearestRes.price.toFixed(currentPrice > 100 ? 2 : 5));
      }
    }
    if (sr && sr.support.length > 0) {
      const nearestSup = sr.support.reduce((nearest, s) =>
        Math.abs(s.price - currentPrice) < Math.abs(nearest.price - currentPrice) ? s : nearest
      );
      if (nearestSup.price < currentPrice && (currentPrice - nearestSup.price) < atr * 0.5) {
        score += w.sr;
        reasons.push('Near support $' + nearestSup.price.toFixed(currentPrice > 100 ? 2 : 5));
      }
    }

    // 8. Model prediction direction
    if (priceChange > 0.01) { score += w.model; reasons.push('Model predicts up'); }
    else if (priceChange < -0.01) { score -= w.model; reasons.push('Model predicts down'); }

    let action = 'HOLD';
    let confidence = 0;
    let confidenceSource = 'default';
    let confidenceSamples = 0;

    if (score >= 0.5) {
      action = 'BUY';
    } else if (score <= -0.5) {
      action = 'SELL';
    }

    if (action !== 'HOLD') {
      // Prefer an empirical win-rate when a calibration table is supplied.
      const emp = opts.confidenceTable
        ? this._empiricalConfidence(action, score, regimeType, opts.confidenceTable)
        : null;
      if (emp) {
        confidence = emp.confidence;
        confidenceSource = 'empirical';
        confidenceSamples = emp.samples;
      } else {
        const s = Math.abs(score);
        confidence = Math.min(0.3 + (s / MAX_SCORE) * 0.65, 0.95);
      }
    } else {
      confidence = 0.5;
    }

    // Tradeability filter — expected move must clear volatility AND round-trip
    // spread (widened in thin sessions).
    const expectedMove = Math.abs(predictions[0] - currentPrice);
    const sessionWidth = sessionMult > 0 ? Math.min(2, Math.max(1, 1 / Math.max(sessionMult, 0.5))) : 2;
    let minRequiredMove = atr * 0.3;
    if (spreadPrice > 0) {
      minRequiredMove = Math.max(minRequiredMove, spreadPrice * 1.2) * sessionWidth;
    }
    let tradeable = expectedMove > minRequiredMove;
    let tradeabilityReason = '';

    if (!tradeable && action !== 'HOLD') {
      tradeabilityReason = spreadPrice > 0
        ? 'Expected move too small vs volatility + spread'
        : 'Expected move too small vs volatility';
      action = 'HOLD';
      confidence = 0.4;
      confidenceSource = 'default';
      reasons.push(spreadPrice > 0 ? '⚠ Trade filtered: move < costs' : '⚠ Trade filtered: move < 0.3 ATR');
    } else if (tradeable && action !== 'HOLD' && sessionMult < 0.9) {
      // Thin session: widen the bar rather than silently passing a marginal setup.
      tradeabilityReason = 'Thin session (' + Math.round(sessionMult * 100) + '% weighting)';
    }

    // Live news guard: never open into a high-impact event for this pair.
    if (action !== 'HOLD' && opts.newsBlocked) {
      action = 'HOLD';
      confidence = 0.4;
      confidenceSource = 'default';
      tradeable = false;
      tradeabilityReason = 'Blocked: high-impact economic event imminent';
      reasons.push('⚠ Blocked: high-impact news window');
    }

    // Regime-adaptive ATR multiples for stops
    let slMultiplier = 1.5;
    let tpMultiplier = 2.0;
    if (regimeType === 'RANGING') {
      slMultiplier = 1.2;
      tpMultiplier = 1.5;
    } else if (adx > 30) {
      // Strong trend — wider stops, bigger targets
      slMultiplier = 2.0;
      tpMultiplier = 3.0;
    }

    const slDistance = atr * slMultiplier;
    const tpDistance = atr * tpMultiplier;

    let stop, target;
    if (action === 'BUY') {
      // Use nearest support as stop if available and closer than ATR-based
      let structureStop = currentPrice - slDistance;
      if (sr && sr.support.length > 0) {
        const nearSup = sr.support.find(s => s.price < currentPrice);
        if (nearSup && (currentPrice - nearSup.price) < slDistance * 1.5) {
          structureStop = nearSup.price - atr * 0.3;
        }
      }
      stop = structureStop;
      target = currentPrice + tpDistance;
    } else if (action === 'SELL') {
      let structureStop = currentPrice + slDistance;
      if (sr && sr.resistance.length > 0) {
        const nearRes = sr.resistance.find(r => r.price > currentPrice);
        if (nearRes && (nearRes.price - currentPrice) < slDistance * 1.5) {
          structureStop = nearRes.price + atr * 0.3;
        }
      }
      stop = structureStop;
      target = currentPrice - tpDistance;
    } else {
      stop = currentPrice - slDistance;
      target = currentPrice + tpDistance;
    }

    const actualSlDistance = Math.abs(currentPrice - stop);
    const actualTpDistance = Math.abs(target - currentPrice);
    const riskReward = actualSlDistance > 0 ? actualTpDistance / actualSlDistance : 0;

    const dp = currentPrice > 100 ? 2 : 5;
    const summary = action === 'BUY'
      ? `Buy — ${regimeType.toLowerCase()} regime. Enter at $${currentPrice.toFixed(dp)}, stop $${stop.toFixed(dp)}, target $${target.toFixed(dp)} (R:R 1:${riskReward.toFixed(1)})`
      : action === 'SELL'
      ? `Sell — ${regimeType.toLowerCase()} regime. Enter at $${currentPrice.toFixed(dp)}, stop $${stop.toFixed(dp)}, target $${target.toFixed(dp)} (R:R 1:${riskReward.toFixed(1)})`
      : `Hold — no strong edge. ${regimeType.toLowerCase()} market, wait for clearer setup.`;

    return {
      action,
      confidence: parseFloat(confidence.toFixed(3)),
      confidenceSource,
      confidenceSamples,
      summary,
      regime: regimeType,
      margins: {
        entry: currentPrice,
        stop: parseFloat(stop.toFixed(dp)),
        target: parseFloat(target.toFixed(dp)),
        slPips: parseFloat((actualSlDistance / pip).toFixed(1)),
        tpPips: parseFloat((actualTpDistance / pip).toFixed(1)),
        riskReward: parseFloat(riskReward.toFixed(2))
      },
      tradeability: {
        tradeable,
        expectedMovePips: parseFloat((expectedMove / pip).toFixed(1)),
        minRequiredMovePips: parseFloat((minRequiredMove / pip).toFixed(1)),
        reason: tradeabilityReason
      },
      score: parseFloat(score.toFixed(2)),
      reasons
    };
  }

  // Map |score| to a coarse bucket so calibration samples pool together.
  static scoreBucket(score) {
    const s = Math.abs(score);
    if (s < 1.0) return 'low';
    if (s < 1.5) return 'mid';
    if (s < 2.5) return 'high';
    return 'extreme';
  }

  // Empirical win-rate for (regime, action, bucket) with Laplace smoothing.
  // Returns null when the sample is too small so callers fall back to the
  // arithmetic estimate. Table shape: { regime: { action: { bucket: {hits,total} } } }.
  _empiricalConfidence(action, score, regime, table) {
    const bucket = PredictionEngine.scoreBucket(score);
    const cell = table && table[regime] && table[regime][action] && table[regime][action][bucket];
    if (!cell || !cell.total || cell.total < 8) return null;
    const alpha = 2;
    const rate = (cell.hits + alpha) / (cell.total + 2 * alpha);
    return { confidence: Math.min(0.95, Math.max(0.30, rate)), samples: cell.total, bucket };
  }
}

PredictionEngine.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
PredictionEngine.MAX_SCORE = MAX_SCORE;

module.exports = new PredictionEngine();
module.exports.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
module.exports.MAX_SCORE = MAX_SCORE;
module.exports.PredictionEngine = PredictionEngine;
