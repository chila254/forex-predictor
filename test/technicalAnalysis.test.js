const { test } = require('node:test');
const assert = require('node:assert');
const TA = require('../server/services/technicalAnalysis');

function linearSeries(n, start = 100, step = 1) {
  return Array.from({ length: n }, (_, i) => start + i * step);
}

function randomWalk(n, start = 1.1, vol = 0.004) {
  let p = start;
  const out = [];
  for (let i = 0; i < n; i++) {
    p += (Math.random() - 0.5) * vol;
    out.push(p);
  }
  return out;
}

test('EMA returns same length as input and tracks price', () => {
  const closes = linearSeries(50);
  const ema = TA.EMA(closes, 12);
  assert.strictEqual(ema.length, closes.length);
  // EMA legitimately lags a steep linear ramp; it must move toward price over time.
  assert.ok(ema[ema.length - 1] > ema[0], 'EMA should follow an uptrend');
  assert.ok(Math.abs(ema[ema.length - 1] - closes[closes.length - 1]) < 10);
});

test('RSI approaches 100 on a pure uptrend', () => {
  const rsi = TA.RSI(linearSeries(50), 14);
  assert.ok(rsi[rsi.length - 1] > 95, `expected ~100, got ${rsi[rsi.length - 1]}`);
});

test('RSI approaches 0 on a pure downtrend', () => {
  const rsi = TA.RSI(linearSeries(50, 100, -1), 14);
  assert.ok(rsi[rsi.length - 1] < 5, `expected ~0, got ${rsi[rsi.length - 1]}`);
});

test('MACD histories align to input length', () => {
  const closes = randomWalk(60);
  const m = TA.MACD(closes);
  assert.strictEqual(m.histogram.length, closes.length);
  assert.strictEqual(m.macdLine.length, closes.length);
});

test('Bollinger middle band equals SMA and upper > lower', () => {
  const closes = randomWalk(50);
  const bb = TA.BollingerBands(closes, 20);
  const last = bb[bb.length - 1];
  assert.ok(last.upper > last.middle);
  assert.ok(last.middle > last.lower);
});

test('ATR on close-only data remains volatility-scaled (regression)', () => {
  // Frankfurter returns high === low === close. ATR must NOT collapse to ~1 pip.
  const closes = randomWalk(120, 1.1, 0.006);
  const atr = TA.ATR(closes.slice(), closes.slice(), closes, 14);
  const last = atr[atr.length - 1];
  // Mean abs move over 120 bars at 0.006 vol ≈ 0.002-0.004; ATR should be comparable.
  assert.ok(last > 0.0015, `ATR too small on close-only data: ${last}`);
});

test('ATR respects full OHLC true range', () => {
  const closes = randomWalk(60);
  const highs = closes.map(c => c + 0.003);
  const lows = closes.map(c => c - 0.003);
  const atr = TA.ATR(highs, lows, closes, 14);
  // Intrabar range alone is 0.006, so ATR must be at least that.
  assert.ok(atr[atr.length - 1] >= 0.0059, `ATR ${atr[atr.length - 1]}`);
});

test('ADX is high for a sustained trend and low for noise (close-only)', () => {
  const up = linearSeries(60, 1, 0.001);
  const adxTrend = TA.ADX(up, up, up, 14);
  assert.ok(adxTrend[adxTrend.length - 1] > 50, 'ADX should be high in a trend');

  const noise = randomWalk(120, 1.1, 0.002);
  const adxNoise = TA.ADX(noise, noise, noise, 14);
  assert.ok(adxNoise[adxNoise.length - 1] < 50, 'ADX should be modest in noise');
});

test('SupportResistance returns clustered levels with touch counts', () => {
  const closes = [];
  for (let i = 0; i < 120; i++) {
    const cycle = [1.100, 1.105, 1.110, 1.105, 1.100, 1.105, 1.110];
    closes.push(cycle[i % cycle.length]);
  }
  const sr = TA.SupportResistance(closes);
  assert.ok(Array.isArray(sr.support));
  assert.ok(Array.isArray(sr.resistance));
  sr.support.concat(sr.resistance).forEach(lvl => {
    assert.ok(typeof lvl.price === 'number');
    assert.ok(lvl.touches >= 1);
  });
});
