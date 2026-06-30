const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const emailCache = require('./emailCache');

function createClient() {
  return new ImapFlow({
    host: process.env.MAIL_HOST || '127.0.0.1',
    port: parseInt(process.env.MAIL_PORT || '993'),
    secure: process.env.MAIL_SECURE !== 'false',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    },
    logger: false
  });
}

async function withClient(fn) {
  const client = createClient();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout();
  }
}

/**
 * Parse a raw IMAP message into a structured email object.
 */
async function parseMessage(source, msg) {
  const parsed = await simpleParser(source);
  return {
    id: msg.uid,
    from: parsed.from ? parsed.from.text : (msg.envelope?.from?.[0]?.address || ''),
    to: parsed.to ? parsed.to.text : (msg.envelope?.to?.map(t => t.address).join(', ') || ''),
    subject: parsed.subject || '(no subject)',
    date: parsed.date || msg.envelope?.date || new Date().toISOString(),
    preview: parsed.text
      ? parsed.text.replace(/\s+/g, ' ').trim().substring(0, 200)
      : '',
    flags: msg.flags || [],
    raw: {
      headers: parsed.headers || {},
      text: parsed.text || '',
      html: parsed.html || '',
      attachments: (parsed.attachments || []).map(a => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size
      }))
    }
  };
}

/**
 * Fetch all emails and initialize the cache.
 * Called once on startup.
 */
async function initializeCache() {
  return withClient(async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const messages = [];
      for await (const msg of client.fetch('1:*', {
        envelope: true,
        uid: true,
        flags: true,
        source: true
      })) {
        const email = await parseMessage(msg.source, msg);
        messages.push(email);
      }
      messages.sort((a, b) => new Date(b.date) - new Date(a.date));
      emailCache.initialize(messages);
      console.log(`[CACHE] Initialized with ${messages.length} emails (last UID: ${emailCache.lastUid})`);
      return messages.length;
    } finally {
      lock.release();
    }
  });
}

/**
 * Fetch only new emails since the last known UID.
 * Updates the cache in-place.
 * Returns the count of new emails added.
 */
async function fetchNewEmails() {
  const lastUid = emailCache.lastUid;
  return withClient(async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Get the current highest UID
      let currentMax = 0;
      for await (const msg of client.fetch('*', { uid: true })) {
        if (msg.uid > currentMax) currentMax = msg.uid;
      }

      if (currentMax <= lastUid) {
        return 0; // No new emails
      }

      const fetchRange = `${lastUid + 1}:${currentMax}`;
      let newCount = 0;

      for await (const msg of client.fetch(fetchRange, {
        envelope: true,
        uid: true,
        flags: true,
        source: true
      })) {
        const email = await parseMessage(msg.source, msg);
        emailCache.addNewEmail(email);
        newCount++;
      }

      if (newCount > 0) {
        console.log(`[CACHE] Fetched ${newCount} new email(s) (UIDs ${lastUid + 1}-${currentMax})`);
      }
      return newCount;
    } finally {
      lock.release();
    }
  });
}

/**
 * Get a single email by UID.
 * Falls back to IMAP if not in cache.
 */
async function fetchEmailById(uid) {
  // Check cache first
  const cached = emailCache.getEmailById(uid);
  if (cached) {
    return cached;
  }

  // Fallback: fetch from IMAP
  return withClient(async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      let found = null;
      for await (const msg of client.fetch(`${uid}`, {
        envelope: true,
        uid: true,
        flags: true,
        source: true
      })) {
        if (msg.uid === parseInt(uid)) {
          found = await parseMessage(msg.source, msg);
        }
      }
      return found;
    } finally {
      lock.release();
    }
  });
}

/**
 * Get emails with pagination from cache.
 */
function getEmails(page = 1, limit = 50, mailbox = null, includeBody = false) {
  return emailCache.getEmails({ page, limit, mailbox, includeBody });
}

/**
 * Search emails from cache.
 */
function searchEmails(query, mailbox = null) {
  return emailCache.searchEmails(query, { mailbox });
}

/**
 * Get all virtual mailboxes.
 */
function getMailboxes() {
  return emailCache.getMailboxes();
}

/**
 * Get system statistics.
 */
function getStats() {
  return emailCache.getStats();
}

/**
 * Fetch all emails from IMAP (legacy, for backward compatibility).
 * Now uses cache if available.
 */
async function fetchAllEmails() {
  if (!emailCache.initialized) {
    await initializeCache();
  }
  return emailCache.getEmails({ page: 1, limit: 10000, includeBody: true }).emails;
}

/**
 * Fetch ID list (legacy).
 */
async function fetchIdList() {
  if (!emailCache.initialized) {
    await initializeCache();
  }
  return emailCache.emails.map(e => ({ id: e.id, subject: e.subject }));
}

/**
 * Filter by recipient (legacy).
 */
async function fetchEmailsByRecipient(email) {
  if (!emailCache.initialized) {
    await initializeCache();
  }
  const lowerEmail = email.toLowerCase();
  return emailCache.emails.filter(msg => {
    const toField = (msg.to || '').toLowerCase();
    const fromField = (msg.from || '').toLowerCase();
    return toField.includes(lowerEmail) || fromField.includes(lowerEmail);
  });
}

module.exports = {
  initializeCache,
  fetchNewEmails,
  fetchAllEmails,
  fetchEmailById,
  fetchEmailsByRecipient,
  searchEmails,
  getEmails,
  getMailboxes,
  getStats,
  fetchIdList,
  withClient,
  emailCache
};
