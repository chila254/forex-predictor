# Quick Start Guide - Forex Predictor

## 5-Minute Setup

### Step 1: Install Dependencies
```bash
cd forex-predictor
npm install
```

### Step 2: Run Server
```bash
npm start
```
Server runs on http://localhost:5000

### Step 3: Open Dashboard
Open your browser to `http://localhost:5000`

## Using the Dashboard

### Make a Prediction

1. **Select Asset**
   - Gold (XAU/USD) - Default
   - EUR/USD, GBP/USD, USD/JPY

2. **Choose Model**
   - Ensemble (Recommended) ⭐
   - Linear, Exponential, ARIMA

3. **Click "Predict Now"**

### Read the Results

**Signal Box** shows:
- **BUY** 🟢 - Go long
- **SELL** 🔴 - Go short  
- **HOLD** 🟡 - Wait
- Color = Confidence level

**Trading Margins**:
- **Entry**: Buy/Sell at current price
- **Stop Loss**: Protect from loss
- **Take Profit**: Target price

**Predictions Table**: Next 5 period prices

**Indicators**:
- **RSI** < 30 = Oversold, > 70 = Overbought
- **MACD** Green = Bullish, Red = Bearish
- **Bollinger Bands** = Support/Resistance
- **ATR** = Volatility level

## Example Trading Scenario

### Gold (XAUUSD) Prediction

**Current Price**: $2,050
**Signal**: BUY ✅ (Confidence 80%)

**Margins**:
- Entry: $2,050
- Stop Loss: $2,009 (2% below) 🛑
- Take Profit: $2,111.50 (3% above) ✅

**Interpretation**:
- Gold is oversold (RSI < 30)
- Buying signal confirmed by MACD
- Risk $41 to make $61.50
- Risk/Reward: 1:1.5

## Free API Keys (Optional)

Get real-time data (currently uses mock data):

### Finnhub (Recommended)
1. Go to https://finnhub.io
2. Sign up (free)
3. Copy API key
4. Add to `.env`: `FINNHUB_API_KEY=your_key`

### Polygon.io
1. https://polygon.io
2. Sign up (free)
3. Add API key to `.env`

## Troubleshooting

### Port 5000 Already in Use
```bash
# Use different port
PORT=3000 npm start
```

### API Rate Limit
- Wait 1 minute
- Get API key from service
- Reduce prediction frequency

### No Predictions Showing
- Needs historical data
- May take 10+ seconds first time
- Check browser console for errors

## Key Features

✅ Real-time price updates
✅ 4 prediction models (Ensemble best)
✅ 7 technical indicators
✅ Smart margin calculation
✅ WebSocket live updates
✅ Mobile responsive design
✅ No login required
✅ Free to use

## What's Next?

1. **Explore Models**: Test each model on different assets
2. **Learn Indicators**: Understand what RSI, MACD mean
3. **Backtest**: Check historical predictions vs actual
4. **Paper Trade**: Practice with virtual money
5. **Add API Keys**: Get real market data

## Command Reference

```bash
# Start server
npm start

# Dev mode (auto-reload)
nodemon server/app.js

# Stop server
Ctrl + C

# Check if running
curl http://localhost:5000
```

## Architecture Overview

```
User Browser
    ↓
Forex Predictor Dashboard (index.html)
    ↓
Node.js Express Server (app.js)
    ↓
┌─────────────────┬──────────────┬──────────────┐
│                 │              │              │
Data Fetcher    Technical    Prediction
API Integration  Analysis      Engine
Finnhub/Polygon  RSI, MACD,    Linear,
                 BBANDS, etc   Exponential,
                               ARIMA,
                               Ensemble
```

## Important Notes

⚠️ **Not Financial Advice**: This tool is educational
⚠️ **Risk Management**: Always use stop losses
⚠️ **Market Risk**: Forex trading carries significant risk
⚠️ **Backtesting**: Past performance ≠ future results
✅ **Paper Trading**: Practice before real money

## Support & Documentation

- Full README: `README.md`
- Source Code: `server/services/`
- Frontend Code: `frontend/public/`
- Configuration: `.env`

## Next Steps

1. **Customize indicators** (Edit technicalAnalysis.js)
2. **Add more assets** (Edit dataFetcher.js)
3. **Modify margins** (Edit predictionEngine.js)
4. **Deploy to cloud** (Heroku, AWS, DigitalOcean)

Enjoy predicting! 🚀
