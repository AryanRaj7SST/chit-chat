# Chit-Chat

## Project Name

**Chit-Chat** is a MERN-based one-to-one messaging application with realtime
communication, friend management, privacy controls, and optional image sharing.

## Problem Statement

Many lightweight chat applications separate basic messaging from friend
management, privacy controls, and account tools. Users need a simple place to
find friends, communicate in realtime, manage message visibility, and control
their profile and privacy settings without a complicated interface.

## Target Users

- Students and small groups of friends who need private one-to-one messaging.
- Users who want realtime chat without managing a large social platform.
- Users who need basic account, privacy, blocking, and data-export controls.
- Demonstration and coursework users evaluating a React, Express, MongoDB, and
  Socket.IO application.

## Solution

Chit-Chat provides authenticated one-to-one conversations. Users can register,
search for other users, send and accept friend requests, and exchange messages
over Socket.IO. REST endpoints handle authentication, user and friendship
operations, conversation history, profile settings, and signed media URLs.
MongoDB stores users, relationships, conversations, messages, and upload
metadata.

The application also includes Buddy AI for supported text interactions,
optional original-quality image sharing, disappearing-message timers, blocking,
message search, and account export/deletion tools.

## Key Features

Users can:

- Register, log in, inspect the current account, change a password, and log out
  all devices.
- Search for users by name or email and send, accept, decline, cancel, or
  remove friend relationships.
- Start and access one-to-one conversations with accepted friends.
- Send text messages and receive them in realtime.
- See online presence, typing indicators, delivery/read state, and message
  notifications within the application.
- Reply to messages, edit recent text messages, react with supported emoji,
  delete messages for themselves, or delete eligible messages for everyone.
- Configure disappearing-message timers for supported conversations.
- Search messages in a conversation.
- Block and unblock users.
- Change themes, accent colors, chat wallpapers, font size, bubble style,
  density, presence visibility, notification preferences, and other settings.
- Edit profile name/about information.
- Export account data and permanently delete the account.
- Interact with Buddy AI through supported text commands and knowledge areas.
- When media is enabled, select or capture supported JPEG, PNG, WebP, or GIF
  images, send originals with optional thumbnails, add captions, and view
  signed media URLs.
- When JPEG privacy removal is enabled, remove JPEG EXIF location metadata
  before sending the client-side image copy.

The application does **not** provide end-to-end encryption or Signal-level
security. Message encryption at rest is a separate server-side protection:
`MESSAGE_ENC_KEY` enables authenticated encryption for protected stored fields;
it does not prevent the server from reading messages during normal operation.

## Tech Stack

- **Frontend:** React 19, Vite, React Router, Axios, Socket.IO Client,
  Tailwind CSS v4, Lucide React, `emoji-picker-react`
- **Backend:** Node.js, Express, Socket.IO, JWT, bcryptjs, Helmet, CORS
- **Database:** MongoDB with Mongoose
- **Media storage:** Local development storage, Cloudflare R2, or an S3-compatible
  provider such as Supabase Storage using AWS SDK v3 presigned URLs
- **Validation/testing:** Node's built-in test runner, Oxlint, Playwright
  scripts, and application verification scripts
- **Deployment:** Vercel frontend, Render backend, MongoDB Atlas database

## Architecture

```text
React
  |-- Axios REST ------------------------------\
  |                                             \
  |-- Socket.IO -------------------------------> Express
                                                |-- JWT middleware
                                                |-- Socket handlers
                                                |-- Controllers/services
                                                |
                                                v
                                             MongoDB
```

The frontend uses Axios for request/response operations such as authentication,
friendships, conversation history, profile settings, and media URL requests.
It uses Socket.IO for connection authentication, realtime messages, presence,
typing, delivery/read updates, and message actions. Express validates JWTs and
request permissions, while Socket.IO authenticates the same JWT and routes
event handlers. Mongoose persists application data in MongoDB.

### How a message travels

For a text message, the React chat window emits `message:send` through the
authenticated Socket.IO connection. The server validates the socket identity,
conversation membership, friendship state, message content, and optional
reply target. It writes the message to MongoDB, updates the conversation
preview, and emits the resulting message to the relevant user rooms. For an
image message, the client first requests a signed upload URL through
`POST /api/uploads/sign`, uploads the bytes directly to the configured storage
provider, and then sends the resulting storage key through `message:send`.
The server validates the stored object before persisting the attachment.

## Local Setup

Requirements:

- Node.js **20.19 or newer**
- MongoDB Atlas or another MongoDB deployment
- PowerShell on Windows

From the repository root:

