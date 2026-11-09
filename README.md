# Forex Predictor - Real-Time Market Prediction System

A sophisticated Node.js application for predicting forex and commodity prices using technical analysis and statistical models.

## Features

### Core Functionality
- **Real-Time Price Tracking**: Live forex and commodity price updates (Gold, EUR/USD, GBP/USD, USD/JPY)
- **Multiple Prediction Models**:
  - Linear Regression
  - Exponential Regression
  - ARIMA (AutoRegressive Integrated Moving Average)
  - Ensemble Model (Weighted combination)

### Technical Indicators
- **RSI** (Relative Strength Index) - Momentum oscillator
- **MACD** (Moving Average Convergence Divergence) - Trend-following momentum
- **Bollinger Bands** - Volatility and support/resistance
- **ATR** (Average True Range) - Volatility measurement
- **SMA/EMA** (Simple & Exponential Moving Averages)
- **Stochastic Oscillator** - Momentum indicator

### Trading Signals
- **BUY/SELL Recommendations** with confidence levels
- **Regime-aware scoring** (trending vs ranging markets get different rules)
- **ATR-based risk management**:
  - Entry Price (current live market price)
  - Stop Loss — ATR multiple (regime-adaptive), snapped to structure where possible
  - Take Profit — ATR multiple target with live risk:reward
- **Tradeability filter** — signals are suppressed when the expected move is smaller than volatility noise

### Dashboard
- Interactive web interface with real-time polling updates
- 3D price history & forecast visualisation (Three.js)
- Technical indicator gauges and multi-timeframe analysis
- Market correlation matrix

## Project Structure

```
forex-predictor/
├── server/
│   ├── app.js                 # Express server & Socket.io
│   ├── routes/
│   │   ├── prices.js          # Price endpoints
│   │   └── predictions.js     # Prediction endpoints
│   └── services/
│       ├── dataFetcher.js     # API data fetching
│       ├── technicalAnalysis.js # Indicator calculations
│       └── predictionEngine.js  # Prediction models
├── frontend/
│   └── public/
│       ├── index.html         # Dashboard UI
│       ├── styles.css         # Styling
│       └── dashboard.js       # Frontend logic
├── .env                       # Configuration
├── package.json               # Dependencies
└── README.md                  # This file
```

## Installation

### Prerequisites
- Node.js 14+
- npm or yarn
- Free API key (optional, uses mock data by default)

### Setup

1. **Clone/Extract the project**
```bash
cd forex-predictor
```

2. **Install dependencies**
```bash
npm install
# or
yarn install
```

3. **Configure API Keys (Optional)**

Get free API keys:
- **Finnhub**: https://finnhub.io/dashboard (free tier)
- **Polygon.io**: https://polygon.io (free tier)
- **Twelve Data**: https://twelvedata.com (free tier)

Edit `.env`:
```env
FINNHUB_API_KEY=your_key_here
```

4. **Start the server**
```bash
npm start
# or for development with hot reload
npm install nodemon -g
nodemon server/app.js
```

5. **Access the dashboard**
```
http://localhost:5000
```

## API Endpoints

### Get Current Price
```
GET /api/prices/:symbol

Example: GET /api/prices/XAUUSD
```

### Get Historical Data
```
GET /api/prices/:symbol/history?timeframe=D

Supported timeframes: D (daily), H (hourly), 5M (5 minutes)
```

### Get Prediction
```
POST /api/predictions/:symbol

Body: { "model": "ensemble" }
Models: "linear", "exponential", "arima", "ensemble"
```

### Get Available Models
```
GET /api/predictions/models
```

### Backtest & Signal Quality
```
GET /api/backtest/:symbol?timeframe=D

Example: GET /api/backtest/EURUSD
```

## Usage

### Web Dashboard
1. Select an asset (Gold, EUR/USD, etc.)
2. Choose a prediction model (Ensemble recommended)
3. Click "Predict Now"
4. View:
   - Current price and daily change
   - Trading signal (BUY/SELL/HOLD)
   - Confidence level
   - Entry, Stop Loss, and Take Profit prices
   - Technical indicators
   - 5-period price predictions

### Example: JavaScript Client
```javascript
// Get prediction
const response = await fetch('/api/predictions/XAUUSD', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'ensemble' })
});

const prediction = await response.json();
console.log(prediction.signal); // { action: 'BUY', confidence: 0.8, ... }
```

### Real-Time Updates
The dashboard updates via short-interval polling of the batch price endpoint
(`GET /api/prices/batch`, server-side 15s cache). There is no WebSocket server;
if you need push updates, poll on your own cadence:

```javascript
setInterval(async () => {
  const res = await fetch('/api/prices/batch');
  const { prices } = await res.json();
  console.log('Prices:', prices);
}, 15000);
```

## Prediction Models

### Linear Regression
- Simple trend line fitting
- Good for trending markets
- Fastest computation
- Use case: Stable, trending assets

### Exponential Regression
- Fits exponential curve
- Better for accelerating trends
- Use case: Strong momentum moves

### ARIMA (1,1,0)
- Time series differencing
- AutoRegressive component
- Handles mean reversion
- Use case: Mean-reverting markets

### Ensemble (Recommended)
- **Adaptive** weights computed per request via walk-forward backtesting
  across linear, ARIMA, exponential, and naive (random-walk) baselines
- Weights are normalised and cached per distinct price series
- Most robust across regimes; naive baseline keeps it honest

## Trading Signals Logic

Signals generated based on a weighted score of:

