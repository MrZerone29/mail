require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const mailRoutes = require('./routes/mailRoutes');
const wsService = require('./services/wsService');
const imapService = require('./services/imapService');

const app = express();
const server = http.createServer(app);

const PORT = parseInt(process.env.PORT || '3000');

// --- Middleware ---

// Parse JSON bodies
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const accept = req.get('Accept') || '-';
    console.log(`[${req.method}] ${req.originalUrl} → ${res.statusCode} (${duration}ms) [Accept: ${accept}]`);
  });
  next();
});

// --- Routes ---

// SSE endpoint (before mail routes to avoid conflicts)
app.get('/api/events', wsService.sseHandler);

// Mount mail routes
app.use('/', mailRoutes);

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/mail');
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cache: imapService.emailCache.initialized ? 'initialized' : 'pending',
    cacheSize: imapService.emailCache.emails.length
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Initialize Cache on Startup ---

async function startup() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         📬 Mail Viewer                       ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Server:    http://localhost:${PORT}             ║`);
  console.log(`║  Web UI:    http://localhost:${PORT}/mail       ║`);
  console.log(`║  API:       http://localhost:${PORT}/api/emails  ║`);
  console.log(`║  WebSocket: ws://localhost:${PORT}              ║`);
  console.log(`║  SSE:       http://localhost:${PORT}/api/events  ║`);
  console.log('╚══════════════════════════════════════════════╝');

  // Initialize WebSocket with IMAP IDLE
  wsService.init(server);

  // Initialize email cache in background
  try {
    console.log('[STARTUP] Loading email cache...');
    const count = await imapService.initializeCache();
    console.log(`[STARTUP] Cache loaded: ${count} emails in ${imapService.emailCache.mailboxes.size} mailbox(es)`);
  } catch (err) {
    console.error('[STARTUP] Cache initialization failed:', err.message);
    console.log('[STARTUP] Will retry on first request...');
  }
}

// --- Start Server ---

server.listen(PORT, async () => {
  await startup();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[SHUTDOWN] Gracefully shutting down...');
  wsService.stop();
  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n[SHUTDOWN] Received SIGTERM');
  wsService.stop();
  server.close(() => {
    process.exit(0);
  });
});
