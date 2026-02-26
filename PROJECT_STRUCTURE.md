# Project Structure

## Overview
Forex Predictor is a modern, organized Node.js application with a Tailwind CSS frontend for real-time market prediction.

## Directory Layout

```
forex-predictor/
├── frontend/
│   └── public/
│       ├── index.html           # Modern Tailwind UI
│       └── dashboard.js         # Frontend logic & interactions
│
├── server/
│   ├── app.js                   # Express app configuration
│   ├── middleware/
│   │   ├── requestLogger.js     # HTTP request logging
│   │   └── errorHandler.js      # Global error handling
│   ├── routes/
│   │   ├── prices.js            # Price API endpoints
│   │   └── predictions.js       # Prediction API endpoints
│   ├── services/
│   │   ├── dataFetcher.js       # API data retrieval
│   │   ├── predictionEngine.js  # Prediction models & signals
│   │   └── technicalAnalysis.js # Technical indicators (RSI, MACD, etc)
│   └── utils/
│       ├── logger.js            # File & console logging
│       └── validators.js        # Input validation
│
├── logs/                         # Server logs (auto-created)
│   ├── error.log               # Error logs
│   └── info.log                # Request & info logs
│
├── .env                         # Environment variables (secret)
├── .env.example                 # Environment template
├── .gitignore                   # Git ignore rules
├── package.json                 # Dependencies & scripts
├── vercel.json                  # Vercel deployment config
├── README.md                    # Project documentation
└── VERCEL_DEPLOYMENT.md        # Deployment guide

```

## Key Technologies

### Backend
- **Express.js** - Web framework
- **Node.js 24.x** - Runtime
- **Axios** - HTTP client for APIs
- **CORS** - Cross-origin support

### Frontend
- **Tailwind CSS** - Modern utility-first styling
- **Chart.js** - Data visualization
- **Vanilla JavaScript** - No frameworks (lightweight)

### Features
- Real-time price tracking
- 4 prediction models (Linear, Exponential, ARIMA, Ensemble)
- 7 technical indicators (RSI, MACD, Bollinger Bands, ATR, SMA, EMA, Stochastic)
- Comprehensive error handling & validation
- Request/response logging
- Prediction history with localStorage
- Health check endpoint

## API Endpoints

### Prices
```
GET /api/prices/:symbol           # Get current price
GET /api/prices/:symbol/history   # Get historical data
```

### Predictions
```
POST /api/predictions/:symbol     # Generate prediction
GET /api/predictions/models       # Get available models
```

### Health
```
GET /health                       # Server health check
```

## Supported Assets
- `XAUUSD` - Gold (Commodity)
- `EURUSD` - Euro/US Dollar
- `GBPUSD` - British Pound/US Dollar
- `USDJPY` - US Dollar/Japanese Yen

## Prediction Models
1. **Linear** - Simple trend fitting
2. **Exponential** - Exponential curve fitting
3. **ARIMA** - Time series model with differencing
4. **Ensemble** - Weighted combination (40% Linear, 30% Exp, 30% ARIMA)

## Technical Indicators
- **RSI** - Relative Strength Index (momentum)
- **MACD** - Moving Average Convergence Divergence (trend)
- **Bollinger Bands** - Volatility & support/resistance
- **ATR** - Average True Range (volatility)
- **SMA** - Simple Moving Average
- **EMA** - Exponential Moving Average
- **Stochastic** - Momentum oscillator

## Error Handling

### Validation Checks
- Symbol validation (supported assets only)
- Model validation (4 models)
- Price data validation (min 14 points, positive)
- Timeframe validation (5M, 15M, 1H, 4H, D)
- Prediction output validation

### Response Format
```json
{
  "success": true,
  "responseTime": 245,
  "error": null,
  "data": {}
}
```

## Logging

### Log Files
- **logs/error.log** - All errors with stack traces
- **logs/info.log** - Requests, responses, info messages

### Console Output
- Development: All logs + timestamps
- Production: Filtered logs

