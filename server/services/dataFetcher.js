const axios = require('axios');

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';
const GOLD_API_KEY = process.env.GOLD_API_KEY;
const GOLD_API_BASE_URL = 'https://www.goldapi.io/api';

// Log API key availability on module load (never log actual keys)
console.log(`[DataFetcher] TwelveData configured: ${!!TWELVE_DATA_API_KEY}`);
console.log(`[DataFetcher] GoldAPI configured: ${!!GOLD_API_KEY}`);

// Swissquote instrument mapping (free real-time, no key needed)
const SQ_SYMBOLS = {
  EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', USDCHF: 'USD/CHF',
  AUDUSD: 'AUD/USD', USDCAD: 'USD/CAD', NZDUSD: 'NZD/USD', XAUUSD: 'XAU/USD',
  EURGBP: 'EUR/GBP', EURJPY: 'EUR/JPY',
};

// Frankfurter needs base/quote split — only supports fiat (not XAU)
const FRANKFURTER_PAIRS = {
  EURUSD: { from: 'EUR', to: 'USD' }, GBPUSD: { from: 'GBP', to: 'USD' },
  USDJPY: { from: 'USD', to: 'JPY' }, USDCHF: { from: 'USD', to: 'CHF' },
  AUDUSD: { from: 'AUD', to: 'USD' }, USDCAD: { from: 'USD', to: 'CAD' },
  NZDUSD: { from: 'NZD', to: 'USD' }, EURGBP: { from: 'EUR', to: 'GBP' },
  EURJPY: { from: 'EUR', to: 'JPY' },
};

// Cache to avoid hitting rate limits
const priceCache = new Map();
const CACHE_TTL = 15 * 1000; // 15 seconds for real-time
const HIST_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for history

class DataFetcher {

  // ===== SWISSQUOTE (PRIMARY — free real-time for ALL pairs inc. gold) =====

  async getSwissquotePrice(symbol) {
    const cacheKey = `sq_${symbol}`;
    const cached = priceCache.get(cacheKey);
    if (cached && (Date.now() - cached.time) < CACHE_TTL) {
      console.log(`[DataFetcher] Cache hit for ${symbol} (Swissquote)`);
      return { ...cached.data, source: 'live' };
    }

    const sqSymbol = SQ_SYMBOLS[symbol];
    if (!sqSymbol) throw new Error(`Unsupported symbol: ${symbol}`);

    const [base, quote] = sqSymbol.split('/');
    console.log(`[DataFetcher] Fetching ${symbol} from Swissquote (real-time)`);

    const response = await axios.get(
      `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${base}/${quote}`,
      { timeout: 5000 }
    );

    const d = response.data;
    if (!Array.isArray(d) || d.length === 0 || !d[0].spreadProfilePrices) {
      throw new Error(`Swissquote: no data for ${symbol}`);
    }

    const profiles = d[0].spreadProfilePrices;
    const best = profiles[0]; // first profile (premium) has tightest spread
    const bid = best.bid;
    const ask = best.ask;
    const price = (bid + ask) / 2;
    const spread = ask - bid;

    const result = {
      symbol,
      price,
      bid,
      ask,
      spread: parseFloat(spread.toFixed(symbol === 'XAUUSD' ? 2 : 5)),
      high: ask,
      low: bid,
      open: price,
      close: price,
      volume: 0,
      timestamp: new Date(),
    };

    priceCache.set(cacheKey, { data: result, time: Date.now() });
    return { ...result, source: 'live' };
  }

  // ===== FRANKFURTER (FREE historical forex data — ECB rates, no key) =====

  async getFrankfurterHistory(symbol) {
    const pair = FRANKFURTER_PAIRS[symbol];
    if (!pair) throw new Error(`Frankfurter does not support ${symbol}`);

    const cacheKey = `frank_hist_${symbol}`;
    const cached = priceCache.get(cacheKey);
    if (cached && (Date.now() - cached.time) < HIST_CACHE_TTL) {
      console.log(`[DataFetcher] Cache hit for ${symbol} history (Frankfurter)`);
      return { source: 'live', data: cached.data };
    }

    // Use yesterday as end date to avoid "future date" errors
    const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const start = new Date(Date.now() - 150 * 86400000).toISOString().slice(0, 10);

    console.log(`[DataFetcher] Fetching ${symbol} history from Frankfurter (${start}..${end})`);

    const response = await axios.get(
      `https://api.frankfurter.app/${start}..${end}?from=${pair.from}&to=${pair.to}`,
      { timeout: 10000 }
    );

    const d = response.data;
    if (!d.rates) throw new Error('Frankfurter: no rates returned');

    const dates = Object.keys(d.rates).sort();
    if (dates.length < 14) throw new Error(`Frankfurter: only ${dates.length} data points`);

    const data = dates.map(date => {
      const rate = d.rates[date][pair.to];
      return {
        date: new Date(date),
        open: rate,
        high: rate,
        low: rate,
        close: rate,
        volume: 0
      };
    });

    console.log(`[DataFetcher] Got ${data.length} daily candles from Frankfurter for ${symbol}`);
    priceCache.set(cacheKey, { data, time: Date.now() });
    return { source: 'live', data };
  }

