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

## Buddy knowledge base (Phase 3.6)

Run `npm run test:kb` from `server`; neither a running server nor database is
needed. The six data files contain 242 original entries: DSA 75, JavaScript 40,
React 25, web development 45, backend 35, and CS basics 22. Each entry includes
a title for the topic browser, a unique ID, lowercase aliases, and an answer
bounded to 900 characters. Optional follow-up text is bounded to 700 characters.
No entries were removed because of uncertain accuracy; implementation assumptions
are stated where they affect complexity or runtime behavior.

The matcher precompiles escaped boundary patterns, checks raw and normalized
text, scores phrases by word count, and uses main-term and longest-match
tiebreaking. It is a deterministic keyword lookup, not a general reasoning model.
Commands run before small talk and concept matching. `topics` lists the six areas;
an area lists its first 20 titles. Any concept can still be requested directly.
`more`, `example`, and `explain again` refer to the last concept; without authored
follow-up text they repeat a short explanation line. `random`, `tip`,
`random tip`, and `teach me something` avoid repeats until the entry set is
exhausted. `quiz me` asks about a concept; `answer`, `show`, or `idk` reveals it.

Each user's learning context is process-local, expires after 30 minutes without
use, and is subject to a 1,000-user least-recently-used cap. A restart or eviction
clears context, while already saved chat messages remain in MongoDB. Multiple
backend instances do not share this learning context. No external AI request,
extra dependency, REST route, or socket event was introduced.

Observed local verification:

- `npm run test:kb`: `Total: 242 entries. All knowledge-base checks passed`.
  Checks include each file's quota, IDs/primary keywords, answer/follow-up bounds,
  balanced fences, self-retrieval of every entry, 25 specific concept probes,
  negative probes, and time/space notes in every DSA answer.
- `PASS - executed 52 JavaScript snippets (37 DSA)`: snippets are run in Node VM
  contexts with concrete expected results. These tests evaluate only repository
  content, never user chat text. Debounce construction is checked without a
  timing assertion; event-loop timing and browser-only API descriptions are not
  executable algorithm examples.
- Command tests cover isolated user state, random exhaustion/reset, quiz reveal,
  expiry with an injected clock, and capacity eviction.
- Running-backend `npm run verify`: `All checks passed`, including an actual
  socket `hii` greeting, binary search containing `O(log n)`, a DSA concept list,
  and quiz question/answer exchanges, alongside all earlier integration checks.
- Client `npm test`: `tests 10`, `pass 10`, `fail 0`, including fenced-code parsing,
  unfinished fences, literal HTML text, and multiple blocks.
- `npm run e2e`: `All browser checks passed`. Chromium checks Buddy-only chips
  through the normal ack/send path, a knowledge reply with code, successful copy,
  denied copy feedback, literal HTML rendering, quiz/reveal, and no page overflow
  at 320/375/768/1280px. Existing human messaging/read/presence/reconnect checks pass.
- Client `npm run build`: `✓ built in 1.04s`. Lint exits
  successfully with the previously documented React context/effect warnings.

Manual checks still needed:

- Review educational wording with a learner; the automated checks do not prove
  every explanatory claim or every possible input to an example algorithm.
- On deployed HTTPS, test Copy in Safari/Firefox and on a real phone, including
  denied clipboard permission, keyboard focus, and horizontal scrolling inside
  a long code block. Confirm the page itself stays within the viewport.
- In Buddy, try topics, each area, more before/after a concept, random tip,
  quiz me followed by show/idk, and an unknown question. Confirm human chats
  have no learning chips and greetings/jokes still behave normally.
- After a backend restart, confirm pending quiz/follow-up state has reset and
  saved learning messages still load. Hosted endpoints and real-time 30-minute
  expiry were not exercised here; the expiry test uses an injected clock.

