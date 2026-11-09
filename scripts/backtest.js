#!/usr/bin/env node
/**
 * CLI: run the cost-aware backtest (and optionally the weight validation) for
 * a symbol against live history. Useful for offline inspection / weight sweeps.
 *
 *   node scripts/backtest.js EURUSD
 *   node scripts/backtest.js EURUSD --sweep
 *   node scripts/backtest.js XAUUSD --timeframe D
 */

const dataFetcher = require('../server/services/dataFetcher');
const { runBacktest } = require('../server/services/backtest');
const { validateWeights } = require('../server/services/weightValidator');
const { SYMBOL_LIST } = require('../server/config/symbols');

async function main() {
  const args = process.argv.slice(2);
  const symbol = (args.find(a => !a.startsWith('--')) || 'EURUSD').toUpperCase();
  const timeframeIdx = args.indexOf('--timeframe');
  const timeframe = timeframeIdx >= 0 ? args[timeframeIdx + 1] : 'D';
  const sweep = args.includes('--sweep');

  if (!SYMBOL_LIST.includes(symbol)) {
    console.error(`Unknown symbol "${symbol}". Supported: ${SYMBOL_LIST.join(', ')}`);
    process.exit(1);
  }

  console.log(`\nFetching ${symbol} ${timeframe} history…`);
  const hist = await dataFetcher.getHistoricalData(symbol, timeframe);
  const candles = hist.data;
  console.log(`Got ${candles.length} bars (source: ${hist.source}${hist.actualTimeframe ? ', actual ' + hist.actualTimeframe : ''})\n`);

  const bt = runBacktest({ candles, symbol });
  if (!bt.ok) {
    console.error(bt.reason);
    process.exit(1);
  }

  const s = bt.summary;
  console.table({
    trades: s.trades,
    hitRate: s.hitRate,
    expectancyPips: s.expectancyPips,
    profitFactor: s.profitFactor,
    totalPips: s.totalPips,
    maxDrawdownPips: s.maxDrawdownPips,
    'buy&holdPips': bt.baselines.buyHold.totalPips,
    spreadPips: bt.cost.spreadPips
  });
  console.log('Data quality:', bt.dataQuality);
  bt.limitations.forEach(l => console.log('  - ' + l));

  if (sweep) {
    console.log('\nValidating weights (walk-forward OOS)…');
    const v = validateWeights(candles, symbol);
    console.table(v.marginal.map(m => ({
      indicator: m.indicator,
      default: m.defaultWeight,
      deltaPips: m.expectancyDeltaPips,
      useful: m.useful
    })));
    console.log('Sweep:', JSON.stringify(v.sweep));
    console.log('Recommendation:', v.recommendation.confidence, '| apply:', v.recommendation.apply, '|', v.recommendation.reason);
    console.log('Recommended weights:', JSON.stringify(v.recommended));
  }

  console.log('\nVerdict:', s.expectancyPips > 0
    ? `cost-adjusted expectancy POSITIVE (${s.expectancyPips} pips/trade on ${s.trades} trades)`
    : `cost-adjusted expectancy NEGATIVE (${s.expectancyPips} pips/trade) — no edge after spread`);
}

main().catch(err => { console.error(err); process.exit(1); });
