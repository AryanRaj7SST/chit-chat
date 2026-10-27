# Recording checklist

## Prepare the environment

- [ ] Choose the recording target: the actual deployed URLs, or localhost.
  Record the target honestly; deployment preparation alone is not deployment.
- [ ] For Render Free, open the backend's `/api/health` endpoint and wait for
  its JSON response before opening the frontend. Waking an idle service can take
  about a minute. Wake it again before a take if it has gone idle.
  [Render's documented idle behavior](https://render.com/docs/free#spinning-down-on-idle).
- [ ] Check the deployment and exact frontend CORS origin using
  [DEPLOYMENT.md](DEPLOYMENT.md). Never show hosting environment panels, database
  connection strings, tokens, password managers, or `.env` files in the video.
- [ ] Run `npm run build` in `client` and `npm run verify` in `server` against
  the chosen, awake backend. Wait for real success output before recording.
  The API verification script leaves test accounts and messages in that database.
- [ ] Clear test data from the recording view. Prefer a separate demo database
  with database-user permissions for it. If reusing a development database,
  manually remove only identified disposable test records in Atlas's collection
  browser, checking filters before deletion. For a demo conversation reset,
  remove its messages and its conversation together. Preserve real users/data;
  neither the seed script nor this kit deletes anything automatically.
- [ ] Finish cleanup and verification before the final seed/rehearsal. Repeated
  verification against the recording database can repopulate the People list.

## Prepare two accounts and the screens

- [ ] For a local/development demo, point `server/.env` at the intended demo
  database and run `npm run seed:demo` from `server`. It creates or reuses:

  | Name | Email | Public demo password |
  | --- | --- | --- |
  | Alice Johnson | `alice.demo@example.com` | `DemoChat123!` |
  | Bob Smith | `bob.demo@example.com` | `DemoChat123!` |

  These are intentionally public demonstration credentials. The script refuses
  `NODE_ENV=production`, preserves existing messages, and does not replace an
  existing account with different details. Never point it at a real production
  database by changing `NODE_ENV` to bypass the guard.
- [ ] For a deployed demo, register two disposable accounts normally on the app.
  Use those identities in the narration; do not seed production. Do not reuse
  personal passwords or reveal non-demo credentials.
- [ ] Prepare one additional unused throwaway email for the registration shot.
  Registration with an already seeded email will correctly fail. After that
  shot, log out and log in as Alice for the main exchange.
- [ ] Include the friend flow before the first human message: Alice searches for
  Bob (2+ characters), chooses Add, and Bob accepts in Requests. If rehearsed
  accounts are already friends, unfriend them before this shot; their history
  remains. Buddy AI is always pinned, is automated, and needs no friend request.
- [ ] Open a normal window for Alice and a private/incognito window for Bob.
  Two normal tabs share localStorage and are not two independent accounts.
  If browser extensions disable incognito, use two separate browser profiles.
- [ ] Close all extra Bob tabs so closing the private window really makes Bob
  offline. Reopening a completely closed incognito session requires logging in.
- [ ] Close notifications and enable the operating system's Do Not Disturb.
  Hide bookmarks, personal tabs, chat apps, and unrelated desktop windows.
- [ ] Set browser zoom to **100%** in both windows. Set the recording canvas to
  **1920×1080**, or **1280×720** if needed, and check text readability in a short
  sample. Arrange the two browser windows side by side before capture.
- [ ] Prepare a **375px** responsive viewport preset. Dock developer tools away
  from the captured area where possible; do not open storage or request headers.
- [ ] Check microphone level, disable feedback, and record a ten-second audio
  sample. Keep the pointer still while narrating explanations.
- [ ] Rehearse the exact message text and timestamps in
  [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md). Do not preload a fake successful result.

## Transitions during the take

- Start with a clean login screen; use a short cut into the prepared two-window
  layout after the register/login demonstration.
- Move the pointer to the destination window before typing. Hold both screens
  still long enough for the viewer to see each incoming message.
- Pause after refresh and after closing Bob's window. Keep the final visible
  result in the recording; shorten uneventful waiting with a transparent cut.
- Resize once to 375px, demonstrate the back button, then restore desktop width.
  Avoid repeatedly dragging the browser while speaking.
- Use one clean cut to the architecture diagram for the last 30-second section,
  then return to the app for the closing sentence. Avoid heavy transitions.

## Fallback: record on localhost

If the deployed app does not recover after waking and a refresh, stop the take.
Do not claim that a broken hosted action succeeded. Switch to a prepared local
setup and state “This demonstration is running locally” in the introduction.

1. Use a development/demo MongoDB database that your local backend can access.
   Keep its URI and a development JWT secret only in ignored `server/.env`.
   Ensure `NODE_ENV` is not production for this separate development setup.
2. Set these public settings in the ignored environment files:

   ```dotenv
   # server/.env (alongside your private database URI and signing secret)
   PORT=5000
   CLIENT_URL=http://localhost:5173

   # client/.env
   VITE_API_URL=http://localhost:5000/api
   VITE_SOCKET_URL=http://localhost:5000
   ```

3. In `server`, run `npm ci` if dependencies are missing, `npm run seed:demo`,
   then `npm run dev`. Leave that terminal running outside the capture.
4. In another terminal in `client`, run `npm ci` if needed, then `npm run dev`.
5. Open `http://localhost:5000/api/health`, then open `http://localhost:5173` in
   the normal and private windows. Confirm Vite actually uses port 5173; if it
   chooses a different port, free the intended port or update `CLIENT_URL`.
6. Run `npm run verify` from another `server` terminal. If `BASE_URL` was set for
   production earlier, set it to `http://localhost:5000` for this run. Check the
   test output, clean only disposable test data from the recording view, and
   repeat the normal rehearsal before starting the new take.

## Review before submitting

- [ ] The take is four to five minutes and follows the requested sequence.
- [ ] Both users, request/accept, live delivery, persistence, online/offline, typing, responsive
  navigation, and the architecture explanation are actually visible.
- [ ] No credentials other than the intentionally public demo credentials are
  exposed. No real user messages or personal notifications appear.
- [ ] The narration matches the environment and behavior actually recorded.
- [ ] Play back the exported file to check audio, legibility, cuts, and duration.
