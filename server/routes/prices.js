const express = require('express');
const router = express.Router();
const dataFetcher = require('../services/dataFetcher');
const Validators = require('../utils/validators');
const logger = require('../utils/logger');

/**
 * GET /api/prices/batch
 * Get current prices for multiple symbols at once
 */
router.get('/batch', async (req, res) => {
  const startTime = Date.now();
  const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'XAUUSD', 'EURGBP', 'EURJPY'];
  
  try {
    const results = await Promise.allSettled(
      symbols.map(s => dataFetcher.getPriceData(s))
    );

    const prices = {};
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        prices[symbols[i]] = result.value;
      }
    });

    const duration = Date.now() - startTime;
    logger.info(`Batch prices fetched in ${duration}ms - ${Object.keys(prices).length} symbols`);

    res.json({
      success: true,
      responseTime: duration,
      prices
    });
  } catch (error) {
    logger.error(`Batch price error: ${error.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch batch prices' });
  }
});

/**
 * GET /api/prices/:symbol
 * Get current price for a symbol
 */
router.get('/:symbol', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { symbol } = req.params;

    // Validate symbol
    try {
      Validators.validateSymbol(symbol);
    } catch (validationError) {
      logger.warn(`Invalid price request: ${validationError.message}`);
      return res.status(400).json({ 
        success: false,
        error: validationError.message 
      });
    }

    logger.info(`Fetching current price for ${symbol}`);

    const priceData = await dataFetcher.getPriceData(symbol);
    
    if (!priceData || !priceData.price) {
      throw new Error('Failed to retrieve price data');
    }

    const duration = Date.now() - startTime;
    logger.info(`Price fetched for ${symbol} in ${duration}ms - Price: ${priceData.price}`);

    res.json({
      success: true,
      responseTime: duration,
      ...priceData
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Price fetch error: ${error.message}`, error);
    
    res.status(500).json({ 
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Failed to fetch price data. Please try again.' 
    });
  }
});

/**
 * GET /api/prices/:symbol/history
 * Get historical data for a symbol
 */
router.get('/:symbol/history', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { symbol } = req.params;
    const { timeframe = 'D' } = req.query;

    try {
      Validators.validateSymbol(symbol);
      Validators.validateTimeframe(timeframe);
    } catch (validationError) {
      logger.warn(`Invalid history request: ${validationError.message}`);
      return res.status(400).json({ 
        success: false,
        error: validationError.message 
      });
    }

    logger.info(`Fetching ${timeframe} history for ${symbol}`);

    const result = await dataFetcher.getHistoricalData(symbol, timeframe);
    const historicalData = result.data;
    
    if (!Array.isArray(historicalData) || historicalData.length === 0) {
      throw new Error('No historical data available');
    }

    const duration = Date.now() - startTime;
    logger.info(`History fetched for ${symbol} in ${duration}ms - ${historicalData.length} candles (source: ${result.source})`);

    res.json({
      success: true,
      responseTime: duration,
      source: result.source,
      sourceError: result.sourceError,
      dataPoints: historicalData.length,
      data: historicalData
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`History fetch error: ${error.message}`, error);
    
    res.status(500).json({ 
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Failed to fetch history. Please try again.' 
    });
  }
});

module.exports = router;
