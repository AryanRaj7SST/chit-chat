import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, MoreVertical, Search } from "lucide-react";
import toast from "react-hot-toast";
import api, { getErrorMessage } from "../services/api";
import { useSocket } from "../hooks/useSocket";
import { formatMessageDate, getOther, sameMessageGroup } from "../utils/format";
import { latestReadAt, mergeMessages } from "../utils/messages";
import Avatar from "./Avatar";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { MessagesSkeleton } from "./Skeletons";
import { useImageSharing } from "../hooks/useImageSharing";

export default function ChatWindow({ conversation, me, onBack, onMessageSent, onUnfriend, busy }) {
  const { socket, connected, onlineIds } = useSocket();
  const { mediaEnabled } = useAuth();
  const other = getOther(conversation, me._id);
  const conversationId = conversation._id;
  const otherId = other._id;
  const isOnline = other.isBot || onlineIds.has(otherId);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState(conversation.lastReadAt?.[otherId] || null);
  const [lastSeen, setLastSeen] = useState(other.lastSeenAt);
  const [reply, setReply] = useState(null), [hasMore, setHasMore] = useState(false), [olderLoading, setOlderLoading] = useState(false), [olderError, setOlderError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false), [search, setSearch] = useState(""), [results, setResults] = useState([]), [searchError, setSearchError] = useState("");
  const scrollRef = useRef(null), anchor = useRef(null), skipScroll = useRef(false), olderBusy = useRef(false), highlightTimer = useRef(null), hiddenIds = useRef(new Set());

  const bottomRef = useRef(null);
  const firstScrollRef = useRef(true);
  const incomingTypingTimer = useRef(null);
  const isTypingRef = useRef(false);
  const stopTimerRef = useRef(null);
  const historyRequest = useRef(0);
  const deliveryTimes = useRef(new Map());

  // ---------- load history (also used after a reconnect) ----------
  const loadMessages = useCallback(async () => {
    const request = ++historyRequest.current;
    setLoading(true);
    try {
      const { data } = await api.get(`/conversations/${conversationId}/messages`, { params: { limit: 50 } });
      if (request !== historyRequest.current) return;
      setMessages((prev) => mergeMessages(prev, data.messages.filter(message => !hiddenIds.current.has(message._id))));
      setHasMore(data.hasMore);
      setOtherReadAt((previous) => data.lastReadAt?.[otherId] ? latestReadAt(previous, data.lastReadAt[otherId]) : null);
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
      if (msg.conversation !== conversationId || hiddenIds.current.has(msg._id)) return;
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
    const onDelivery = ({ conversationId: id, messageId, at }) => { if (id === conversationId) { deliveryTimes.current.set(messageId, at); if (deliveryTimes.current.size > 1000) deliveryTimes.current.delete(deliveryTimes.current.keys().next().value); setMessages(previous => previous.map(message => message._id === messageId ? { ...message, deliveredAt: latestReadAt(message.deliveredAt, at) } : message)); } };
    const onStatus = data => { if (data.userId === otherId && Object.hasOwn(data, "lastSeen")) setLastSeen(data.lastSeen); };
    const onChange = message => {
      if (message.conversation !== conversationId) return;
      if (message.hidden || message.expired) { hiddenIds.current.add(message._id); setMessages(previous => previous.filter(item => item._id !== message._id).map(item => item.replyTo?._id === message._id ? { ...item, replyTo: { ...item.replyTo, preview: "Message unavailable" } } : item)); setResults(previous => previous.filter(item => item._id !== message._id)); setReply(previous => previous?._id === message._id ? null : previous); }
      else if (!hiddenIds.current.has(message._id)) setMessages(previous => mergeMessages(previous, [message]).map(item => item.replyTo?._id === message._id ? { ...item, replyTo: { ...item.replyTo, preview: message.deletedAt ? "Message unavailable" : message.type === "image" ? "Photo" : message.content.slice(0, 160) } } : item));
    };

    socket.on("message:new", onNew);
    socket.on("typing:update", onTyping);
    socket.on("connect", onConnect);
    socket.on("message:read:update", onRead);
    socket.on("message:delivery:update", onDelivery);
    socket.on("user:status", onStatus);
    for (const event of ["message:react:update", "message:edit:update", "message:delete:update"]) socket.on(event, onChange);
    return () => {
      socket.off("message:new", onNew);
      socket.off("typing:update", onTyping);
      socket.off("connect", onConnect);
      socket.off("message:read:update", onRead);
      socket.off("message:delivery:update", onDelivery);
      socket.off("user:status", onStatus);
      for (const event of ["message:react:update", "message:edit:update", "message:delete:update"]) socket.off(event, onChange);
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
    if (!socket?.connected || me.settings?.typingIndicators === false) return;
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
    const fields = typeof content === "string" ? { content } : content;
    socket.timeout(20000).emit("message:send", { conversationId, ...fields, tempId }, (err, res) => {
      if (err || !res?.success) {
        markFailed(tempId);
        if (!err) imageSharing.invalidate(tempId);
        toast.error(err ? "Sending timed out. Tap to retry." : res.message);
        return;
      }
      // the server confirmed it is saved: swap the temporary message for the real one
      if (hiddenIds.current.has(res.message._id)) { imageSharing.complete(tempId); return; }
      setMessages((prev) =>
        mergeMessages(prev, [{ ...res.message, deliveredAt: latestReadAt(res.message.deliveredAt, deliveryTimes.current.get(res.message._id)), tempId, status: "sent" }])
      );
      onMessageSent(res.message, conversation);
      imageSharing.complete(tempId);
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
        ...(reply ? { replyTo: { _id: reply._id, preview: reply.type === "image" ? "Photo" : reply.content.slice(0, 160) } } : {}),
        createdAt: new Date().toISOString(),
        status: "sending",
      },
    ]);
    deliver(tempId, { content, ...(reply ? { replyTo: reply._id } : {}) }); setReply(null);
  };

  const handleRetry = (message) => {
    if (imageSharing.retry(message)) return;
    setMessages((prev) => prev.map((m) => (m.tempId === message.tempId ? { ...m, status: "sending" } : m)));
    deliver(message.tempId, { ...(message.type === "image" ? { type: "image", attachments: message.attachments, caption: message.caption } : { content: message.content }), ...(message.replyTo ? { replyTo: message.replyTo._id || message.replyTo } : {}) });
  };

  const imageSharing = useImageSharing({ conversationId, isBot: other.isBot, enabled: mediaEnabled,
    create: (tempId, fields) => { stopTyping(); setMessages(previous => [...previous, { _id: tempId, tempId, conversation: conversationId, sender: me._id, createdAt: new Date().toISOString(), status: "sending", ...fields, ...(reply ? { replyTo: { _id: reply._id, preview: reply.type === "image" ? "Photo" : reply.content.slice(0,160) } } : {}) }]); setReply(null); },
    update: (tempId, fields) => setMessages(previous => previous.map(message => message.tempId === tempId ? { ...message, ...fields } : message)), deliver, replyTo: reply?._id });

  const action = async (message, name, fields) => {
    if (!socket?.connected) { toast.error("You are offline. Try again when connected."); return false; }
    try {
      const result = await socket.timeout(20000).emitWithAck(`message:${name}`, { messageId: message._id, ...fields });
      if (!result.success) throw new Error(result.message); return true;
    } catch (error) { toast.error(error.message || "Action failed"); return false; }
  };
  const manageChat = async fields => {
    try { await api.patch(`/conversations/${conversationId}/settings`, fields); if (fields.archived && scrollRef.current) onBack(); }
    catch (error) { toast.error(getErrorMessage(error)); }
  };
  const block = async () => {
    if (!window.confirm(`Block ${other.name}? This also removes your friendship.`)) return;
    try { await api.post(`/users/${otherId}/block`); if (scrollRef.current) onBack(); } catch (error) { toast.error(getErrorMessage(error)); }
  };
  const setTimer = async seconds => {
    if (!socket?.connected) { toast.error("You are offline"); return; }
    try { const result = await socket.timeout(10000).emitWithAck("conversation:timer", { conversationId, seconds }); if (!result.success) throw new Error(result.message); }
    catch (error) { toast.error(error.message); }
  };
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setMessages(previous => { const next = previous.filter(message => !message.expireAt || new Date(message.expireAt).getTime() > now); return next.length === previous.length ? previous : next; });
      setReply(previous => previous?.expireAt && new Date(previous.expireAt).getTime() <= now ? null : previous);
    }, 1000);
    return () => clearInterval(timer);
  }, [conversationId]);
  const loadOlder = async () => {
    if (!hasMore || olderBusy.current || loading || !messages.length) return;
    olderBusy.current = true; setOlderLoading(true); setOlderError("");
    const oldest = messages.find(message => !message.status || message.status === "sent");
    try {
      const { data } = await api.get(`/conversations/${conversationId}/messages`, { params: { before: `${oldest.createdAt}|${oldest._id}`, limit: 50 } });
      const element = scrollRef.current; if (!element) return;
      anchor.current = { height: element.scrollHeight, top: element.scrollTop }; skipScroll.current = true;
      setMessages(previous => mergeMessages(previous, data.messages.filter(message => !hiddenIds.current.has(message._id)))); setHasMore(data.hasMore);
    } catch (error) { setOlderError(getErrorMessage(error)); }
    finally { olderBusy.current = false; setOlderLoading(false); }
  };
  useLayoutEffect(() => {
    if (anchor.current && scrollRef.current) { const element = scrollRef.current; element.scrollTop = anchor.current.top + element.scrollHeight - anchor.current.height; anchor.current = null; }
  }, [messages]);
  const jump = async id => {
    let element = document.querySelector(`[data-message-id="${CSS.escape(String(id))}"]`);
    if (!element) {
      try {
        const { data } = await api.get(`/conversations/${conversationId}/messages`, { params: { around: id } });
        skipScroll.current = true; setMessages(previous => mergeMessages(previous, data.messages.filter(message => !hiddenIds.current.has(message._id))));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        element = document.querySelector(`[data-message-id="${CSS.escape(String(id))}"]`);
      } catch (error) { toast.error(getErrorMessage(error)); return; }
    }
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" }); element.classList.add("message-highlight");
    clearTimeout(highlightTimer.current); highlightTimer.current = setTimeout(() => element.classList.remove("message-highlight"), 1800);
  };
  useEffect(() => () => clearTimeout(highlightTimer.current), []);
  useEffect(() => {
    let canceled = false;
    if (!search.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try { const { data } = await api.get(`/conversations/${conversationId}/messages`, { params: { q: search.trim() } }); if (!canceled) { setResults(data.messages); setSearchError(""); } }
      catch (error) { if (!canceled) setSearchError(getErrorMessage(error)); }
    }, 300);
    return () => { canceled = true; clearTimeout(timer); };
  }, [search, conversationId]);

  // ---------- auto scroll ----------
  useEffect(() => {
    if (loading) return;
    if (skipScroll.current) { skipScroll.current = false; return; }
    bottomRef.current?.scrollIntoView({ behavior: firstScrollRef.current ? "auto" : "smooth" });
    firstScrollRef.current = false;
  }, [messages.length, otherTyping, loading]);

  return (
    <section onDragOver={event => { if (mediaEnabled && event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => { if (mediaEnabled && event.dataTransfer.files.length) { event.preventDefault(); void imageSharing.addFiles([...event.dataTransfer.files]); } }} className="panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border bg-surface md:rounded-2xl">
      <header className="flex items-center gap-3 border-b border-border bg-header px-3 py-4 md:px-5">
        <button
          onClick={onBack}
          aria-label="Back to conversations"
          className="rounded-lg p-2 text-muted hover:bg-surface-2 md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={other.name} avatar={other.avatar} online={isOnline} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-text">{other.name}</p>
          <p className={`text-xs ${otherTyping ? "text-primary-ink " : isOnline ? "text-online-ink" : "text-muted"}`}>
            {otherTyping ? "typing..." : other.isBot ? "Always online - automated replies" : isOnline ? "Online" : "Offline"}
          </p>
          {!isOnline && lastSeen && <p className="truncate text-[11px] text-muted">Last seen {new Date(lastSeen).toLocaleString()}</p>}
          {other.about && <p className="truncate text-[11px] text-muted" title={other.about}>{other.about}</p>}
        </div>
        <button aria-label="Search messages" className="media-control" onClick={() => setSearchOpen(value => !value)}><Search size={18} /></button>
        {(
          <details className="relative shrink-0">
            <summary aria-label={other.isBot ? "Chat options" : "Friend options"} className="list-none rounded-lg p-2 text-muted hover:bg-surface-2"><MoreVertical className="h-5 w-5" /></summary>
            <div className="absolute right-0 z-40 mt-2 flex w-52 max-w-[80vw] flex-col rounded-xl border border-border bg-surface p-2 text-sm shadow-lg">
              <button className="media-control" onClick={() => void manageChat({ pinned: !conversation.settings?.pinned })}>{conversation.settings?.pinned ? "Unpin chat" : "Pin chat"}</button>
              <button className="media-control" onClick={() => void manageChat({ muted: !conversation.settings?.muted })}>{conversation.settings?.muted ? "Unmute chat" : "Mute chat"}</button>
              <button className="media-control" onClick={() => void manageChat({ archived: !conversation.settings?.archived })}>{conversation.settings?.archived ? "Unarchive chat" : "Archive chat"}</button>
              {!other.isBot && <label className="mt-2 text-xs text-muted">Disappearing messages<select aria-label="Disappearing messages" className="min-h-10 w-full rounded border border-border bg-input px-2 text-text" value={conversation.disappearingSeconds || 0} onChange={event => void setTimer(Number(event.target.value))}>{[[0, "Off"], [3600, "1 hour"], [86400, "24 hours"], [604800, "7 days"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            {!other.isBot && <><button disabled={busy} onClick={() => {
              if (window.confirm(`Unfriend ${other.name}? Your saved history will remain, but you cannot send new messages until you are friends again.`)) onUnfriend(otherId);
            }} className="media-control text-danger-ink">Unfriend</button><button className="media-control text-danger-ink" onClick={() => void block()}>Block user</button></>}
            </div>
          </details>
        )}
      </header>
      {searchOpen && <div className="shrink-0 border-b border-border p-2"><input aria-label="Search in chat" placeholder="Search messages…" value={search} onChange={event => setSearch(event.target.value)} className="min-h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-text" />{searchError && <p role="alert">{searchError}</p>}{search.trim() && <div className="max-h-36 overflow-y-auto" aria-label="Message search results">{results.length ? results.map(message => <button key={message._id} className="block w-full truncate p-2 text-left text-sm hover:bg-surface-2" onClick={() => void jump(message._id)}>{message.type === "image" ? `Photo: ${message.caption}` : message.content}</button>) : <p className="p-2 text-sm text-muted">No matching messages.</p>}</div>}</div>}

      <div ref={scrollRef} aria-label="Message history" onScroll={event => { if (event.currentTarget.scrollTop < 60) void loadOlder(); }} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 md:px-4">
        {hasMore && <button disabled={olderLoading} className="media-control mx-auto my-2 block" onClick={() => void loadOlder()}>{olderLoading ? "Loading older messages…" : "Load older messages"}</button>}
        {olderError && <p role="alert" className="text-sm text-danger-ink">{olderError}</p>}
        {loading ? (
          <MessagesSkeleton />
        ) : error ? (
          <div role="alert" className="mx-auto mt-10 max-w-xs text-center">
            <p className="text-sm text-danger-ink">{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                loadMessages();
              }}
              className="brand-gradient mt-3 rounded-xl px-4 py-2 text-sm font-medium text-on-primary"
            >
              Try again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted">
            No messages yet. Say hello to {other.name}!
          </p>
        ) : (
          <div>
            {messages.map((m, index) => (
              <Fragment key={m.tempId || m._id}>
                {(index === 0 || new Date(messages[index - 1].createdAt).toDateString() !== new Date(m.createdAt).toDateString()) && (
                  <div role="separator" aria-label={formatMessageDate(m.createdAt)} className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] font-medium text-muted">{formatMessageDate(m.createdAt)}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <MessageBubble
                  message={m}
                  mine={m.sender === me._id}
                  isBot={other.isBot && m.sender !== me._id}
                  senderName={m.sender === me._id ? me.name : other.name}
                  onCancelUpload={imageSharing.cancel}
                  botChat={other.isBot}
                  currentUserId={me._id}
                  onReply={setReply}
                  onJump={jump}
                  onAction={(name, fields) => action(m, name, fields)}
                  read={me.settings?.readReceipts !== false && !!otherReadAt && new Date(otherReadAt) >= new Date(m.createdAt)}
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
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 shadow-sm">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-1.5 w-1.5 rounded-full bg-muted"
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {other.isBot && (
        <div aria-label="Buddy quick replies" className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-surface px-3 py-2 md:px-4">
          {["topics", "dsa", "web dev", "quiz me", "random tip"].map(text => (
            <button key={text} type="button" onClick={() => handleSend(text)} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-primary-ink hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{text}</button>
          ))}
        </div>
      )}
      <MessageInput onSend={handleSend} onTyping={handleTyping} onStopTyping={stopTyping} images={imageSharing} reply={reply} onCancelReply={() => setReply(null)} />
    </section>
  );
}
