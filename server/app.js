const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const logger = require('./utils/logger');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');

// Startup logging
logger.info('Forex Predictor server starting...');
logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

// Middleware - CORS. Restrict to an allowlist in production; open in dev.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
app.use(cors({
  origin: process.env.NODE_ENV === 'production' && allowedOrigins.length
    ? allowedOrigins
    : true,
  methods: ['GET', 'POST', 'DELETE'],
}));

// Middleware - JSON parsing
app.use(express.json());

// Middleware - Request logging
app.use(requestLogger);

// Rate limiting on the API — protects upstream provider quotas.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PER_MIN) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please slow down.' },
});
app.use('/api/', apiLimiter);

// Serve static files from frontend/public
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Import routes
const priceRoutes = require('./routes/prices');
const predictionRoutes = require('./routes/predictions');
const newsRoutes = require('./routes/news');
const alertRoutes = require('./routes/alerts');
const analysisRoutes = require('./routes/analysis');
const backtestRoutes = require('./routes/backtest');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/prices', priceRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/backtest', backtestRoutes);

// Serve dashboard for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// 404 handler
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    success: false,
    error: 'Not found' 
  });
});

// Error handler
app.use(errorHandler);

// For local development with HTTP server
if (require.main === module) {
  const http = require('http');
  const PORT = process.env.PORT || 5000;
  const server = http.createServer(app);
  
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Forex Predictor started...');
  });
}

module.exports = app;
