import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import { formatTime } from "../utils/format";
import toast from "react-hot-toast";
import { splitMessageContent } from "../utils/messageContent";

export default function MessageBubble({ message, mine, isBot, read, onRetry, groupedBefore, groupedAfter }) {
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
    <div data-message-id={message._id} data-grouped={groupedBefore ? "true" : "false"} className={`flex ${groupedBefore ? "mt-1" : "mt-3"} ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`min-w-0 max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm ${isBot ? "md:max-w-[75%]" : "md:max-w-[65%]"} ${
          mine
            ? "sent-bubble rounded-br-md text-on-primary"
            : "received-bubble rounded-bl-md border border-border bg-received text-text"
        } ${groupedBefore ? (mine ? "rounded-tr-md" : "rounded-tl-md") : ""} ${groupedAfter ? (mine ? "rounded-br-md" : "rounded-bl-md") : ""}`}
      >
        <div className="min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere]">
          {splitMessageContent(message.content).map((part, index) => part.type === "text" ? (
            <p key={index} className="whitespace-pre-wrap break-words">{part.text}</p>
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
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
            mine ? "text-sent-muted" : "text-muted"
          }`}
        >
          <span>{formatTime(message.createdAt)}</span>
          {mine && sending && <span aria-label="Sending"><Clock className="h-3 w-3" /></span>}
          {mine && failed && <AlertCircle className="h-3 w-3 text-on-primary" />}
          {mine && !sending && !failed && (
            <span aria-label={read ? "Read" : "Sent"} title={read ? "Read" : "Sent"}>
              {read ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
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
