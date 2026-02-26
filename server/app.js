const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend/public
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Import routes
const priceRoutes = require('./routes/prices');
const predictionRoutes = require('./routes/predictions');

// API Routes
app.use('/api/prices', priceRoutes);
app.use('/api/predictions', predictionRoutes);

// Serve dashboard for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Serve dashboard for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

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
