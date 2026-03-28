const axios = require('axios');

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

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

// Cache to avoid hitting rate limits (free tier = 8 calls/min)
const priceCache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds

class DataFetcher {
  async getPriceData(symbol) {
    try {
      if (!TWELVE_DATA_API_KEY) {
        throw new Error('TWELVE_DATA_API_KEY is not configured');
      }

      // Check cache first
      const cacheKey = `quote_${symbol}`;
      const cached = priceCache.get(cacheKey);
      if (cached && (Date.now() - cached.time) < CACHE_TTL) {
        console.log(`[DataFetcher] Cache hit for ${symbol} quote`);
        return { ...cached.data, source: 'live' };
      }

      const tdSymbol = symbol === 'XAUUSD' ? 'XAU/USD' : `${symbol.slice(0, 3)}/${symbol.slice(3)}`;

      console.log(`[DataFetcher] Fetching quote for ${tdSymbol} (key: ${TWELVE_DATA_API_KEY.slice(0, 4)}...)`);

      const response = await axios.get(`${TWELVE_DATA_BASE_URL}/quote`, {
        params: {
          symbol: tdSymbol,
          apikey: TWELVE_DATA_API_KEY
        },
        timeout: 10000
      });

      const d = response.data;
      console.log(`[DataFetcher] Quote response for ${tdSymbol}:`, JSON.stringify(d).slice(0, 500));

      // Twelve Data returns error codes like 400, 401, 429 in response body
      if (d.code || d.status === 'error') {
        throw new Error(d.message || `API error code: ${d.code}`);
      }

      // Validate we got actual price data
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
      console.error(`[DataFetcher] Error fetching price for ${symbol}:`, error.message);

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
        sourceError: error.message
      };
    }
  }

  async getHistoricalData(symbol, timeframe = 'D') {
    try {
      if (!TWELVE_DATA_API_KEY) {
        throw new Error('TWELVE_DATA_API_KEY is not configured');
      }

      // Check cache first (use longer TTL for historical data)
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
        timeout: 10000
      });

      const d = response.data;
      console.log(`[DataFetcher] Time series response keys:`, Object.keys(d), `status: ${d.status}, code: ${d.code}`);

      // Check for API errors first
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

      // Log the full response if we didn't get values
      console.error(`[DataFetcher] No values in response:`, JSON.stringify(d).slice(0, 1000));
      throw new Error(d.message || 'API returned no data - check your plan supports this symbol/interval');
    } catch (error) {
      console.error('[DataFetcher] Error fetching historical data:', error.message);

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
        sourceError: error.message,
        data: historicalData
      };
    }
  }
}

module.exports = new DataFetcher();
