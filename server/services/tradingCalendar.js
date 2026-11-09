/**
 * Economic calendar access shared by the news route and the signal path.
 *
 * The feed (faireconomy ForexFactory mirror) returns events with an ISO
 * datetime including offset and a `country` field that is actually the
 * currency code (e.g. "EUR", "USD", "AUD"). A single cached fetch with
 * in-flight de-duplication keeps both consumers from hammering the source.
 */

const axios = require('axios');
const logger = require('../utils/logger');

const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const CACHE_TTL = 5 * 60 * 1000;
const HIGH_IMPACT_WINDOW_MIN = 45;

let cache = { data: null, timestamp: 0 };
let inFlight = null;

async function fetchRaw() {
  const res = await axios.get(FEED_URL, { timeout: 8000 });
  if (!Array.isArray(res.data)) throw new Error('Invalid calendar format');
  return res.data.map(e => ({
    title: e.title,
    country: e.country,
    impact: e.impact,
    forecast: e.forecast,
    previous: e.previous,
    actual: e.actual || null,
    datetimeUTC: e.date ? new Date(e.date) : null
  })).filter(e => e.datetimeUTC && !isNaN(e.datetimeUTC.getTime()));
}

// Returns the parsed event list; never throws — callers get [] on failure.
async function getCalendar() {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL) return cache.data;
  if (inFlight) return inFlight;

  inFlight = fetchRaw()
    .then(events => {
      cache = { data: events, timestamp: Date.now() };
      return events;
    })
    .catch(err => {
      logger.warn(`Calendar fetch failed: ${err.message}`);
      return cache.data || [];
    })
    .finally(() => { inFlight = null; });

  return inFlight;
}

function pairCurrencies(symbol) {
  // Symbols are 6-char CCYCCY (XAUUSD is handled as XAU/USD).
  return [symbol.slice(0, 3), symbol.slice(3, 6)];
}

function eventsWithin(calendar, symbol, now = new Date(), windowMinutes = HIGH_IMPACT_WINDOW_MIN) {
  const currencies = pairCurrencies(symbol);
  const horizon = windowMinutes * 60 * 1000;
  return calendar.filter(e => {
    if (e.impact !== 'High') return false;
    if (!currencies.includes(e.country)) return false;
    return Math.abs(e.datetimeUTC.getTime() - now.getTime()) <= horizon;
  });
}

// Live pre-trade guard: is a HIGH-impact event for this pair due soon?
async function newsGuard(symbol, now = new Date(), windowMinutes = HIGH_IMPACT_WINDOW_MIN) {
  const calendar = await getCalendar();
  const events = eventsWithin(calendar, symbol, now, windowMinutes);
  return {
    blocked: events.length > 0,
    events: events.map(e => ({ title: e.title, country: e.country, datetimeUTC: e.datetimeUTC.toISOString() })),
    windowMinutes
  };
}

module.exports = { getCalendar, eventsWithin, newsGuard, pairCurrencies, HIGH_IMPACT_WINDOW_MIN };
