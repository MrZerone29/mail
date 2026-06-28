const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

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

function parseMessage(msg) {
  return {
    id: msg.uid,
    from: msg._parsedFrom || '',
    to: msg._parsedTo || '',
    subject: msg._parsedSubject || '(no subject)',
    date: msg._parsedDate || msg.envelope?.date || new Date().toISOString(),
    preview: msg._parsedPreview || '',
    flags: msg.flags || [],
    raw: {
      headers: msg._parsedHeaders || {},
      text: msg._parsedText || '',
      html: msg._parsedHtml || '',
      attachments: msg._parsedAttachments || []
    }
  };
}

async function fetchAllEmails() {
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
        const parsed = await simpleParser(msg.source);
        messages.push({
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
        });
      }
      messages.sort((a, b) => new Date(b.date) - new Date(a.date));
      return messages;
    } finally {
      lock.release();
    }
  });
}

async function fetchEmailById(uid) {
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
          const parsed = await simpleParser(msg.source);
          found = {
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
      }
      return found;
    } finally {
      lock.release();
    }
  });
}

async function fetchEmailsByRecipient(email) {
  const all = await fetchAllEmails();
  const lowerEmail = email.toLowerCase();
  return all.filter(msg => {
    const toField = (msg.to || '').toLowerCase();
    const fromField = (msg.from || '').toLowerCase();
    return toField.includes(lowerEmail) || fromField.includes(lowerEmail);
  });
}

async function searchEmails(query) {
  const all = await fetchAllEmails();
  const q = query.toLowerCase();
  return all.filter(msg => {
    return (msg.subject || '').toLowerCase().includes(q) ||
           (msg.from || '').toLowerCase().includes(q) ||
           (msg.raw?.text || '').toLowerCase().includes(q);
  });
}

async function fetchIdList() {
  return withClient(async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const ids = [];
      for await (const msg of client.fetch('1:*', {
        envelope: true,
        uid: true
      })) {
        ids.push({
          id: msg.uid,
          subject: msg.envelope?.subject || '(no subject)'
        });
      }
      ids.sort((a, b) => b.id - a.id);
      return ids;
    } finally {
      lock.release();
    }
  });
}

module.exports = {
  fetchAllEmails,
  fetchEmailById,
  fetchEmailsByRecipient,
  searchEmails,
  fetchIdList,
  withClient
};