```powershell
git clone https://github.com/AryanRaj7SST/chit-chat.git
Set-Location .\chit-chat
```

Install dependencies:

```powershell
Set-Location .\server
npm install
Set-Location ..\client
npm install
```

Create local environment files from the committed examples:

```powershell
Set-Location ..\server
Copy-Item .env.example .env
Set-Location ..\client
Copy-Item .env.example .env
```

Fill the server `.env` with a MongoDB URI, JWT secret, and the local-development
settings described below. For local media, use `MEDIA_ENABLED=true` and
`STORAGE_DRIVER=local`. Local storage is disabled when `NODE_ENV=production`.

Run the backend in one PowerShell window:

```powershell
Set-Location .\server
npm run dev
```

Run the frontend in another PowerShell window:

```powershell
Set-Location .\client
npm run dev
```

The default local URLs are `http://localhost:5000` for the backend and
`http://localhost:5173` for the frontend.

## Environment Variables

### Server: `server/.env`

Use placeholders only in shared examples. Never commit completed secrets.

```dotenv
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/mern-chat
JWT_SECRET=<long-random-secret>
MESSAGE_ENC_KEY=<base64-encoded-32-byte-key>
CLIENT_URL=http://localhost:5173

# Set false to run without storage credentials or media operations.
MEDIA_ENABLED=true

# Use local for development, r2 for Cloudflare R2, or s3 for Supabase/S3.
STORAGE_DRIVER=local
PUBLIC_API_URL=http://localhost:5000

# R2 configuration, required only when STORAGE_DRIVER=r2.
R2_ACCOUNT_ID=<r2-account-id>
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
R2_BUCKET=<private-r2-bucket>

# S3-compatible configuration, required only when STORAGE_DRIVER=s3.
S3_ENDPOINT=https://<project-ref>.storage.supabase.co
S3_REGION=<s3-region>
S3_ACCESS_KEY_ID=<s3-access-key-id>
S3_SECRET_ACCESS_KEY=<s3-secret-access-key>
S3_BUCKET=chit-chat

MESSAGE_EDIT_WINDOW_MS=900000
```

`MONGO_URI` and `JWT_SECRET` are required. Production also requires a valid
`MESSAGE_ENC_KEY`. When `MEDIA_ENABLED=false`, the server skips storage driver
initialization and does not require storage credentials. When media is enabled,
the selected storage driver's required variables are validated at startup.

### Client: `client/.env`

```dotenv
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
CSP_S3_ORIGIN=https://<project-ref>.storage.supabase.co
CSP_SUPABASE_ORIGIN=https://<project-ref>.supabase.co
# Alternative for Cloudflare R2:
# CSP_R2_ORIGIN=https://<account-id>.r2.cloudflarestorage.com
```

`VITE_API_URL` must be the backend origin ending in `/api`. `VITE_SOCKET_URL`
must be the backend origin without `/api` or `/socket.io`. Client variables are
public build-time configuration; do not put secrets in them.

## Deployment

The deployed application uses:

