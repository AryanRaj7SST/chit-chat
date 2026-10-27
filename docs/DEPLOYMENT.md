# Deploy MERN Chat: Atlas, Render, Vercel

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
   and `CLIENT_URL` when prompted for unsynced environment variables.
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
| `CLIENT_URL` | Initially `http://localhost:5173`; replace with the actual Vercel origin after step 3 |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |

Use at least 32 random bytes for the JWT signing secret. Do not reuse an example
value. The Blueprint sets the last two values automatically. Render supplies
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

## Preparation verification evidence

The following checks were run locally against the updated code on 2026-10-27:

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
