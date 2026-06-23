// Builds the Express API. Importing the DB here guarantees the schema exists
// before any route runs. `createApiServer()` returns the app; index.js listens.
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import './db.js';
import { webhookRouter } from './routes/webhook.js';
import { timersRouter } from './routes/timers.js';
import { eventsRouter } from './routes/events.js';
import { serversRouter } from './routes/servers.js';
import { linkRouter } from './routes/link.js';

export function createApiServer() {
  const app = express();

  // Security headers + JSON body cap (the plugin payloads are tiny).
  app.use(helmet());
  app.use(express.json({ limit: '64kb' }));

  // Per-IP rate limiting — defence-in-depth on the public API. Skipped in tests,
  // where many requests legitimately come from 127.0.0.1 in a tight loop.
  app.use(
    rateLimit({
      windowMs: config.api.rateLimit.windowMs,
      max: config.api.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { ok: false, error: 'Too many requests, slow down.' },
      skip: () => config.env === 'test',
    }),
  );

  // Tiny request logger (method + path + status + ms).
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      console.log(`[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });

  app.get('/', (_req, res) =>
    res.json({
      name: 'RustLink API',
      status: 'ok',
      endpoints: [
        'GET  /health',
        'POST /webhook/rust',
        'GET  /timers?server=<name>',
        'POST /timers/set',
        'GET  /events?server=<name>&limit=25',
        'GET  /servers',
        'POST /link/claim',
        'GET  /link?discord=<id>|steam=<id>',
      ],
    }),
  );

  app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

  app.use('/webhook', webhookRouter());
  app.use('/timers', timersRouter());
  app.use('/timer', timersRouter()); // alias so POST /timer/set also works
  app.use('/events', eventsRouter());
  app.use('/servers', serversRouter());
  app.use('/link', linkRouter());

  // 404 + error handlers (kept last).
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
  // Express needs the 4-arg signature to recognise this as an error handler. Honour
  // client-error codes set by body-parser (413 payload too large, 400 malformed JSON)
  // instead of masking them as 500s; only log genuine server errors.
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('[api] unhandled error:', err);
    const message = status === 413 ? 'Payload too large' : status === 400 ? 'Invalid JSON body' : 'Internal server error';
    res.status(status).json({ ok: false, error: message });
  });

  return app;
}

export default createApiServer;
