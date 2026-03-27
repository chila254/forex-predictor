/**
 * Simple Logging Utility
 * Uses console only (no filesystem writes) for Vercel compatibility
 */
class Logger {
  getTimestamp() {
    return new Date().toISOString();
  }

  error(message, error = null) {
    const logMessage = `[${this.getTimestamp()}] ERROR: ${message}${error ? '\n' + error.stack : ''}`;
    console.error(logMessage);
  }

  info(message) {
    console.log(`[${this.getTimestamp()}] INFO: ${message}`);
  }

  warn(message) {
    console.warn(`[${this.getTimestamp()}] WARN: ${message}`);
  }

  debug(message) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${this.getTimestamp()}] DEBUG: ${message}`);
    }
  }

  logRequestResponse(method, path, statusCode, duration) {
    console.log(`[${this.getTimestamp()}] ${method} ${path} - ${statusCode} - ${duration}ms`);
  }
}

module.exports = new Logger();
