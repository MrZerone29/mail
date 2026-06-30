# 📬 Mail Viewer

A complete Mail Viewer system using Dovecot IMAP with REST API, Web UI, and real-time email notifications.

## Features

- **REST API** — Full JSON API for all email operations
- **Web UI** — Dark-themed HTML interface for browser access
- **Real-time Notifications** — IMAP IDLE + WebSocket for instant new mail alerts
- **Email Search** — Full-text search across subject, sender, and body
- **Read-only** — Designed for secure email monitoring (no send capabilities)
- **Content Negotiation** — Same endpoints serve both API and Web UI based on `Accept` header

## Tech Stack

- **Node.js** with **Express** — Web server
- **imapflow** — Modern IMAP client
- **mailparser** — Email parsing
- **ws** — WebSocket server for real-time updates
- **dotenv** — Environment configuration

## Prerequisites

- Node.js 18+
- Dovecot IMAP server (or any IMAP-compatible mail server)
- An email account with IMAP access

## Installation

```bash
# Clone the repository
git clone [<repo-url>](https://github.com/MrZerone29/mail.git)
cd mail-viewer

# Install dependencies
npm install

# Configure environment
cp .env .env.local  # Edit with your IMAP credentials
```

## Configuration

Edit the `.env` file with your IMAP server details:

| Variable | Description | Default |
|----------|-------------|---------|
| `MAIL_HOST` | IMAP server hostname | `127.0.0.1` |
| `MAIL_PORT` | IMAP server port | `993` |
| `MAIL_SECURE` | Use SSL/TLS connection | `true` |
| `MAIL_USER` | IMAP username (full email) | `main@servermail.qzz.io` |
| `MAIL_PASS` | IMAP password | *(required)* |
| `PORT` | Web server port | `3000` |
| `WEBHOOK_URL` | Optional webhook URL for new mail alerts | *(optional)* |

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

Then open `http://localhost:3000` in your browser.

## API Endpoints

All endpoints support **content negotiation**:
- Set `Accept: application/json` for JSON responses
- Set `Accept: text/html` for Web UI (browser default)

### `GET /mail`
List all emails sorted by date (newest first).

**Response:** Array of email objects with `id`, `from`, `to`, `subject`, `date`, `preview`, `flags`, and `raw` (full parsed email).

### `GET /mail/getid`
List email UIDs with subjects.

**Response:** `[{ id, subject }]`

### `GET /mail/:id`
Get a specific email by UID.

**Response:** Full email object with parsed headers, text body, HTML body, and attachment metadata.

**Error:** `404 Not Found` if the email doesn't exist.

### `GET /mail/to/:email`
Filter emails by recipient address.

**Response:** Array of full email objects matching the recipient.

### `GET /search?q={query}`
Full-text search across email subject, sender, and body.

**Response:** Array of matching email objects.

## Real-time Notifications

The system uses **IMAP IDLE** to watch for new emails:

1. **WebSocket** — Browser clients receive `new_mail` events instantly
2. **Webhook** — Optional HTTP POST to `WEBHOOK_URL` when new mail arrives

### WebSocket Payload

```json
{
  "type": "new_mail",
  "data": {
    "id": 123,
    "from": "sender@example.com",
    "to": "you@example.com",
    "subject": "New Email",
    "date": "2024-01-01T00:00:00.000Z",
    "preview": "First 200 characters..."
  }
}
```

## Web UI Pages

| Route | Description |
|-------|-------------|
| `/mail` | Inbox — table view of all emails |
| `/mail/:id` | Email detail — full message view |
| `/mail/getid` | ID list — clickable UID/subject pairs |
| `/mail/to/:email` | Filtered inbox |
| `/search` | Search page with input and results |

## Architecture

```
server.js            Express app + WebSocket server
├── routes/
│   └── mailRoutes.js    All mail API routes
├── services/
│   ├── imapService.js   IMAP connection, fetch, parse
│   └── wsService.js     WebSocket + IMAP IDLE loop
├── views/
│   ├── inbox.html       Dark theme inbox table
│   ├── detail.html      Email detail view
│   ├── search.html      Search interface
│   └── getid.html       UID list view
└── utils/               (extendable)
```

## License

MIT
