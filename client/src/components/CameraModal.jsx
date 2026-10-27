import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function CameraModal({ onClose, onCapture }) {
  const video = useRef(null), stream = useRef(null), root = useRef(null);
  const [facing, setFacing] = useState("environment"), [photo, setPhoto] = useState(null);
  const [error, setError] = useState(""), [ready, setReady] = useState(false);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!photo) { setPreview(""); return; }
    const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    let canceled = false;
    const stop = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; };
    const start = async () => {
      stop(); setReady(false); setError("");
      if (photo) return;
      if (!window.isSecureContext) { setError("Camera needs HTTPS; localhost also works."); return; }
      if (!navigator.mediaDevices?.getUserMedia) { setError("Camera preview is unavailable. Use the native camera option."); return; }
      try {
        let acquired;
        try { acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 4096 }, height: { ideal: 2160 } } }); }
        catch (err) {
          if (!["OverconstrainedError", "NotReadableError"].includes(err.name)) throw err;
          acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
        if (canceled || document.hidden) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream.current = acquired;
        if (video.current) { video.current.srcObject = acquired; await video.current.play(); }
      } catch (err) {
        if (canceled) return;
        stop(); setError(err.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in your browser or choose a photo." : err.name === "NotFoundError" ? "No camera was found. Choose a photo instead." : "Could not start the camera. Try the native camera option or choose a photo.");
      }
    };
    void start();
    const hide = () => { if (document.hidden) { stop(); onClose(); } };
    const key = event => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const controls = [...root.current.querySelectorAll('button:not(:disabled), input')];
        if (!controls.length) return;
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
      }
    };
    document.addEventListener("visibilitychange", hide); document.addEventListener("keydown", key);
    return () => { canceled = true; stop(); document.removeEventListener("visibilitychange", hide); document.removeEventListener("keydown", key); };
  }, [facing, photo, onClose]);
  const capture = () => {
    const v = video.current; if (!v?.videoWidth || !v.videoHeight) return;
    const canvas = document.createElement("canvas"); canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    canvas.getContext("2d").drawImage(v, 0, 0);
    canvas.toBlob(blob => { if (blob) setPhoto(new File([blob], "camera.jpg", { type: "image/jpeg" })); else setError("Could not capture a photo. Try again."); }, "image/jpeg", 0.95);
  };
  return createPortal(
    <div className="media-overlay" role="dialog" aria-modal="true" aria-label="Camera" ref={root}>
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-surface p-3 text-text">
        <div className="flex items-center justify-between"><h2>Camera</h2><button autoFocus onClick={onClose} className="media-control">Close camera</button></div>
        {error && <p role="alert" className="p-3 text-danger-ink">{error}</p>}
        {preview ? <img src={preview} alt="Captured photo preview" className="max-h-[60dvh] w-full object-contain" /> : <video ref={video} autoPlay playsInline muted onLoadedMetadata={() => setReady(true)} className="max-h-[60dvh] w-full rounded-lg bg-surface-2" />}
        <div className="mt-3 flex flex-wrap gap-2">
          {photo ? <><button className="media-control" onClick={() => setPhoto(null)}>Retake</button><button className="media-control" onClick={() => { onCapture(photo); onClose(); }}>Send photo</button></> : <><button className="media-control" onClick={() => setFacing(value => value === "user" ? "environment" : "user")}>Switch camera</button><button className="media-control" disabled={!ready} onClick={capture}>Capture photo</button></>}
          <label className="media-control cursor-pointer">Use native camera<input className="sr-only" type="file" accept="image/*" capture="environment" onChange={event => { if (event.target.files[0]) { onCapture(event.target.files[0]); onClose(); } }} /></label>
        </div>
      </div>
    </div>, document.body,
  );
}
