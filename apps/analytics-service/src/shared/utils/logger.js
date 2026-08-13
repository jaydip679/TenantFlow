'use strict';

/**
 * Winston Logger
 *
 * Structured JSON logging with request ID tracing.
 * Levels: error, warn, info, http, debug
 *
 * Transports:
 *   - Console: always active, human-readable in development
 *   - File (non-test): logs/error.log (errors only), logs/combined.log (all)
 *
 * Usage:
 *   logger.info('Server started', { port: 5000 });
 *   logger.error({ err: err.message, requestId }, 'Operation failed');
 *
 * REF: docs/SYSTEM_DESIGN.md §15 — Logging Architecture
 * REF: docs/IMPLEMENTATION_ROADMAP.md §3.2 T0.6
 */

const winston = require('winston');
const path    = require('path');

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

// ── Format: Human-readable for development console ───────────
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} [${level}] ${message}${metaStr}`;
  })
);

// ── Format: Structured JSON for production / file transport ──
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const isTest        = process.env.NODE_ENV === 'test';
const isDevelopment = process.env.NODE_ENV === 'development';

const transports = [
  new winston.transports.Console({
    format: isDevelopment ? devFormat : prodFormat,
    silent: isTest, // Silence logs during test runs to keep output clean
  }),
];

// File transports — enabled in development and production, disabled in test
if (!isTest) {
  const logsDir = path.join(process.cwd(), 'logs');

  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level:    'error',
      format:   prodFormat,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format:   prodFormat,
    })
  );
}

const logger = winston.createLogger({
  level:      process.env.LOG_LEVEL || 'info',
  transports,
  // Do not exit on unhandled exceptions — let the process manager handle it
  exitOnError: false,
});

/**
 * Morgan-compatible HTTP log stream.
 * Pipes Morgan HTTP logs into Winston at 'http' level.
 */
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

module.exports = logger;
