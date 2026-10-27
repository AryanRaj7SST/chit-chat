# Integration testing

Use a development database. The API and browser tests register unique users and
leave test users, conversations, and messages in that database. They do not delete
data. Keep credentials in ignored `.env` files; never paste them into test output.

## Run the checks

1. In `server`, run `npm ci`, then `npm start`. Confirm the server is listening.
   Configure `MONGO_URI`, `JWT_SECRET`, `PORT`, and `CLIENT_URL` in `server/.env`.
2. In another terminal in `server`, run `npm run verify`.
3. In `client`, run `npm ci`, `npm test`, `npm run lint`, and `npm run build`.
4. In `client`, run `npx playwright install chromium` once, then `npm run dev`.
   Configure `VITE_API_URL` and `VITE_SOCKET_URL` in `client/.env` to point to the
   backend. `CLIENT_URL` must match the client origin exactly.
5. In another terminal in `client`, run `npm run e2e`.

Defaults: API tests use `http://localhost:5000`; browser tests use
`http://localhost:5173`. To test isolated instances in PowerShell:

```powershell
# Backend terminal, in server
$env:PORT = '5001'
$env:CLIENT_URL = 'http://localhost:5174'
npm start

# API verification terminal, in server
$env:BASE_URL = 'http://localhost:5001'
npm run verify

# Client terminal, in client
$env:VITE_API_URL = 'http://localhost:5001/api'
$env:VITE_SOCKET_URL = 'http://localhost:5001'
npm run dev -- --host localhost --port 5174 --strictPort

# Browser verification terminal, in client
$env:E2E_BASE_URL = 'http://localhost:5174'
npm run e2e
```

Run the browser test against the development server to exercise React StrictMode.
It uses two separate browser contexts with freshly registered users, plus an
additional tab for one user. Playwright is a development dependency only.

## Automated coverage

- API: register/login, duplicate emails, authenticated user search, private
  conversation reuse, self-chat rejection, membership checks for history,
  messaging and typing, invalid and expired socket JWTs, invalid JWT on reconnect,
  per-user presence with multiple sockets, delivery, validation, concurrent retry
  identity, persisted history, and conversation previews.
- Message reconciliation: history arriving before an acknowledgement, stale
  history arriving after a socket event, repeated events, and failed
  acknowledgements reconciled by history.
- Browser: independent sessions, live messages and replies, unique messages after
  reload and reconnect, missed-message recovery, typing and draft clearing,
  multi-tab presence, offline state after closing a context, and 375px navigation.

## Manual checklist

- [ ] Use real phones with Android Chrome and iOS Safari: verify the keyboard,
  safe areas, scrolling, and back button at 375px. Chromium emulation cannot
  establish real-device or other-browser behavior.
- [ ] Throttle the connection, send, then interrupt the acknowledgement. Restore
  connectivity and retry: both users should see one copy of that message. Unit
  and API checks cover reconciliation and retry identity separately; they cannot
  reproduce every transport timing.
- [ ] While B types, switch B to another conversation, clear the draft, send, and
  close the tab. A's typing indicator should stop. Repeat with rapid switching
  and long continuous typing; no indicator should remain stuck.
- [ ] Open B in two tabs. Close one while typing in the other: B stays online.
  Close the last tab and confirm A sees Offline. Repeat after laptop sleep and
  after a browser crash; abrupt losses may take the Socket.IO heartbeat timeout.
- [ ] Use a short-lived development JWT, keep the page open until it expires,
  then interrupt and restore networking. A rejected reconnect should return the
  client to login without a reconnect loop. Automated API checks cover expired
  JWT rejection; they do not wait seven days for a real client token to expire.
- [ ] Restart the backend with both users connected. Confirm presence resets,
  missed messages load, and messages do not duplicate after repeated reconnects.
- [ ] Check long histories (more than the latest 50 messages), Unicode input,
  slow database responses, and rapid sends from several tabs. This phase does
  not add history pagination controls or a multi-process presence service.
- [ ] Verify the actual deployment's CORS origins, TLS, WebSocket proxying, and
  database indexes. This test suite does not deploy or validate production.

The retry fix adds a partial unique MongoDB index on
`{ conversation, sender, tempId }`. Confirm it exists in environments where
Mongoose automatic index creation is disabled. Existing messages without a
`tempId` are excluded from this index.

## Phase 4 verification evidence

Executed on 2026-10-27 using the updated backend on port 5001 and the Vite
development client on port 5174, with the configured development MongoDB:

- `npm run build`: `✓ built in 1.15s`.
- `npm test`: `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.
- `npm run verify`: `All checks passed`, including
  `PASS - concurrent first sends persist one message` and
  `PASS - retrying an old message preserves the newest preview`.
- `npm run e2e`: `All browser checks passed`.
- `npm run lint` exited successfully with warnings about context exports,
  effect-driven state updates, and ref cleanup. These warnings remain.

No production deployment, real mobile devices, Firefox, or Safari was tested.
The manual checklist above records remaining coverage.
