const { test } = require('node:test');
const assert = require('node:assert');
const { runBacktest } = require('../server/services/backtest');
const { validateWeights } = require('../server/services/weightValidator');
const predictionEngine = require('../server/services/predictionEngine');
const { DEFAULT_WEIGHTS } = predictionEngine;

function trendingCandles(n, start = 1.1, drift = 0.0006, wave = 0.001) {
  const out = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p += drift + Math.sin(i / 9) * wave;
    out.push({ date: new Date(2024, 0, i + 1), open: p, high: p, low: p, close: p, volume: 0 });
  }
  return out;
}

test('backtest refuses series that are too short', () => {
  const r = runBacktest({ candles: trendingCandles(30), symbol: 'EURUSD' });
  assert.strictEqual(r.ok, false);
  assert.ok(/Insufficient/.test(r.reason));
});

test('backtest produces a summary with cost applied', () => {
  const r = runBacktest({ candles: trendingCandles(180), symbol: 'EURUSD' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.dataQuality, 'close_only');
  assert.ok(r.summary.trades >= 0);
  assert.strictEqual(r.cost.spreadPips, 1);
  assert.ok(Array.isArray(r.limitations) && r.limitations.length >= 2);
});

test('spread cost reduces every trade by exactly one pip', () => {
  const candles = trendingCandles(180);
  const zero = runBacktest({ candles, symbol: 'EURUSD', spreadPrice: 0 });
  const one = runBacktest({ candles, symbol: 'EURUSD', spreadPrice: 0.0001 });
  assert.strictEqual(zero.trades.length, one.trades.length);
  for (let i = 0; i < zero.trades.length; i++) {
    const diff = zero.trades[i].pnlPips - one.trades[i].pnlPips;
    assert.ok(Math.abs(diff - 1) < 1e-9, `trade ${i} diff ${diff}`);
  }
});

test('no lookahead: future bars do not change past trades', () => {
  const base = trendingCandles(140);
  const spiked = base.map((c, i) => (i >= 120 ? { ...c, close: c.close * 1.2, open: c.open * 1.2, high: c.high * 1.2, low: c.low * 1.2 } : c));
  const a = runBacktest({ candles: base, symbol: 'EURUSD' });
  const b = runBacktest({ candles: spiked, symbol: 'EURUSD' });
  const earlyA = a.trades.filter(t => t.idx < 100);
  const earlyB = b.trades.filter(t => t.idx < 100);
  assert.deepStrictEqual(earlyA, earlyB);
});

test('weight validation is deterministic and guarded', () => {
  const candles = trendingCandles(200);
  const v1 = validateWeights(candles, 'EURUSD');
  const v2 = validateWeights(candles, 'EURUSD');
  assert.deepStrictEqual(v1.marginal, v2.marginal);
  assert.deepStrictEqual(v1.sweep, v2.sweep);
  assert.ok(['low', 'medium', 'high'].includes(v1.recommendation.confidence));
  // On a near-random OOS slice it must NOT auto-apply.
  if (v1.sweep.sampleTrades < 60) assert.strictEqual(v1.recommendation.apply, false);
});

test('confidence falls back to the arithmetic formula without a table', () => {
  const candles = trendingCandles(120);
  const p = predictionEngine.predict(candles, 'ensemble');
  assert.strictEqual(p.signal.confidenceSource, 'default');
});

test('confidence uses an empirical table when samples are sufficient', () => {
  const candles = trendingCandles(120);
  const p0 = predictionEngine.predict(candles, 'ensemble');
  const action = p0.signal.action;
  if (action === 'HOLD') return; // nothing to calibrate on this series
  const bucket = predictionEngine.PredictionEngine.scoreBucket(p0.signal.score);
  const regime = p0.regime.regime;
  const table = { [regime]: { [action]: { [bucket]: { hits: 9, total: 10 } } } };
  const p = predictionEngine.predict(candles, 'ensemble', { confidenceTable: table });
  assert.strictEqual(p.signal.confidenceSource, 'empirical');
  assert.strictEqual(p.signal.confidenceSamples, 10);
  assert.ok(p.signal.confidence > 0.7); // 9/10 smoothed ≈ 0.79
});

test('small calibration sample is ignored (fallback)', () => {
  const candles = trendingCandles(120);
  const p0 = predictionEngine.predict(candles, 'ensemble');
  if (p0.signal.action === 'HOLD') return;
  const bucket = predictionEngine.PredictionEngine.scoreBucket(p0.signal.score);
  const regime = p0.regime.regime;
  const table = { [regime]: { [p0.signal.action]: { [bucket]: { hits: 3, total: 5 } } } };
  const p = predictionEngine.predict(candles, 'ensemble', { confidenceTable: table });
  assert.strictEqual(p.signal.confidenceSource, 'default');
});

test('news guard blocks a non-HOLD signal', () => {
  const candles = trendingCandles(120);
  const p = predictionEngine.predict(candles, 'ensemble', { symbol: 'EURUSD', newsBlocked: true });
  assert.strictEqual(p.signal.action, 'HOLD');
  assert.ok(/news|event/i.test(p.signal.tradeability.reason));
});

test('spread widens the tradeability threshold', () => {
  const candles = trendingCandles(120);
  const plain = predictionEngine.predict(candles, 'ensemble', { symbol: 'EURUSD', spreadPrice: 0 });
  const costly = predictionEngine.predict(candles, 'ensemble', { symbol: 'EURUSD', spreadPrice: 0.01 });
  assert.ok(costly.signal.tradeability.minRequiredMovePips >= plain.signal.tradeability.minRequiredMovePips);
});

test('applyWeights override changes scoring deterministically and restores', () => {
  const candles = trendingCandles(120);
  const base = predictionEngine.predict(candles, 'ensemble');
  predictionEngine.applyWeights(Object.assign({}, DEFAULT_WEIGHTS, { trendBias: 3 }));
  const boosted = predictionEngine.predict(candles, 'ensemble');
  predictionEngine.applyWeights(null);
  const restored = predictionEngine.predict(candles, 'ensemble');
  assert.deepStrictEqual(restored.signal.score, base.signal.score);
  assert.ok(Math.abs(boosted.signal.score) >= Math.abs(base.signal.score));
});
