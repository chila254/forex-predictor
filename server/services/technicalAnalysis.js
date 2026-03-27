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
  static ATR(high, low, close, period = 14) {
    const tr = [];
    
    for (let i = 1; i < close.length; i++) {
      const tr1 = high[i] - low[i];
      const tr2 = Math.abs(high[i] - close[i - 1]);
      const tr3 = Math.abs(low[i] - close[i - 1]);
      tr.push(Math.max(tr1, tr2, tr3));
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
}

module.exports = TechnicalAnalysis;
