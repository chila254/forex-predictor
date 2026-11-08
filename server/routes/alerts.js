const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const dataFetcher = require('../services/dataFetcher');
const { isSupported } = require('../config/symbols');

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
  if (!isSupported(symbol)) {
    return res.status(400).json({ success: false, error: 'Unsupported symbol' });
  }
  if (condition !== 'above' && condition !== 'below') {
    return res.status(400).json({ success: false, error: 'condition must be "above" or "below"' });
  }
  if (!Number.isFinite(parseFloat(targetPrice)) || parseFloat(targetPrice) <= 0) {
    return res.status(400).json({ success: false, error: 'targetPrice must be a positive number' });
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
  const { sessionId = 'default' } = req.body;
  const alerts = alertsStore.get(sessionId) || [];
  const triggered = [];

  // Prices are fetched server-side. Client-supplied prices are ignored so a
  // caller cannot spoof a trigger by posting arbitrary numbers.
  const symbolsToCheck = [...new Set(alerts.filter(a => !a.triggered).map(a => a.symbol))];
  const priceResults = await Promise.allSettled(
    symbolsToCheck.map(s => dataFetcher.getPriceData(s))
  );
  const prices = {};
  priceResults.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) prices[symbolsToCheck[i]] = r.value.price;
  });

  for (const alert of alerts) {
    if (alert.triggered) continue;
    const currentPrice = prices[alert.symbol];
    if (currentPrice === undefined) continue;

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
