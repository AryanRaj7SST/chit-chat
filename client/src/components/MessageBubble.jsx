import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import { useRef, useState } from "react";
import { formatTime } from "../utils/format";
import toast from "react-hot-toast";
import { splitMessageContent } from "../utils/messageContent";
import ImageAttachments from "./ImageAttachments";
import { isLargeEmoji } from "../utils/characters";

export default function MessageBubble({ message, mine, isBot, botChat, currentUserId, senderName, onCancelUpload, read, onRetry, onReply, onJump, onAction, groupedBefore, groupedAfter }) {
  const touch = useRef(null);
  const [menu, setMenu] = useState(false), [editing, setEditing] = useState(false), [draft, setDraft] = useState(message.content || "");
  const failed = message.status === "failed";
  const sending = message.status === "sending";
  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy. Select the code to copy it manually.");
    }
  };

  return (
    <div data-message-id={message._id} data-grouped={groupedBefore ? "true" : "false"} onTouchStart={event => { touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchEnd={event => {
      const point = event.changedTouches[0], start = touch.current; touch.current = null;
      if (start && point.clientX - start.x > 65 && Math.abs(point.clientY - start.y) < 35 && !message.deletedAt && !message.status?.match(/sending|failed/)) onReply?.(message);
    }} className={`group relative flex ${groupedBefore ? "mt-1" : "mt-3"} ${message.type === "system" ? "justify-center" : mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`min-w-0 max-w-[80%] ${message.type === "image" ? "w-[420px]" : ""} rounded-2xl px-3.5 py-2 shadow-sm ${isBot ? "md:max-w-[75%]" : "md:max-w-[65%]"} ${
          message.type === "system" ? "border border-border bg-surface-2 text-muted" : mine
            ? "sent-bubble rounded-br-md text-on-primary"
            : "received-bubble rounded-bl-md border border-border bg-received text-text"
        } ${groupedBefore ? (mine ? "rounded-tr-md" : "rounded-tl-md") : ""} ${groupedAfter ? (mine ? "rounded-br-md" : "rounded-bl-md") : ""}`}
      >
        {message.replyTo && <button type="button" onClick={() => onJump?.(message.replyTo._id)} className="mb-2 block w-full max-w-full truncate rounded-lg border-l-4 border-primary bg-surface-2 px-2 py-1 text-left text-xs text-text" aria-label="Jump to replied message">↩ {message.replyTo.preview || "Message unavailable"}</button>}
        {message.deletedAt ? <><p className="text-sm italic">This message was deleted</p><button className="mt-1 text-xs underline" onClick={() => void onAction?.("delete", { forEveryone: false })}>Delete for me</button></> : <>
        <div className="min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere]">
          {message.type === "image" && <ImageAttachments message={message} sender={senderName} onCancel={onCancelUpload} />}
          {splitMessageContent(message.content || "").map((part, index) => part.type === "text" ? (
            <p key={index} className={`whitespace-pre-wrap break-words ${isLargeEmoji(message.content) ? "text-4xl leading-relaxed" : ""}`}>{part.text}</p>
          ) : (
            <div key={index} className="my-2 min-w-0 overflow-hidden rounded-xl border border-border bg-surface-2 text-text">
              <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-1 text-xs">
                <span className="text-muted">{part.language}</span>
                <button type="button" onClick={() => copyCode(part.text)} className="rounded px-1.5 py-1 font-medium text-primary-ink hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Copy</button>
              </div>
              <pre className="max-w-full overflow-x-auto p-3 font-mono text-[13px] leading-relaxed"><code>{part.text}</code></pre>
            </div>
          ))}
        </div>
        {message.reactions?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{[...new Set(message.reactions.map(r => r.emoji))].map(emoji => <button key={emoji} onClick={() => onAction?.("react", { emoji: message.reactions.some(r => r.user === currentUserId && r.emoji === emoji) ? null : emoji })} className="rounded-full border border-border bg-surface-2 px-2 text-xs text-text" aria-label={`React ${emoji}`}>{emoji} {message.reactions.filter(r => r.emoji === emoji).length}</button>)}</div>}
        {editing && <div className="mt-2"><textarea aria-label="Edit message text" className="w-full rounded border border-border bg-input p-2 text-text" value={draft} onChange={event => setDraft(event.target.value)} /><div className="flex gap-1"><button className="media-control" onClick={async () => { if (await onAction?.("edit", { content: draft })) setEditing(false); }}>Save edit</button><button className="media-control" onClick={() => setEditing(false)}>Cancel edit</button></div></div>}
        {!sending && !failed && <div className="mt-1 flex flex-wrap gap-1 text-xs md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button className="rounded px-1 underline" onClick={() => onReply?.(message)} aria-label="Reply to message">Reply</button>
          <button className="rounded px-1 underline" onClick={() => setMenu(value => !value)} aria-label="Message actions" aria-expanded={menu}>More</button>
        </div>}
        {menu && <div className="my-1 flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-surface-2 p-1 text-text">
          {!botChat && ["👍", "❤️", "😂", "😮", "😢", "🙏"].map(emoji => <button key={emoji} aria-label={`React ${emoji}`} className="media-control" onClick={() => { void onAction?.("react", { emoji }); setMenu(false); }}>{emoji}</button>)}
          {mine && !botChat && (!message.type || message.type === "text") && Date.now() - new Date(message.createdAt) <= 15 * 60000 && <button className="media-control" onClick={() => { setDraft(message.content); setEditing(true); setMenu(false); }}>Edit message</button>}
          <button className="media-control" onClick={() => { void onAction?.("delete", { forEveryone: false }); setMenu(false); }}>Delete for me</button>
          {mine && !botChat && Date.now() - new Date(message.createdAt) <= 48 * 3600000 && <button className="media-control" onClick={() => { if (window.confirm("Delete this message for everyone?")) void onAction?.("delete", { forEveryone: true }); setMenu(false); }}>Delete for everyone</button>}
        </div>}
        </>}
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
            mine ? "text-sent-muted" : "text-muted"
          }`}
        >
          <span>{formatTime(message.createdAt)}</span>
          {message.editedAt && !message.deletedAt && <span>edited</span>}
          {mine && sending && <span aria-label="Sending"><Clock className="h-3 w-3" /></span>}
          {mine && failed && <AlertCircle className="h-3 w-3 text-on-primary" />}
          {mine && message.type !== "system" && !sending && !failed && (
            <span className={read ? "rounded bg-surface px-0.5 text-primary-ink" : ""} aria-label={read ? "Read" : message.deliveredAt ? "Delivered" : "Sent"} title={read ? "Read" : message.deliveredAt ? "Delivered" : "Sent"}>
              {read || message.deliveredAt ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            </span>
          )}
        </div>
        {failed && (
          <button
            onClick={() => onRetry(message)}
            className="mt-1 text-xs font-medium text-on-primary underline"
          >
            Failed to send. Tap to retry
          </button>
        )}
      </div>
    </div>
  );
}
