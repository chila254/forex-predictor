const express = require('express');
const router = express.Router();
const dataFetcher = require('../services/dataFetcher');
const predictionEngine = require('../services/predictionEngine');
const { runBacktest } = require('../services/backtest');
const { validateWeights } = require('../services/weightValidator');
const { getSpreadConfig } = require('../config/tradingCosts');
const Validators = require('../utils/validators');
const logger = require('../utils/logger');
const { publicError } = require('../utils/errors');

const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map();

// Flatten the raw {regime:{action:{bucket:{hits,total}}}} counts into rows.
function calibrationRows(table) {
  const rows = [];
  for (const regime of Object.keys(table)) {
    for (const action of Object.keys(table[regime])) {
      for (const bucket of Object.keys(table[regime][action])) {
        const c = table[regime][action][bucket];
        rows.push({
          regime, action, bucket,
          samples: c.total,
          winRate: c.total ? parseFloat((c.hits / c.total).toFixed(3)) : null
        });
      }
    }
  }
  return rows;
}

async function computeBacktest(symbol, timeframe, refresh) {
  const key = `${symbol}|${timeframe}`;
  const now = Date.now();
  if (!refresh && cache.has(key)) {
    const hit = cache.get(key);
    if (now - hit.time < CACHE_TTL) return { ...hit.value, cached: true };
  }

  const hist = await dataFetcher.getHistoricalData(symbol, timeframe);
  const candles = hist.data;
  const cfg = getSpreadConfig(symbol);
  const bt = runBacktest({ candles, symbol });
  if (!bt.ok) {
    const value = {
      success: true, symbol, cached: false,
      dataQuality: hist.actualTimeframe ? 'close_only' : bt.dataQuality,
      summary: null, reason: bt.reason, limitations: bt.limitations
    };
    return value;
  }

  const validation = validateWeights(candles, symbol);

  // Persist the result BEFORE returning so the live prediction route can reuse
  // the calibration table and confident weights immediately.
  const value = {
    success: true,
    symbol,
    timeframe,
    actualTimeframe: hist.actualTimeframe || timeframe,
    cached: false,
    dataQuality: bt.dataQuality,
    bars: bt.bars,
    start: bt.start,
    end: bt.end,
    cost: { spreadPips: bt.cost.spreadPips, assumedSource: 'retail' },
    summary: bt.summary,
    baselines: bt.baselines,
    weights: {
      defaults: validation.defaults,
      recommended: validation.recommended,
      searched: validation.searchedWeights,
      marginal: validation.marginal,
      sweep: validation.sweep,
      recommendation: validation.recommendation
    },
    confidenceCalibration: calibrationRows(bt.confidenceTable),
    confidenceTable: bt.confidenceTable,
    limitations: bt.limitations
  };

  cache.set(key, { time: now, value });
  if (cache.size > 32) cache.delete(cache.keys().next().value);
  return value;
}

/**
 * GET /api/backtest/:symbol?timeframe=D&refresh=0
 * Returns the cost-aware walk-forward backtest, validated weights and the
 * empirical confidence calibration for the live signal.
 */
router.get('/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const timeframe = req.query.timeframe || 'D';
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';

  try {
    Validators.validateSymbol(symbol);
    Validators.validateTimeframe(timeframe);
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }

  try {
    const start = Date.now();
    const value = await computeBacktest(symbol, timeframe, refresh);

    // Auto-apply confident weights to the live engine.
    if (value.weights && value.weights.recommendation && value.weights.recommendation.apply) {
      predictionEngine.applyWeights(value.weights.recommended);
    }

    logger.info(`Backtest ${symbol}: trades=${value.summary ? value.summary.trades : 0} confidence=${value.weights ? value.weights.recommendation.confidence : 'n/a'}`);
    res.json({ ...value, durationMs: Date.now() - start });
  } catch (error) {
    logger.error(`Backtest error for ${symbol}: ${error.message}`);
    res.status(500).json({ success: false, error: publicError(error.message) || 'Backtest failed' });
  }
});

// Used by the prediction route to reuse calibration + confident weights.
// Prefers the cached backtest result (fast); never runs the weight search here.
async function getCalibration(symbol, timeframe = 'D', candles = null) {
  const key = `${symbol}|${timeframe}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL && hit.value.summary) {
    const rec = hit.value.weights && hit.value.weights.recommendation;
    return {
      confidenceTable: hit.value.confidenceTable || null,
      weights: rec && rec.apply ? hit.value.weights.recommended : predictionEngine.getActiveWeights()
    };
  }
  // No cached backtest yet: fall back to a cheap backtest (no weight search)
  // just to obtain a calibration table, when candles are supplied.
  if (candles && candles.length >= 60) {
    try {
      const bt = runBacktest({ candles, symbol });
      return { confidenceTable: bt.ok ? bt.confidenceTable : null, weights: predictionEngine.getActiveWeights() };
    } catch (e) { /* fall through */ }
  }
  return { confidenceTable: null, weights: predictionEngine.getActiveWeights() };
}

module.exports = router;
module.exports.getCalibration = getCalibration;
