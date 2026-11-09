const { test } = require('node:test');
const assert = require('node:assert');
const { getSpreadConfig, pipsToPrice, priceToPips, activeSession, sessionMultiplier, SPREADS } = require('../server/config/tradingCosts');
const { eventsWithin, pairCurrencies } = require('../server/services/tradingCalendar');

test('pip conversion is correct per symbol', () => {
  assert.strictEqual(pipsToPrice('USDJPY', 1), 0.01);
  assert.strictEqual(pipsToPrice('EURJPY', 1), 0.01);
  assert.strictEqual(pipsToPrice('XAUUSD', 1), 0.1);
  assert.strictEqual(pipsToPrice('EURUSD', 1), 0.0001);
  assert.strictEqual(priceToPips('EURJPY', 1), 100);
  assert.strictEqual(priceToPips('XAUUSD', 0.3).toFixed(2), '3.00');
});

test('spread config returns price cost matching pips × pip', () => {
  for (const sym of Object.keys(SPREADS)) {
    const c = getSpreadConfig(sym);
    assert.ok(Math.abs(c.spreadPrice - c.spreadPips * c.pip) < 1e-12, sym);
    assert.ok(c.spreadPrice > 0, sym);
  }
});

test('unknown symbol falls back to a 5-digit major', () => {
  const c = getSpreadConfig('ZZZUSD');
  assert.strictEqual(c.pip, 0.0001);
  assert.ok(c.spreadPrice > 0);
});

test('activeSession covers London/NY overlap, Sydney wrap and weekend', () => {
  // 2024-01-05 is a Friday.
  assert.strictEqual(activeSession(new Date('2024-01-05T14:00:00Z')), 'LONDON_NEWYORK_OVERLAP');
  assert.strictEqual(activeSession(new Date('2024-01-05T21:30:00Z')), 'SYDNEY');
  assert.strictEqual(activeSession(new Date('2024-01-05T06:30:00Z')), 'TOKYO');
  assert.strictEqual(activeSession(new Date('2024-01-06T12:00:00Z')), 'CLOSED'); // Saturday
});

test('sessionMultiplier matches the session table', () => {
  assert.strictEqual(sessionMultiplier(new Date('2024-01-05T14:00:00Z')), 1.1);
  assert.strictEqual(sessionMultiplier(new Date('2024-01-05T21:30:00Z')), 0.7);
  assert.strictEqual(sessionMultiplier(new Date('2024-01-06T12:00:00Z')), 0);
});

test('pairCurrencies splits 6-char symbols', () => {
  assert.deepStrictEqual(pairCurrencies('EURUSD'), ['EUR', 'USD']);
  assert.deepStrictEqual(pairCurrencies('XAUUSD'), ['XAU', 'USD']);
});

test('eventsWithin blocks EURUSD on a HIGH EUR event but not USDJPY', () => {
  const now = new Date('2024-01-05T13:00:00Z');
  const cal = [
    { title: 'ECB Rate', country: 'EUR', impact: 'High', datetimeUTC: new Date('2024-01-05T13:20:00Z') },
    { title: 'Minor', country: 'EUR', impact: 'Low', datetimeUTC: new Date('2024-01-05T13:10:00Z') },
    { title: 'Far', country: 'EUR', impact: 'High', datetimeUTC: new Date('2024-01-05T20:00:00Z') }
  ];
  const eur = eventsWithin(cal, 'EURUSD', now, 45);
  assert.strictEqual(eur.length, 1);
  assert.strictEqual(eur[0].title, 'ECB Rate');
  const jpy = eventsWithin(cal, 'USDJPY', now, 45);
  assert.strictEqual(jpy.length, 0);
});