  async buildIntradayHistory(symbol, timeframe) {
    if (TWELVE_DATA_API_KEY) {
      return this.getTwelveDataHistory(symbol, timeframe);
    }
    throw new Error(`No real intraday data source available for ${symbol} ${timeframe}. Set TWELVE_DATA_API_KEY for intraday history.`);
  }

  async getGoldHistory(timeframe) {
    if (TWELVE_DATA_API_KEY) {
      return await this.getTwelveDataHistory('XAUUSD', timeframe);
    }
    throw new Error('Historical XAUUSD data requires TWELVE_DATA_API_KEY. Only live spot price is available via Swissquote.');
  }

  // ===== TWELVE DATA METHODS (used when API key is available) =====

  async getTwelveDataPrice(symbol) {
    try {
      if (!TWELVE_DATA_API_KEY) {
        throw new Error('TWELVE_DATA_API_KEY is not configured');
      }

      const cacheKey = `quote_${symbol}`;
      const cached = priceCache.get(cacheKey);
      if (cached && (Date.now() - cached.time) < CACHE_TTL) {
        console.log(`[DataFetcher] Cache hit for ${symbol} quote`);
        return { ...cached.data, source: 'live' };
      }

      const tdSymbol = symbol === 'XAUUSD' ? 'XAU/USD' : `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
      console.log(`[DataFetcher] Fetching quote for ${tdSymbol} from TwelveData`);

      const response = await axios.get(`${TWELVE_DATA_BASE_URL}/quote`, {
        params: {
          symbol: tdSymbol,
          apikey: TWELVE_DATA_API_KEY
        },
        timeout: 5000
      });

      const d = response.data;
      if (d.code || d.status === 'error') {
        throw new Error(d.message || `API error code: ${d.code}`);
      }

      const price = parseFloat(d.close);
      if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid price data received: close=${d.close}`);
      }

      const result = {
        symbol,
        price,
        high: parseFloat(d.high) || price,
        low: parseFloat(d.low) || price,
        open: parseFloat(d.open) || price,
        close: parseFloat(d.previous_close) || price,
        volume: parseInt(d.volume) || 0,
        timestamp: new Date(),
      };

