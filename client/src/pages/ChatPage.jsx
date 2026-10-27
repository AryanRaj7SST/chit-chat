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
  const [activeConv, setActiveConv] = useState(null);
  const [unread, setUnread] = useState({});
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const conversationsRef = useRef([]);
  const activeIdRef = useRef(null);
  const receivedIds = useRef(new Set());
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    activeIdRef.current = activeConv?._id || null;
  }, [activeConv]);

  const loadConversations = useCallback(async () => {
    try {
      const { data } = await api.get("/conversations");
      setConversations(data.conversations);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setConvsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // debounced user search (empty query lists registered users)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        try {
          const { data } = await api.get("/users", { params: { q: query.trim() } });
          if (!cancelled) setUsers(data.users);
        } catch (err) {
          if (!cancelled) toast.error(getErrorMessage(err));
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
  }, [query]);

  // sidebar updates for incoming messages + refresh after reconnects
  useEffect(() => {
    if (!socket) return;

    const onNew = (msg) => {
      if (receivedIds.current.has(msg._id)) return;
      receivedIds.current.add(msg._id);
      if (receivedIds.current.size > 1000) receivedIds.current.delete(receivedIds.current.values().next().value);
      const known = conversationsRef.current.some((c) => c._id === msg.conversation);
      if (known) setConversations((prev) => bump(prev, msg));
      else loadConversations();

      if (msg.conversation !== activeIdRef.current && msg.sender !== user._id) {
        setUnread((u) => ({ ...u, [msg.conversation]: (u[msg.conversation] || 0) + 1 }));
      }
    };
    const onConnect = () => loadConversations();

    socket.on("message:new", onNew);
    socket.on("connect", onConnect);
    return () => {
      socket.off("message:new", onNew);
      socket.off("connect", onConnect);
    };
  }, [socket, user._id, loadConversations]);

  const openConversation = (conv) => {
    setActiveConv(conv);
    setUnread((u) => ({ ...u, [conv._id]: 0 }));
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
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-white">
      {!connected && (
        <div className="flex items-center justify-center gap-2 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800">
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
          onlineIds={onlineIds}
          unread={unread}
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
          <div className="hidden flex-1 flex-col items-center justify-center bg-slate-50 text-center md:flex">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <MessageCircle className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800">Select a conversation</h2>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              Choose someone from the list or search for a person to start chatting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
