# Project rules for MERN Chat

Stack: Express, MongoDB/Mongoose, Socket.IO, React + Vite + Tailwind v4.

- Work only inside this repo. Never print, log, or commit secrets. `.env` files must stay untracked; only `.env.example` is committed.
- Keep it simple. No group chats, calls, file uploads, E2E encryption, or push notifications.
- Never claim something was tested, built, or deployed unless you ran the command and saw the output. Quote the actual output when reporting.
- Do not rename existing socket events or REST routes without updating every usage (client, server, `scripts/api-test.mjs`, docs).
- Before each commit: run `npm run build` in client and `npm run verify` in server (server must be running). Fix failures first.
- After finishing a phase: `git add -A`, check `git status` for stray `.env` files, commit with the given message, `git push`, and report the commit hash.
- If blocked by something only the human can do (dashboard clicks, credentials, secrets), stop and list exact steps for the user. Never invent values.
- End every phase with: what changed, what you verified (with evidence), what you could NOT verify, and what the user should check manually.
