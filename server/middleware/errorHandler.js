const logger = require('../utils/logger');
const { publicError } = require('../utils/errors');

function errorHandlerMiddleware(err, req, res, next) {
  logger.error(`Unhandled error: ${err.message}`, err);
  
  res.status(err.status || 500).json({ 
    success: false,
    error: publicError(err.message) || 'An error occurred'
  });
}

module.exports = errorHandlerMiddleware;
