/**
 * Walk-forward backtester for the signal path.
 *
 * For each bar i it predicts using ONLY candles[0..i] (no lookahead), takes the
 * resulting BUY/SELL/HOLD, and simulates the trade forward up to `maxHold`
 * bars against the engine's own ATR SL/TP, subtracting the configured spread.
 * Non-overlapping trades, so each bar is evaluated once.
 *
 * Honesty notes surfaced in `limitations`:
 *  - Frankfurter data is close-only (open==high==low==close): SL/TP fills can
 *    only be judged at each bar's close, never intrabar. This under-counts
 *    stops that were touched intraday and under-states volatility.
 *  - Session and news filters cannot be replayed on daily bars (no intraday
 *    timestamps), so they are excluded from the simulated PnL.
 */

const predictionEngine = require('./predictionEngine');
const { getSpreadConfig } = require('../config/tradingCosts');

const WARMUP = 40;
const RESULT_TTL = 10 * 60 * 1000;
const resultCache = new Map();

function weightsKey(weights) {
  if (!weights) return 'default';
  return Object.keys(weights).sort().map(k => k + ':' + weights[k]).join(',');
}

function isCloseOnly(candles, from, to) {
  for (let i = from; i < to; i++) {
    const c = candles[i];
    if (c.open !== c.high || c.high !== c.low || c.low !== c.close) return false;
  }
  return true;
}

// Fast ensemble: reuse a single fixed model blend instead of re-fitting the
// adaptive weights on every bar (which is O(n^2) and adds run-to-run noise).
function fastPredict(candles, symbol, weights) {
  return predictionEngine.predictWithLivePrice(candles, null, 'ensemble', { symbol, weights });
}

/**
 * @returns {object} backtest result (see README / route for shape)
 */
function runBacktest({ candles, symbol, weights = null, spreadPrice = null, minBars = 60, maxHold = 5 }) {
  const cfg = getSpreadConfig(symbol);
  const spread = spreadPrice == null ? cfg.spreadPrice : spreadPrice;
  const pip = cfg.pip;

  const n = candles.length;
  const limitations = [
    'Close-only daily data: SL/TP evaluated on bar close, not intrabar.',
    'Session and news filters not simulated on daily bars.'
  ];

  if (n < Math.max(minBars, WARMUP + 5)) {
    return { ok: false, reason: `Insufficient bars (${n}); need ${Math.max(minBars, WARMUP + 5)}`, limitations };
  }

  const closeOnly = isCloseOnly(candles, WARMUP, n);
  const trades = [];
  const confidenceTable = {};
  let i = WARMUP;

  while (i < n - 1) {
    const window = candles.slice(0, i + 1); // strictly no lookahead
    let pred;
    try {
      pred = fastPredict(window, symbol, weights);
    } catch (e) {
      i++;
      continue;
    }
    if (!pred || pred.error || !pred.signal) { i++; continue; }
    const s = pred.signal;

    if (s.action === 'BUY' || s.action === 'SELL') {
      const side = s.action === 'BUY' ? 1 : -1;
      const entry = candles[i].close;
      const sl = s.margins.stop;
      const tp = s.margins.target;

      let exit = null;
      let exitIdx = i;
      let exitReason = 'EXPIRY';
      for (let j = i + 1; j <= Math.min(i + maxHold, n - 1); j++) {
        const bar = candles[j];
        exitIdx = j;
        if (closeOnly) {
          // Only the close is real; check it against SL/TP.
          const cpx = bar.close;
          if (side === 1 && cpx <= sl) { exit = sl; exitReason = 'SL'; break; }
          if (side === 1 && cpx >= tp) { exit = tp; exitReason = 'TP'; break; }
          if (side === -1 && cpx >= sl) { exit = sl; exitReason = 'SL'; break; }
          if (side === -1 && cpx <= tp) { exit = tp; exitReason = 'TP'; break; }
        } else {
          if (side === 1 && bar.low <= sl) { exit = sl; exitReason = 'SL'; break; }
          if (side === 1 && bar.high >= tp) { exit = tp; exitReason = 'TP'; break; }
          if (side === -1 && bar.high >= sl) { exit = sl; exitReason = 'SL'; break; }
          if (side === -1 && bar.low <= tp) { exit = tp; exitReason = 'TP'; break; }
        }
      }
      if (exit == null) exit = candles[exitIdx].close;

      const pnlPrice = side * (exit - entry) - spread;
      const pnlPips = pnlPrice / pip;
      const win = pnlPips > 0;

      trades.push({
        idx: i,
        action: s.action,
        score: s.score,
        regime: s.regime,
        bucket: predictionEngine.PredictionEngine.scoreBucket(s.score),
        entry, exit, exitReason,
        pnlPips: parseFloat(pnlPips.toFixed(2)),
        win
      });

      // Accumulate raw calibration counts for (regime, action, bucket).
      const reg = s.regime || 'RANGING';
      confidenceTable[reg] = confidenceTable[reg] || {};
      confidenceTable[reg][s.action] = confidenceTable[reg][s.action] || {};
      const cell = confidenceTable[reg][s.action][trades[trades.length - 1].bucket] || { hits: 0, total: 0 };
      cell.total += 1;
      if (win) cell.hits += 1;
      confidenceTable[reg][s.action][trades[trades.length - 1].bucket] = cell;

      i = exitIdx + 1;
    } else {
      i++;
    }
  }

  const summary = summarize(trades);
  const baselines = {
    buyHold: buyHoldBaseline(candles, WARMUP, spread, pip),
    randomWalk: randomWalkBaseline(trades)
  };

  return {
    ok: true,
    symbol,
    bars: n,
    evaluatedBars: n - WARMUP - 1,
    start: candles[WARMUP].date,
    end: candles[n - 1].date,
    dataQuality: closeOnly ? 'close_only' : 'full_ohlc',
    cost: { spreadPips: parseFloat((spread / pip).toFixed(2)) },
    summary,
    baselines,
    confidenceTable,
    trades,
    limitations
  };
}