      priceCache.set(cacheKey, { data: result, time: Date.now() });
      return { ...result, source: 'live' };
    } catch (error) {
      console.error(`[DataFetcher] TwelveData error for ${symbol}:`, error.message);
      throw error;
    }
  }

  async getTwelveDataHistory(symbol, timeframe = 'D') {
    if (!TWELVE_DATA_API_KEY) {
      throw new Error('TWELVE_DATA_API_KEY is not configured');
    }

    const cacheKey = `hist_${symbol}_${timeframe}`;
    const cached = priceCache.get(cacheKey);
    if (cached && (Date.now() - cached.time) < HIST_CACHE_TTL) {
      console.log(`[DataFetcher] Cache hit for ${symbol} ${timeframe} history`);
      return { source: 'live', data: cached.data };
    }

    const tdSymbol = symbol === 'XAUUSD' ? 'XAU/USD' : `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
    const intervalMap = { '5M': '5min', '15M': '15min', '1H': '1h', '4H': '4h', 'D': '1day' };
    const interval = intervalMap[timeframe] || '1day';

    console.log(`[DataFetcher] Fetching time_series for ${tdSymbol}, interval=${interval}`);

    const response = await axios.get(`${TWELVE_DATA_BASE_URL}/time_series`, {
      params: {
        symbol: tdSymbol,
        interval,
        outputsize: 100,
        apikey: TWELVE_DATA_API_KEY
      },
      timeout: 5000
    });

    const d = response.data;
    if (d.code || d.status === 'error') {
      throw new Error(d.message || `API error code: ${d.code}`);
    }

    if (d.values && Array.isArray(d.values) && d.values.length > 0) {
      console.log(`[DataFetcher] Got ${d.values.length} candles for ${tdSymbol}`);
      const data = d.values.reverse().map(v => ({
        date: new Date(v.datetime),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseInt(v.volume) || 0
      }));
      priceCache.set(cacheKey, { data, time: Date.now() });
      return { source: 'live', data };
    }

    throw new Error(d.message || 'API returned no data');
  }

  // ===== PUBLIC API (routes call these) =====

  async getPriceData(symbol) {
    // 1. Try Swissquote first (free, real-time, all pairs + gold)
    try {
      return await this.getSwissquotePrice(symbol);
    } catch (err) {
      console.log(`[DataFetcher] Swissquote failed for ${symbol}: ${err.message}`);
    }

    // 2. Try ExchangeRate-API for forex pairs
    if (symbol !== 'XAUUSD') {
      try {
        return await this.getExchangeRatePrice(symbol);
      } catch (err) {
        console.log(`[DataFetcher] ExchangeRate-API failed for ${symbol}: ${err.message}`);
      }
    }

    // 3. Try TwelveData if key available
    if (TWELVE_DATA_API_KEY) {
      try {
        return await this.getTwelveDataPrice(symbol);
      } catch (err) {
        console.log(`[DataFetcher] TwelveData failed for ${symbol}: ${err.message}`);
      }
    }

    // 4. GoldAPI for XAUUSD
    if (symbol === 'XAUUSD' && GOLD_API_KEY) {
      try {
        return await this.getGoldPrice();
      } catch (err) {
        console.log(`[DataFetcher] GoldAPI failed: ${err.message}`);
      }
    }

    throw new Error(`All data sources failed for ${symbol}`);
  }

  async getHistoricalData(symbol, timeframe = 'D') {
    // Gold: real historical data only
    if (symbol === 'XAUUSD') {
      return this.getGoldHistory(timeframe);
    }

    // Forex intraday: TwelveData first, then daily fallback with warning
    if (timeframe !== 'D') {
      if (TWELVE_DATA_API_KEY) {
        try {
          return await this.getTwelveDataHistory(symbol, timeframe);
        } catch (err) {
          console.log(`[DataFetcher] TwelveData intraday failed for ${symbol}: ${err.message}`);
        }
      }

      // Fall back to daily data with warning
      if (FRANKFURTER_PAIRS[symbol]) {
        const daily = await this.getFrankfurterHistory(symbol);
        return {
          ...daily,
          requestedTimeframe: timeframe,
          actualTimeframe: 'D',
          dataQuality: 'close_only',
          warnings: [`No real ${timeframe} data available; returned daily close-only data instead.`]
        };
      }

      throw new Error(`No real intraday source available for ${symbol}`);
    }

    // Forex daily: Frankfurter (real ECB data)
    if (FRANKFURTER_PAIRS[symbol]) {
      try {
        return await this.getFrankfurterHistory(symbol);
      } catch (err) {
        console.log(`[DataFetcher] Frankfurter failed for ${symbol}: ${err.message}`);
      }
    }

    // Fallback to TwelveData for daily
    if (TWELVE_DATA_API_KEY) {
      return this.getTwelveDataHistory(symbol, timeframe);
    }

    throw new Error(`No historical data source available for ${symbol} ${timeframe}`);
  }

  // ===== EXCHANGERATE-API (fallback for live forex prices) =====

  async getExchangeRatePrice(symbol) {
    const base = symbol.slice(0, 3);
    const quote = symbol.slice(3);

    const cacheKey = `er_${symbol}`;
    const cached = priceCache.get(cacheKey);
    if (cached && (Date.now() - cached.time) < CACHE_TTL) {
      console.log(`[DataFetcher] Cache hit for ${symbol} (ExchangeRate-API)`);
      return { ...cached.data, source: 'live' };
    }

    console.log(`[DataFetcher] Fetching ${symbol} from ExchangeRate-API (base=${base})`);

    const response = await axios.get(`https://open.er-api.com/v6/latest/${base}`, {
      timeout: 5000
    });

    const d = response.data;
    if (d.result !== 'success' || !d.rates || !d.rates[quote]) {
      throw new Error(`ExchangeRate-API: no rate for ${quote} from base ${base}`);
    }

    const price = d.rates[quote];

    const result = {
      symbol,
      price,
      high: price,
      low: price,
      open: price,
      close: price,
      volume: 0,
      timestamp: new Date(),
    };

    priceCache.set(cacheKey, { data: result, time: Date.now() });
    return { ...result, source: 'live' };
  }

  // ===== GOLDAPI.IO (fallback for gold) =====

  async getGoldPrice() {
    if (!GOLD_API_KEY) throw new Error('GOLD_API_KEY is not configured');

    const cacheKey = 'quote_XAUUSD';
    const cached = priceCache.get(cacheKey);
    if (cached && (Date.now() - cached.time) < 60000) {
      return { ...cached.data, source: 'live' };
    }

    const response = await axios.get(`${GOLD_API_BASE_URL}/XAU/USD`, {
      headers: { 'x-access-token': GOLD_API_KEY, 'Content-Type': 'application/json' },
      timeout: 5000
    });

    const d = response.data;
    if (d.error) throw new Error(d.error);

    const price = parseFloat(d.price);
    if (isNaN(price) || price <= 0) throw new Error(`Invalid gold price: ${d.price}`);

    const result = {
      symbol: 'XAUUSD',
      price,
      high: parseFloat(d.high_price) || price,
      low: parseFloat(d.low_price) || price,
      open: parseFloat(d.open_price) || price,
      close: parseFloat(d.prev_close_price) || price,
      volume: 0,
      timestamp: new Date(),
    };

    priceCache.set(cacheKey, { data: result, time: Date.now() });
    return { ...result, source: 'live' };
  }
}

module.exports = new DataFetcher();
