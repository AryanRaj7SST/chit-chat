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

For a hosted backend, wake its `/api/health` endpoint first, then run
`BASE_URL="<RENDER_URL>" npm run verify` from `server` (PowerShell:
`$env:BASE_URL = '<RENDER_URL>'`, then `npm run verify`). The script does not
require the production JWT secret: it explicitly skips the expired-token signing
check if the local secret differs. It also verifies an explicit WebSocket
connection. See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment order and setup.

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
  history arriving after a socket event, repeated events, and pending/failed
  deliveries staying unique without displaying sent before an acknowledgement.
- Browser: independent sessions, live messages and replies, unique messages after
  reload and reconnect, missed-message recovery, typing and draft clearing,
  multi-tab presence, offline state after closing a context, and 375px navigation.

## Manual checklist

- [ ] Search with fewer than two characters: no directory results. Check masked
  emails, Add/Pending/Cancel, Accept/Decline, request badges, and Chats/Requests.
- [ ] Add each other simultaneously in two browser sessions: one friendship,
  no duplicate requests, and online dots appear without refresh.
- [ ] Unfriend while the other user has the chat open, including while offline.
  Confirm sending/typing stops; re-friend and confirm saved history returns.
- [ ] Keep an unrelated third user open: it should not receive either person's
  status changes or friend events. Close one of several friend tabs, then the last.
- [ ] Chat with Buddy: hello, help, time/date, eight jokes, thanks, bye, friend/add,
  love/sad/bored and unknown text. Confirm automated label, typing, all-tab
  delivery, one welcome, and no request/unfriend menu. Test slow/lost acknowledgements.
- [ ] Restart the backend to confirm friendship persistence. The request limiter,
  presence and joke rotation are per-process memory and reset on restart.

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

## Phase 5 behavior and coverage

`Conversation.lastReadAt` is a MongoDB map serialized as
`{ "<participant id>": "<ISO timestamp>" }`. Existing conversations need no
migration: a missing position is treated as the Unix epoch. Existing participant
and unique `participantsKey` indexes are preserved.

- Client sends `message:read` with `{ conversationId }` after a visible open chat
  successfully loads history, receives messages, regains visibility, or
  reconnects. Hidden or failed history views are not marked read.
- Server validates membership in the update query, obtains the user ID and time
  itself, and advances that user's position with `$max`. Client-provided IDs or
  timestamps cannot set someone else's position. Read updates preserve
  `updatedAt`, so opening a conversation does not move it to the top.
- Server emits `message:read:update` with `{ conversationId, userId, at }` to
  both participant rooms, including the reader's other tabs. The optional socket
  acknowledgement contains `{ success: true, conversationId, userId, at }`;
  invalid or unauthorized requests receive `{ success: false, message }`.
- `GET /api/conversations` includes `unreadCount` for each conversation: messages
  by the other participant with `createdAt > my lastReadAt`. The sidebar uses
  these server counts, including after reload and reconnect. History also
  returns `lastReadAt` to restore receipt state after reconnect.
- My messages show a clock while sending, a single check after acknowledgement,
  and a double check when the other participant's position reaches the message's
  `createdAt`. Pending and failed sends remain retryable if the acknowledgement
  is lost, even when history already contains the persisted message.
- Date separators use the browser's local calendar with Today/Yesterday labels.
  Consecutive messages by one sender within five minutes share tighter spacing
  and corners. Long unbroken content wraps inside the bubble.
- Dark mode uses Tailwind v4's class-based `dark:` variant. The sidebar footer
  toggle persists `chat_theme` in localStorage; light is the initial default.
  Light and dark screenshots are written to ignored `client/test-results/`.

The API suite covers read authorization, server timestamps, independent unread
counts, multi-tab updates, persistence after disconnect, monotonic read positions,
and conversation ordering. Browser coverage includes a deliberately held send
acknowledgement, persistent badges, live/read receipts after reload, skeletons
with delayed requests, empty states, successful retries after injected history
and sidebar failures, keyboard focus, and overflow checks at 320/375/768/1280px.
The suite also checks the dark toggle and preference after reload. Unit tests
cover date boundaries, message groups, and out-of-order receipt timestamps.

Additional manual checks:

- [ ] With two real browser sessions, leave a chat in a background tab. Messages
  should remain unread until it becomes visible; then badges clear on all tabs.
- [ ] Check receipt timing and typing during rapid sends, switches, and unreliable
  networking. Automated tests cover controlled races, not every network timing.
- [ ] Inspect text contrast, focus rings, system font rendering, mobile keyboards,
  and reduced-motion settings on real devices in both themes.
- [ ] Leave a conversation across midnight, reopen it, and check date labels in
  the user's local timezone, including daylight-saving boundaries.
- [ ] Verify older conversations start with all messages from the other person
  unread until first opening, and that reconnect restores read checks.

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

## Phase 5 verification evidence

Executed on 2026-10-27 against the updated backend on port 5001 and development
client on port 5174:

- `npm run verify`: `All checks passed`, including
  `PASS - outsider cannot mark a conversation read`,
  `PASS - unread count survives socket disconnect`, and
  `PASS - rapid typing updates preserve the newest state`.
- `npm run build`: `✓ built in 1.11s`.
- `npm test`: `ℹ tests 6`, `ℹ pass 6`, `ℹ fail 0`.
- `npm run e2e`: `All browser checks passed`, including persistent unread badges,
  delayed send acknowledgements, live read checks, all four viewport widths,
  delayed-request skeletons, retries, keyboard focus, and the persisted theme.
- `npm run lint` exited successfully with warnings about context exports,
  effect-driven state updates, and ref cleanup; these warnings remain.

Light and dark desktop screenshots were inspected. Real-device rendering,
Safari/Firefox, production deployment, and every possible network race remain
manual checks.

## Friendships and Buddy verification

The updated local implementation was checked with the backend on port 5001 and
the development client on port 5174:

- `npm run verify`: `All checks passed`. This includes masked pending search,
  request/accept/decline/cancel events and role checks, reciprocal-request races,
  empty friend conversations, stranger-scoped presence, immediate accepted-friend
  dots, unfriend send/typing denial, re-friend history, Buddy welcome and replies,
  bot retry deduplication, and the 20-attempt request limit. Earlier messaging,
  JWT, read receipt, unread count and reconnect checks still pass.
- Client `npm run build`: `✓ built in 1.29s`.
- Server `npm test`: `ℹ pass 3`, `ℹ fail 0`; includes deterministic Buddy rules
  and all eight jokes. Client `npm test`: `ℹ pass 8`, `ℹ fail 0`.
- Browser `npm run e2e`: `All browser checks passed`, including cancellation and
  acceptance through the UI, confirmed unfriend closing the other chat, restored
  history on re-friend, Buddy's reply and missing unfriend menu, plus prior
  responsive, theme, typing, presence, read and retry-state coverage.
- The README contract audit covers 15 REST routes and 13 application socket
  events. No existing event name was changed.

Hosted deployment, Safari/Firefox, real-device rendering, hour-long limiter
rollover in real time, and an injected bot/database failure were not verified.
Use the manual checks above for unreliable networks and cross-device behavior.
