import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, WifiOff } from "lucide-react";
import toast from "react-hot-toast";
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import api, { getErrorMessage } from "../services/api";

// move a conversation to the top with its newest message
const bump = (list, msg) => {
  const target = list.find((c) => c._id === msg.conversation);
  if (!target) return list;
  if (target.lastMessage && new Date(target.lastMessage.createdAt) > new Date(msg.createdAt)) return list;
  return [{ ...target, lastMessage: msg, updatedAt: msg.createdAt }, ...list.filter((c) => c._id !== msg.conversation)];
};

export default function ChatPage() {
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

  const conversationRequest = useRef(0);
  const receivedIds = useRef(new Set());

  const loadConversations = useCallback(async () => {
    const request = ++conversationRequest.current;
    try {
      const { data } = await api.get("/conversations");
      if (request !== conversationRequest.current) return;
      setConversations(data.conversations);
      setConvsError("");
    } catch (err) {
      if (request === conversationRequest.current) setConvsError(getErrorMessage(err));
    } finally {
      if (request === conversationRequest.current) setConvsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // debounced user search (empty query lists registered users)
  useEffect(() => {
    let cancelled = false;
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
    const onConnect = () => loadConversations();
    const onRead = () => loadConversations();

    socket.on("message:new", onNew);
    socket.on("connect", onConnect);
    socket.on("message:read:update", onRead);
    return () => {
      socket.off("message:new", onNew);
      socket.off("connect", onConnect);
      socket.off("message:read:update", onRead);
    };
  }, [socket, user._id, loadConversations]);

  const openConversation = (conv) => {
    setActiveConv(conv);
  };

  const openWithUser = async (u) => {
    try {
      const { data } = await api.post("/conversations", { userId: u._id });
      setQuery("");
      openConversation(data.conversation);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
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
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-white dark:bg-slate-900">
      {!connected && (
        <div className="flex items-center justify-center gap-2 bg-amber-100 dark:bg-amber-950 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
          <WifiOff className="h-3.5 w-3.5" />
          Connecting to the server...
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          className={`${activeConv ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96`}
          me={user}
          conversations={conversations}
          activeId={activeConv?._id}
          onSelectConversation={openConversation}
          onSelectUser={openWithUser}
          users={users}
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
          />
        ) : (
          <div className="hidden min-w-0 flex-1 flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-6 text-center md:flex">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <MessageCircle className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Select a conversation</h2>
            <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
              Choose someone from the list or search for a person to start chatting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
