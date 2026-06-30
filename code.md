# Mandatory Project Analysis Before Any Code Changes

Before writing, modifying, refactoring, or generating **any** code, you **MUST** fully analyze the project. Do **NOT** start implementing features immediately.

This is a mandatory workflow.

## Phase 1 — Read and Understand Everything

Read the project in the following order:

1. Read **README.md** (if it exists).
2. Read **idea.md** completely from beginning to end.
3. Recursively scan the entire project directory.
4. Read every source file before modifying any code.
5. Build a complete understanding of how the project works.

Treat **idea.md** as the **source of truth** for the project's original vision, architecture, feature requirements, and future roadmap.

Before implementing anything:

* Understand every feature described in `idea.md`.
* Compare the current implementation with the planned design.
* Identify completed features.
* Identify partially completed features.
* Identify missing features.
* Keep all new implementations consistent with the architecture described in `idea.md` unless explicitly instructed otherwise.

## Phase 2 — Analyze the Existing Project

After reading the entire project, understand and internally summarize:

* Overall architecture
* Folder structure
* Application flow
* Configuration
* Services
* Middleware
* Routes
* API endpoints
* Web UI
* IMAP implementation
* Email parsing logic
* Mail storage/cache
* Search implementation
* Realtime implementation (if any)
* Authentication
* Dependencies
* Build process

Determine:

* Which files need to be modified.
* Which files should remain untouched.
* Which modules can be reused.
* Which components already implement part of the requested functionality.
* Where the new features should integrate naturally.

Do **NOT** duplicate existing functionality.

## Phase 3 — Preserve Existing Architecture

Do **NOT** rewrite the project from scratch.

Do **NOT** replace working modules unless absolutely necessary.

Instead:

* Extend the existing architecture.
* Reuse existing modules whenever possible.
* Preserve backward compatibility.
* Follow the existing coding style.
* Minimize unnecessary file modifications.
* Avoid creating duplicate code.
* Keep the project modular and maintainable.

If a feature already exists, improve or extend it instead of replacing it.

## Phase 4 — Implementation

Only after completing the full analysis may you begin implementation.

Implement features incrementally.

After each major feature:

* Verify that existing functionality still works.
* Ensure all existing API endpoints remain compatible.
* Ensure the Web UI is not broken.
* Reuse existing utilities and services.
* Handle errors gracefully.
* Write production-quality code.

## General Rules

* Think before coding.
* Read before modifying.
* Reuse before creating.
* Optimize only after functionality is complete.
* Never duplicate code.
* Never ignore the existing project architecture.
* Never ignore `idea.md`.
* Keep the code clean, modular, scalable, and production-ready.

Always understand first, implement second, and optimize last.




# Feature Implementation

After completing the mandatory project analysis, begin implementing the requested features.

## Objectives

Implement all requested features while preserving the existing architecture and functionality.

The implementation should feel like a natural extension of the current project rather than a rewrite.

## Requirements

Implement the following features:

### 1. Real-Time Email Updates

Implement real-time inbox updates using the following priority:

1. IMAP IDLE + WebSocket (preferred)
2. IMAP IDLE + Server-Sent Events (SSE)
3. Automatic refresh every 30 seconds (fallback)

The refresh interval must be configurable through `.env`.

When a new email arrives:

* Update the inbox automatically.
* Update mailbox counters.
* Update filtered mailbox views.
* Show a small "New email received" notification.
* Never require a manual browser refresh.

---

### 2. Automatic Mailbox Classification

All emails are forwarded to:

```text
main@servermail.qzz.io
```

The original recipient remains available in the email headers.

Automatically classify emails using the following priority:

1. Envelope recipient
2. Delivered-To
3. X-Original-To
4. To

Each unique recipient address should automatically become a virtual mailbox.

Example:

* [otp@servermail.qzz.io](mailto:otp@servermail.qzz.io)
* [steam@servermail.qzz.io](mailto:steam@servermail.qzz.io)
* [github@servermail.qzz.io](mailto:github@servermail.qzz.io)
* [discord@servermail.qzz.io](mailto:discord@servermail.qzz.io)

No manual configuration should be required.

---

### 3. Mailbox Sidebar

Create a Gmail-like sidebar showing:

* Inbox (All)
* One entry for every detected recipient
* Message count
* Unread count (if available)

Clicking a mailbox should instantly filter emails without reloading the page.

---

### 4. Search

Implement fast searching by:

* Subject
* Sender
* Recipient
* Date
* Message-ID
* Body (optional if already indexed)

Search should work globally and inside filtered mailboxes.

---

### 5. API Improvements

Add or improve endpoints for:

* List mailboxes
* List emails
* Get email by ID
* Filter emails by recipient
* Live update endpoint (WebSocket/SSE)
* Health check
* Statistics

Keep existing endpoints backward compatible.

---

### 6. Performance

Optimize for large inboxes.

Requirements:

* Use IMAP UID tracking.
* Fetch only new emails.
* Avoid downloading the same email twice.
* Cache parsed emails.
* Cache mailbox indexes.
* Load email bodies only when necessary.
* Support pagination.

---

### 7. Web UI

Improve the web interface with:

* Responsive layout
* Dark mode
* Loading indicators
* Infinite scrolling or pagination
* Smooth animations
* Mail preview panel
* Keyboard shortcuts (optional)

The interface should resemble a modern webmail client.

---

### 8. Code Quality

* Keep the project modular.
* Reuse existing code whenever possible.
* Do not duplicate logic.
* Add comments only where necessary.
* Follow the existing coding style.
* Keep backward compatibility.
* Handle errors gracefully.
* Produce production-ready code.

---

## Completion Rules

Implement features incrementally.

After each completed feature:

* Verify compatibility.
* Ensure existing functionality still works.
* Fix any regressions immediately.

Continue until every requested feature has been fully implemented.
