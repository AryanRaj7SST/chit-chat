# MERN Chat demonstration: 4 minutes 35 seconds

Read the quoted lines naturally. Bracketed directions are actions, not narration.
Pause briefly for each visible result; do not fill loading time with claims that
something worked. Use a normal window and an incognito/private window, side by
side. Prepare them with [RECORDING_CHECKLIST.md](RECORDING_CHECKLIST.md).

The demo seed creates Alice Johnson and Bob Smith for development recording.
For a deployed recording, use two accounts registered normally on that app;
never run the development seed in production. Substitute their names below.

## 0:00–0:25 — Introduction and stack

[Show the chat app title and login page. Keep the address bar visible.]

“This is MERN Chat, a private messaging app for conversations between two people.
The frontend uses React, Vite, and Tailwind CSS. The backend uses Node and
Express, with MongoDB and Mongoose for storage. Socket.IO carries the live chat
events. I’ll show the account flow, a real conversation, and what happens when
someone refreshes or disconnects.”

## 0:25–1:05 — Register and log in

[Open Create an account. Register a fresh throwaway recording account using a
prepared, unused email. Show the chat screen, log out, then log in as Alice.]

“I’ll start by creating an account. I enter a name, an email, and a password.
After registration, the app takes me into the conversation screen. I can log out
and return through the login form. For the main demonstration, I’m signing in as
Alice. In this private window, I’ll sign in as Bob. These windows use separate
sessions, so we’re looking at two different users.”

[Log in as Bob in the private window. Keep real passwords and dashboards out of
the capture. Public seeded credentials may be shown only for a local demo.]

## 1:05–1:55 — Two windows chatting live

[In Alice's window, search for Bob's email and open the conversation. Send
“Hi Bob! Ready for the demo?” Open Alice's conversation in Bob's window, then
reply “Hi Alice! I can see your message.” Send another short message from Alice.]

“Alice can search for another person by name or email. I’ll choose Bob and send
a message. It arrives in Bob’s window without a refresh. Bob can reply from his
own session, and Alice sees the reply straight away. I’ll send one more message
so you can watch both screens at once. The clock means a send is still waiting
for confirmation. A single check means it was saved, and a double check means
the other person has opened the conversation and marked it read.”

## 1:55–2:20 — Refresh and persistence

[Refresh Alice's window. Select Bob's conversation again. Point to the same
messages, without sending replacements.]

“Now I’ll refresh Alice’s page and reopen the conversation. The messages are
still here because they were saved in MongoDB. They aren’t only held in the
browser’s memory. The conversation preview also shows the latest saved message.
Refreshing doesn’t create another copy of the conversation or its messages.”

## 2:20–2:50 — Online and offline

[Point to Online in Alice's chat header. Close Bob's entire private window,
including every Bob tab. Wait until Alice shows Offline. Reopen a private
window and log Bob back in. Wait for Online before continuing.]

“Alice can see that Bob is online. I’ll close Bob’s private window. Once the
server notices that Bob’s last connection has closed, Alice sees Offline. If
Bob had another tab open, he would still count as online. I’ll bring Bob back
now, and the status changes when his connection is restored.”

## 2:50–3:15 — Typing indicator

[Open Alice's chat as Bob. Type “This is the typing indicator” without sending.
Point to typing... in Alice's header, then send the message.]

“While Bob writes, Alice sees that he’s typing. This is a temporary live event;
it isn’t saved as a chat message. When Bob sends the message, the typing
indicator stops and the message appears. Clearing a draft or leaving the
conversation also stops the typing state.”

## 3:15–3:55 — Responsive resize

[Resize Alice's viewport to 375px using a prepared responsive browser preset.
Show the chat, use Back to conversations, then select Bob again. Return to a
desktop width. Keep browser zoom at 100%; resize the viewport, not the zoom.]

“The same interface works in a narrow window. At a phone-sized width, it shows
one panel at a time so the conversation has room to breathe. The back button
returns to the conversation list, and selecting Bob brings the chat back. Long
messages wrap inside their bubbles. At desktop width, the list and the selected
conversation sit side by side. Date separators and grouped messages make the
history easier to follow.”

## 3:55–4:25 — Architecture, about 30 seconds

[Show the diagram in ARCHITECTURE.md, prepared in another tab, or keep the app
visible and use the diagram as an editing overlay.]

“REST handles registration, login, user search, and loading conversation history.
Socket.IO handles live messages, typing, presence, and read updates. MongoDB
stores users, conversations, and messages. Both REST and the socket handshake
use the same JWT identity. Before saving a message, the server checks that the
sender belongs to that conversation. It then sends the recipient a live event
and confirms the saved message to the sender.”

## 4:25–4:35 — Closing

[Return to the two chat windows with the saved exchange visible.]

“That’s MERN Chat: two independent sessions, live private messaging, saved
history, and a layout that adapts to smaller screens. Thanks for watching.”

If recording on localhost, say so in the introduction. Only call it a deployed
demonstration when the recording actually uses the deployed URLs. The timestamps
are a rehearsal guide; aim for a final take between four and five minutes.
