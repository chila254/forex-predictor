const logger = require('../utils/logger');

function errorHandlerMiddleware(err, req, res, next) {
  logger.error(`Unhandled error: ${err.message}`, err);
  
  res.status(err.status || 500).json({ 
    success: false,
    error: process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'An error occurred'
  });
}

module.exports = errorHandlerMiddleware;
