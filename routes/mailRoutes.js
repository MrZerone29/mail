const express = require('express');
const router = express.Router();
const path = require('path');
const imapService = require('../services/imapService');
const { isApiRequest } = require('../utils/contentNegotiation');

// GET /mail - List all emails (with pagination)
router.get('/mail', async (req, res) => {
  try {
    // Ensure cache is initialized
    if (!imapService.emailCache.initialized) {
      await imapService.initializeCache();
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const mailbox = req.query.mailbox || null;

    const result = imapService.getEmails(page, limit, mailbox, false);

    if (isApiRequest(req)) {
      res.json(result);
    } else {
      res.sendFile(path.join(__dirname, '..', 'views', 'inbox.html'));
    }
  } catch (err) {
    console.error('[ROUTE /mail]', err.message);
    res.status(500).json({ error: 'Failed to fetch emails', details: err.message });
  }
});

// GET /mail/getid - List of IDs with subjects
router.get('/mail/getid', async (req, res) => {
  try {
    if (!imapService.emailCache.initialized) {
      await imapService.initializeCache();
    }
    const ids = await imapService.fetchIdList();
    if (isApiRequest(req)) {
      res.json(ids);
    } else {
      res.sendFile(path.join(__dirname, '..', 'views', 'getid.html'));
    }
  } catch (err) {
    console.error('[ROUTE /mail/getid]', err.message);
    res.status(500).json({ error: 'Failed to fetch email IDs', details: err.message });
  }
});

// GET /mail/to/:email - Filter by recipient (legacy, backward compatible)
router.get('/mail/to/:email', async (req, res) => {
  try {
    if (!imapService.emailCache.initialized) {
      await imapService.initializeCache();
    }
    const emails = await imapService.fetchEmailsByRecipient(req.params.email);
    if (isApiRequest(req)) {
      res.json(emails);
    } else {
      res.sendFile(path.join(__dirname, '..', 'views', 'inbox.html'));
    }
  } catch (err) {
    console.error('[ROUTE /mail/to/:email]', err.message);
    res.status(500).json({ error: 'Failed to filter emails', details: err.message });
  }
});

// GET /mail/:id - Single email detail
router.get('/mail/:id', async (req, res) => {
  // Skip if the path matches another route pattern (shouldn't happen due to ordering, but safe guard)
  if (req.params.id === 'getid' || req.params.id === 'to' || req.params.id === 'mailbox') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const email = await imapService.fetchEmailById(req.params.id);
    if (!email) {
      if (isApiRequest(req)) {
        return res.status(404).json({ error: 'Email not found' });
      }
      // For web UI: send the page (JS will show error)
      return res.status(404).sendFile(path.join(__dirname, '..', 'views', 'detail.html'));
    }
    if (isApiRequest(req)) {
      res.json(email);
    } else {
      res.sendFile(path.join(__dirname, '..', 'views', 'detail.html'));
    }
  } catch (err) {
    console.error('[ROUTE /mail/:id]', err.message);
    res.status(500).json({ error: 'Failed to fetch email', details: err.message });
  }
});

// GET /search?q= - Search emails
router.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    if (isApiRequest(req)) {
      return res.json([]);
    } else {
      return res.sendFile(path.join(__dirname, '..', 'views', 'search.html'));
    }
  }

  try {
    if (!imapService.emailCache.initialized) {
      await imapService.initializeCache();
    }
    const mailbox = req.query.mailbox || null;
    const results = imapService.searchEmails(query, mailbox);
    if (isApiRequest(req)) {
      res.json({ query, results, total: results.length });
    } else {
      res.sendFile(path.join(__dirname, '..', 'views', 'search.html'));
    }
  } catch (err) {
    console.error('[ROUTE /search]', err.message);
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

// GET /api/mailboxes - List virtual mailboxes
router.get('/api/mailboxes', async (req, res) => {
  try {
    if (!imapService.emailCache.initialized) {
      await imapService.initializeCache();
    }
    const mailboxes = imapService.getMailboxes();
    res.json({ mailboxes, total: mailboxes.length });
  } catch (err) {
    console.error('[ROUTE /api/mailboxes]', err.message);
    res.status(500).json({ error: 'Failed to get mailboxes', details: err.message });
  }
});

// GET /api/stats - System statistics
router.get('/api/stats', async (req, res) => {
  try {
    if (!imapService.emailCache.initialized) {
      await imapService.initializeCache();
    }
    const stats = imapService.getStats();
    res.json(stats);
  } catch (err) {
    console.error('[ROUTE /api/stats]', err.message);
    res.status(500).json({ error: 'Failed to get stats', details: err.message });
  }
});

// GET /api/emails - Paginated email listing
router.get('/api/emails', async (req, res) => {
  try {
    if (!imapService.emailCache.initialized) {
      await imapService.initializeCache();
    }
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const mailbox = req.query.mailbox || null;
    const includeBody = req.query.includeBody === 'true';

    const result = imapService.getEmails(page, limit, mailbox, includeBody);
    res.json(result);
  } catch (err) {
    console.error('[ROUTE /api/emails]', err.message);
    res.status(500).json({ error: 'Failed to get emails', details: err.message });
  }
});

module.exports = router;
