import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import api, { getErrorMessage } from "../services/api";
import { useSocket } from "../hooks/useSocket";
import { formatMessageDate, getOther, sameMessageGroup } from "../utils/format";
import { latestReadAt, mergeMessages } from "../utils/messages";
import Avatar from "./Avatar";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { MessagesSkeleton } from "./Skeletons";

export default function ChatWindow({ conversation, me, onBack, onMessageSent }) {
  const { socket, connected, onlineIds } = useSocket();
  const other = getOther(conversation, me._id);
  const conversationId = conversation._id;
  const otherId = other._id;
  const isOnline = onlineIds.has(otherId);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState(conversation.lastReadAt?.[otherId] || null);

  const bottomRef = useRef(null);
  const firstScrollRef = useRef(true);
  const incomingTypingTimer = useRef(null);
  const isTypingRef = useRef(false);
  const stopTimerRef = useRef(null);
  const historyRequest = useRef(0);

  // ---------- load history (also used after a reconnect) ----------
  const loadMessages = useCallback(async () => {
    const request = ++historyRequest.current;
    setLoading(true);
    try {
      const { data } = await api.get(`/conversations/${conversationId}/messages`, { params: { limit: 50 } });
      if (request !== historyRequest.current) return;
      setMessages((prev) => mergeMessages(prev, data.messages));
      setOtherReadAt((previous) => latestReadAt(previous, data.lastReadAt?.[otherId]));
      setError("");
    } catch (err) {
      if (request === historyRequest.current) setError(getErrorMessage(err));
    } finally {
      if (request === historyRequest.current) setLoading(false);
    }
  }, [conversationId, otherId]);

  useEffect(() => {
    loadMessages();
    return () => { historyRequest.current++; };
  }, [loadMessages]);

  // ---------- socket listeners ----------
  useEffect(() => {
    if (!socket) return;

    const onNew = (msg) => {
      if (msg.conversation !== conversationId) return;
      setMessages((prev) => mergeMessages(prev, [msg]));
    };

    const onTyping = ({ conversationId: cid, userId, isTyping }) => {
      if (cid !== conversationId || userId !== otherId) return;
      clearTimeout(incomingTypingTimer.current);
      setOtherTyping(isTyping);
      // safety net in case the "stop" event is lost
      if (isTyping) incomingTypingTimer.current = setTimeout(() => setOtherTyping(false), 4000);
    };

    const onConnect = () => loadMessages(); // fires on reconnects: fetch anything we missed
    const onRead = ({ conversationId: id, userId, at }) => {
      if (id === conversationId && userId === otherId)
        setOtherReadAt((previous) => latestReadAt(previous, at));
    };

    socket.on("message:new", onNew);
    socket.on("typing:update", onTyping);
    socket.on("connect", onConnect);
    socket.on("message:read:update", onRead);
    return () => {
      socket.off("message:new", onNew);
      socket.off("typing:update", onTyping);
      socket.off("connect", onConnect);
      socket.off("message:read:update", onRead);
      clearTimeout(incomingTypingTimer.current);
    };
  }, [socket, conversationId, otherId, loadMessages]);

  useEffect(() => {
    if (!socket || !connected || loading || error) return;
    const markRead = () => {
      if (document.visibilityState === "visible" && socket.connected)
        socket.timeout(10000).emit("message:read", { conversationId }, () => {});
    };
    markRead();
    window.addEventListener("focus", markRead);
    document.addEventListener("visibilitychange", markRead);
    return () => {
      window.removeEventListener("focus", markRead);
      document.removeEventListener("visibilitychange", markRead);
    };
  }, [socket, connected, conversationId, loading, error, messages.length]);

  // ---------- outgoing typing ----------
  const stopTyping = useCallback(() => {
    clearTimeout(stopTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      if (socket?.connected) socket.emit("typing:stop", { conversationId });
    }
  }, [socket, conversationId]);

  const handleTyping = () => {
    if (!socket?.connected) return;
    isTypingRef.current = true;
    socket.emit("typing:start", { conversationId });
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(stopTyping, 2000);
  };

  useEffect(() => stopTyping, [stopTyping]); // stop typing when leaving the conversation

  useEffect(() => {
    if (!connected) {
      clearTimeout(stopTimerRef.current);
      isTypingRef.current = false;
    }
    if (!connected || !isOnline) {
      clearTimeout(incomingTypingTimer.current);
      setOtherTyping(false);
    }
  }, [connected, isOnline]);

  // ---------- sending ----------
  const markFailed = (tempId) =>
    setMessages((prev) => prev.map((m) => (m.tempId === tempId && m.status === "sending" ? { ...m, status: "failed" } : m)));

  const deliver = (tempId, content) => {
    if (!socket?.connected) {
      markFailed(tempId);
      toast.error("You are offline. Check your connection and retry.");
      return;
    }
    socket.timeout(10000).emit("message:send", { conversationId, content, tempId }, (err, res) => {
      if (err || !res?.success) {
        markFailed(tempId);
        toast.error(err ? "Sending timed out. Tap to retry." : res.message);
        return;
      }
      // the server confirmed it is saved: swap the temporary message for the real one
      setMessages((prev) =>
        mergeMessages(prev, [{ ...res.message, tempId, status: "sent" }])
      );
      onMessageSent(res.message, conversation);
    });
  };

  const handleSend = (content) => {
    stopTyping();
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [
      ...prev,
      {
        _id: tempId,
        tempId,
        conversation: conversationId,
        sender: me._id,
        content,
        createdAt: new Date().toISOString(),
        status: "sending",
      },
    ]);
    deliver(tempId, content);
  };

  const handleRetry = (message) => {
    setMessages((prev) => prev.map((m) => (m.tempId === message.tempId ? { ...m, status: "sending" } : m)));
    deliver(message.tempId, message.content);
  };

  // ---------- auto scroll ----------
  useEffect(() => {
    if (loading) return;
    bottomRef.current?.scrollIntoView({ behavior: firstScrollRef.current ? "auto" : "smooth" });
    firstScrollRef.current = false;
  }, [messages.length, otherTyping, loading]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 shadow-sm md:px-4">
        <button
          onClick={onBack}
          aria-label="Back to conversations"
          className="rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={other.name} online={isOnline} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{other.name}</p>
          <p className={`text-xs ${otherTyping ? "text-indigo-600 dark:text-indigo-400" : isOnline ? "text-emerald-600" : "text-slate-400"}`}>
            {otherTyping ? "typing..." : isOnline ? "Online" : "Offline"}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 md:px-4">
        {loading ? (
          <MessagesSkeleton />
        ) : error ? (
          <div role="alert" className="mx-auto mt-10 max-w-xs text-center">
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                loadMessages();
              }}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Try again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No messages yet. Say hello to {other.name}!
          </p>
        ) : (
          <div>
            {messages.map((m, index) => (
              <Fragment key={m.tempId || m._id}>
                {(index === 0 || new Date(messages[index - 1].createdAt).toDateString() !== new Date(m.createdAt).toDateString()) && (
                  <div role="separator" aria-label={formatMessageDate(m.createdAt)} className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{formatMessageDate(m.createdAt)}</span>
                    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  </div>
                )}
                <MessageBubble
                  message={m}
                  mine={m.sender === me._id}
                  read={!!otherReadAt && new Date(otherReadAt) >= new Date(m.createdAt)}
                  onRetry={handleRetry}
                  groupedBefore={sameMessageGroup(messages[index - 1], m)}
                  groupedAfter={sameMessageGroup(m, messages[index + 1])}
                />
              </Fragment>
            ))}
          </div>
        )}

        {otherTyping && (
          <div className="mt-2 flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <MessageInput onSend={handleSend} onTyping={handleTyping} onStopTyping={stopTyping} />
    </section>
  );
}
