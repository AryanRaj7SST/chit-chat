# Hardened, privacy-focused

This application is hardened, privacy-focused. It is **not end-to-end encrypted**.
The server can read messages, captions, and profile About text. It decrypts them
to authorize access, return history, run Buddy, and search. Do not treat this app
as a confidential channel against its operator or a compromised server.

## What is protected

- HTTPS is expected in production. Exact client origins govern API/Socket.IO
  CORS; Helmet and the configured frontend CSP provide browser defenses.
- Passwords use salted bcrypt hashes at cost 12. New passwords need eight Unicode
  code points, must fit bcrypt's 72-byte limit, and cannot match a small common
  password list. Existing weaker hashes can still authenticate; eligible hashes
  are upgraded on successful login. Users with old weak passwords should change
  them. Login errors are generic and always perform a bcrypt comparison, including
  unknown users. This reduces timing differences; it is not a timing-proof claim.
- JWTs expire after 24 hours and include a database tokenVersion. Logout-all and
  password changes increment it, invalidate old REST/socket authentication, and
  disconnect that user's sockets. Socket packets recheck authentication/version.
- Rate limits are login 10/15 minutes per IP+normalized email, registration
  5/hour/IP, authenticated API 300/minute/user, and existing upload signing
  30/10 minutes/user. Sockets allow 20 sends and 60 typing events/10 seconds,
  bounded queued actions, at most 10 active sockets/user, and 1 MiB packets.
  Payload shapes are allowlisted; identity, membership, friendship/block checks
  remain server-controlled. Limits are per process and reset on restart; this
  single-instance design needs a shared store/adapter before horizontal scaling.
- Message.content, Message.caption, and User.about use AES-256-GCM at rest,
  with a random 12-byte IV and authenticated tag for every nonempty value. The
  stored format is v1:iv:tag:ciphertext, using base64 components. Empty values
  remain empty. Production refuses to start without a valid 32-byte base64
  MESSAGE_ENC_KEY. Development without it explicitly warns and writes plaintext.
  Reads accept legacy unprefixed plaintext so a staged migration is possible.
- This field encryption protects these fields in a leaked **database dump when
  the key is not leaked**. Names, emails, participant/sender IDs, timestamps,
  receipts, reactions, attachment keys, and other metadata are not encrypted by
  this field layer. Passwords are hashed separately. A stolen encryption key or
  server environment defeats this dump protection.
- Media is private with short-lived links. Objects are not made public; the app
  authorizes a media URL before issuing a 60-second signed capability. Upload
  capabilities last ten minutes and cannot overwrite existing objects. Image
  types, signed sizes, ownership, and signatures are checked. This AES field
  encryption does **not** encrypt media bytes; their privacy depends on the
  bucket, credentials, authorization, HTTPS, and the storage provider.
- JPEG location removal defaults ON. It removes APP1 Exif segments without
  re-encoding compressed image data. It does not remove XMP/IPTC or all possible
  metadata, and cannot promise every location trace is gone. Invalid JPEG parsing
  leaves the original intact and shows a warning. Removing EXIF also removes
  orientation; a viewer may display the original rotated. Other formats are
  unchanged. The toggle is available in the profile panel pending Phase 5.9.

## What is not protected

A compromised server, malicious operator, compromised browser/device, malicious
same-origin script, screenshots, recipient copies, or stolen bearer tokens can
expose content. JWTs live in localStorage and are readable by same-origin scripts;
CSP reduces some injection paths but does not eliminate this risk. The frontend
allows inline styles for its UI libraries but does not allow inline scripts or
eval. No raw HTML insertion is used to render messages.

Logout cannot recall downloaded content or independently revoke an already
issued R2 capability before it expires. Deletion and disappearing timers cannot
recall other people's copies or historical backups. Media cleanup runs every
five minutes while the backend is awake; storage failure/Render sleep can delay
physical cleanup. Media documents are excluded from automatic TTL until the
sweeper removes their objects. See docs/TESTING.md for these tested boundaries.

In-memory limits are not a DDoS defense or a distributed abuse-prevention service.
Render's edge and a correct proxy topology are part of the deployment boundary.
Production trusts one immediate proxy hop; development trusts loopback only.
Never expose an alternate direct production ingress or trust arbitrary forwarded
headers. Confirm client IP derivation and HTTPS in the actual Render deployment.

## Keys, migration, and search

Keep MESSAGE_ENC_KEY only on the backend and in a secure recovery backup separate
from database backups. Never put it in VITE_ variables, Vercel's client config,
logs, commits, or screenshots. Do not change it casually: v1 has no key ID and
automatic rotation is not implemented. Losing the key loses encrypted content.

Back up the database, configure a persistent key, pause application writes, then
run `npm run migrate:encryption` from server for a dry run. Review the counts;
run `npm run migrate:encryption -- --apply` to encrypt existing plaintext. Repeat
the dry run to verify zero pending changes. The script uses native conditional
updates to avoid overwriting changed rows and is idempotent. It logs counts only.
A malformed/reserved v1 prefix stops migration rather than silently treating
ciphertext as plaintext; investigate privately. Old plaintext backups are still
plaintext. New writes must go through the protected Mongoose fields; native
writes and update pipelines must not write protected text without encryption.

Encrypted text cannot be searched with database regexes. Search decrypts the
latest 500 visible, non-deleted messages of ONE authorized conversation in server
memory and returns at most 30 literal matches. Older messages outside that window
will not appear in search; history paging still works. There is no plaintext
search index or external search service.

The local security harness uses a temporary key only for disposable test data;
it never runs a global migration. Do not use its generated test key for real
accounts or expect its disposable ciphertext to remain readable after the run.

## Reporting an issue

Use the repository's **Security → Report a vulnerability** option if private
reporting is enabled. Otherwise contact the repository owner privately through
their published GitHub contact options. If none are available, open only a
non-sensitive issue asking for a private reporting channel. There is no dedicated
security email configured; do not invent or assume one.

Include the commit/version, affected feature, impact, and minimal reproduction
using disposable accounts. Do not send live credentials, keys, JWTs, signed URLs,
personal messages, or database dumps. Do not publish exploit details or real user
data in a public issue. Dependency audit and automated tests are evidence of
specific checks, not a security certification.
