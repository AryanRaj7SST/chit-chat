import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import { formatTime } from "../utils/format";

export default function MessageBubble({ message, mine, read, onRetry, groupedBefore, groupedAfter }) {
  const failed = message.status === "failed";
  const sending = message.status === "sending";

  return (
    <div data-message-id={message._id} data-grouped={groupedBefore ? "true" : "false"} className={`flex ${groupedBefore ? "mt-1" : "mt-3"} ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`min-w-0 max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm md:max-w-[65%] ${
          mine
            ? "sent-bubble rounded-br-md text-on-primary"
            : "received-bubble rounded-bl-md border border-border bg-received text-text"
        } ${groupedBefore ? (mine ? "rounded-tr-md" : "rounded-tl-md") : ""} ${groupedAfter ? (mine ? "rounded-br-md" : "rounded-bl-md") : ""}`}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{message.content}</p>
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
