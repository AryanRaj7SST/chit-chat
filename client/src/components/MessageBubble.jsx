import { AlertCircle, Check, Clock } from "lucide-react";
import { formatTime } from "../utils/format";

export default function MessageBubble({ message, mine, onRetry }) {
  const failed = message.status === "failed";
  const sending = message.status === "sending";

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`min-w-0 max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm md:max-w-[65%] ${
          mine
            ? "rounded-br-md bg-indigo-600 text-white"
            : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            mine ? "text-indigo-200" : "text-slate-400"
          }`}
        >
          <span>{formatTime(message.createdAt)}</span>
          {mine && sending && <Clock className="h-3 w-3" />}
          {mine && failed && <AlertCircle className="h-3 w-3 text-rose-200" />}
          {mine && !sending && !failed && <Check className="h-3 w-3" />}
        </div>
        {failed && (
          <button
            onClick={() => onRetry(message)}
            className="mt-1 text-xs font-medium text-rose-200 underline"
          >
            Failed to send. Tap to retry
          </button>
        )}
      </div>
    </div>
  );
}
