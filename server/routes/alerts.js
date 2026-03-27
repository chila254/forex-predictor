const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// In-memory alerts storage (per-session, resets on deploy)
const alertsStore = new Map();

router.get('/', (req, res) => {
  const sessionId = req.query.sessionId || 'default';
  const alerts = alertsStore.get(sessionId) || [];
  res.json({ success: true, alerts });
});

router.post('/', (req, res) => {
  const { sessionId = 'default', symbol, condition, targetPrice, note } = req.body;

  if (!symbol || !condition || !targetPrice) {
    return res.status(400).json({ success: false, error: 'symbol, condition, and targetPrice are required' });
  }

  const alert = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    symbol,
    condition, // 'above' or 'below'
    targetPrice: parseFloat(targetPrice),
    note: note || '',
    createdAt: new Date().toISOString(),
    triggered: false
  };

  const alerts = alertsStore.get(sessionId) || [];
  alerts.push(alert);
  alertsStore.set(sessionId, alerts);

  logger.info(`Alert created: ${symbol} ${condition} ${targetPrice}`);
  res.json({ success: true, alert });
});

router.delete('/:id', (req, res) => {
  const { sessionId = 'default' } = req.query;
  const alerts = alertsStore.get(sessionId) || [];
  const filtered = alerts.filter(a => a.id !== req.params.id);
  alertsStore.set(sessionId, filtered);
  res.json({ success: true });
});

router.post('/check', async (req, res) => {
  const { sessionId = 'default', prices } = req.body;
  const alerts = alertsStore.get(sessionId) || [];
  const triggered = [];

  for (const alert of alerts) {
    if (alert.triggered) continue;
    const currentPrice = prices?.[alert.symbol];
    if (!currentPrice) continue;

    if (
      (alert.condition === 'above' && currentPrice >= alert.targetPrice) ||
      (alert.condition === 'below' && currentPrice <= alert.targetPrice)
    ) {
      alert.triggered = true;
      triggered.push({ ...alert, currentPrice });
    }
  }

  alertsStore.set(sessionId, alerts);
  res.json({ success: true, triggered });
});

module.exports = router;
