/**
 * In-memory email cache service.
 *
 * Features:
 * - Caches parsed emails in memory
 * - Tracks last known UID for incremental fetching
 * - Classifies emails into virtual mailboxes by recipient
 * - Supports pagination and lazy body loading
 * - Maintains mailbox indexes (count, unread)
 */
class EmailCache {
  constructor() {
    /** All cached emails, sorted newest first */
    this.emails = [];
    /** Map: uid → email object */
    this.emailMap = new Map();
    /** Map: mailbox address → { name, count, unread } */
    this.mailboxes = new Map();
    /** Highest UID ever seen */
    this.lastUid = 0;
    /** Whether initial bulk load is complete */
    this.initialized = false;
  }

  /**
   * Initialize the cache with a batch of emails.
   * Called on startup to load all existing emails.
   */
  initialize(emails) {
    this.emails = [];
    this.emailMap = new Map();
    this.mailboxes = new Map();
    this.lastUid = 0;

    for (const email of emails) {
      this._addEmail(email);
    }

    this.emails.sort((a, b) => new Date(b.date) - new Date(a.date));
    this.initialized = true;
  }

  /**
   * Add or update a single email in the cache.
   */
  _addEmail(email) {
    const uid = email.id;
    if (uid > this.lastUid) {
      this.lastUid = uid;
    }

    // Store with lazy body: store full body, but API can request without body
    this.emailMap.set(uid, email);

    // Classify into mailboxes
    this._classifyEmail(email);
  }

  /**
   * Extract recipient address from email headers.
   * Priority: envelope.to → Delivered-To → X-Original-To → To
   */
  _extractRecipient(email) {
    const raw = email.raw || {};

    // 1. envelope.to (parsed 'to' field)
    if (email.to) {
      const addresses = this._extractAddresses(email.to);
      if (addresses.length > 0) return addresses[0];
    }

    // 2. Delivered-To header
    const headers = raw.headers || {};
    if (headers['delivered-to']) {
      const addr = this._cleanAddress(headers['delivered-to']);
      if (addr) return addr;
    }

    // 3. X-Original-To header
    if (headers['x-original-to']) {
      const addr = this._cleanAddress(headers['x-original-to']);
      if (addr) return addr;
    }

    // 4. To header (raw)
    if (headers['to']) {
      const addr = this._cleanAddress(headers['to']);
      if (addr) return addr;
    }

    return null;
  }

