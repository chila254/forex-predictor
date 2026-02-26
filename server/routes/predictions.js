const express = require('express');
const router = express.Router();
const dataFetcher = require('../services/dataFetcher');
const predictionEngine = require('../services/predictionEngine');

// Get prediction for a symbol
router.post('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { model = 'ensemble' } = req.body;

    // Get historical data for prediction
    const historicalData = await dataFetcher.getHistoricalData(symbol);
    
    // Run prediction
    const prediction = predictionEngine.predict(historicalData, model);
    
    res.json({
      symbol,
      model,
      ...prediction
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all available models
router.get('/models', (req, res) => {
  res.json({
    models: ['linear', 'exponential', 'arima', 'ensemble'],
    descriptions: {
      linear: 'Simple linear regression',
      exponential: 'Exponential trend fitting',
      arima: 'ARIMA(1,1,0) time series model',
      ensemble: 'Weighted ensemble of all models'
    }
  });
});

module.exports = router;