- **Frontend:** [https://chit-chat-zeta-smoky.vercel.app](https://chit-chat-zeta-smoky.vercel.app)
- **Backend:** [https://chit-chat-vf71.onrender.com](https://chit-chat-vf71.onrender.com)
- **Database:** MongoDB Atlas

The Render backend is hosted on the free tier. It can sleep when inactive, so
the first request after inactivity may take about a minute.

For a Vercel deployment, configure `VITE_API_URL` and `VITE_SOCKET_URL` with the
backend URL, configure the public storage origins used by the CSP generator,
and run:

```powershell
Set-Location .\client
npm run configure:csp
npm run build
```

For the Render backend, set `NODE_ENV=production`, the Atlas `MONGO_URI`,
`JWT_SECRET`, `MESSAGE_ENC_KEY`, `CLIENT_URL`, and the selected media settings.
If using Supabase Storage, create a private bucket named `chit-chat`, enable its
S3 connection, create an access key, set `STORAGE_DRIVER=s3`, set the `S3_*`
variables, and set `MEDIA_ENABLED=true`. If media is not required, set
`MEDIA_ENABLED=false`; storage credentials are then not needed.

## API Endpoints

Protected endpoints require `Authorization: Bearer <JWT>` unless noted.

| Method | Endpoint | Auth | Purpose |
|---|---|---:|---|
| GET | `/api/health` | No | Health check |
| GET | `/api/config` | No | Returns `{ mediaEnabled }` |
| POST | `/api/auth/register` | No | Register an account |
| POST | `/api/auth/login` | No | Log in and receive a JWT |
| GET | `/api/auth/me` | Yes | Get the current user |
| POST | `/api/auth/logout-all` | Yes | Invalidate other sessions |
| POST | `/api/auth/change-password` | Yes | Change the password |
| GET | `/api/users` | Yes | Search users |
| GET | `/api/users/blocked` | Yes | List blocked users |
| PATCH | `/api/users/me` | Yes | Update profile/settings |
| GET | `/api/users/me/export` | Yes | Export account data |
| DELETE | `/api/users/me` | Yes | Delete the account |
| POST | `/api/users/:id/block` | Yes | Block a user |
| DELETE | `/api/users/:id/block` | Yes | Unblock a user |
| GET | `/api/friends` | Yes | List friends |
| GET | `/api/friends/requests` | Yes | List friend requests |
| POST | `/api/friends/requests` | Yes | Send a friend request |
| POST | `/api/friends/requests/:id/accept` | Yes | Accept a request |
| POST | `/api/friends/requests/:id/decline` | Yes | Decline a request |
| DELETE | `/api/friends/requests/:id` | Yes | Cancel a request |
| DELETE | `/api/friends/:userId` | Yes | Remove a friend |
| GET | `/api/conversations` | Yes | List conversations |
| POST | `/api/conversations` | Yes | Create/get a conversation |
| GET | `/api/conversations/:id/messages` | Yes | Read conversation messages/search |
| PATCH | `/api/conversations/:id/settings` | Yes | Update chat settings |
| POST | `/api/uploads/sign` | Yes | Create a signed media upload URL |
| PUT | `/api/uploads/local/:token` | Yes | Upload to the local driver |
| GET | `/api/uploads/local/:token` | No | Read from the local signed URL |
| GET | `/api/media?key=...` | Yes | Create a signed media download URL |

When `MEDIA_ENABLED=false`, the media upload and media URL endpoints return
HTTP 503 with `Photo sharing is turned off on this deployment`.

## Socket.IO Events

The socket connection uses the same JWT authentication as the REST API.

| Direction | Event | Purpose |
|---|---|---|
| Client → server | `message:send` | Send a text or validated image message |
| Client → server | `message:read` | Mark messages as read |
| Client → server | `typing:start` | Notify the other participant that typing started |
| Client → server | `typing:stop` | Notify the other participant that typing stopped |
| Client → server | `conversation:timer` | Set a disappearing-message timer |
| Client → server | `message:delivered` | Acknowledge message delivery |
| Client → server | `message:react` | Add or remove a supported reaction |
| Client → server | `message:edit` | Edit an eligible text message |
| Client → server | `message:delete` | Delete for self or delete for everyone |
| Server → client | `presence:list` | Send visible online users after connection |
| Server → client | `user:status` | Notify presence changes |
| Server → client | `message:new` | Deliver a new message |
| Server → client | `message:read:update` | Notify read-state changes |
| Server → client | `message:delivery:update` | Notify delivery-state changes |
| Server → client | `typing:update` | Notify typing-state changes |
| Server → client | `conversation:timer:update` | Notify timer changes |
| Server → client | `message:edit:update` | Notify an edited message |
| Server → client | `message:react:update` | Notify a reaction change |
| Server → client | `message:delete:update` | Notify message deletion/expiry |
| Server → client | `friend:request` | Notify a new friend request |
| Server → client | `friend:accepted` | Notify an accepted request |
| Server → client | `friend:removed` | Notify that a friendship was removed |

## Known Limitations

- The application supports one-to-one conversations only; there are no group
  chats, calls, file uploads unrelated to image sharing, push notifications, or
  end-to-end encryption.
- Buddy AI is text-only and does not support image conversations.
- Media sharing depends on `MEDIA_ENABLED` and correctly configured private
  storage credentials and storage CORS.
- The Render free tier sleeps when idle, so cold starts can be slow.
- Signed media URLs are temporary bearer URLs and must not be logged or shared.
- The server can read messages in normal operation. `MESSAGE_ENC_KEY` protects
  selected stored fields at rest but is not end-to-end encryption.
- The storage compatibility check confirmed upload, head, range read, download
  hashing, and cleanup against the configured S3-compatible service. Some
  providers may not enforce the conditional `If-None-Match` overwrite behavior
  identically.
- Browser media uploads still require storage-side CORS configuration for the
  deployed frontend origin.
- The current automated API verification requires a running backend and
  database; it is not a substitute for checking the deployed browser UI on
  real devices.

## Demo Video

**Demo video:** `[Add final demo video link here]`

## Verification Commands

From `server`:

```powershell
npm test
npm run verify
```

From `client`:

```powershell
npm test
npm run lint
npm run build
```
