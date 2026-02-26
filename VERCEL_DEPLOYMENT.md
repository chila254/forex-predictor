# Deploying to Vercel

## What Changed for Vercel

The app was updated to work with Vercel's serverless architecture:

1. **Removed Socket.io** - WebSocket not supported in serverless
2. **Updated Express app** - Works as a Vercel function
3. **Added `vercel.json`** - Deployment configuration
4. **Updated frontend** - Removed Socket.io dependency

## Step-by-Step Deployment

### 1. Connect Your GitHub Account
1. Go to https://vercel.com
2. Sign in (or create account)
3. Click "Import Project"
4. Select "GitHub"
5. Authorize Vercel

### 2. Import Your Repository
1. Find **chila254/forex-predictor**
2. Click "Import"
3. Configure project:
   - **Framework Preset**: Node.js
   - **Root Directory**: ./
   - Leave other settings as default

### 3. Set Environment Variables (Optional)
1. Scroll to "Environment Variables"
2. Add if you have API keys:
   ```
   FINNHUB_API_KEY=your_key_here
   PORT=3000
   ```
3. Click "Deploy"

### 4. Wait for Deployment
- Vercel will build and deploy automatically
- Takes 1-2 minutes
- Watch the logs for any errors

### 5. Access Your App
Once deployed, visit:
```
https://forex-predictor-chila254.vercel.app
```

(Your actual URL will be different based on project name)

## Troubleshooting

### Still Getting 404?

**Check logs**:
1. Go to https://vercel.com/dashboard
2. Select your project
3. Click "Deployments"
4. Click the latest deployment
5. View logs in "Functions" tab

**Common fixes**:

```bash
# Clean rebuild
git commit -m "trigger redeploy"
git push origin main  # Auto-redeploys on Vercel
```

### Routes Not Working

Verify `vercel.json` exists:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server/app.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "server/app.js" },
    { "src": "/", "dest": "frontend/public/index.html" }
  ]
}
```

### API Returning Errors

Check that the paths are correct. Update URLs if needed:

In `frontend/public/dashboard.js`, change:
```javascript
// If deployed with custom domain
const API_BASE = 'https://your-vercel-url.com';

// Otherwise, relative paths work:
const API_BASE = '/api';
```

## Features on Vercel

✅ **Included**:
- HTTP API endpoints
- Static file serving
- Serverless functions
- Automatic HTTPS
- Custom domains (paid)
- Automatic deployments from GitHub

❌ **Not Included** (limitations):
- WebSocket (Socket.io removed)
- Real-time updates
- Long-running processes

## Performance Tips

1. **API responses are cached** by default
2. **First request is slower** (cold start)
3. **Functions timeout after 60 seconds**

## Custom Domain (Optional)

To use your own domain:

1. Go to project settings
2. Click "Domains"
3. Add your domain
4. Update DNS records (Vercel provides instructions)

Example: `forex-predictor.yourdomain.com`

## Rollback to Previous Deployment

1. Click "Deployments" in Vercel dashboard
2. Find previous working deployment
3. Click "..."  menu
4. Select "Promote to Production"

## Environment Variables

Add more vars if needed:

**In Vercel Dashboard**:
1. Project → Settings → Environment Variables
2. Add variables
3. Redeploy (auto-triggers)

**Supported Variables**:
```env
FINNHUB_API_KEY=your_key
PORT=3000
NODE_ENV=production
```

## Monitoring

Track your app's performance:

1. **Analytics**: Dashboard → Analytics
2. **Logs**: Deployments → Functions
3. **Errors**: Deployments → Error Logs

## Scaling

Vercel auto-scales. No configuration needed.

- Free plan: Good for low traffic
- Pro plan: For production apps
- Enterprise: For high-scale apps

## Costs

**Free Plan**:
- 100 GB bandwidth/month
- 1000 serverless function invocations/month
- Good for testing

**Pro Plan** (~$20/month):
- Unlimited invocations
- Priority support
- Analytics

## Rebuilding & Redeploying

**Auto-deploy** on every push:
```bash
git push origin main  # Auto-redeploys on Vercel
```

**Manual redeploy**:
1. Go to project dashboard
2. Click "Deployments"
3. Click "..."  on latest
4. Select "Redeploy"

## Disable Vercel Analytics (Optional)

Edit `vercel.json`:
```json
{
  "analytics": false
}
```

## Next Steps

1. ✅ Deploy to Vercel
2. Test the app
3. Add API keys (if using real data)
4. Configure custom domain (optional)
5. Monitor performance

## Support

**Issues**?
- Check Vercel docs: https://vercel.com/docs
- View deployment logs
- Check error messages carefully

**Common 404 Solution**:
- Ensure `vercel.json` is in root
- Check that routes are correct
- Verify both backend and frontend files exist
- Clear Vercel cache and redeploy

---

**Your deployment URL**: https://forex-predictor-chila254.vercel.app (or similar based on project name)

For fastest help, check the deployment logs first!
