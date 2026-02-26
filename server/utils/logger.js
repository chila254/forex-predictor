/**
 * Simple Logging Utility
 */
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

class Logger {
  constructor() {
    this.errorLogPath = path.join(logsDir, 'error.log');
    this.infoLogPath = path.join(logsDir, 'info.log');
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  error(message, error = null) {
    const timestamp = this.getTimestamp();
    const logMessage = `[${timestamp}] ERROR: ${message}${error ? '\n' + error.stack : ''}`;
    
    console.error(logMessage);
    
    try {
      fs.appendFileSync(this.errorLogPath, logMessage + '\n---\n');
    } catch (err) {
      console.error('Failed to write error log:', err);
    }
  }

  info(message) {
    const timestamp = this.getTimestamp();
    const logMessage = `[${timestamp}] INFO: ${message}`;
    
    console.log(logMessage);
    
    try {
      fs.appendFileSync(this.infoLogPath, logMessage + '\n');
    } catch (err) {
      console.error('Failed to write info log:', err);
    }
  }

  warn(message) {
    const timestamp = this.getTimestamp();
    const logMessage = `[${timestamp}] WARN: ${message}`;
    
    console.warn(logMessage);
    
    try {
      fs.appendFileSync(this.infoLogPath, logMessage + '\n');
    } catch (err) {
      console.error('Failed to write warn log:', err);
    }
  }

  debug(message) {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = this.getTimestamp();
      console.log(`[${timestamp}] DEBUG: ${message}`);
    }
  }

  logRequestResponse(method, path, statusCode, duration) {
    const timestamp = this.getTimestamp();
    const logMessage = `[${timestamp}] ${method} ${path} - ${statusCode} - ${duration}ms`;
    console.log(logMessage);
    
    try {
      fs.appendFileSync(this.infoLogPath, logMessage + '\n');
    } catch (err) {
      console.error('Failed to write log:', err);
    }
  }
}

module.exports = new Logger();
