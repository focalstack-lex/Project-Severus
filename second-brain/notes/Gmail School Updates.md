# Gmail School Updates

Gmail integration for the desktop app (2026-09-14): Severus surfaces unread mail from Lex's school domain — TopHeader mail pill with unread badge, an Inbox tab in the Context Inspector, and a spoken summary ("Two new emails, Sir. Latest from the Registrar about enrollment.") on demand via "check my email".

Auth is OAuth 2.0 (Desktop client, `gmail.readonly` only — the app can never send or delete). The renderer performs all HTTPS (mirroring the Strava integration); Rust contributes only a one-shot loopback `TcpListener` that captures Google's consent redirect on 127.0.0.1 and Windows Credential Manager storage (`keyring`, `windows-native` feature) for the refresh token and client secret — nothing sensitive in localStorage. Polling runs in the renderer every few minutes (`from:(@domain) is:unread`, metadata headers only, paused when the window is hidden), diffs against seen-ids in localStorage, and fires `severus:mail-updated` — the same CustomEvent pattern as the Strava stats. First sync is a silent baseline. Testing-mode consents expire weekly, so a 30-second reconnect is expected unless the Workspace admin allows internal apps.

Setup: enable the Gmail API in Cloud Console, create an OAuth Desktop client, add the school account as a test user, then paste client ID/secret + domain in Settings ▸ Gmail School Mail.

## Google Classroom (added 2026-09-14)

The consent now also carries three Classroom read-only scopes (courses, student submissions, announcements) — one connect covers both services, so disconnecting and reconnecting once is required to gain Classroom access. `gmail.ts` gained `fetchClassroomSnapshot`/`pollClassroom`: active courses → coursework + own submissions joined into **due soon** and **missing** buckets, plus latest announcements per course, polled on a slower timer, cached in localStorage, announced via `severus:classroom-updated`.

Surfaces: the Inbox tab became the **School Hub** (Mail + Classroom sections — due soon, missing in red, announcements), the Status popover shows "N due · N missing · N unread", and Thinking Mode receives a LIVE CLASSROOM telemetry block so "what's due, Sir?" is answered from real due dates. Voice: "what's due", "missing assignments", "any announcements", "check my classroom". "open classroom" launches classroom.google.com. A 403 in the Hub means stale scopes — reconnect.

Related: [[Windows System Control]], [[The Ascension]], [[Second Brain]]. #gmail #classroom #email #voice #meta
