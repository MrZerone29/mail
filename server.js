require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const mailRoutes = require('./routes/mailRoutes');
const wsService = require('./services/wsService');

const app = express();
const server = http.createServer(app);

const PORT = parseInt(process.env.PORT || '3000');

// --- Middleware ---

// Parse JSON bodies (for potential future use)
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

// Mount mail routes
app.use('/', mailRoutes);

// GET /mail/to/:email routes need to be defined before /mail/:id to avoid conflicts
// But our router is already handling this correctly since /mail/to/:email is a specific path

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/mail');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// --- Start Server ---

server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         📬 Mail Viewer                       ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Server:    http://localhost:${PORT}             ║`);
  console.log(`║  Web UI:    http://localhost:${PORT}/mail       ║`);
  console.log(`║  API:       http://localhost:${PORT}/mail (JSON) ║`);
  console.log(`║  WebSocket: ws://localhost:${PORT}              ║`);
  console.log('╚══════════════════════════════════════════════╝');

  // Initialize WebSocket with IMAP IDLE
  wsService.init(server);
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
