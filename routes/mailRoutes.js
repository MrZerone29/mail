const express = require('express');
const router = express.Router();
const path = require('path');
const imapService = require('../services/imapService');
const { isApiRequest } = require('../utils/contentNegotiation');

// GET /mail - List all emails
router.get('/mail', async (req, res) => {
  try {
    const emails = await imapService.fetchAllEmails();
    if (isApiRequest(req)) {
      res.json(emails);
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

// GET /mail/to/:email - Filter by recipient
router.get('/mail/to/:email', async (req, res) => {
  try {
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
  try {
    const email = await imapService.fetchEmailById(req.params.id);
    if (!email) {
      if (isApiRequest(req)) {
        return res.status(404).json({ error: 'Email not found' });
      }
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
    const results = await imapService.searchEmails(query);
    if (isApiRequest(req)) {
      res.json(results);
    } else {
      res.sendFile(path.join(__dirname, '..', 'views', 'search.html'));
    }
  } catch (err) {
    console.error('[ROUTE /search]', err.message);
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

module.exports = router;