  /**
   * Extract email addresses from a string like "Name <email>" or "email1, email2"
   */
  _extractAddresses(str) {
    if (!str) return [];
    const results = [];
    // Match email patterns in strings like "Name <email@domain.com>" or just "email@domain.com"
    const matches = str.match(/[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/g);
    if (matches) {
      for (const m of matches) {
        const cleaned = m.trim().toLowerCase().replace(/^[<]+|[>]+$/g, '');
        if (cleaned && !results.includes(cleaned)) {
          results.push(cleaned);
        }
      }
    }
    return results;
  }

  /**
   * Clean an address string to just the email part.
   */
  _cleanAddress(raw) {
    if (!raw) return null;
    const match = raw.match(/[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/);
    if (match) {
      return match[0].trim().toLowerCase().replace(/^[<]+|[>]+$/g, '');
    }
    return null;
  }

  /**
   * Classify an email into its virtual mailboxes.
   */
  _classifyEmail(email) {
    const recipient = this._extractRecipient(email);
    if (recipient) {
      email._mailbox = recipient;
      this._incrementMailbox(recipient, email);
    }

    // Also index all "to" addresses as mailboxes
    if (email.to) {
      const addrs = this._extractAddresses(email.to);
      for (const addr of addrs) {
        if (addr !== recipient) {
          this._incrementMailbox(addr, email);
        }
      }
    }
  }

  /**
   * Increment mailbox counter and track unread.
   */
  _incrementMailbox(address, email) {
    const key = address.toLowerCase();
    if (!this.mailboxes.has(key)) {
      this.mailboxes.set(key, { name: address, count: 0, unread: 0 });
    }
    const mb = this.mailboxes.get(key);
    mb.count++;
    if (email.flags && !email.flags.includes('\\Seen')) {
      mb.unread++;
    }
  }

  /**
   * Add a new email to the cache (from real-time update).
   */
  addNewEmail(email) {
    this._addEmail(email);
    // Re-sort to maintain newest-first order
    this.emails.push(email);
    this.emails.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /**
   * Get all emails with pagination support.
   * @param {Object} opts
   * @param {number} opts.page - Page number (1-based)
   * @param {number} opts.limit - Items per page (default 50)
   * @param {string} opts.mailbox - Filter by mailbox address
   * @param {boolean} opts.includeBody - Include full body content
   * @returns {{ emails: Array, total: number, page: number, pages: number }}
   */
  getEmails(opts = {}) {
    const { page = 1, limit = 50, mailbox, includeBody } = opts;

    let filtered = this.emails;

    // Filter by mailbox
    if (mailbox) {
      const lower = mailbox.toLowerCase();
      filtered = filtered.filter(e => (e._mailbox || '').toLowerCase() === lower);
    }

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const end = start + limit;
    let items = filtered.slice(start, end);

    // Strip body if not requested (lazy load)
    if (!includeBody) {
      items = items.map(e => this._stripBody(e));
    }

    return { emails: items, total, page, pages, limit };
  }

  /**
   * Get a single email by UID.
   */
  getEmailById(uid) {
    const email = this.emailMap.get(parseInt(uid));
    return email || null;
  }

  /**
   * Search emails across multiple fields.
   */
  searchEmails(query, opts = {}) {
    const { mailbox } = opts;
    const q = query.toLowerCase();

    let candidates = this.emails;

    // Scope to mailbox if specified
    if (mailbox) {
      const lower = mailbox.toLowerCase();
      candidates = candidates.filter(e => (e._mailbox || '').toLowerCase() === lower);
    }

    return candidates.filter(email => {
      return (
        (email.subject || '').toLowerCase().includes(q) ||
        (email.from || '').toLowerCase().includes(q) ||
        (email.to || '').toLowerCase().includes(q) ||
        (email._mailbox || '').toLowerCase().includes(q) ||
        (email.raw?.text || '').toLowerCase().includes(q) ||
        (String(email.id)).includes(q) ||
        this._searchDate(email.date, q)
      );
    });
  }

  /**
   * Check if a date string matches a search query.
   */
  _searchDate(dateStr, query) {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      const formatted = d.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      }).toLowerCase();
      return formatted.includes(query);
    } catch {
      return false;
    }
  }

  /**
   * Get all virtual mailboxes with counts.
   */
  getMailboxes() {
    const list = [];
    for (const mb of this.mailboxes.values()) {
      list.push({ ...mb });
    }
    list.sort((a, b) => b.count - a.count);
    return list;
  }

  /**
   * Get mailbox stats.
   */
  getStats() {
    let totalUnread = 0;
    for (const mb of this.mailboxes.values()) {
      totalUnread += mb.unread;
    }
    return {
      totalEmails: this.emails.length,
      totalMailboxes: this.mailboxes.size,
      totalUnread,
      lastUid: this.lastUid,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * Strip full body content for list views (lazy loading).
   */
  _stripBody(email) {
    return {
      id: email.id,
      from: email.from,
      to: email.to,
      subject: email.subject,
      date: email.date,
      preview: email.preview,
      flags: email.flags,
      _mailbox: email._mailbox,
      raw: email.raw ? {
        headers: email.raw.headers,
        attachments: (email.raw.attachments || []).map(a => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size
        }))
      } : undefined
    };
  }

  /**
   * Check if a mailbox exists.
   */
  hasMailbox(address) {
    return this.mailboxes.has(address.toLowerCase());
  }

  /**
   * Clear the cache (for testing/reload).
   */
  clear() {
    this.emails = [];
    this.emailMap.clear();
    this.mailboxes.clear();
    this.lastUid = 0;
    this.initialized = false;
  }
}

// Singleton instance
const instance = new EmailCache();

module.exports = instance;
