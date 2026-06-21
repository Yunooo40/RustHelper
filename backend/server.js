// Builds the Express API. Importing the DB here guarantees the schema exists
// before any route runs. `createApiServer()` returns the app; index.js listens.
import express from 'express';
import './db.js';
import { webhookRouter } from './routes/webhook.js';
import { timersRouter } from './routes/timers.js';
import { eventsRouter } from './routes/events.js';
import { serversRouter } from './routes/servers.js';
import { linkRouter } from './routes/link.js';

export function createApiServer() {
  const app = express();
  app.use(express.json());

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
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[api] unhandled error:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  });

  return app;
}

export default createApiServer;
