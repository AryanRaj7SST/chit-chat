import { useCallback, useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";
import BrandIcon from "../components/BrandIcon";
import toast from "react-hot-toast";
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import { useVisualViewport } from "../hooks/useVisualViewport";
import api, { getErrorMessage } from "../services/api";
import { getFriends, getFriendRequests, sendFriendRequest, acceptFriendRequest, declineFriendRequest, cancelFriendRequest, removeFriend } from "../services/friends";

// move a conversation to the top with its newest message
const bump = (list, msg) => {
  const target = list.find((c) => c._id === msg.conversation);
  if (!target) return list;
  if (target.lastMessage && new Date(target.lastMessage.createdAt) > new Date(msg.createdAt)) return list;
  return [{ ...target, lastMessage: msg, updatedAt: msg.createdAt }, ...list.filter((c) => c._id !== msg.conversation)];
};

export default function ChatPage() {
  useVisualViewport();
  const { user, logout } = useAuth();
  const { socket, connected, onlineIds } = useSocket();

  const [conversations, setConversations] = useState([]);
  const [convsLoading, setConvsLoading] = useState(true);
  const [convsError, setConvsError] = useState("");
  const [activeConv, setActiveConv] = useState(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [searchRetry, setSearchRetry] = useState(0);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [socialError, setSocialError] = useState("");
  const [busy, setBusy] = useState(false);

  const conversationRequest = useRef(0);
  const receivedIds = useRef(new Set());
  const socialRequest = useRef(0);

  const loadSocial = useCallback(async () => {
    const request = ++socialRequest.current;
    try {
      const [people, invitations] = await Promise.all([getFriends(), getFriendRequests()]);
      if (request !== socialRequest.current) return;
      setFriends(people.data.friends);
      setRequests({ incoming: invitations.data.incoming, outgoing: invitations.data.outgoing });
      setSocialError("");
    } catch (err) {
      if (request === socialRequest.current) setSocialError(getErrorMessage(err));
    }
  }, []);

  const loadConversations = useCallback(async () => {
    const request = ++conversationRequest.current;
    try {
      const { data } = await api.get("/conversations");
      if (request !== conversationRequest.current) return;
      setConversations(data.conversations);
      setActiveConv((previous) => previous ? data.conversations.find((conversation) => conversation._id === previous._id) || null : null);
      setConvsError("");
    } catch (err) {
      if (request === conversationRequest.current) setConvsError(getErrorMessage(err));
    } finally {
      if (request === conversationRequest.current) setConvsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadSocial();
  }, [loadConversations, loadSocial]);

  // Discovery is search-only; never fetch a directory of all accounts.
  useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) {
      setUsers([]);
      setUsersLoading(false);
      setUsersError("");
      return;
    }
    setUsersLoading(true);
    const timer = setTimeout(
      async () => {
        try {
          const { data } = await api.get("/users", { params: { q: query.trim() } });
          if (!cancelled) {
            setUsers(data.users);
            setUsersError("");
          }
        } catch (err) {
          if (!cancelled) setUsersError(getErrorMessage(err));
        } finally {
          if (!cancelled) setUsersLoading(false);
        }
      },
      query ? 300 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchRetry]);

  // sidebar updates for incoming messages + refresh after reconnects
  useEffect(() => {
    if (!socket) return;

    const onNew = (msg) => {
      if (receivedIds.current.has(msg._id)) return;
      receivedIds.current.add(msg._id);
      if (receivedIds.current.size > 1000) receivedIds.current.delete(receivedIds.current.values().next().value);
      setConversations((prev) => bump(prev, msg));
      loadConversations(); // unread counts are always computed by the server
    };
    const onConnect = () => { loadConversations(); loadSocial(); };
    const onRead = () => loadConversations();
    const onRequest = ({ requestId, from }) => {
      toast(`${from.name} sent you a friend request`);
      setRequests((previous) => previous.incoming.some((item) => item._id === requestId) ? previous : {
        ...previous, incoming: [...previous.incoming, { _id: requestId, user: from, createdAt: new Date().toISOString() }],
      });
      loadSocial();
      setSearchRetry((value) => value + 1);
    };
    const onAccepted = ({ user: friend }) => {
      toast.success(`${friend.name} accepted your friend request`);
      loadSocial();
      loadConversations();
      setSearchRetry((value) => value + 1);
    };
    const onRemoved = ({ userId }) => {
      setFriends((previous) => previous.filter((friend) => friend._id !== userId));
      setConversations((previous) => previous.filter((conversation) => !conversation.participants.some((person) => person._id === userId)));
      setActiveConv((previous) => previous?.participants.some((person) => person._id === userId) ? null : previous);
      loadSocial();
      loadConversations();
      setSearchRetry((value) => value + 1);
    };
    const onRequestRemoved = () => { loadSocial(); setSearchRetry((value) => value + 1); };

    socket.on("message:new", onNew);
    socket.on("connect", onConnect);
    socket.on("message:read:update", onRead);
    socket.on("friend:request", onRequest);
    socket.on("friend:accepted", onAccepted);
    socket.on("friend:removed", onRemoved);
    socket.on("friend:request:removed", onRequestRemoved);
    for (const event of ["message:edit:update", "message:delete:update"]) socket.on(event, onRead);
    socket.on("conversation:settings:update", onRead);
    socket.on("conversation:timer:update", onRead);
    return () => {
      socket.off("message:new", onNew);
      socket.off("connect", onConnect);
      socket.off("message:read:update", onRead);
      socket.off("friend:request", onRequest);
      socket.off("friend:accepted", onAccepted);
      socket.off("friend:removed", onRemoved);
      socket.off("friend:request:removed", onRequestRemoved);
      for (const event of ["message:edit:update", "message:delete:update"]) socket.off(event, onRead);
      socket.off("conversation:settings:update", onRead);
      socket.off("conversation:timer:update", onRead);
    };
  }, [socket, user._id, loadConversations, loadSocial]);

  const openConversation = (conv) => {
    setActiveConv(conv);
  };

  const openWithUser = async (u) => {
    try {
      const { data } = await api.post("/conversations", { userId: u._id });
      setQuery("");
      openConversation(data.conversation);
      loadConversations();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const friendAction = async (action, id) => {
    if (busy) return;
    setBusy(true);
    try {
      const commands = { add: sendFriendRequest, accept: acceptFriendRequest, decline: declineFriendRequest, cancel: cancelFriendRequest, unfriend: removeFriend };
      const { data } = await commands[action](id);
      if (data.status === "accepted") toast.success(`You and ${data.user.name} are now friends`);
      await Promise.all([loadSocial(), loadConversations()]);
      setSearchRetry((value) => value + 1);
      if (action === "unfriend") setActiveConv((previous) => previous?.participants.some((person) => person._id === id) ? null : previous);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setBusy(false); }
  };

  // called by ChatWindow once the server has confirmed a message is saved
  const handleMessageSent = (msg, conv) => {
    setConversations((prev) =>
      prev.some((c) => c._id === msg.conversation)
        ? bump(prev, msg)
        : [{ ...conv, lastMessage: msg, updatedAt: msg.createdAt }, ...prev]
    );
    loadConversations();
  };

  return (
    <div className="app-shell flex h-dvh w-full flex-col overflow-hidden bg-bg">
      {!connected && (
        <div className="flex items-center justify-center gap-2 bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted">
          <WifiOff className="h-3.5 w-3.5" />
          Connecting to the server...
        </div>
      )}
      <div className="flex min-h-0 flex-1 md:gap-4 md:p-4">
        <Sidebar
          className={`${activeConv ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96`}
          me={user}
          conversations={conversations}
          activeId={activeConv?._id}
          onSelectConversation={openConversation}
          onSelectUser={openWithUser}
          users={users}
          friends={friends}
          requests={requests}
          socialError={socialError}
          onRetrySocial={loadSocial}
          onFriendAction={friendAction}
          busy={busy}
          usersLoading={usersLoading}
          convsLoading={convsLoading}
          convsError={convsError}
          usersError={usersError}
          onRetryConversations={() => { setConvsLoading(true); loadConversations(); }}
          onRetryUsers={() => setSearchRetry((value) => value + 1)}
          onlineIds={onlineIds}
          query={query}
          onQueryChange={setQuery}
          onLogout={logout}
        />

        {activeConv ? (
          <ChatWindow
            key={activeConv._id}
            conversation={activeConv}
            me={user}
            onBack={() => setActiveConv(null)}
            onMessageSent={handleMessageSent}
            onUnfriend={(id) => friendAction("unfriend", id)}
            busy={busy}
          />
        ) : (
          <div className="panel hidden min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border border-border bg-surface px-6 text-center md:flex">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary-ink">
              <BrandIcon className="h-12 w-12" />
            </div>
            <h2 className="text-lg font-semibold text-text">Select a conversation</h2>
            <p className="mt-1 max-w-xs text-sm text-muted">
              Chat with Buddy AI, or search for someone and add them as a friend.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
