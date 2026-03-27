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

class DataFetcher {
  async getPriceData(symbol) {
    try {
      if (!TWELVE_DATA_API_KEY) {
        throw new Error('TWELVE_DATA_API_KEY is not configured');
      }

      const tdSymbol = symbol === 'XAUUSD' ? 'XAU/USD' : `${symbol.slice(0, 3)}/${symbol.slice(3)}`;

      const response = await axios.get(`${TWELVE_DATA_BASE_URL}/quote`, {
        params: {
          symbol: tdSymbol,
          apikey: TWELVE_DATA_API_KEY
        },
        timeout: 10000
      });

      const d = response.data;
      if (d.code || d.status === 'error') {
        throw new Error(d.message || 'API returned error');
      }

      return {
        symbol,
        price: parseFloat(d.close),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        open: parseFloat(d.open),
        close: parseFloat(d.previous_close),
        volume: parseInt(d.volume) || 0,
        timestamp: new Date(),
        source: 'live'
      };
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error.message);

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

      const tdSymbol = symbol === 'XAUUSD' ? 'XAU/USD' : `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
      const intervalMap = { '5M': '5min', '15M': '15min', '1H': '1h', '4H': '4h', 'D': '1day' };

      const response = await axios.get(`${TWELVE_DATA_BASE_URL}/time_series`, {
        params: {
          symbol: tdSymbol,
          interval: intervalMap[timeframe] || '1day',
          outputsize: 100,
          apikey: TWELVE_DATA_API_KEY
        },
        timeout: 10000
      });

      const d = response.data;
      if (d.values && Array.isArray(d.values)) {
        return {
          source: 'live',
          data: d.values.reverse().map(v => ({
            date: new Date(v.datetime),
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
            volume: parseInt(v.volume) || 0
          }))
        };
      }

      throw new Error('API returned no data');
    } catch (error) {
      console.error('Error fetching historical data:', error.message);

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
