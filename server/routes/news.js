const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

const FOREX_NEWS_CACHE = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

router.get('/', async (req, res) => {
  try {
    const now = Date.now();
    if (FOREX_NEWS_CACHE.data && (now - FOREX_NEWS_CACHE.timestamp) < CACHE_TTL) {
      return res.json({ success: true, source: 'cache', news: FOREX_NEWS_CACHE.data });
    }

    // Use free ForexFactory-style economic calendar via DailyFX RSS or fallback
    const response = await axios.get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      timeout: 8000
    });

    const events = response.data;
    if (Array.isArray(events)) {
      const news = events.slice(0, 20).map(e => ({
        title: e.title,
        country: e.country,
        date: e.date,
        time: e.time,
        impact: e.impact,
        forecast: e.forecast,
        previous: e.previous,
        actual: e.actual || null
      }));

      FOREX_NEWS_CACHE.data = news;
      FOREX_NEWS_CACHE.timestamp = now;

      return res.json({ success: true, source: 'live', news });
    }

    throw new Error('Invalid news data format');
  } catch (error) {
    logger.error(`News fetch error: ${error.message}`);
    
    // Return fallback static news
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
