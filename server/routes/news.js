const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { getCalendar } = require('../services/tradingCalendar');

router.get('/', async (req, res) => {
  try {
    const calendar = await getCalendar();
    if (!calendar.length) throw new Error('Calendar unavailable');

    const news = calendar.slice(0, 20).map(e => ({
      title: e.title,
      country: e.country,
      date: e.datetimeUTC.toISOString().split('T')[0],
      time: e.datetimeUTC.toISOString().slice(11, 16),
      impact: e.impact,
      forecast: e.forecast,
      previous: e.previous,
      actual: e.actual
    }));

    res.json({ success: true, source: 'live', news });
  } catch (error) {
    logger.error(`News fetch error: ${error.message}`);

    res.json({
      success: true,
      source: 'fallback',
      news: [
        { title: 'Economic calendar unavailable', country: 'N/A', date: new Date().toISOString().split('T')[0], time: '', impact: 'Low', forecast: '', previous: '', actual: null }
      ]
    });
  }
});

module.exports = router;
