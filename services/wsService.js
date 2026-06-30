const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const imapService = require('./imapService');

let wss = null;
let idleRunning = false;
let lastKnownUid = 0;
let sseClients = [];
let refreshInterval = null;

/**
 * Parse refresh interval from .env or default to 30000ms.
 * Set to 0 to disable fallback polling.
 */
function getRefreshInterval() {
  const val = parseInt(process.env.MAIL_REFRESH_INTERVAL);
  if (!isNaN(val) && val >= 0) {
    return val;
  }
  return 30000; // default 30 seconds
}

function init(server) {
  // WebSocket
  const { WebSocketServer } = require('ws');
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    ws.on('close', () => console.log('[WS] Client disconnected'));
  });

  // Start IMAP IDLE
  startIdle();

  // Start fallback polling (if interval > 0)
  const interval = getRefreshInterval();
  if (interval > 0) {
    refreshInterval = setInterval(async () => {
      try {
        const newCount = await imapService.fetchNewEmails();
        if (newCount > 0) {
          // Broadcast new email notifications
          const latestEmails = imapService.emailCache.getEmails({ page: 1, limit: newCount });
          for (const email of latestEmails.emails) {
            const payload = {
              type: 'new_mail',
              data: {
                id: email.id,
                from: email.from,
                to: email.to,
                subject: email.subject,
                date: email.date,
                preview: email.preview,
                _mailbox: imapService.emailCache.getEmailById(email.id)?._mailbox || null
              }
            };

            broadcast(payload);
            sendSSE(payload);
          }
        }
      } catch (err) {
        console.error('[POLL] Error:', err.message);
      }
    }, interval);
    console.log(`[POLL] Fallback refresh every ${interval}ms`);
  }
}

function broadcast(data) {
  if (!wss) return;
  const message = JSON.stringify(data);
  let count = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
      count++;
    }
  });
  if (count > 0) {
    console.log(`[WS] Broadcasted to ${count} client(s)`);
  }
}

/**
 * Add an SSE client (response object).
 */
function addSSEClient(res) {
  sseClients.push(res);
  // Remove on close
  res.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
}

/**
 * Send data to all SSE clients.
 */
function sendSSE(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(res => {
    try {
      res.write(message);
      return true;
    } catch (e) {
      return false;
    }
  });
}

/**
 * Express middleware for SSE endpoint.
 */
function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial heartbeat
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  addSSEClient(res);

  // Keep-alive heartbeat every 30s
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 30000);

  res.on('close', () => {
    clearInterval(heartbeat);
  });
}

async function getNewestUid(client) {
  let newest = 0;
  for await (const msg of client.fetch('*', { uid: true })) {
    if (msg.uid > newest) newest = msg.uid;
  }
  return newest;
}

async function startIdle() {
  idleRunning = true;

  while (idleRunning) {
    let client = null;
    try {
      client = new ImapFlow({
        host: process.env.MAIL_HOST || '127.0.0.1',
        port: parseInt(process.env.MAIL_PORT || '993'),
        secure: process.env.MAIL_SECURE !== 'false',
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS
        },
        logger: false
      });

      await client.connect();
      console.log('[IDLE] Connected, establishing initial mailbox state...');

      // Get initial state
      const lock = await client.getMailboxLock('INBOX');
      try {
        lastKnownUid = await getNewestUid(client);
        console.log(`[IDLE] Watching for new mail (last UID: ${lastKnownUid})...`);

        // Listen for EXISTS events (new mail)
        client.on('exists', async () => {
          try {
            const currentNewest = await getNewestUid(client);
            if (currentNewest > lastKnownUid) {
              console.log(`[IDLE] New mail detected! UIDs ${lastKnownUid + 1} - ${currentNewest}`);

              // Fetch new messages
              const fetchRange = `${lastKnownUid + 1}:${currentNewest}`;
              for await (const msg of client.fetch(fetchRange, {
                envelope: true,
                uid: true,
                source: true
              })) {
                try {
                  const parsed = await simpleParser(msg.source);
                  const emailData = {
                    id: msg.uid,
                    from: parsed.from ? parsed.from.text : (msg.envelope?.from?.[0]?.address || ''),
                    to: parsed.to ? parsed.to.text : (msg.envelope?.to?.map(t => t.address).join(', ') || ''),
                    subject: parsed.subject || '(no subject)',
                    date: parsed.date || msg.envelope?.date || new Date().toISOString(),
                    preview: parsed.text
                      ? parsed.text.replace(/\s+/g, ' ').trim().substring(0, 200)
                      : '',
                    flags: msg.flags || []
                  };

                  // Update cache
                  imapService.emailCache.addNewEmail(emailData);

                  const cachedEmail = imapService.emailCache.getEmailById(emailData.id);
                  const payload = {
                    type: 'new_mail',
                    data: {
                      ...emailData,
                      _mailbox: cachedEmail?._mailbox || null
                    }
                  };

                  broadcast(payload);
                  sendSSE(payload);

                  // Webhook
                  const webhookUrl = process.env.WEBHOOK_URL;
                  if (webhookUrl) {
                    sendWebhook(webhookUrl, payload.data);
                  }
                } catch (parseErr) {
                  console.error('[IDLE] Parse error:', parseErr.message);
                }
              }

              lastKnownUid = currentNewest;
            }
          } catch (fetchErr) {
            console.error('[IDLE] Error handling new mail:', fetchErr.message);
          }
        });

        // Enter IDLE loop
        while (idleRunning) {
          try {
            await client.idle();
          } catch (idleErr) {
            if (idleRunning) {
              console.error('[IDLE] Idle interrupted:', idleErr.message);
            }
            break;
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      if (idleRunning) {
        console.error('[IDLE] Connection error:', err.message);
        console.log('[IDLE] Retrying in 10 seconds...');
        await new Promise(r => setTimeout(r, 10000));
      }
    } finally {
      if (client) {
        try { await client.logout(); } catch (e) {}
      }
    }
  }
}

function sendWebhook(url, data) {
  try {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === 'https:' ? require('https') : require('http');
    const postData = JSON.stringify(data);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = lib.request(options);
    req.write(postData);
    req.end();
    req.on('error', (err) => console.error('[WEBHOOK] Error:', err.message));
  } catch (err) {
    console.error('[WEBHOOK] Error:', err.message);
  }
}

function stop() {
  idleRunning = false;
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

module.exports = { init, broadcast, stop, sseHandler };
