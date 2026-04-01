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

    const timeframes = [
      { key: 'daily', label: 'Daily (Bias)', tf: 'D', role: 'bias' },
      { key: 'h4', label: '4H (Setup)', tf: '4H', role: 'confirmation' },
      { key: 'h1', label: '1H (Entry)', tf: '1H', role: 'timing' },
      { key: 'm15', label: '15M (Precision)', tf: '15M', role: 'timing' }
    ];

    // Fetch all timeframes in parallel
    const fetchResults = await Promise.allSettled(
      timeframes.map(t => dataFetcher.getHistoricalData(symbol, t.tf))
    );

    const results = {};
    const signals = [];
    const biasSignals = []; // D and 4H

    for (let i = 0; i < timeframes.length; i++) {
      const tf = timeframes[i];
      const fetchResult = fetchResults[i];

      if (fetchResult.status !== 'fulfilled' || !fetchResult.value.data) {
        results[tf.key] = {
          label: tf.label,
          role: tf.role,
          signal: 'UNAVAILABLE',
          confidence: 0,
          rsi: null,
          actualTimeframe: null,
          warning: fetchResult.reason?.message || 'Data unavailable'
        };
        continue;
      }

      const histData = fetchResult.value.data;
      const actualTf = fetchResult.value.actualTimeframe || tf.tf;

      if (histData.length < 14) {
        results[tf.key] = {
          label: tf.label,
          role: tf.role,
          signal: 'INSUFFICIENT',
          confidence: 0,
          rsi: null,
          actualTimeframe: actualTf
        };
        continue;
      }

      const prediction = predictionEngine.predict(histData);
      if (prediction.error) {
        results[tf.key] = {
          label: tf.label,
          role: tf.role,
          signal: 'ERROR',
          confidence: 0,
          rsi: null,
          actualTimeframe: actualTf
        };
        continue;
      }

      const result = {
        label: tf.label,
        role: tf.role,
        signal: prediction.signal.action,
        confidence: parseFloat(prediction.signal.confidence.toFixed(2)),
        rsi: prediction.indicators.rsi ? parseFloat(prediction.indicators.rsi.toFixed(1)) : null,
        regime: prediction.regime ? prediction.regime.regime : null,
        actualTimeframe: actualTf,
        isFallback: actualTf !== tf.tf
      };

      if (result.isFallback) {
        result.warning = `Requested ${tf.tf} but got ${actualTf} data`;
      }

      results[tf.key] = result;
      if (result.signal !== 'HOLD') signals.push(result.signal);
      if (tf.role === 'bias' || tf.role === 'confirmation') {
        biasSignals.push(result.signal);
      }
    }

    // Hierarchical consensus: D + 4H must agree for strong signal
    const buys = signals.filter(s => s === 'BUY').length;
    const sells = signals.filter(s => s === 'SELL').length;
    const biasbuys = biasSignals.filter(s => s === 'BUY').length;
    const biassells = biasSignals.filter(s => s === 'SELL').length;

    let consensus = 'HOLD';
    if (biasbuys >= 2 || (biasbuys >= 1 && buys > sells)) {
      consensus = 'BUY';
    } else if (biassells >= 2 || (biassells >= 1 && sells > buys)) {
      consensus = 'SELL';
    }

    const totalSignals = signals.length;
    const maxCount = Math.max(buys, sells, 0);
    const agreement = totalSignals > 0 ? Math.round((maxCount / totalSignals) * 100) : 0;

    const duration = Date.now() - startTime;
    logger.info(`Multi-timeframe analysis for ${symbol} in ${duration}ms - Consensus: ${consensus} (${agreement}%)`);

    res.json({
      success: true,
      symbol,
      timeframes: results,
      consensus,
      agreement,
      note: 'Consensus requires Daily + 4H agreement for BUY/SELL'
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