## Frontend Features

### UI Components
- Modern glass-morphism design
- Responsive grid layout
- Real-time price display
- Trading signal visualization
- Technical indicators grid
- Price predictions table
- Prediction history cards
- Quick stats panel

### User Interactions
- Asset selection
- Model selection
- Real-time price loading
- Prediction generation with loading state
- Toast notifications (success/error/info/warning)
- Prediction history tracking
- Clear history functionality

### Data Persistence
- localStorage for prediction history (50 max)
- Session state for current selections
- Browser caching

## Performance Metrics

| Metric | Target |
|--------|--------|
| API Response Time | < 500ms |
| Initial Load | < 2s |
| Chart Rendering | < 1s |
| Prediction Accuracy | > 55% |
| Uptime | 99.9% |

## Development Commands

```bash
# Start server
npm start

# Development with auto-reload
npm run dev

# Health check
curl http://localhost:5000/health

# Test prediction
curl -X POST http://localhost:5000/api/predictions/XAUUSD \
  -H "Content-Type: application/json" \
  -d '{"model":"ensemble"}'
```

## Deployment

### Local Development
```bash
npm install
npm start
# Visit http://localhost:5000
```

### Vercel
```bash
git push origin main
# Auto-deploys with vercel.json
```

### Custom Server
1. Set NODE_ENV=production
2. Configure environment variables
3. Run `npm start`
4. Use process manager (PM2)

## Environment Variables

```env
PORT=5000                          # Server port
NODE_ENV=development              # Environment
FINNHUB_API_KEY=your_key          # Optional API key
```

## Code Organization

### Separation of Concerns
- **routes/** - HTTP endpoint handling
- **services/** - Business logic
- **middleware/** - Cross-cutting concerns
- **utils/** - Reusable utilities
- **frontend/** - UI & client logic

### Error Handling
- Input validation before processing
- Try/catch blocks on async operations
- Comprehensive error logging
- User-friendly error messages

### Scalability
- Modular structure for easy expansion
- Services layer for business logic
- Middleware for extensibility
- Logger for debugging

## Monitoring

### Available Logs
```bash
# View error logs
tail -f logs/error.log

# View all logs
tail -f logs/info.log

# Count requests
grep "GET \|POST" logs/info.log | wc -l
```

### Metrics
- Response times (in logs)
- Error rates (in error.log)
- Prediction accuracy (in frontend history)
- API usage patterns

## Future Enhancements

### Phase 2
- Real API integration (Finnhub, Polygon)
- Data caching with Redis
- Backtesting framework
- Database (MongoDB) for history

### Phase 3
- User authentication
- Paper trading account
- Email/SMS alerts
- Multiple timeframes
- Advanced ML models (LSTM)

### Phase 4
- Live broker integration
- Advanced strategies
- Risk management tools
- Performance analytics

## Security

- ✅ Input validation on all endpoints
- ✅ Error messages don't leak secrets
- ✅ Environment variables protected
- ✅ CORS configured
- ✅ HTTP status codes proper
- ✅ No sensitive data in logs

## Browser Compatibility

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers supported

## File Size

- Minified frontend JS: ~15KB
- CSS (Tailwind): ~50KB (CDN)
- Total initial load: <100KB

## Git Workflow

```bash
# Make changes
git add .
git commit -m "Clear message describing change"
git push origin main

# Vercel auto-deploys on push
```

## Support & Debugging

### Common Issues
1. **404 errors** - Check vercel.json routing
2. **API fails** - Check API keys in .env
3. **Chart not loading** - Check browser console
4. **History not saving** - Check localStorage permissions

### Debug Mode
```javascript
// In browser console
predictionHistory  // View all predictions
localStorage.getItem('predictionHistory')  // Raw data
chart  // Access chart object
```

## License

ISC License - Free to use and modify

## Author

Franklin Chilango

---

**Last Updated**: February 2026
**Version**: 2.0 (Tailwind modernized)
