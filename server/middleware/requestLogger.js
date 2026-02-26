const logger = require('../utils/logger');

function requestLoggerMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequestResponse(req.method, req.path, res.statusCode, duration);
  });
  
  next();
}

module.exports = requestLoggerMiddleware;
