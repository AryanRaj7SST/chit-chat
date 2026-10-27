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
    <div className="border-t border-border bg-surface p-3 md:p-4">
    <div className="flex items-end gap-2 rounded-[26px] border border-border bg-input p-2 transition-colors duration-150 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={2000}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        aria-label="Message"
        className="max-h-32 min-w-0 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2.5 text-sm text-text outline-none focus-visible:outline-none"
      />
      <button
        onClick={submit}
        disabled={!text.trim()}
        aria-label="Send message"
        className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-primary shadow-sm disabled:cursor-not-allowed"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
    </div>
  );
}
