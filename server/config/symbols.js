// Single source of truth for supported instruments and their data-source mappings.
const SYMBOLS = {
  XAUUSD: { swissquote: 'XAU/USD', frankfurter: null, twelveData: 'XAU/USD', name: 'Gold' },
  EURUSD: { swissquote: 'EUR/USD', frankfurter: { from: 'EUR', to: 'USD' }, twelveData: 'EUR/USD' },
  GBPUSD: { swissquote: 'GBP/USD', frankfurter: { from: 'GBP', to: 'USD' }, twelveData: 'GBP/USD' },
  USDJPY: { swissquote: 'USD/JPY', frankfurter: { from: 'USD', to: 'JPY' }, twelveData: 'USD/JPY' },
  USDCHF: { swissquote: 'USD/CHF', frankfurter: { from: 'USD', to: 'CHF' }, twelveData: 'USD/CHF' },
  AUDUSD: { swissquote: 'AUD/USD', frankfurter: { from: 'AUD', to: 'USD' }, twelveData: 'AUD/USD' },
  USDCAD: { swissquote: 'USD/CAD', frankfurter: { from: 'USD', to: 'CAD' }, twelveData: 'USD/CAD' },
  NZDUSD: { swissquote: 'NZD/USD', frankfurter: { from: 'NZD', to: 'USD' }, twelveData: 'NZD/USD' },
  EURGBP: { swissquote: 'EUR/GBP', frankfurter: { from: 'EUR', to: 'GBP' }, twelveData: 'EUR/GBP' },
  EURJPY: { swissquote: 'EUR/JPY', frankfurter: { from: 'EUR', to: 'JPY' }, twelveData: 'EUR/JPY' },
};

const SYMBOL_LIST = Object.keys(SYMBOLS);

function isSupported(symbol) {
  return Object.prototype.hasOwnProperty.call(SYMBOLS, symbol);
}

function getSymbolConfig(symbol) {
  return SYMBOLS[symbol] || null;
}

module.exports = { SYMBOLS, SYMBOL_LIST, isSupported, getSymbolConfig };
