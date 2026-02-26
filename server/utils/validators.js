/**
 * Input Validation Utilities
 */
class Validators {
  static validateSymbol(symbol) {
    const validSymbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];
    if (!symbol || !validSymbols.includes(symbol)) {
      throw new Error(`Invalid symbol. Supported: ${validSymbols.join(', ')}`);
    }
    return true;
  }

  static validateModel(model) {
    const validModels = ['linear', 'exponential', 'arima', 'ensemble'];
    if (!model || !validModels.includes(model)) {
      throw new Error(`Invalid model. Supported: ${validModels.join(', ')}`);
    }
    return true;
  }

  static validatePriceData(priceData) {
    if (!Array.isArray(priceData)) {
      throw new Error('Price data must be an array');
    }
    
    if (priceData.length < 14) {
      throw new Error(`Need at least 14 price points, got ${priceData.length}`);
    }
    
    for (let i = 0; i < priceData.length; i++) {
      const price = priceData[i];
      if (typeof price.close !== 'number' || price.close <= 0) {
        throw new Error(`Invalid price at index ${i}: close price must be positive number`);
      }
      if (typeof price.high !== 'number' || typeof price.low !== 'number') {
        throw new Error(`Invalid price at index ${i}: high/low must be numbers`);
      }
    }
    return true;
  }

  static validatePrediction(prediction) {
    if (!prediction) {
      throw new Error('Prediction is null or undefined');
    }
    
    if (!prediction.signal || typeof prediction.signal !== 'object') {
      throw new Error('Invalid prediction structure: missing signal');
    }
    
    const validActions = ['BUY', 'SELL', 'HOLD'];
    if (!validActions.includes(prediction.signal.action)) {
      throw new Error(`Invalid signal action: ${prediction.signal.action}`);
    }
    
    if (typeof prediction.signal.confidence !== 'number') {
      throw new Error('Signal confidence must be a number');
    }
    
    if (prediction.signal.confidence < 0 || prediction.signal.confidence > 1) {
      throw new Error('Signal confidence must be between 0 and 1');
    }
    
    return true;
  }

  static validateTimeframe(timeframe) {
    const validTimeframes = ['5M', '15M', '1H', '4H', 'D'];
    if (!timeframe || !validTimeframes.includes(timeframe)) {
      throw new Error(`Invalid timeframe. Supported: ${validTimeframes.join(', ')}`);
    }
    return true;
  }
}

module.exports = Validators;
