const axios = require('axios');

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';
const GOLD_API_KEY = process.env.GOLD_API_KEY;
const GOLD_API_BASE_URL = 'https://www.goldapi.io/api';

const BASE_PRICES = {
  XAUUSD: 2650,
  EURUSD: 1.08,
  GBPUSD: 1.27,
  USDJPY: 150.5,
  USDCHF: 0.88,
  AUDUSD: 0.65,
  USDCAD: 1.37,
  NZDUSD: 0.57,
  EURGBP: 0.85,
  EURJPY: 162.5,
};

// Cache to avoid hitting rate limits
const priceCache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds
const GOLD_CACHE_TTL = 60 * 1000; // 60 seconds (GoldAPI free = 100 reqs/month)
const ER_CACHE_TTL = 60 * 1000; // 60 seconds for ExchangeRate-API

class DataFetcher {

  // ===== EXCHANGERATE-API (PRIMARY for forex) =====

  async getExchangeRatePrice(symbol) {
    const base = symbol.slice(0, 3);
    const quote = symbol.slice(3);

    const cacheKey = `er_${symbol}`;
    const cached = priceCache.get(cacheKey);
    if (cached && (Date.now() - cached.time) < ER_CACHE_TTL) {
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
    const basePrice = BASE_PRICES[symbol] || price;
    const variation = basePrice * 0.002;

    const result = {
      symbol,
      price,
      high: price + Math.random() * variation,
      low: price - Math.random() * variation,
      open: basePrice,
      close: basePrice,
      volume: 0,
      timestamp: new Date(),
    };

    priceCache.set(cacheKey, { data: result, time: Date.now() });
    return { ...result, source: 'live' };
  }

  // ===== GOLD-SPECIFIC METHODS (GoldAPI.io) =====

  async getGoldPrice() {
    try {
      if (!GOLD_API_KEY) {
        throw new Error('GOLD_API_KEY is not configured');
      }

      const cacheKey = 'quote_XAUUSD';
      const cached = priceCache.get(cacheKey);
      if (cached && (Date.now() - cached.time) < GOLD_CACHE_TTL) {
        console.log('[DataFetcher] Cache hit for XAUUSD (GoldAPI)');
        return { ...cached.data, source: 'live' };
      }

      console.log('[DataFetcher] Fetching XAU/USD from GoldAPI.io');

      const response = await axios.get(`${GOLD_API_BASE_URL}/XAU/USD`, {
        headers: {
          'x-access-token': GOLD_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      const d = response.data;
      console.log('[DataFetcher] GoldAPI response:', JSON.stringify(d).slice(0, 500));

      if (d.error) {
        throw new Error(d.error);
      }

      const price = parseFloat(d.price);
      if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid gold price: ${d.price}`);
      }

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
    } catch (error) {
      console.error('[DataFetcher] GoldAPI error:', error.message);
      // Try Twelve Data as secondary fallback
      return this.getTwelveDataPrice('XAUUSD');
    }
  }

  async getGoldHistory(timeframe) {
    // GoldAPI free tier doesn't have time series, so use Twelve Data or mock
    return this.getTwelveDataHistory('XAUUSD', timeframe);
  }

  // ===== TWELVE DATA METHODS =====

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
      console.log(`[DataFetcher] Quote response for ${tdSymbol}:`, JSON.stringify(d).slice(0, 500));

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
      return this.getMockPrice(symbol, error.message);
    }
  }

  async getTwelveDataHistory(symbol, timeframe = 'D') {
    try {
      if (!TWELVE_DATA_API_KEY) {
        throw new Error('TWELVE_DATA_API_KEY is not configured');
      }

      const cacheKey = `hist_${symbol}_${timeframe}`;
      const cached = priceCache.get(cacheKey);
      if (cached && (Date.now() - cached.time) < CACHE_TTL * 4) {
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
      console.log(`[DataFetcher] Time series keys:`, Object.keys(d), `status: ${d.status}, code: ${d.code}`);

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

      console.error(`[DataFetcher] No values in response:`, JSON.stringify(d).slice(0, 1000));
      throw new Error(d.message || 'API returned no data');
    } catch (error) {
      console.error('[DataFetcher] History error:', error.message);
      return this.getMockHistory(symbol, error.message);
    }
  }

  // ===== MOCK DATA FALLBACKS =====

  getMockPrice(symbol, errorMsg) {
    const base = BASE_PRICES[symbol] || 100;
    const variation = base * 0.005;
    const price = base + (Math.random() - 0.5) * 2 * variation;
    return {
      symbol,
      price,
      high: price + Math.random() * variation,
      low: price - Math.random() * variation,
      open: base + (Math.random() - 0.5) * variation,
      close: base + (Math.random() - 0.5) * variation,
      volume: Math.floor(Math.random() * 1000000),
      timestamp: new Date(),
      source: 'mock',
      sourceError: errorMsg
    };
  }

  getMockHistory(symbol, errorMsg) {
    const base = BASE_PRICES[symbol] || 100;
    const variation = base * 0.003;
    const historicalData = [];
    let price = base;

    for (let i = 100; i > 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      price += (Math.random() - 0.5) * 2 * variation;
      const dayVariation = base * 0.002;
      historicalData.push({
        date,
        open: price + (Math.random() - 0.5) * dayVariation,
        high: price + Math.random() * dayVariation,
        low: price - Math.random() * dayVariation,
        close: price + (Math.random() - 0.5) * dayVariation,
        volume: Math.floor(Math.random() * 1000000)
      });
    }
    return {
      source: 'mock',
      sourceError: errorMsg,
      data: historicalData
    };
  }

  // ===== PUBLIC API (routes call these) =====

  async getPriceData(symbol) {
    if (symbol === 'XAUUSD' && GOLD_API_KEY) {
      return this.getGoldPrice();
    }
    // Try ExchangeRate-API first for forex pairs (not XAUUSD)
    if (symbol !== 'XAUUSD') {
      try {
        return await this.getExchangeRatePrice(symbol);
      } catch (err) {
        console.log(`[DataFetcher] ExchangeRate-API failed for ${symbol}: ${err.message}, trying Twelve Data`);
      }
    }
    return this.getTwelveDataPrice(symbol);
  }

  async getHistoricalData(symbol, timeframe = 'D') {
    if (symbol === 'XAUUSD' && GOLD_API_KEY) {
      return this.getGoldHistory(timeframe);
    }
    return this.getTwelveDataHistory(symbol, timeframe);
  }
}

module.exports = new DataFetcher();
