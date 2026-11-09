/**
 * Trading cost & session configuration.
 *
 * Spreads are retail-typical round-trip costs expressed both in pips and in
 * raw quote units, so the signal path and the backtester can subtract the
 * same number the broker actually charges. "pip" is the conventional quote
 * increment for the pair (4th decimal for 5-digit forex, 2nd for JPY pairs,
 * $0.10 for gold).
 */

const SPREADS = {
  EURUSD: { pip: 0.0001, pips: 1.0, digits: 5 },
  GBPUSD: { pip: 0.0001, pips: 1.2, digits: 5 },
  AUDUSD: { pip: 0.0001, pips: 1.1, digits: 5 },
  NZDUSD: { pip: 0.0001, pips: 1.4, digits: 5 },
  USDCHF: { pip: 0.0001, pips: 1.3, digits: 5 },
  USDCAD: { pip: 0.0001, pips: 1.4, digits: 5 },
  USDJPY: { pip: 0.01, pips: 1.0, digits: 3 },
  EURJPY: { pip: 0.01, pips: 1.5, digits: 3 },
  EURGBP: { pip: 0.0001, pips: 1.5, digits: 5 },
  XAUUSD: { pip: 0.1, pips: 3.0, digits: 2 }
};

// UTC, half-open [open, close). Sydney wraps past midnight.
const SESSIONS = [
  { name: 'SYDNEY', open: 21, close: 6 },
  { name: 'TOKYO', open: 0, close: 9 },
  { name: 'LONDON', open: 7, close: 16 },
  { name: 'NEWYORK', open: 13, close: 22 }
];

// Relative signal reliability per session. Overlap of the two most liquid
// sessions is rewarded; thin Asian/Sydney hours are penalised; weekends close.
const SESSION_MULT = {
  SYDNEY: 0.7,
  TOKYO: 0.85,
  LONDON: 1.0,
  NEWYORK: 1.0,
  LONDON_NEWYORK_OVERLAP: 1.1,
  CLOSED: 0
};

function getSpreadConfig(symbol) {
  const s = SPREADS[symbol];
  if (!s) {
    // Unknown symbol: assume a 5-digit major so math never returns NaN.
    return { pip: 0.0001, spreadPips: 1.0, spreadPrice: 0.0001, digits: 5 };
  }
  return { pip: s.pip, spreadPips: s.pips, spreadPrice: s.pips * s.pip, digits: s.digits };
}

function pipsToPrice(symbol, pips) {
  return pips * getSpreadConfig(symbol).pip;
}

function priceToPips(symbol, delta) {
  return delta / getSpreadConfig(symbol).pip;
}

function inWindow(hour, open, close) {
  return open < close ? hour >= open && hour < close : hour >= open || hour < close;
}

// Returns the session name, the overlap label, or CLOSED on Sat/Sun.
function activeSession(date = new Date()) {
  const day = date.getUTCDay(); // 0 Sun .. 6 Sat
  if (day === 6) return 'CLOSED';
  if (day === 0 && date.getUTCHours() >= 22) return 'CLOSED';

  const h = date.getUTCHours();
  const inLondon = inWindow(h, 7, 16);
  const inNY = inWindow(h, 13, 22);
  if (inLondon && inNY) return 'LONDON_NEWYORK_OVERLAP';
  for (const s of SESSIONS) {
    if (inWindow(h, s.open, s.close)) return s.name;
  }
  return 'CLOSED';
}

function sessionMultiplier(date = new Date()) {
  const name = activeSession(date);
  const m = SESSION_MULT[name];
  return m === undefined ? 1 : m;
}

module.exports = {
  SPREADS,
  SESSIONS,
  SESSION_MULT,
  getSpreadConfig,
  pipsToPrice,
  priceToPips,
  activeSession,
  sessionMultiplier
};