Selected runtime details were cross-checked against primary references:
[MDN WeakMap](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap)
documents supported weak keys;
[React StrictMode](https://react.dev/reference/react/StrictMode) documents extra
development checks; [Web Vitals](https://web.dev/articles/vitals) describes
LCP/INP/CLS. The explanations in the knowledge files are original wording.

## Images, camera, and emoji (Phase 5.6)

For local checks, start the backend with STORAGE_DRIVER=local and
PUBLIC_API_URL matching its origin (for the test runs: http://localhost:5001),
and the client with its API/socket URLs pointing to that backend. Existing
server/.env secrets remain private and untracked. Local files go only into
gitignored server/.uploads. Production refuses this driver.

Automated commands:

- Server `npm test`: includes image magic-byte checks, path rejection,
  conditional image/text schema validation for documents AND atomic upserts,
  2,000-emoji boundaries, and production-local-storage rejection.
- Server `npm run verify`: includes SVG/oversize/thumb-size/non-member/Buddy
  signing rejection, a former friend's signing denial, owning-user JWT checks
  on local PUT, immutable uploads, trusted saved metadata, image retry identity,
  byte-for-byte SHA-256 download comparison, outsider media denial, traversal
  rejection, wrong magic bytes with a fake extension and physical local deletion,
  cross-conversation key rejection, direct Buddy image rejection, emoji limits,
  and the 30-attempt upload sign limiter. Remote runs report a SKIP for physical
  deletion inspection when the target storage is unavailable to the test runner.
- Client `npm test`: grapheme counting and one-to-three-emoji rendering decisions
  supplement message reconciliation, URL, date/read, and code-fence tests.
- Client `npm run e2e`: two separate user contexts exercise removable multi-photo
  previews, per-file progress, cancel/retry, live reception, thumbnail loading,
  original download SHA-256 equality, viewer navigation/zoom/Escape, persistence,
  and overflow/composer checks at 320/375/768/1024/1440px. The existing text,
  friendship, typing, presence, receipts, Buddy and theme regressions remain.
- Client `npm run test:media`: runs Chromium with fake camera hardware. It
  exercises real browser getUserMedia against that simulated device, capture,
  retake, facing-mode switch, track cleanup on close/capture/tab-hide, mocked
  permission denial, and Buddy's image refusal. It also tests lazy emoji cursor
  insertion, Escape/outside close, large emoji bubbles, touch-mode no-autofocus,
  40px targets, native capture-input preference, and a shortened 320px viewport.
  These are not real-device or real-camera results.
- `npm run build` produces separate emoji-picker chunks. The picker is imported
  through React.lazy rather than included eagerly in the main application path.

Original File objects are sent unchanged; only separate 480px-wide-or-smaller
JPEG previews use canvas quality 0.8. Camera capture creates a new JPEG at the
video's reported dimensions and quality 0.95. Preview decoding uses EXIF-aware
createImageBitmap. A thumbnail failure leaves a supported original sendable and
uses a file-style chat placeholder; click it to open/download the original.
GIF originals remain animated and PNG originals retain transparency. HEIC is
not in the requested server allowlist and is refused, rather than silently
converted and labeled as an untouched original.

Manual checklist (not verified automatically):

- [ ] Configure a private R2 bucket, scoped server credentials, and its separate
  CORS policy using [DEPLOYMENT.md](DEPLOYMENT.md). Verify PUT/GET in the hosted
  browser, including If-None-Match, and confirm unsigned URLs fail. No real R2
  request or deployment was performed during this phase.
- [ ] Compare original/download SHA-256 for a large JPEG, transparent PNG,
  animated GIF, and WebP. Check rotated EXIF photos on Safari/iOS and Android.
  Check the fallback when thumbnail decoding is unavailable.
- [ ] On actual camera hardware: deny permission, allow it, switch front/back,
  capture, retake, send, close, navigate away, and background the tab. Verify the
  OS camera indicator goes out. Check missing-device and insecure-context errors.
- [ ] On a real phone, use the native capture picker, check its full-quality
  output, and confirm pinch zoom/panning and viewer controls are usable.
- [ ] Open the actual mobile keyboard in portrait/landscape. Check composer,
  caption, preview tray, safe-area/notch insets, emoji popup, focus, and dismissal.
  Resizing a browser viewport does not simulate every mobile keyboard behavior.
- [ ] Try ten photos, remove some, paste/drop more, cancel during a large upload,
  go offline, reconnect, retry, and verify a send is never marked sent before ack.
- [ ] Let a signed image URL expire, revisit a lazy-loaded thumbnail, retry a
  failed photo, and test Download after expiry. Confirm logout clears URL cache.
- [ ] Review abandoned upload storage usage. Canceled/expired unused uploads need
  operational cleanup after checking both original AND thumbnail message refs;
  automatic orphan collection is outside this phase. Never delete all c/ objects
  by age because saved images share that prefix.

Real R2, real cameras, Safari/Firefox, physical-device keyboards, EXIF fixtures,
and long-running storage cleanup remain unverified. The per-process upload
limiter and learning/presence state are not coordinated across server instances.

Recorded local command output for this phase:

- Server verification: `All checks passed`, including
  `PASS - original upload/download is byte-for-byte identical (SHA-256)` and
  `PASS - invalid image object is removed from local storage`.
- Server unit tests: `tests 6`, `pass 6`, `fail 0`; knowledge tests:
  `Total: 242 entries. All knowledge-base checks passed`.
- Client unit tests: `tests 11`, `pass 11`, `fail 0`.
- Client production build: `✓ built in 1.07s`.
- Browser regression suite: `All browser checks passed`.
- Camera/emoji/touch suite: `All media UI checks passed` (simulated hardware).
- Lint exited 0 with React context-export, effect-state, ref-cleanup, and compiler
  optimization/purity warnings. Camera/photo effects add synchronization warnings;
  these are not presented as a warning-free lint run.

## Message features (Phase 5.7)

All eleven priority areas are implemented. The optional full reaction picker is
omitted; reactions use 👍 ❤️ 😂 😮 😢 🙏. No calls, status posts, groups, voice
notes, or service-worker push service were added. Phase 5.9's privacy settings UI
is intentionally not included: settings.readReceipts and settings.hidePreviews
exist now and default to true.

Behavior and contracts:

- One tick means the sender's acknowledgement arrived. Two neutral ticks mean
  the other participant's socket acknowledged message:delivered; violet ticks
  mean read. Delivery is persisted separately from read and remains monotonic
  through delayed acks/history. On reconnect, up to 1,000 undelivered messages
  are replayed with their persisted IDs for client deduplication. Private reads
  still update the reader's own unread count but do not expose their timestamps
  through REST or emit them to the other participant.
- replyTo is a same-conversation reference, never trusted client quote text.
  Replies to hidden/deleted/expired messages are unavailable. Quotes jump to and
  highlight a loaded original, fetching context if necessary. Touch uses a
  rightward swipe; desktop has hover/focus action controls.
- Reactions are updated atomically with one entry per user. Edit/delete actions
  use the authenticated sender and database timestamps, not payload identities.
  Text edits are limited to 15 minutes; delete-for-everyone to 48 hours. Hidden
  messages are filtered from the caller's history/search/previews/unread counts
  and hiddenFor is never serialized. Tombstones clear text/caption/media. Media
  deletion errors leave the message retryable rather than silently claiming
  successful removal; already downloaded copies cannot be recalled.
- History supports the original ISO before cursor plus ISO|messageId for ties.
  Older pages restore scroll height/position and merge by ID. q is a literal,
  escaped, case-insensitive content/caption search capped at 30; around returns
  the exact authorized target and older context. Deleted/hidden/expired messages
  are excluded. Search has no global directory or cross-conversation scope.
- ConversationSettings has one document per user with per-conversation pin,
  mute, and archive fields. An atomic update enforces three explicit pins even
  across instances. Buddy's existing first-row treatment is independent of
  explicit pins. Muted conversations retain unread badges but suppress browser
  notifications. Archived conversations appear under Archived.
- A directional Block record is enforced both ways for discovery, friend
  requests, sending, typing, message actions, and uploads. Blocking deletes the
  friendship/pending request and closes open chats on both sides. Unblocking
  removes only the caller's block and does not restore friendship. Saved history
  remains membership-readable. Signed URLs already issued remain short-lived
  bearer capabilities; they are not a mechanism for recalling downloaded data.
- Own profile updates accept name, About (140 graphemes), and validated avatar
  keys in u/<ownerId>/... storage. The original is retained unchanged; a separate
  thumbnail fits within 512px. Last seen is stored only after the final socket
  disconnects, with reconnect/presence checks preventing stale offline events.
- Disappearing timers apply to NEW messages only: Off, 1 hour, 24 hours, 7 days.
  Both current friends can change a timer and get a system notice. Text-only
  documents have a partial Mongo TTL index. Media documents are excluded from
  TTL so their keys cannot be lost before cleanup. A startup/five-minute sweep
  removes original/thumbnail objects first, then documents; on failure it keeps
  documents for retry. It handles at most 1,000 records per sweep. REST and the
  open chat hide expired messages immediately; physical cleanup can lag by a
  sweep interval, storage failure, or a sleeping/stopped Render service. Existing
  live references to a shared legacy object prevent premature byte deletion.
- Browser notifications are enabled only through the user's button click. They
  are generated only while the open tab is hidden, honor mute/read state, and
  default to a generic body without sender/content previews. They do not work
  as closed-browser/mobile push. Camera and notification automation both use
  simulated browser facilities, not real hardware/OS notifications.
- Buddy supports ticks/replies and delete-for-me, but refuses reactions, edits,
  delete-for-everyone, timers, and blocking. Its existing image refusal remains.

Automated coverage:

- Server `npm run verify` covers recipient-only delivery acknowledgements;
  same/foreign-conversation replies; outsider, invalid, concurrent, and removed
  reactions; non-sender/late edits/deletes; hidden-view isolation; literal search
  and outsider search; private read REST/event suppression; media deletion;
  per-user settings and pin cap; profile/About/avatar owner validation;
  timer permissions/options/notices; timestamp assignment; expired URL denial;
  TTL's media exclusion; cleanup failure/retry and physical object removal;
  blocking requests/messages/actions/uploads/search/avatar access; unblock
  isolation; and a new last-seen timestamp after final disconnect.
- Local-only helpers mutate timestamps/privacy only for IDs registered/created
  by that test run. They also check equal-timestamp cursors and target jumps.
  Remote BASE_URL runs print explicit SKIP lines for fixture mutation/physical
  storage inspection. Production never honors MESSAGE_EDIT_WINDOW_MS; it always
  uses 15 minutes. The override is development-only.
- Client unit tests check that newer revisions and delivery timestamps survive
  stale history, delayed send acknowledgements still clear pending state, and
  equal-timestamp pages retain persisted-ID order.
- Two-browser tests cover delivered/read/ack behavior, live replies/reactions/
  edits/deletes, quote highlights, literal search, anchored older history,
  pin/mute/archive controls, timer notices, and block/unblock navigation, alongside
  existing uploads/Buddy/theme/presence/mobile regressions. Notification tests
  mock only the Notification API and visibility; they check no automatic prompt,
  no visible-tab alert, generic private bodies, and mute suppression.
- The media UI suite additionally saves a name/About/avatar, reloads the profile,
  and verifies the rendered thumbnail's natural width is 512px. Simulated camera
  lifecycle and emoji/touch checks still run.

Manual checks still required:

- [ ] Test real OS notification permission/denial and hidden-tab delivery on
  HTTPS, including browser notification settings and unsupported mobile browsers.
  Check both hidePreviews values once Phase 5.9 exposes its settings UI.
- [ ] On two real phones, swipe to reply without interfering with vertical
  scroll, jump to old originals, react, and check focus/menus at 320px.
- [ ] Open two tabs for one user: hide/edit/delete in one while the other is
  loading history or awaiting a send ack. Confirm no stale snapshot restores
  deleted content and that the final tab controls last seen.
- [ ] On R2, delete an image for everyone and expire an image; verify BOTH keys
  are gone. Exercise storage permission/network failure and subsequent retry.
  No real R2 credentials, deployed endpoints, or storage outage were exercised.
- [ ] Observe a real 1-hour timer and Mongo's asynchronous text TTL monitor.
  Automation time-travels fixtures and invokes the sweeper directly; it does
  not wait an hour/five minutes or verify Render's sleeping-service behavior.
- [ ] Check profile avatar orientation/quality and Safari/Firefox rendering.
  Avatar/name changes on another user's already-open profile refresh on reload.
- [ ] Review abandoned c/ AND u/ uploads operationally. Reconcile Message
  attachment references AND User.avatar key/thumbKey references before deleting
  unused objects. Do not apply a blanket age-based deletion policy to either
  prefix; non-expiring messages and avatars must remain.

Final local command evidence:

- Server `npm run verify`: `All checks passed`, including
  `PASS - failed media cleanup preserves the expired document for retry`,
  `PASS - expired media bytes are physically removed`, and
  `PASS - private read updates are not emitted to the other participant`.
- Client `npm run build`: `✓ built in 1.18s`.
- Client `npm test`: `tests 13`, `pass 13`, `fail 0`; server `npm test`:
  `tests 6`, `pass 6`, `fail 0`.
- `npm run test:kb`: `Total: 242 entries. All knowledge-base checks passed`.
- Client `npm run e2e`: `All browser checks passed` with all message/chat controls,
  simulated Notification API privacy/mute checks, and earlier regression coverage.
- Client `npm run test:media`: `All media UI checks passed`, including the 512px
  avatar test and simulated-camera/touch coverage. The viewport assertion waits
  for visualViewport resize to settle before measuring the composer.
- Lint exited 0 with React context/effect, ref cleanup, and compiler optimization/
  purity warnings; this is not a warning-free lint run.

These results are local development evidence, not a production deployment.
