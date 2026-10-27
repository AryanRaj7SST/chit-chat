import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Camera, Paperclip, Send, Smile, X } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { allowedImages } from "../services/media";
import { characterCount, limitCharacters } from "../utils/characters";
import CameraModal from "./CameraModal";

const EmojiPicker = lazy(() => import("emoji-picker-react"));
const touchDevice = () => window.matchMedia("(pointer: coarse)").matches;

export default function MessageInput({ onSend, onTyping, onStopTyping, images }) {
  const [text, setText] = useState(""), [caption, setCaption] = useState("");
  const [emoji, setEmoji] = useState(false), [attach, setAttach] = useState(false), [camera, setCamera] = useState(false);
  const { resolvedTheme } = useTheme();
  const ref = useRef(null), picker = useRef(null), fileInput = useRef(null), nativeCamera = useRef(null);
  const cursor = useRef({ start: 0, end: 0 }), emojiButton = useRef(null), captionRef = useRef(null), target = useRef(null);
  const closeCamera = useCallback(() => setCamera(false), []);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);
  useEffect(() => {
    if (!emoji && !attach) return;
    const click = event => { if (!picker.current?.contains(event.target)) { setEmoji(false); setAttach(false); } };
    const key = event => { if (event.key === "Escape") { setEmoji(false); setAttach(false); emojiButton.current?.focus(); } };
    document.addEventListener("pointerdown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", click); document.removeEventListener("keydown", key); };
  }, [emoji, attach]);
  const submit = () => {
    if (images.preparing) return;
    if (images.drafts.length) { images.send(caption.trim()); setCaption(""); onStopTyping(); }
    else { const value = text.trim(); if (!value) return; onSend(value); setText(""); }
    ref.current?.focus();
  };
  const choose = event => { void images.addFiles([...event.target.files]); event.target.value = ""; setAttach(false); };
  const capture = async photo => { await images.addFiles([photo]); images.send(caption.trim()); setCaption(""); };
  const rememberCursor = event => { target.current = event.target; cursor.current = { start: event.target.selectionStart, end: event.target.selectionEnd }; };
  const insertEmoji = data => {
    const input = target.current === captionRef.current && captionRef.current ? captionRef.current : ref.current;
    const value = input.value, start = cursor.current.start ?? value.length, end = cursor.current.end ?? start;
    const next = limitCharacters(value.slice(0, start) + data.emoji + value.slice(end), input === captionRef.current ? 1000 : 2000);
    if (input === captionRef.current) setCaption(next); else setText(next);
    const position = Math.min(next.length, start + data.emoji.length);
    cursor.current = { start: position, end: position };
    requestAnimationFrame(() => { if (!touchDevice()) input.focus(); input.setSelectionRange(position, position); });
    setEmoji(false);
  };
  return <div className="composer relative min-w-0 shrink-0 border-t border-border bg-surface p-2 md:p-4" onPaste={event => {
    const files = [...(event.clipboardData?.items || [])].filter(item => item.kind === "file").map(item => item.getAsFile()).filter(Boolean);
    if (files.length) { event.preventDefault(); void images.addFiles(files); }
  }}>
    {images.error && <p role="alert" className="mb-2 text-sm text-danger-ink">{images.error}</p>}
    {images.preparing && <p role="status" className="mb-2 text-sm text-muted">Preparing photo previews…</p>}
    {images.drafts.length > 0 && <div className="mb-2 min-w-0 rounded-xl border border-border bg-surface-2 p-2">
      <p className="mb-1 text-xs font-medium text-text">Original quality · {images.drafts.length}/10</p>
      <div className="flex min-w-0 gap-2 overflow-x-auto pb-2" aria-label="Photo previews">
        {images.drafts.map(item => <div key={item.id} className="relative w-28 shrink-0 rounded-lg border border-border bg-surface p-1">
          <img src={item.localUrl} alt="Selected photo preview" className="h-20 w-full rounded object-cover" />
          <button aria-label="Remove photo" disabled={images.preparing} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text" onClick={() => images.remove(item.id)}><X size={18} /></button>
          <span className="block text-xs text-muted">{(item.file.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>)}
      </div>
      <input ref={captionRef} aria-label="Photo caption" placeholder="Add a caption…" value={caption} onSelect={rememberCursor} onChange={event => setCaption(limitCharacters(event.target.value, 1000))} className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-input px-2 text-sm text-text" />
      <span className="text-xs text-muted">{characterCount(caption)}/1000</span>
    </div>}
    <div className="flex min-w-0 items-end gap-1 rounded-[26px] border border-border bg-input p-1.5 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20">
      <div ref={picker} className="flex shrink-0">
        <button type="button" aria-label="Attach photos" aria-expanded={attach} className="composer-button" onClick={() => { setAttach(value => !value); setEmoji(false); }}><Paperclip size={19} /></button>
        {attach && <div className="absolute bottom-full left-2 z-20 mb-2 flex flex-col rounded-xl border border-border bg-surface p-2 shadow-lg">
          <button className="media-control" onClick={() => fileInput.current.click()}>Choose photos</button>
          <button className="media-control" onClick={() => { setAttach(false); if (touchDevice() || !navigator.mediaDevices?.getUserMedia) nativeCamera.current.click(); else setCamera(true); }}><Camera size={17} /> Camera</button>
        </div>}
        <button ref={emojiButton} type="button" aria-label="Choose emoji" aria-expanded={emoji} className="composer-button" onClick={() => { setEmoji(value => !value); setAttach(false); }}><Smile size={19} /></button>
        {emoji && <div className="emoji-popup absolute bottom-full left-2 z-30 mb-2 max-w-[calc(100%-1rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-lg" role="dialog" aria-label="Emoji picker">
          <Suspense fallback={<p className="p-4 text-sm text-muted">Loading emojis…</p>}><EmojiPicker theme={resolvedTheme} emojiStyle="native" autoFocusSearch={!touchDevice()} lazyLoadEmojis width="100%" height={320} onEmojiClick={insertEmoji} previewConfig={{ showPreview: false }} /></Suspense>
        </div>}
      </div>
      <input ref={fileInput} className="sr-only" tabIndex={-1} type="file" accept={allowedImages} multiple onChange={choose} aria-label="Photo files" />
      <input ref={nativeCamera} className="sr-only" tabIndex={-1} type="file" accept="image/*" capture="environment" onChange={choose} aria-label="Native camera photo" />
      <textarea ref={ref} rows={1} value={text} onSelect={rememberCursor} onChange={event => { const value = limitCharacters(event.target.value, 2000); setText(value); if (value.trim()) onTyping(); else onStopTyping(); }}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} placeholder="Type a message..." aria-label="Message" className="max-h-32 min-w-0 flex-1 resize-none rounded-2xl border-0 bg-transparent px-1 py-2.5 text-sm text-text outline-none focus-visible:outline-none" />
      <button onClick={submit} disabled={images.preparing || (!text.trim() && !images.drafts.length)} aria-label="Send message" className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-primary shadow-sm disabled:cursor-not-allowed"><Send size={18} /></button>
    </div>
    {camera && <CameraModal onClose={closeCamera} onCapture={capture} />}
  </div>;
}
