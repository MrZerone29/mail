const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

let wss = null;
let idleRunning = false;
let lastKnownUid = 0;

function init(server) {
  const { WebSocketServer } = require('ws');
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    ws.on('close', () => console.log('[WS] Client disconnected'));
  });

  startIdle();
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
        client.on('exists', async (event) => {
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
                  const payload = {
                    type: 'new_mail',
                    data: {
                      id: msg.uid,
                      from: parsed.from ? parsed.from.text : (msg.envelope?.from?.[0]?.address || ''),
                      to: parsed.to ? parsed.to.text : (msg.envelope?.to?.map(t => t.address).join(', ') || ''),
                      subject: parsed.subject || '(no subject)',
                      date: parsed.date || msg.envelope?.date || new Date().toISOString(),
                      preview: parsed.text
                        ? parsed.text.replace(/\s+/g, ' ').trim().substring(0, 200)
                        : ''
                    }
                  };

                  broadcast(payload);

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
}

module.exports = { init, broadcast, stop };
