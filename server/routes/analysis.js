const express = require('express');
const router = express.Router();
const dataFetcher = require('../services/dataFetcher');
const predictionEngine = require('../services/predictionEngine');
const logger = require('../utils/logger');

/**
 * GET /api/analysis/multi-timeframe/:symbol
 * Run prediction engine on multiple timeframes and return signal agreement
 */
router.get('/multi-timeframe/:symbol', async (req, res) => {
  const startTime = Date.now();

  try {
    const { symbol } = req.params;

    logger.info(`Multi-timeframe analysis for ${symbol}`);

    const histResult = await dataFetcher.getHistoricalData(symbol);
    const historicalData = histResult.data;

    if (!Array.isArray(historicalData) || historicalData.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient historical data for multi-timeframe analysis'
      });
    }

    const timeframes = {
      short: { label: 'Short-term', window: 20 },
      medium: { label: 'Medium-term', window: 50 },
      long: { label: 'Long-term', window: 80 },
      daily: { label: 'Daily', window: historicalData.length }
    };

    const results = {};
    const signals = [];

    for (const [key, tf] of Object.entries(timeframes)) {
      const window = Math.min(tf.window, historicalData.length);
      const slice = historicalData.slice(-window);

      if (slice.length < 14) {
        results[key] = { label: tf.label, signal: 'HOLD', confidence: 0, rsi: 50 };
        continue;
      }

      const prediction = predictionEngine.predict(slice);
      if (prediction.error) {
        results[key] = { label: tf.label, signal: 'HOLD', confidence: 0, rsi: 50 };
        continue;
      }

      results[key] = {
        label: tf.label,
        signal: prediction.signal.action,
        confidence: parseFloat(prediction.signal.confidence.toFixed(2)),
        rsi: parseFloat((prediction.indicators.rsi || 50).toFixed(1))
      };

      signals.push(prediction.signal.action);
    }

    // Calculate consensus
    const buys = signals.filter(s => s === 'BUY').length;
    const sells = signals.filter(s => s === 'SELL').length;
    let consensus = 'HOLD';
    if (buys > sells) consensus = 'BUY';
    else if (sells > buys) consensus = 'SELL';

    const maxCount = Math.max(buys, sells);
    const agreement = signals.length > 0 ? Math.round((maxCount / signals.length) * 100) : 0;

    const duration = Date.now() - startTime;
    logger.info(`Multi-timeframe analysis for ${symbol} in ${duration}ms - Consensus: ${consensus} (${agreement}%)`);

    res.json({
      success: true,
      symbol,
      timeframes: results,
      consensus,
      agreement
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Multi-timeframe analysis error: ${error.message}`, error);

    res.status(500).json({
      success: false,
      error: 'Failed to perform multi-timeframe analysis'
    });
  }
});

/**
 * GET /api/analysis/correlation
 * Compute correlation matrix from real Frankfurter daily data
 */
router.get('/correlation', async (req, res) => {
  const startTime = Date.now();

  try {
    const pairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD'];

    // Fetch real daily history for each pair
    const histResults = await Promise.allSettled(
      pairs.map(s => dataFetcher.getHistoricalData(s, 'D'))
    );

    // Extract close prices indexed by date for alignment
    const seriesMap = {};
    const allDates = new Set();

    pairs.forEach((pair, i) => {
      if (histResults[i].status === 'fulfilled' && histResults[i].value.data) {
        const closes = {};
        histResults[i].value.data.forEach(d => {
          const dateStr = new Date(d.date).toISOString().slice(0, 10);
          closes[dateStr] = d.close;
          allDates.add(dateStr);
        });
        seriesMap[pair] = closes;
      }
    });

    // Sort dates and find common dates across all pairs
    const sortedDates = [...allDates].sort();
    const availablePairs = pairs.filter(p => seriesMap[p]);

    // Compute log returns for each pair on common dates
    const returns = {};
    for (const pair of availablePairs) {
      returns[pair] = [];
      let prevClose = null;
      for (const date of sortedDates) {
        const close = seriesMap[pair][date];
        if (close && prevClose && prevClose > 0) {
          returns[pair].push({ date, ret: Math.log(close / prevClose) });
        }
        if (close) prevClose = close;
      }
    }

    // Pearson correlation helper
    function pearson(a, b) {
      // Align by date
      const bMap = {};
      b.forEach(r => { bMap[r.date] = r.ret; });
      const aligned = a.filter(r => bMap[r.date] !== undefined);
      const aVals = aligned.map(r => r.ret);
      const bVals = aligned.map(r => bMap[r.date]);

      const n = aVals.length;
      if (n < 5) return null;

      const meanA = aVals.reduce((s, v) => s + v, 0) / n;
      const meanB = bVals.reduce((s, v) => s + v, 0) / n;

      let num = 0, denA = 0, denB = 0;
      for (let i = 0; i < n; i++) {
        const da = aVals[i] - meanA;
        const db = bVals[i] - meanB;
        num += da * db;
        denA += da * da;
        denB += db * db;
      }

      if (denA === 0 || denB === 0) return 0;
      return num / Math.sqrt(denA * denB);
    }

    // Build correlation matrix
    const matrix = [];
    for (let i = 0; i < availablePairs.length; i++) {
      const row = [];
      for (let j = 0; j < availablePairs.length; j++) {
        if (i === j) {
          row.push(1);
        } else {
          const corr = pearson(returns[availablePairs[i]], returns[availablePairs[j]]);
          row.push(corr !== null ? parseFloat(corr.toFixed(2)) : null);
        }
      }
      matrix.push(row);
    }

    const duration = Date.now() - startTime;
    logger.info(`Correlation matrix computed from real data in ${duration}ms`);

    res.json({
      success: true,
      pairs: availablePairs,
      matrix,
      dataSource: 'frankfurter',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Correlation analysis error: ${error.message}`, error);

    res.status(500).json({
      success: false,
      error: 'Failed to compute correlation matrix'
    });
  }
});

module.exports = router;
