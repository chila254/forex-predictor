const { test } = require('node:test');
const assert = require('node:assert');
const predictionEngine = require('../server/services/predictionEngine');
const Validators = require('../server/utils/validators');
const { SYMBOL_LIST } = require('../server/config/symbols');

function makeCandles(n, start = 1.1, step = 0.0005) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = start + i * step;
    out.push({ date: new Date(Date.now() - (n - i) * 86400000), open: c, high: c + 0.001, low: c - 0.001, close: c, volume: 0 });
  }
  return out;
}

test('predict rejects insufficient data with an error', () => {
  const result = predictionEngine.predict(makeCandles(5));
  assert.ok(result.error);
});

test('predict returns a valid signal structure', () => {
  const result = predictionEngine.predictWithLivePrice(makeCandles(80), 1.15, 'ensemble');
  assert.ok(!result.error, result.error);
  assert.strictEqual(result.predictions.length, 5);
  assert.ok(['BUY', 'SELL', 'HOLD'].includes(result.signal.action));
  assert.ok(result.signal.confidence >= 0 && result.signal.confidence <= 1);
  Validators.validatePrediction(result);
});

test('prediction anchors returns to the live price', () => {
  const candles = makeCandles(80);
  const histClose = candles[candles.length - 1].close;
  const livePrice = histClose + 0.05;
  const result = predictionEngine.predictWithLivePrice(candles, livePrice, 'linear');
  // First-step predicted return should be identical to the historical-close run.
  const noLive = predictionEngine.predictWithLivePrice(candles, null, 'linear');
  const rLive = (result.predictions[0] - livePrice) / livePrice;
  const rHist = (noLive.predictions[0] - histClose) / histClose;
  assert.ok(Math.abs(rLive - rHist) < 1e-6);
});

test('adaptive weights sum to ~1 and are cached', () => {
  const candles = makeCandles(120);
  const closes = candles.map(c => c.close);
  const w1 = predictionEngine.computeAdaptiveWeights(closes);
  const sum = Object.values(w1).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `weights sum ${sum}`);
  const w2 = predictionEngine.computeAdaptiveWeights(closes);
  assert.strictEqual(w1, w2, 'expected cached identical object');
});

test('stops and targets are on the correct side of entry', () => {
  const candles = makeCandles(100);
  const result = predictionEngine.predictWithLivePrice(candles, candles[candles.length - 1].close, 'ensemble');
  const m = result.signal.margins;
  if (result.signal.action === 'BUY') {
    assert.ok(m.stop < m.entry);
    assert.ok(m.target > m.entry);
  } else if (result.signal.action === 'SELL') {
    assert.ok(m.stop > m.entry);
    assert.ok(m.target < m.entry);
  }
});

test('all supported symbols validate', () => {
  SYMBOL_LIST.forEach(s => assert.doesNotThrow(() => Validators.validateSymbol(s)));
});

test('unsupported symbol and model are rejected', () => {
  assert.throws(() => Validators.validateSymbol('BTCUSD'));
  assert.throws(() => Validators.validateModel('naive'));
  assert.throws(() => Validators.validateModel('nonsense'));
});

test('timeframe validation', () => {
  ['5M', '15M', '1H', '4H', 'D'].forEach(tf => assert.doesNotThrow(() => Validators.validateTimeframe(tf)));
  assert.throws(() => Validators.validateTimeframe('1m'));
});
