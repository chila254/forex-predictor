const express = require('express');
const router = express.Router();
const dataFetcher = require('../services/dataFetcher');
const predictionEngine = require('../services/predictionEngine');
const Validators = require('../utils/validators');
const logger = require('../utils/logger');

/**
 * POST /api/predictions/:symbol
 * Generate prediction for a symbol
 */
router.post('/:symbol', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { symbol } = req.params;
    const { model = 'ensemble', timeframe = 'D' } = req.body;

    // Validate inputs
    try {
      Validators.validateSymbol(symbol);
      Validators.validateModel(model);
      Validators.validateTimeframe(timeframe);
    } catch (validationError) {
      const duration = Date.now() - startTime;
      logger.warn(`Invalid prediction request: ${validationError.message}`);
      return res.status(400).json({ 
        success: false,
        error: validationError.message 
      });
    }

    logger.info(`Generating ${model} prediction for ${symbol} (${timeframe})`);

    // Get historical data for prediction using selected timeframe
    const histResult = await dataFetcher.getHistoricalData(symbol, timeframe);
    const historicalData = histResult.data;
    const dataSource = histResult.source;
    
    // Validate data
    try {
      Validators.validatePriceData(historicalData);
    } catch (dataError) {
      const duration = Date.now() - startTime;
      logger.error(`Invalid price data: ${dataError.message}`);
      return res.status(400).json({ 
        success: false,
        error: dataError.message 
      });
    }

    // Get live price for anchoring predictions to current market
    let livePrice = null;
    try {
      const livePriceData = await dataFetcher.getPriceData(symbol);
      livePrice = livePriceData.price;
    } catch (e) {
      // Live price unavailable, predictions will anchor to last historical close
    }

    // Run prediction anchored to live price
    const prediction = predictionEngine.predictWithLivePrice
      ? predictionEngine.predictWithLivePrice(historicalData, livePrice, model)
      : predictionEngine.predict(historicalData, model);
    
    // Validate prediction
    try {
      if (prediction.error) throw new Error(prediction.error);
      Validators.validatePrediction(prediction);
    } catch (predError) {
      const duration = Date.now() - startTime;
      logger.error(`Invalid prediction output: ${predError.message}`);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to generate valid prediction' 
      });
    }

    const duration = Date.now() - startTime;
    logger.info(`Prediction generated for ${symbol} in ${duration}ms - Signal: ${prediction.signal.action}`);
    
    res.json({
      success: true,
      symbol,
      model,
      timeframe,
      actualTimeframe: histResult.actualTimeframe || timeframe,
      dataQuality: histResult.dataQuality || (dataSource === 'live' ? 'full_ohlc' : 'unknown'),
      warnings: histResult.warnings || [],
      responseTime: duration,
      dataSource,
      ...prediction
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Prediction error for ${req.params.symbol}: ${error.message}`, error);
    
    res.status(500).json({ 
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Failed to generate prediction. Please try again.' 
    });
  }
});

/**
 * GET /api/predictions/models
 * Get all available models
 */
router.get('/models', (req, res) => {
  logger.info('Fetching available models');
  
  res.json({
    success: true,
    models: ['linear', 'exponential', 'arima', 'ensemble'],
    descriptions: {
      linear: 'Simple linear regression - best for trending markets',
      exponential: 'Exponential trend fitting - good for accelerating moves',
      arima: 'ARIMA(1,1,0) time series model - handles mean reversion',
      ensemble: 'Weighted ensemble (40% linear, 30% exp, 30% ARIMA) - most robust'
    },
    recommendations: {
      beginner: 'ensemble',
      accurate: 'ensemble',
      fast: 'linear',
      trending: 'linear',
      volatile: 'arima'
    }
  });
});

module.exports = router;
