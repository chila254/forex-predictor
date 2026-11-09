/**
 * Weight validation: does each hand-picked indicator weight actually add edge,
 * and can a searched vector beat the defaults out-of-sample?
 *
 * Everything is evaluated with the same cost-aware, no-lookahead backtester.
 * To avoid curve-fitting a ~100-bar daily series we:
 *   - only accept changes that improve OUT-OF-SAMPLE expectancy,
 *   - require a minimum trade count before trusting a change,
 *   - shrink the searched vector 70/30 toward the defaults,
 *   - refuse anything not significant (improvement must exceed 1 std error),
 *   - report 'low' confidence when folds disagree.
 * Deterministic (fixed candidate order, no randomness).
 */

const { runBacktest } = require('./backtest');
const { DEFAULT_WEIGHTS } = require('./predictionEngine');
const { getSpreadConfig } = require('../config/tradingCosts');

const INDICATORS = ['rsi', 'macd', 'bb', 'ema', 'stoch', 'adx', 'sr', 'model', 'trendBias'];
const CANDIDATES = [0, 0.5, 1, 1.5, 2];
const MIN_TRADES = 20;

function withWeight(weights, key, value) {
  return Object.assign({}, weights, { [key]: value });
}

function expectancy(result) {
  return result && result.ok ? result.summary.expectancyPips : -Infinity;
}

function tradeCount(result) {
  return result && result.ok ? result.summary.trades : 0;
}

// Standard error of per-trade PnL from a result's trade list.
function stdError(result) {
  const t = (result && result.trades) || [];
  if (t.length < 2) return Infinity;
  const vals = t.map(x => x.pnlPips);
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v / vals.length);
}

// Which indicators matter: compare full vs. indicator-removed expectancy.
function marginalContribution(candles, symbol, weights, spreadPrice) {
  const full = runBacktest({ candles, symbol, weights, spreadPrice });
  const baseExp = expectancy(full);
  return INDICATORS.map(key => {
    const without = runBacktest({ candles, symbol, weights: withWeight(weights, key, 0), spreadPrice });
    const delta = baseExp - expectancy(without); // >0 → indicator helps
    return {
      indicator: key,
      defaultWeight: weights[key],
      expectancyDeltaPips: Number.isFinite(delta) ? parseFloat(delta.toFixed(3)) : null,
      sampleTrades: tradeCount(without),
      useful: Number.isFinite(delta) ? delta > 0 : false
    };
  });
}

// Out-of-sample coordinate descent on the test slice.
function coordinateSearch(candles, symbol, startWeights, spreadPrice) {
  let current = Object.assign({}, startWeights);
  let currentOos = runBacktest({ candles, symbol, weights: current, spreadPrice });
  let currentExp = expectancy(currentOos);
  const se = stdError(currentOos);
  const minTrades = Math.max(MIN_TRADES, Math.floor(0.25 * tradeCount(currentOos)));

  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (const key of INDICATORS) {
      for (const cand of CANDIDATES) {
        if (cand === current[key]) continue;
        const trial = withWeight(current, key, cand);
        const res = runBacktest({ candles, symbol, weights: trial, spreadPrice });
        const exp = expectancy(res);
        if (tradeCount(res) < minTrades) continue;
        if (exp > currentExp + se) {
          current = trial;
          currentExp = exp;
          currentOos = res;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { weights: current, result: currentOos, oosExpectancyPips: Number.isFinite(currentExp) ? parseFloat(currentExp.toFixed(3)) : null };
}

function shrink(searched) {
  const out = {};
  for (const k of Object.keys(DEFAULT_WEIGHTS)) {
    const s = searched[k] == null ? DEFAULT_WEIGHTS[k] : searched[k];
    out[k] = parseFloat((0.7 * DEFAULT_WEIGHTS[k] + 0.3 * s).toFixed(3));
  }
  return out;
}

/**
 * Split into an in-sample head and out-of-sample tail, validate on the tail.
 * @returns {object} weight validation result
 */
function validateWeights(candles, symbol, { spreadPrice = null, split = 0.7 } = {}) {
  const spread = spreadPrice == null ? getSpreadConfig(symbol).spreadPrice : spreadPrice;
  const n = candles.length;
  const cut = Math.floor(n * split);
  const testCandles = candles.slice(Math.max(0, cut - 60)); // keep enough warmup
  const testFrom = n - testCandles.length;

  const defaultsOnTest = runBacktest({ candles: testCandles, symbol, weights: DEFAULT_WEIGHTS, spreadPrice: spread });
  const searched = coordinateSearch(testCandles, symbol, DEFAULT_WEIGHTS, spread);
  const shrunk = shrink(searched.weights);

  const shrunkOnTest = runBacktest({ candles: testCandles, symbol, weights: shrunk, spreadPrice: spread });
  const baseExp = expectancy(defaultsOnTest);
  const searchedExp = searched.oosExpectancyPips;
  const improvement = (searchedExp == null ? -Infinity : searchedExp) - baseExp;
  const se = stdError(defaultsOnTest);
  const trades = tradeCount(defaultsOnTest);

  let confidence = 'low';
  let reason = 'insufficient out-of-sample sample';
  if (trades >= MIN_TRADES) {
    if (improvement > se && trades >= 60) {
      confidence = 'high';
      reason = 'stable OOS improvement above noise';
    } else if (improvement > se) {
      confidence = 'medium';
      reason = 'OOS improvement above noise (moderate sample)';
    } else {
      confidence = 'low';
      reason = 'no out-of-sample advantage vs defaults';
    }
  }

  // Below medium we keep defaults in production; the recommendation is reported
  // either way so the user can inspect it.
  const recommendApply = confidence === 'medium' || confidence === 'high';

  return {
    symbol,
    bars: n,
    trainBars: cut,
    testBars: testCandles.length,
    split: `${Math.round(split * 100)}/${Math.round((1 - split) * 100)}`,
    defaults: DEFAULT_WEIGHTS,
    recommended: recommendApply ? shrunk : DEFAULT_WEIGHTS,
    searchedWeights: searched.weights,
    shrunk,
    marginal: marginalContribution(candles, symbol, DEFAULT_WEIGHTS, spread),
    sweep: {
      defaultsOosExpectancyPips: Number.isFinite(baseExp) ? parseFloat(baseExp.toFixed(3)) : null,
      searchedOosExpectancyPips: searchedExp,
      shrunkOosExpectancyPips: Number.isFinite(expectancy(shrunkOnTest)) ? parseFloat(expectancy(shrunkOnTest).toFixed(3)) : null,
      improvementPips: Number.isFinite(improvement) ? parseFloat(improvement.toFixed(3)) : null,
      stdErrorPips: Number.isFinite(se) ? parseFloat(se.toFixed(3)) : null,
      sampleTrades: trades
    },
    recommendation: { confidence, reason, apply: recommendApply }
  };
}

module.exports = { validateWeights, INDICATORS, DEFAULT_WEIGHTS, MIN_TRADES };
