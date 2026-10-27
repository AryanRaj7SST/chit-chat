# Deploy chit-chat: Atlas, Render, Vercel

This guide prepares a deployment; it does not record a completed deployment.
The Render and Vercel CLIs were not installed in the preparation environment.
Use the dashboards below. Replace `<RENDER_URL>` and `<VERCEL_URL>` with the
actual HTTPS origins assigned to your services, without a trailing slash.

Order: configure Atlas, deploy the backend on Render, deploy the frontend on
Vercel, then update Render's `CLIENT_URL` and redeploy the backend.

## 1. MongoDB Atlas

1. Sign in at [Atlas](https://cloud.mongodb.com/) and select your organization
   and project. If needed, create a project, open **Database / Clusters**, click
   **Create**, choose the **Free** cluster option, select a region, and create it.
   An existing cluster can also be used.
2. Open **Security → Database Access → Add New Database User**. Choose
   **Password**, enter your own database username, and generate/store a strong
   password in your password manager. This is a database user, separate from
   your Atlas login.
3. Under privileges, choose **Add Specific Privileges**, select `readWrite`,
   and set the database to `mern-chat` (all collections). Click **Add User**.
   See [Atlas database users](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).
4. Open **Security → Network Access → Add IP Address**. Click **Allow Access
   from Anywhere** or enter `0.0.0.0/0`; click **Confirm** and wait until active.
   This permits connections from any IPv4 address; database authentication is
   still required. See [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
5. Return to **Database / Clusters**, click **Connect → Drivers**, and select
   **Node.js**. Copy the connection string into a private editor or password
   manager. Substitute your database username/password; percent-encode reserved
   characters in those credential components. Add `/mern-chat` before `?`:

   ```text
   mongodb+srv://<DB_USER>:<URL_ENCODED_DB_PASSWORD>@<ATLAS_HOST>/mern-chat?retryWrites=true&w=majority
   ```

   Keep any Atlas-provided connection options. Paste the completed URI only into
   Render's `MONGO_URI`, never into Git, screenshots, logs, or client settings.
   MongoDB creates the database/collections when the app first writes data.
   See [MongoDB connection strings](https://www.mongodb.com/docs/manual/reference/connection-string/).

## 2. Render backend first

Use **one** of the following creation methods.

### Blueprint method (uses the committed render.yaml)

1. Sign in at [Render](https://dashboard.render.com/).
2. Click **New → Blueprint**. Connect GitHub if prompted, then click **Connect**
   beside `AryanRaj7SST/chit-chat`.
3. Choose branch **main** and Blueprint path **render.yaml** at the repository
   root. Name the Blueprint as you prefer.
4. Review the web service configuration below. Supply `MONGO_URI`, `JWT_SECRET`,
   `MESSAGE_ENC_KEY`, storage credentials, and `CLIENT_URL` when prompted for unsynced environment variables.
5. Click **Deploy Blueprint** and open the created web service's **Logs**.

These steps follow [Render's Blueprint setup](https://render.com/docs/infrastructure-as-code).
Secrets use `sync: false`, so they are supplied in the dashboard; new unsynced
variables must be added manually on later updates.
[Blueprint environment variables](https://render.com/docs/blueprint-spec#setting-environment-variables).

### Manual Web Service method (alternative)

1. Click **New → Web Service**, connect GitHub, and select the same repository.
2. Select branch **main**, runtime **Node**, and instance type **Free**.
3. Set **Root Directory** to `server`, **Build Command** to `npm install`, and
   **Start Command** to `npm start`.
4. In **Advanced**, set **Health Check Path** to `/api/health`.
5. Add the environment values below, then click **Deploy Web Service**.

See [Render's Express guide](https://render.com/docs/deploy-node-express-app).

### Backend settings for either method

| Variable | Value to enter |
| --- | --- |
| `MONGO_URI` | Your private Atlas URI containing `/mern-chat` |
| `JWT_SECRET` | A new, long random secret from your password manager; store it only on Render |
| `MESSAGE_ENC_KEY` | A persistent base64-encoded 32-byte random key; backend only, backed up separately from the database |
| `CLIENT_URL` | Initially `http://localhost:5173`; replace with the actual Vercel origin after step 3 |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |
| `STORAGE_DRIVER` | `r2` (required in production) |
| `R2_ACCOUNT_ID` | Your Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Private bucket-scoped object read/write key |
| `R2_SECRET_ACCESS_KEY` | Private secret returned with that key |
| `R2_BUCKET` | Name of your PRIVATE R2 bucket |

Use at least 32 random bytes for the JWT signing secret. Do not reuse an example
value. The Blueprint sets NODE_ENV and NODE_VERSION automatically. Render supplies
`PORT`; leave it unset in the dashboard. The app reads it and binds `0.0.0.0`.
Node 24 is selected explicitly because an unbounded `engines.node` range can
otherwise select a newer major release.
[Render Node versions](https://render.com/docs/node-version).

Wait for the service to become **Live**, copy its actual `https://...onrender.com`
URL, and open `<RENDER_URL>/api/health`. The expected response is:

```json
{"success":true,"message":"API is running"}
```

This is an expected response, not a claim that a deployed service has been
verified. The server connects to MongoDB before it starts listening.

## 3. Vercel frontend second

Before importing, complete the CSP configuration in the security rollout section
below and push that public configuration. The sample `example.invalid` origins
are intentionally unusable; deploying them will block connections and media.

1. Sign in at [Vercel](https://vercel.com/), click **Add New → Project**, connect
   GitHub if needed, and **Import** `AryanRaj7SST/chit-chat`.
2. Set **Framework Preset** to **Vite**. Click **Edit** beside **Root Directory**
   and choose `client`.
3. Confirm **Build Command** is `npm run build` and **Output Directory** is
   `dist`. Use Node **24.x** in the project's Node.js settings.
4. Expand **Environment Variables**. Add the following for **Production**:

   | Variable | Value |
   | --- | --- |
   | `VITE_API_URL` | `<RENDER_URL>/api` |
   | `VITE_SOCKET_URL` | `<RENDER_URL>` |

5. Click **Deploy**. Once ready, copy the project's production `https://...vercel.app`
   origin. Frontend API calls may fail until the next step authorizes this origin.

These import settings follow [Vercel's Git deployment guide](https://vercel.com/docs/git).
`client/vercel.json` rewrites SPA routes to `index.html`, so `/login` and
`/register` can load directly on refresh.
[Vite SPA routing on Vercel](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas).

Both URLs are public build-time settings. `VITE_API_URL` must end with `/api`;
`VITE_SOCKET_URL` must be the backend origin, without `/api` or `/socket.io`.
The client fails validation if either is missing or malformed; it has no
hardcoded API host or fallback to the frontend origin. After changing a Vercel
environment value, open **Deployments → latest deployment → Redeploy** to
rebuild the client. Never put `MONGO_URI` or `JWT_SECRET` in Vercel or any
`VITE_*` variable.

## 4. Authorize the frontend on Render, then redeploy

1. Return to the Render web service and open **Environment → Edit**.
2. Replace `CLIENT_URL` with the actual Vercel production origin. To allow both
   hosted and local clients, use `<VERCEL_URL>,http://localhost:5173` instead.
   Commas separate origins; whitespace and trailing slashes are removed. Use
   exact origins with scheme, no `/login` or other path, and no wildcard.
3. Click **Save, rebuild, and deploy** (or **Save Changes**, followed by
   **Manual Deploy → Deploy latest commit** if the UI does not redeploy).
4. Wait for **Live**, then reload Vercel. Add any custom domain or specific
   preview deployment origin to this same list before using it. Preview origins
   are not automatically authorized. The same list is used by HTTP and Socket.IO.

## 5. Wake, verify, and record

Render's Free web service sleeps after about 15 minutes without inbound traffic.
The first request or new socket connection can take about one minute to wake it.
Before tests or recording, open `<RENDER_URL>/api/health` and wait for the JSON
response, then refresh the frontend.
[Render free service behavior](https://render.com/docs/free#spinning-down-on-idle).

From the repository's `server` directory, install development dependencies with
`npm ci` if needed. Run against the actual backend origin (not the frontend, and
without `/api`):

```powershell
# Windows PowerShell: replace the placeholder with your actual Render origin.
$env:BASE_URL = '<RENDER_URL>'
npm run verify
```

```sh
# macOS/Linux shell, from server:
BASE_URL="<RENDER_URL>" npm run verify
```

Only `BASE_URL` is needed to test the hosted API, authenticated Socket.IO,
explicit WebSocket transport, memberships, unread counts, and receipts. If the
local `JWT_SECRET` cannot verify the remote server's token, the suite prints
`SKIP - expired-token signing check`; all other checks still run. Do not copy a
production signing secret locally just for this test. Local verification with
the matching development secret also tests expired-token rejection.

The suite creates test users, conversations, and messages in the target database
and leaves them there. It does not delete any data. A timeout while waking the
Free instance is not a passing run: wake `/api/health` first and rerun.

Manual checks after both deployments:

- [ ] Refresh `/login` and `/register` directly on Vercel: no hosting 404.
- [ ] Register two users in separate browser sessions. Send and reply without
  refreshing after sending/accepting a friend request; confirm saved history after reload, typing, presence, badges, and
  read checks.
- [ ] Confirm Buddy AI appears for a newly registered and an existing user and
  replies without any external AI key. Startup ensures the bot and friendship
  indexes; use a database role allowed to create indexes. Never assign the
  reserved buddy@buddy-ai.local address to a human account.
- [ ] In browser Network tools, confirm API requests go to Render under `/api`,
  and Socket.IO upgrades to WebSocket (`101 Switching Protocols`).
- [ ] If the browser reports CORS errors, check that Render's `CLIENT_URL`
  contains the exact frontend origin and that its redeployment finished. Node
  CLI tests alone do not enforce browser CORS; local automated tests cover both
  HTTP and Socket.IO polling CORS, but the hosted browser check is still needed.
- [ ] Follow the remaining real-device checks in [TESTING.md](TESTING.md).

Send the actual Render and Vercel URLs after deployment. The next verification
will target those URLs and report the real command output. No hosted deployment
or production test has been performed during this preparation phase.

## Private image storage added in Phase 5.6

Configure this before deploying Phase 5.6: a production server refuses the local
driver, including when STORAGE_DRIVER is unset and would default to local.
No R2 bucket or credentials were created or exercised during local testing.

1. In the Cloudflare dashboard, open **R2 Object Storage** and choose
   **Create bucket**. Choose a bucket name and create it. Leave public access,
   r2.dev access, and public custom domains disabled.
2. Open **Manage R2 API Tokens** and create an account API token with
   **Object Read & Write** permission restricted to this bucket. Copy the
   access key ID and secret directly into Render environment settings; do not
   paste them into source files, terminal commands, screenshots, or Vercel.
   Also copy the account ID shown with the S3 endpoint.
3. On Render, open the backend's **Environment** page. Set STORAGE_DRIVER=r2,
   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.
   The root render.yaml lists these settings. PUBLIC_API_URL is only needed
   for the local driver and is not required for R2.
4. Open the bucket's **Settings → CORS policy → Add**. Apply this policy with
   your actual frontend origin replacing the example. Add a localhost origin
   only if you intentionally test this R2 bucket from your development client:

   ```json
   [{
     "AllowedOrigins": ["https://your-client.vercel.app"],
     "AllowedMethods": ["GET", "HEAD", "PUT"],
     "AllowedHeaders": ["Content-Type", "Content-Length", "If-None-Match"],
     "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
     "MaxAgeSeconds": 3600
   }]
   ```

5. Keep Render's CLIENT_URL configured separately. It governs the application
   API and Socket.IO, while the bucket CORS policy governs direct image PUT/GET.
   Redeploy Render after saving its environment settings, then rebuild/redeploy
   Vercel for the new client. Never add R2 secrets to any VITE_ variable.

6. With two accepted-friend accounts, send a photo and download its original.
   Compare hashes, refresh history, test an expired link, and confirm an outsider
   cannot request its media URL. Try GIF/PNG transparency and a rotated camera
   JPEG. An unsigned bucket URL must remain inaccessible.

### Supabase Storage (S3-compatible alternative)

Supabase Storage can be used instead of R2 through its S3 protocol. This keeps
the bucket private and uses presigned URLs; the application does not receive
Supabase service-role credentials.

1. In the Supabase dashboard, open **Storage → Buckets**, create a **private**
   bucket named `chit-chat`, and leave public access disabled.
2. Open **Storage → S3 Connection** and enable the S3 connection. Copy the
   endpoint and note the S3 region shown by Supabase.
3. Create an S3 access key with access to the `chit-chat` bucket. Keep the
   access key ID and secret in a password manager; do not put them in Git,
   screenshots, Vercel, or client-side variables.
4. On Render, set these backend environment variables:

   | Variable | Value |
   | --- | --- |
   | `STORAGE_DRIVER` | `s3` |
   | `S3_ENDPOINT` | Supabase S3 endpoint |
   | `S3_REGION` | Supabase S3 region |
   | `S3_ACCESS_KEY_ID` | Supabase S3 access key ID |
   | `S3_SECRET_ACCESS_KEY` | Supabase S3 secret access key |
   | `S3_BUCKET` | `chit-chat` |
   | `MEDIA_ENABLED` | `true` |

   `S3_ENDPOINT` must be the S3 endpoint, not the normal Supabase project URL.
   Do not set R2 credentials for this driver. The server validates every
   required S3 variable during startup and names the missing variable if one is
   absent.
5. Configure the Supabase Storage S3 CORS policy for the exact frontend origin
   and allow `PUT` with the signed `Content-Type` and `If-None-Match` headers.
   Include `http://localhost:5173` only when testing from the local client.
   Run `npm run storage:check` from `server` with the Render-equivalent
   environment to print the preflight headers and verify the upload, range
   read, download hash, and cleanup. A Node check cannot prove that a browser
   upload succeeds; test the hosted browser separately.

The client uploads original image data to ten-minute signed PUT URLs and uses
separate JPEG thumbnails. Default-on JPEG privacy removal changes APP1 Exif
metadata bytes without re-encoding pixel data; disable the profile toggle when
testing full-file hashes with EXIF-bearing JPEGs. If-None-Match prevents overwriting an existing object;
R2 documents atomic create-once conditional writes in its
[S3 compatibility reference](https://developers.cloudflare.com/r2/api/s3/api/).
Signed download URLs last 60 seconds; clients cache them in memory for 50 seconds.
Treat all signed links as temporary bearer capabilities and avoid logging them.
See Cloudflare's [CORS guide](https://developers.cloudflare.com/r2/buckets/cors/)
and [token guide](https://developers.cloudflare.com/r2/api/tokens/).

The local driver uses server/.uploads, which must remain untracked, and is not a
durable production option. Upload metadata is persisted in MongoDB. Signing
expires after an hour for an unclaimed upload; signed PUT capabilities expire
after ten minutes. Canceling a request cannot guarantee that an already in-flight
R2 write is canceled. Unused/abandoned original or thumbnail objects are not
automatically garbage-collected in this phase. Periodically reconcile expired
Upload records against BOTH attachments.key and attachments.thumbKey in Message
before deleting unused objects. Do not apply a blanket age-based deletion policy
to the c/ prefix: that would also delete saved conversation photos. The sign
limiter is per server process and resets on restart.

HEIC is deliberately refused because the allowed storage formats are JPEG,
PNG, WebP, and GIF. A supported original is still sent if its optional thumbnail
cannot be decoded/generated. Camera captures are new JPEG files at the browser's
reported capture resolution and quality 0.95; originals chosen from disk/native
camera are not recompressed by the app.

Phase 5.7 also stores private avatars under u/<userId>/... in the same bucket.
No additional R2 credentials or public access are needed. Operational orphan
cleanup must check User.avatar.key/thumbKey as well as Message attachments.

Startup builds the Message expiry indexes. Keep the TTL index partial with
hasMedia=false; do not replace it with an unconditional TTL on expireAt. The
server sweeper must retain media documents until their object deletions succeed,
then remove the documents. It runs on startup and every five minutes while the
backend is awake. Render sleep or an outage can delay physical byte deletion;
REST and the client still hide expired messages at their deadline. Mongo TTL
deletion itself is asynchronous, as described in the
[MongoDB TTL reference](https://www.mongodb.com/docs/manual/core/index-ttl/).
The separate compound expiry index supports sweeper lookups. Check startup/index
creation errors before deploying against an existing manually modified database.

Browser notifications need HTTPS and explicit user permission; no provider push
credentials or service worker were added. MESSAGE_EDIT_WINDOW_MS is optional
for development tests and ignored in production. Production always uses the
15-minute edit limit and 48-hour delete-for-everyone limit.

## Security hardening rollout (Phase 5.8)

This app is hardened, privacy-focused. The server can read messages. Encryption
at rest protects encrypted text fields in a leaked database dump without its
key; it does not protect against a compromised server. Read [SECURITY.md](../SECURITY.md).

### Persistent key and existing data

1. Back up the database privately. Schedule a maintenance window and pause
   application writes before migrating. Do not run a global migration against
   a database with an unknown encryption key.
2. From `server`, run `npm run key:create` only if no key is configured. It
   generates 32 random bytes directly into ignored `server/.env`, never prints
   them, and refuses accidental replacement. Open that file privately in your
   editor, save the key in a password manager, and copy it into Render's
   **Environment → Add Environment Variable → MESSAGE_ENC_KEY**. Do not show the
   file while recording. An existing deployment must reuse its existing key.
3. Ensure the migration process has the SAME `MESSAGE_ENC_KEY` and intended
   `MONGO_URI` privately configured. From `server`, run:

   ```sh
   npm run migrate:encryption
   npm run migrate:encryption -- --apply
   npm run migrate:encryption
   ```

   The first command is a dry run. Review counts before applying; the final dry
   run should report zero pending changes. The script encrypts Message.content,
   Message.caption, and User.about using conditional native updates and skips
   already-encrypted values. It authenticates existing v1 values and stops on
   a wrong key, malformed envelope, or ambiguous legacy v1-prefixed text.
   Investigate privately rather than overwriting unreadable data.
4. Save Render's environment and redeploy, then resume writes after verification.
   Production startup refuses a missing/invalid key. Development without a key
   warns and writes plaintext; it is not an encrypted deployment. Old unprefixed
   plaintext remains readable during migration. Old backups remain plaintext.
5. Retain the key for recovery. Changing it makes existing encrypted text
   unreadable; automatic key rotation is not implemented. All pre-hardening JWTs
   are invalidated by the new token format; sign in again. New JWTs last 24 hours.

No full-database migration was performed during local verification. The isolated
security harness encrypts only disposable fixtures using a temporary child-process
key, removes those accounts afterward, and never saves that key to `.env`.
Never use that ephemeral test key for actual accounts.

### Fill the static frontend CSP before deployment

`client/vercel.json` contains sample API/socket/R2 origins and security headers.
Vercel does not interpolate environment placeholders in this static file. The
configuration must contain your actual public origins before Vercel reads it;
changing a build-time environment variable alone does not update these headers.

1. In ignored `client/.env.production.local` (or your local process environment),
   set public values only:

   ```text
   VITE_API_URL=https://<actual-render-host>/api
   VITE_SOCKET_URL=https://<actual-render-host>
   CSP_S3_ORIGIN=https://<project-ref>.storage.supabase.co
   CSP_SUPABASE_ORIGIN=https://<project-ref>.supabase.co
   # Or use CSP_R2_ORIGIN=https://<account-id>.r2.cloudflarestorage.com for R2.
   ```

   Use the exact R2 S3 origin used by signed URLs; do not enable public bucket
   access or put R2 credentials here. API/socket origins can be the same.
2. From `client`, run `npm run configure:csp`. Set `CSP_S3_ORIGIN` for Supabase Storage or `CSP_R2_ORIGIN` for R2, then review `git diff -- vercel.json`.
   The helper writes the API origin, socket HTTPS and WSS origins, and R2 origin
   into connect-src; images allow self/blob/data/API/R2. Scripts allow self only;
   styles allow self and unsafe-inline for UI-library styles. Other directives
   deny framing/objects and restrict form actions/base URLs to self.
3. Commit and push the public `vercel.json` origin configuration before importing
   or redeploying Vercel. Keep the SPA rewrite and no-referrer/nosniff headers.
   Permissions-Policy allows camera only for self and denies microphone,
   geolocation, and payment. No secret is needed by this helper.
4. Keep Vercel's `VITE_API_URL`/`VITE_SOCKET_URL` settings aligned, redeploy, and
   check DevTools for CSP violations while logging in, chatting, opening the
   emoji picker, viewing/downloading images, changing an avatar, and using camera.
   Repeat CSP generation/review/deployment whenever a public backend/storage
   origin changes. Preview deployments need their own matching configuration.

See [Vercel header configuration](https://vercel.com/docs/project-configuration/vercel-json#headers).
The local production-asset browser test exercises the same policy with local
origins, not an actual Vercel deployment or R2 bucket.

### Proxy, rate limits, and search checks

Production trusts one immediate proxy hop for Render's managed ingress;
development trusts loopback only. Confirm on Render that different clients
produce distinct limiter identities and forged forwarded chains cannot bypass
limits. Do not expose a shorter direct ingress path. Reassess this setting if
adding another proxy; see [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/).
In-memory rate limits, presence, and socket caps assume one backend process;
multi-instance deployment needs shared limits and a Socket.IO adapter.

Message search now decrypts only the last 500 visible messages of the authorized
conversation in server memory and returns up to 30 literal matches. Older
messages can be paged but will not appear in search. No plaintext search index
is stored. The profile's photo-location toggle defaults ON; invalid JPEG parsing
keeps the original and warns, and EXIF removal may change orientation. XMP/IPTC
and non-JPEG metadata are outside this removal scope.

## Preparation verification evidence (Phase 6)

The following checks were run locally against the Phase 6 code on 2026-10-27:

- Client `npm run build`: `✓ built in 1.14s`.
- Client `npm test`: `ℹ tests 8`, `ℹ pass 8`, `ℹ fail 0`.
- Server `npm test`: `ℹ tests 2`, `ℹ pass 2`, `ℹ fail 0`, including HTTP and
  Socket.IO polling CORS with multiple allowed origins and an unlisted origin.
- Server `BASE_URL=http://localhost:5001/ npm run verify`: `All checks passed`,
  including `PASS - WebSocket transport connects with JWT` and expired-token
  rejection using the matching development secret.
- A separate local verification run with `JWT_SECRET` removed after dotenv
  loading reported the explicit expired-token `SKIP` and `All checks passed`.
- Client `npm run e2e`: `All browser checks passed`, with a comma-separated,
  whitespace/trailing-slash `CLIENT_URL` configuration on the local server.
- Vercel rewrite JSON and server package/lockfile engine metadata were checked.
  Provider-side Blueprint validation and Vercel routing are still unverified.

The deployment dashboards, real hosted endpoints, and hosted WebSocket/CORS
behavior require the deployment steps above. These results do not indicate a
Render or Vercel deployment.
