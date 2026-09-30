# Coordination channel (two Claude sessions)

Two Claude sessions collaborate on this project via this Git repo:
- **server session** (Claude Code on the Hashavshevet server): builds the DB bridge (read/write to SQL, localhost). Has direct SQL access.
- **local session** (Claude on Gil's PC): advisor + full research context + front-end (Next.js) / Supabase. NO direct SQL access.

## How to exchange notes
- `coordination/from-local.md` — the local session writes questions/feedback/context for the server session.
- `coordination/from-server.md` — the server session writes questions/status/code notes for the local session.
- Each session appends (newest at top, dated). Commit + push after writing. The other session pulls and reads when Gil asks it to.

## Ground rules (both sessions)
- Reply to Gil in Hebrew (server session may reply in English in the terminal for readability; keep app/UI strings Hebrew).
- Read `SERVER-CONTEXT.md` first — it holds the validated Hashavshevet integration facts.
- NEVER delete Hashavshevet documents via SQL (cancel with a counter-document). Only orders are written, as temp docs (DocumentID 11, DocNumber 0, Status 0).
- Secrets only in `.env.local` (gitignored). On the server, DB host = localhost,61476... (see .env.example: localhost,61476 is wrong → use 61476).
