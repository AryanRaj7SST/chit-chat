import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

export default function MessageInput({ onSend, onTyping, onStopTyping }) {
  const [text, setText] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
    ref.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const handleChange = (e) => {
    setText(e.target.value);
    if (e.target.value.trim()) onTyping();
    else onStopTyping();
  };

  return (
    <div className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={2000}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        className="max-h-32 min-w-0 flex-1 resize-none rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
      />
      <button
        onClick={submit}
        disabled={!text.trim()}
        aria-label="Send message"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}