function summarize(trades) {
  const count = trades.length;
  if (!count) {
    return { trades: 0, wins: 0, losses: 0, hitRate: 0, avgWinPips: 0, avgLossPips: 0, profitFactor: 0, expectancyPips: 0, totalPips: 0, maxDrawdownPips: 0, sharpeDaily: 0 };
  }
  const wins = trades.filter(t => t.win);
  const losses = trades.filter(t => !t.win);
  const grossWin = wins.reduce((a, t) => a + t.pnlPips, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnlPips, 0));
  const totalPips = trades.reduce((a, t) => a + t.pnlPips, 0);

  // Max drawdown on the cumulative trade PnL curve.
  let peak = 0, equity = 0, maxDD = 0;
  for (const t of trades) {
    equity += t.pnlPips;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
  }

  const mean = totalPips / count;
  const variance = trades.reduce((a, t) => a + (t.pnlPips - mean) ** 2, 0) / count;
  const std = Math.sqrt(variance);

  return {
    trades: count,
    wins: wins.length,
    losses: losses.length,
    hitRate: parseFloat((wins.length / count).toFixed(3)),
    avgWinPips: parseFloat((wins.length ? grossWin / wins.length : 0).toFixed(2)),
    avgLossPips: parseFloat((losses.length ? -grossLoss / losses.length : 0).toFixed(2)),
    profitFactor: grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : (grossWin > 0 ? Infinity : 0),
    expectancyPips: parseFloat(mean.toFixed(3)),
    totalPips: parseFloat(totalPips.toFixed(2)),
    maxDrawdownPips: parseFloat(maxDD.toFixed(2)),
    sharpeDaily: std > 0 ? parseFloat((mean / std).toFixed(3)) : 0
  };
}

function buyHoldBaseline(candles, from, spread, pip) {
  const entry = candles[from].close;
  const exit = candles[candles.length - 1].close;
  return { totalPips: parseFloat(((exit - entry - spread) / pip).toFixed(2)), note: 'Buy & hold over the same window, one spread.' };
}

// Expected PnL of a coin-flip trader using the SAME realized outcomes but
// random sides: average of +|move| and -|move| minus spread → ≈ -spread.
function randomWalkBaseline(trades) {
  if (!trades.length) return { expectancyPips: 0, note: 'No trades to compare.' };
  const grossMoves = trades.map(t => {
    const move = t.action === 'BUY' ? t.exit - t.entry : t.entry - t.exit;
    return Math.abs(move);
  });
  const avgAbs = grossMoves.reduce((a, b) => a + b, 0) / grossMoves.length;
  return { expectancyPips: 0, avgAbsMovePips: parseFloat(avgAbs.toFixed(2)), note: 'Coin-flip side has ~0 raw edge; costs make it negative.' };
}

// Cached entry point used by the route.
async function getBacktest(symbol, candles, { weights = null, refresh = false } = {}) {
  const key = `${symbol}|${weightsKey(weights)}|${candles.length}`;
  const now = Date.now();
  if (!refresh) {
    const hit = resultCache.get(key);
    if (hit && now - hit.time < RESULT_TTL) return { cached: true, result: hit.result };
  }
  const result = runBacktest({ candles, symbol, weights });
  if (resultCache.size > 32) resultCache.delete(resultCache.keys().next().value);
  resultCache.set(key, { time: now, result });
  return { cached: false, result };
}

module.exports = {
  runBacktest,
  getBacktest,
  summarize,
  WARMUP,
  // exposed for the live signal path
  weightsKey
};
