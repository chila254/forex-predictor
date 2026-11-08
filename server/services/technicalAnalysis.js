// Technical Analysis Indicators
class TechnicalAnalysis {
  
  // Simple Moving Average
  static SMA(prices, period) {
    const sma = [];
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    return sma;
  }

  // Exponential Moving Average
  static EMA(prices, period) {
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    
    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  }

  // Relative Strength Index
  static RSI(prices, period = 14) {
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) avgGain += changes[i];
      else avgLoss -= changes[i];
    }
    avgGain /= period;
    avgLoss /= period;

    const rsiValues = [];
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues.push(100 - (100 / (1 + rs)));

    for (let i = period; i < changes.length; i++) {
      const gain = changes[i] > 0 ? changes[i] : 0;
      const loss = changes[i] < 0 ? -changes[i] : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsiValues.push(100 - (100 / (1 + rs2)));
    }

    return rsiValues;
  }

  // MACD
  static MACD(prices) {
    const ema12 = this.EMA(prices, 12);
    const ema26 = this.EMA(prices, 26);
    
    const macdLine = [];
    const signalLine = [];
    const histogram = [];

    const startIdx = Math.max(ema12.length, ema26.length) - Math.min(ema12.length, ema26.length);
    
    for (let i = startIdx; i < ema12.length; i++) {
      const macd = ema12[i] - ema26[i - startIdx];
      macdLine.push(macd);
    }

    const signal = this.EMA(macdLine, 9);
    for (let i = 0; i < macdLine.length; i++) {
      signalLine.push(signal[i - macdLine.length + signal.length] || 0);
      histogram.push(macdLine[i] - signalLine[i]);
    }

    return { macdLine, signalLine, histogram };
  }

  // Bollinger Bands
  static BollingerBands(prices, period = 20, stdDev = 2) {
    const sma = this.SMA(prices, period);
    const bands = [];

    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const avg = slice.reduce((a, b) => a + b) / period;
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / period;
      const std = Math.sqrt(variance);

      bands.push({
        upper: sma[i - (period - 1)] + (std * stdDev),
        middle: sma[i - (period - 1)],
        lower: sma[i - (period - 1)] - (std * stdDev)
      });
    }
    return bands;
  }

  // Stochastic Oscillator
  static Stochastic(prices, period = 14) {
    const stoch = [];
    
    for (let i = period; i < prices.length; i++) {
      const slice = prices.slice(i - period, i);
      const high = Math.max(...slice);
      const low = Math.min(...slice);
      const k = ((prices[i] - low) / (high - low)) * 100;
      stoch.push(k);
    }
    return stoch;
  }

  // ATR (Average True Range)
  // Note: when the source is close-only (e.g. Frankfurter sets high=low=close)
  // the intrabar range (tr1) collapses to zero and only the close-to-close move
  // (tr2/tr3) carries information, so volatility stays realistic.
  static ATR(high, low, close, period = 14) {
    const tr = [];

    for (let i = 1; i < close.length; i++) {
      const tr1 = high[i] - low[i];
      const tr2 = Math.abs(high[i] - close[i - 1]);
      const tr3 = Math.abs(low[i] - close[i - 1]);
      tr.push(Math.max(tr1, tr2, tr3));
    }

    // Close-only data can produce near-zero ATR if price gaps are tiny.
    // Floor it with a rolling close-to-close volatility estimate so downstream
    // stop/target sizing never degenerates.
    const closeOnly = close.every((c, i) => high[i] === c && low[i] === c);
    if (closeOnly && tr.length > period) {
      const changes = [];
      for (let i = 1; i < close.length; i++) changes.push(Math.abs(close[i] - close[i - 1]));
      for (let i = 0; i < tr.length; i++) {
        const windowStart = Math.max(0, i + 1 - period);
        const window = changes.slice(windowStart, i + 1);
        const mean = window.reduce((a, b) => a + b, 0) / window.length;
        // Typical intrabar range ≈ 1.5× mean absolute move; keeps ATR honest.
        tr[i] = Math.max(tr[i], mean * 1.5);
      }
    }

    const atr = [];
    let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
    atr.push(sum / period);

    for (let i = period; i < tr.length; i++) {
      sum = sum - tr[i - period] + tr[i];
      atr.push(sum / period);
    }
    return atr;
  }

  // ADX (Average Directional Index) for trend strength
  static ADX(high, low, close, period = 14) {
    if (close.length < period + 1) return [];

    const plusDM = [];
    const minusDM = [];
    const tr = [];

    for (let i = 1; i < close.length; i++) {
      const upMove = high[i] - high[i - 1];
      const downMove = low[i - 1] - low[i];
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
      const tr1 = high[i] - low[i];
      const tr2 = Math.abs(high[i] - close[i - 1]);
      const tr3 = Math.abs(low[i] - close[i - 1]);
      tr.push(Math.max(tr1, tr2, tr3));
    }

    // Close-only source: derive directional movement from close-to-close
    // changes, otherwise +DM/-DM are always zero and ADX is meaningless.
    const closeOnly = close.every((c, i) => high[i] === c && low[i] === c);
    if (closeOnly) {
      for (let i = 1; i < close.length; i++) {
        const delta = close[i] - close[i - 1];
        plusDM[i - 1] = delta > 0 ? delta : 0;
        minusDM[i - 1] = delta < 0 ? -delta : 0;
        tr[i - 1] = Math.abs(delta) || tr[i - 1];
      }
    }

    // Smoothed averages using Wilder's method
    let smoothTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

    const dx = [];
    for (let i = period; i < tr.length; i++) {
      if (i > period) {
        smoothTR = smoothTR - smoothTR / period + tr[i];
        smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
        smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];
      }
      const plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
      const minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
      const diSum = plusDI + minusDI;
      dx.push(diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0);
    }

    if (dx.length === 0) return [];

    // Smooth DX to get ADX
    const adx = [];
    let adxSum = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    adx.push(adxSum);
    for (let i = period; i < dx.length; i++) {
      adxSum = (adxSum * (period - 1) + dx[i]) / period;
      adx.push(adxSum);
    }

    return adx;
  }

  // Detect support and resistance levels from price data
  static SupportResistance(closes, lookback = 5, clusterThreshold = 0.003) {
    if (closes.length < lookback * 2 + 1) return { support: [], resistance: [] };

    const swingHighs = [];
    const swingLows = [];

    // Find swing points
    for (let i = lookback; i < closes.length - lookback; i++) {
      let isHigh = true;
      let isLow = true;
      for (let j = 1; j <= lookback; j++) {
        if (closes[i] <= closes[i - j] || closes[i] <= closes[i + j]) isHigh = false;
        if (closes[i] >= closes[i - j] || closes[i] >= closes[i + j]) isLow = false;
      }
      if (isHigh) swingHighs.push({ price: closes[i], index: i });
      if (isLow) swingLows.push({ price: closes[i], index: i });
    }

    // Cluster nearby levels
    function clusterLevels(points) {
      if (points.length === 0) return [];
      const sorted = [...points].sort((a, b) => a.price - b.price);
      const clusters = [];
      let cluster = [sorted[0]];

      for (let i = 1; i < sorted.length; i++) {
        const diff = Math.abs(sorted[i].price - cluster[0].price) / cluster[0].price;
        if (diff < clusterThreshold) {
          cluster.push(sorted[i]);
        } else {
          clusters.push(cluster);
          cluster = [sorted[i]];
        }
      }
      clusters.push(cluster);

      return clusters.map(c => ({
        price: c.reduce((sum, p) => sum + p.price, 0) / c.length,
        touches: c.length,
        lastIndex: Math.max(...c.map(p => p.index))
      })).sort((a, b) => b.touches - a.touches);
    }

    return {
      support: clusterLevels(swingLows).slice(0, 5),
      resistance: clusterLevels(swingHighs).slice(0, 5)
    };
  }
}

module.exports = TechnicalAnalysis;
