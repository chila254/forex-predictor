const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const logger = require('./utils/logger');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');

// Startup logging
logger.info('Forex Predictor server starting...');
logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

// Middleware - CORS
app.use(cors());

// Middleware - JSON parsing
app.use(express.json());

// Middleware - Request logging
app.use(requestLogger);

// Serve static files from frontend/public
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Import routes
const priceRoutes = require('./routes/prices');
const predictionRoutes = require('./routes/predictions');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/prices', priceRoutes);
app.use('/api/predictions', predictionRoutes);

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
