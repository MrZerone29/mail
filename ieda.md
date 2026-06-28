Create a complete Node.js project that acts as a Mail Viewer system using Dovecot IMAP.

The system must include:
- REST API (RAW JSON responses)
- Web UI (HTML interface for browser access)
- Real-time email notification (WebSocket or webhook)
- Email search functionality
- Read-only email access (no sending emails)

The project must be fully runnable after generation.

---

========================
TECH STACK
========================
- Node.js (Express)
- imapflow (IMAP client)
- mailparser (email parsing)
- ws or socket.io (real-time support)
- dotenv (environment variables)
- Optional: EJS or raw HTML templates

---

========================
IMAP CONFIG
========================
Use Dovecot IMAP:

host=127.0.0.1
port=993
secure=true
user=main@servermail.qzz.io
password loaded from .env (MAIL_PASS)

---

========================
CORE RULE
========================
- If request is from browser (Accept: text/html) → return HTML UI
- If request is from API client (Accept: application/json) → return JSON RAW
- Same endpoint must support both modes

---

========================
API + WEB ROUTES
========================

1. GET /mail
- API: return all emails (RAW JSON)
- Web: inbox UI (table view)
- Fields:
  id (UID)
  from
  to
  subject
  date
  preview
  raw (full parsed email)
- Sort: newest first

---

2. GET /mail/getid
- API: [{id, subject}]
- Web: clickable list UI linking to /mail/:id

---

3. GET /mail/:id
- API: full raw email JSON
- Web: detailed email view:
  subject, from, to, date, headers, body (text + safe HTML)

- Return 404 if not found

---

4. GET /mail/to/:email
- Filter emails by recipient address
- Match:
  - envelope.to OR
  - header "To"
- Return full raw email structure

---

5. GET /search?q=
- Search in:
  - subject
  - from
  - body
- Web: search page with input + results
- API: JSON results

---

========================
REALTIME SYSTEM
========================
- Use IMAP IDLE
- Detect new email instantly
- Emit event: "new_mail"

Support:
1. WebSocket broadcast OR
2. HTTP webhook (ENV WEBHOOK_URL)

Payload:
{
  id,
  from,
  to,
  subject,
  date,
  preview
}

---

========================
WEB UI
========================
- Simple dark theme HTML (no frontend framework)
- Pages:
  - /mail → inbox list
  - /mail/:id → email detail
  - /mail/getid → ID list
  - /mail/to/:email → filtered inbox
  - /search → search page

UI features:
- Table-based inbox
- Click row → open email
- Fast lightweight design

---

========================
IMAP HANDLING
========================
- Use imapflow
- Connect → fetch → logout per request
- Parse with mailparser
- Fetch:
  - envelope
  - uid
  - flags
  - raw source

---

========================
PROJECT STRUCTURE (MANDATORY)
========================

Generate full project with:

/project-root
  ├── server.js
  ├── package.json
  ├── .env
  ├── README.md
  ├── /routes
  ├── /services
  ├── /views (HTML pages)
  ├── /utils

---

========================
package.json REQUIREMENTS
========================
Must include:
- express
- imapflow
- mailparser
- dotenv
- ws (or socket.io)
- nodemon (dev optional)

Include scripts:
- "start": "node server.js"
- "dev": "nodemon server.js"

---

========================
.ENV FILE (AUTO GENERATE)
========================

Create .env file with:

MAIL_HOST=127.0.0.1
MAIL_PORT=993
MAIL_USER=main@servermail.qzz.io
MAIL_PASS=your_password_here
WEBHOOK_URL=http://localhost:4000/webhook (optional)

---

========================
README.md (AUTO GENERATE)
========================

Include:
- Project description
- Installation steps
- Setup instructions
- Environment variables explanation
- How to run:
  npm install
  npm run dev

- API routes list:
  /mail
  /mail/getid
  /mail/:id
  /mail/to/:email
  /search

- Web UI routes explanation
- Real-time feature explanation

---

========================
GOAL
========================

Generate a fully working project that:
- Can run immediately after npm install
- Works with Dovecot IMAP
- Supports both API and Web UI
- Supports real-time email notifications
- Includes complete setup files (.env, package.json, README.md)
- Is clean, modular, and production-ready

Output full code for all files.