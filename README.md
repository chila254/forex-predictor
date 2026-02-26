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
- **Smart Margin Calculation**:
  - Entry Price (current market price)
  - Stop Loss (risk management - 2% below entry for buy)
  - Take Profit (target - 3% above entry for buy)

### Dashboard
- Interactive web interface with real-time updates
- Chart visualization of historical and predicted prices
- Technical indicator display
- WebSocket support for live data

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

### Real-Time Updates with WebSocket
```javascript
const socket = io();
socket.emit('subscribe', 'XAUUSD');
socket.on('priceUpdate', (data) => {
  console.log('New price:', data.price);
});
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
- Combines all models with weights:
  - Linear: 40%
  - Exponential: 30%
  - ARIMA: 30%
- Most robust and balanced
- Best for diverse market conditions

## Trading Signals Logic

Signals generated based on consensus of:

1. **RSI** (< 30 = Buy, > 70 = Sell)
2. **MACD** (Positive = Buy, Negative = Sell)
3. **Bollinger Bands** (Touch lower = Buy, Touch upper = Sell)

**Confidence** = Percentage of indicators agreeing

**Margins**:
- Entry: Current market price
- Stop Loss: 2% below entry (buy) / 2% above (sell)
- Take Profit: 3% above entry (buy) / 3% below (sell)

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

- Uses mock data by default (needs API keys for real data)
- Prediction accuracy depends on market conditions
- Historical patterns may not repeat
- No guarantee of profits
- Past performance ≠ future results

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