1. **RSI** (regime-conditioned overbought/oversold)
2. **MACD** (histogram + crossovers)
3. **Bollinger Bands** (mean-reversion in ranges, pullback in trends)
4. **EMA trend** (fast vs slow)
5. **Stochastic** (short-term momentum)
6. **ADX** (trend strength amplifier)
7. **Support/Resistance** proximity (structure-aware)
8. **Model forecast direction**

**Confidence** is either:
- **empirical** — the realized win-rate for the same `(regime, action, score-bucket)` learned from the walk-forward backtest (Laplace-smoothed, needs ≥8 samples), or
- **formula** — the arithmetic estimate `min(0.3 + |score|/8.75 × 0.65, 0.95)` when no calibration exists yet.

The UI tags each confidence with which source it came from.

**Cost / session / news guards (applied to the live signal):**
- **Spread**: the tradeability bar is raised to cover the round-trip spread, so a setup whose expected move is smaller than costs becomes HOLD. Per-symbol spreads live in `server/config/tradingCosts.js`.
- **Session multiplier**: signals in thin sessions (Sydney 0.7, Tokyo 0.85) get a wider tradeability bar; London/NY 1.0; the London–NY overlap 1.1.
- **News filter**: a new BUY/SELL is downgraded to HOLD when a HIGH-impact economic event for the pair's currencies is within 45 minutes.

**Margins** (ATR-based, regime-adaptive):

- Entry: Current live market price
- Stop Loss: 1.2–2.0 × ATR (structure-snapped where a nearby S/R level exists)
- Take Profit: 1.5–3.0 × ATR
- Signals are filtered out (→ HOLD) when expected move < 0.3 × ATR (or < spread when costs are modelled).

## Backtesting & Signal Quality

The engine ships a cost-aware walk-forward backtester that replays the exact
live signal on fetched history — predicting each bar using only data up to that
bar, then simulating the trade against its own ATR stop/target and subtracting
the spread.

```
GET /api/backtest/:symbol?timeframe=D
```

Returns trade count, hit-rate, expectancy (pips/trade), profit factor, max
drawdown, buy-&-hold baseline, per-indicator marginal contribution, a
walk-forward weight recommendation, and the empirical confidence calibration.

Run it offline from the terminal (add `--sweep` for weight validation):

```bash
npm run backtest -- EURUSD
npm run backtest -- XAUUSD --sweep
```

**Weight validation** compares the hand-picked default weights against removing
each indicator, then runs an out-of-sample coordinate search on the last 30% of
bars. To avoid curve-fitting a ~100-bar daily series it only accepts changes that
beat the defaults out-of-sample by more than one standard error, shrinks the
searched vector 70/30 toward the defaults, and refuses to auto-apply when the
out-of-sample sample is small (`low` confidence). Confident recommendations are
applied to the live engine automatically.

**Honest results on daily ECB data:** the current score-based signal is
*unprofitable after spread* (e.g. EURUSD ≈ −23 pips/trade, profit factor ≈ 0.2
over ~9 trades). That is the real answer to "does it predict?" — the inputs are
real, but the forecast has no demonstrated edge, and the backtest now says so
plainly instead of implying otherwise.

## Performance Tips

1. **Choose appropriate timeframes**: 
   - Short-term trading: 5M, 15M
   - Day trading: 1H
   - Swing trading: Daily

2. **Use Ensemble model**: More reliable than individual models

3. **Check indicators**: 
   - Confluence = Higher confidence
   - Divergence = Wait for confirmation

4. **Risk management**: Always use stop losses

## Limitations

- Requires network access to upstream providers (Swissquote, Frankfurter, TwelveData); no synthetic fallback data
- Intraday history (5M/15M/1H/4H) requires a `TWELVE_DATA_API_KEY`
- **Forex history from Frankfurter/ECB is close-only** (no OHLC): backtest stop/target hits are judged on each bar's close, never intrabar, so intraday stops are under-counted
- **Session and news filters are applied live only** — daily bars cannot be aligned to intraday events, so they are excluded from the backtest
- The backtest uses ~90–150 daily bars per pair; weight validation is sample-limited and biased conservative on purpose
- Prediction accuracy depends on market conditions; the daily backtest currently shows negative edge after spread
- Historical patterns may not repeat
- No guarantee of profits
- Past performance ≠ future results

## Testing

```bash
npm test
```

Runs the indicator and prediction-engine unit tests with Node's built-in test runner (no extra dependencies).

## Future Enhancements

- [ ] Machine Learning models (LSTM, XGBoost)
- [ ] Advanced indicators (Ichimoku, Market Profile)
- [ ] Backtesting framework
- [ ] Risk/reward calculator
- [ ] Portfolio management
- [ ] Email/SMS alerts
- [ ] Mobile app
- [ ] Real account integration (broker APIs)

## Disclaimer

This tool is for educational and research purposes. Trading forex involves substantial risk. Do not use real money without proper risk management and understanding of forex markets. The creators are not responsible for trading losses.

## License

ISC

## Support

For issues or questions:
1. Check `.env` configuration
2. Verify API keys are valid
3. Check browser console for errors
4. Review server logs

## Free APIs to Use

| Service | Free Tier | Limit |
|---------|-----------|-------|
| Finnhub | Yes | 60 calls/min |
| Polygon.io | Yes | Limited stocks |
| Twelve Data | Yes | 800/day |
| Alpha Vantage | Yes | 5 calls/min |
| OHLC.app | Yes | No auth needed |

Choose one and add the key to `.env`
