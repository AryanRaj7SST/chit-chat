import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { mediaUrl } from "../services/media";

function SignedPhoto({ attachment, original = false, alt, className, onLoad }) {
  const [url, setUrl] = useState(attachment.localUrl || ""), [loaded, setLoaded] = useState(false), [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = original ? attachment.key : attachment.thumbKey;
  useEffect(() => {
    let canceled = false; setError(false); setLoaded(false);
    if (attachment.localUrl) { setUrl(attachment.localUrl); return; }
    setUrl("");
    if (key) mediaUrl(key, retry > 0).then(value => { if (!canceled) setUrl(value); }).catch(() => { if (!canceled) setError(true); });
    return () => { canceled = true; };
  }, [key, attachment.localUrl, retry]);
  if (!attachment.localUrl && !key) return <span className="flex h-full min-h-24 items-center justify-center p-3 text-sm text-muted">Photo · open original</span>;
  if (error) return <span className="flex h-full flex-col items-center justify-center gap-2 p-3 text-sm text-muted">Photo unavailable<button type="button" className="media-control" onClick={event => { event.stopPropagation(); setRetry(value => value + 1); }}>Retry photo</button></span>;
  return <img referrerPolicy="no-referrer" src={url || undefined} loading={original ? "eager" : "lazy"} alt={alt} draggable={false} onLoad={() => { setLoaded(true); onLoad?.(); }} onError={() => { if (retry < 1) setRetry(value => value + 1); else setError(true); }} className={`${className} ${loaded ? "" : "blur-sm"}`} />;
}

function Lightbox({ attachments, initial, sender, messageId, onClose }) {
  const [index, setIndex] = useState(initial), [zoom, setZoom] = useState(1), [downloading, setDownloading] = useState(false);
  const root = useRef(null), points = useRef(new Map()), pinch = useRef(null), close = useRef(null);
  const move = delta => { setIndex(value => (value + delta + attachments.length) % attachments.length); setZoom(1); };
  useEffect(() => {
    const previous = document.activeElement; close.current?.focus();
    const key = event => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") { setIndex(value => (value + 1) % attachments.length); setZoom(1); }
      if (event.key === "ArrowLeft") { setIndex(value => (value - 1 + attachments.length) % attachments.length); setZoom(1); }
      if (event.key === "Tab") {
        const buttons = [...root.current.querySelectorAll("button:not(:disabled)")];
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
      }
    };
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [attachments.length, onClose]);
  const download = async () => {
    setDownloading(true);
    try {
      const a = attachments[index];
      const response = await fetch(await mediaUrl(a.key, true), { referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error();
      const blob = await response.blob(), url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url;
      link.download = `photo-${String(messageId).replace(/[^a-z0-9-]/gi, "").slice(0, 60)}-${index + 1}.${({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" })[a.mime] || "jpg"}`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { toast.error("Could not download the original. Try again."); }
    finally { setDownloading(false); }
  };
  const pointer = event => {
    const previous = points.current.get(event.pointerId);
    if (previous && points.current.size === 1 && zoom > 1) {
      event.currentTarget.scrollLeft -= event.clientX - previous.x;
      event.currentTarget.scrollTop -= event.clientY - previous.y;
    }
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (points.current.size === 2) {
      const [a, b] = [...points.current.values()], distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (!pinch.current) pinch.current = { distance, zoom };
      else setZoom(Math.min(5, Math.max(1, pinch.current.zoom * distance / Math.max(1, pinch.current.distance))));
    }
  };
  return createPortal(<div className="media-overlay" role="dialog" aria-modal="true" aria-label="Photo viewer" ref={root}>
    <div className="flex h-full max-h-full w-full min-w-0 flex-col text-text">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-surface p-2">
        <span>{index + 1} / {attachments.length} · Original quality</span>
        <div className="flex flex-wrap gap-1"><button className="media-control" onClick={() => setZoom(value => Math.max(1, value - 0.5))}>Zoom out</button><button className="media-control" onClick={() => setZoom(value => Math.min(5, value + 0.5))}>Zoom in</button><button className="media-control" disabled={downloading || !attachments[index].key} onClick={download}>{downloading ? "Downloading…" : "Download"}</button><button ref={close} className="media-control" onClick={onClose}>Close viewer</button></div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto rounded-xl bg-surface-2" style={{ touchAction: "none" }} onWheel={event => setZoom(value => Math.min(5, Math.max(1, value + (event.deltaY < 0 ? 0.2 : -0.2))))}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pointer(event); }} onPointerMove={event => { if (points.current.has(event.pointerId)) pointer(event); }} onPointerUp={event => { points.current.delete(event.pointerId); pinch.current = null; }} onPointerCancel={event => { points.current.delete(event.pointerId); pinch.current = null; }}>
        <div className="flex min-h-full min-w-full items-center justify-center" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}><SignedPhoto key={index} attachment={attachments[index]} original alt={`Photo from ${sender}`} className="h-full w-full object-contain" /></div>
      </div>
      <div className="flex shrink-0 justify-between gap-2 p-2"><button className="media-control" onClick={() => move(-1)} disabled={attachments.length === 1}>Previous photo</button><button className="media-control" onClick={() => move(1)} disabled={attachments.length === 1}>Next photo</button></div>
    </div>
  </div>, document.body);
}

export default function ImageAttachments({ message, sender, onCancel }) {
  const [open, setOpen] = useState(null);
  const attachments = message.attachments || [];
  return <>
    <div className={`grid min-w-0 gap-2 ${attachments.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {attachments.map((attachment, index) => <div key={attachment.key || attachment.localUrl || index} className="relative min-h-24 min-w-0 overflow-hidden rounded-xl border border-border bg-surface-2 text-text" style={{ aspectRatio: attachment.width && attachment.height ? `${attachment.width} / ${attachment.height}` : "4 / 3", maxHeight: 360 }}>
        <div role="button" tabIndex={0} aria-label={`Open photo ${index + 1} from ${sender}`} onClick={() => setOpen(index)} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setOpen(index); } }} className="h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-primary">
          <SignedPhoto attachment={attachment} alt={`Photo from ${sender}`} className="h-full w-full object-cover" />
        </div>
        {message.uploading && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/60"><span role="progressbar" aria-label={`Uploading photo ${index + 1}`} aria-valuenow={message.progress?.[index] || 0} aria-valuemin={0} aria-valuemax={100} className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary bg-surface text-sm text-text" style={{ backgroundImage: `conic-gradient(var(--primary) ${(message.progress?.[index] || 0) * 3.6}deg, transparent 0)` }}><span className="rounded-full bg-surface p-1">{message.progress?.[index] || 0}%</span></span></div>}
      </div>)}
    </div>
    {message.uploading && <button className="media-control mt-2 text-text" onClick={() => onCancel?.(message.tempId)}>Cancel upload</button>}
    {message.caption && <p className="mt-2 whitespace-pre-wrap break-words">{message.caption}</p>}
    {open !== null && <Lightbox attachments={attachments} initial={open} sender={sender} messageId={message._id} onClose={() => setOpen(null)} />}
  </>;
}
