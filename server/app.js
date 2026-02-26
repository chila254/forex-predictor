const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../frontend/public'));

// Import routes
const priceRoutes = require('./routes/prices');
const predictionRoutes = require('./routes/predictions');

// Routes
app.use('/api/prices', priceRoutes);
app.use('/api/predictions', predictionRoutes);

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('subscribe', (asset) => {
    console.log(`Client ${socket.id} subscribed to ${asset}`);
    socket.join(asset);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Forex Predictor started...');
});

module.exports = { app, io };
