const express = require('express');
const router = express.Router();
const dataFetcher = require('../services/dataFetcher');

// Get current price for a symbol
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const priceData = await dataFetcher.getPriceData(symbol);
    res.json(priceData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get historical data
router.get('/:symbol/history', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = 'D' } = req.query;
    const historicalData = await dataFetcher.getHistoricalData(symbol, timeframe);
    res.json(historicalData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
