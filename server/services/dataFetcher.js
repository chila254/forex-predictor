const axios = require('axios');

// Using Finnhub API - Free tier available
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

// Commodity symbols
const SYMBOLS = {
  GOLD: 'XAUUSD',  // Gold
  EURUSD: 'EURUSD',  // EUR/USD
  GBPUSD: 'GBPUSD',  // GBP/USD
  USDJPY: 'USDJPY',  // USD/JPY
};

class DataFetcher {
  async getPriceData(symbol) {
    try {
      // Validate API keys
      if (!FINNHUB_API_KEY) {
        throw new Error('FINNHUB_API_KEY is not configured. Please add it to your environment variables.');
      }
      
      const response = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
        params: {
          symbol: symbol,
          token: FINNHUB_API_KEY
        }
      });

      return {
        symbol,
        price: response.data.c,  // Current price
        high: response.data.h,   // Day high
        low: response.data.l,    // Day low
        open: response.data.o,   // Open price
        close: response.data.pc, // Previous close
        volume: response.data.v,
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error.message);
      
      // Return mock data for demo
      return {
        symbol,
        price: Math.random() * 100,
        high: Math.random() * 105,
        low: Math.random() * 95,
        open: Math.random() * 100,
        close: Math.random() * 100,
        volume: Math.random() * 1000000,
        timestamp: new Date()
      };
    }
  }

  async getHistoricalData(symbol, timeframe = 'D') {
    try {
      // Mock historical data for demo
      // In production, fetch from API
      const historicalData = [];
      for (let i = 100; i > 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        historicalData.push({
          date,
          open: 100 + Math.random() * 10,
          high: 105 + Math.random() * 10,
          low: 95 + Math.random() * 10,
          close: 100 + Math.random() * 10,
          volume: Math.random() * 1000000
        });
      }
      return historicalData;
    } catch (error) {
      console.error('Error fetching historical data:', error.message);
      return [];
    }
  }
}

module.exports = new DataFetcher();
