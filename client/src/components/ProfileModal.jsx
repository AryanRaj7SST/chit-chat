import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../hooks/useAuth";
import { allowedImages, prepareImage, uploadImage } from "../services/media";
import { getErrorMessage } from "../services/api";
import { characterCount, limitCharacters } from "../utils/characters";

export default function ProfileModal({ onClose }) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user.name), [about, setAbout] = useState(user.about || ""), [photo, setPhoto] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0);
  const controller = useRef(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { const key = event => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, [onClose]);
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(""); controller.current = new AbortController();
    try {
      let avatar;
      if (photo) {
        const file = await prepareImage(photo, { maxWidth: 512, maxHeight: 512 });
        if (!file.thumb) throw new Error("Could not create an avatar thumbnail. Choose another supported photo.");
        const key = await uploadImage(file.file, file.mime, undefined, "avatar-original", { width: file.width, height: file.height }, controller.current.signal, setProgress);
        const thumbKey = await uploadImage(file.thumb, "image/jpeg", undefined, "avatar-thumb", { width: file.thumbWidth, height: file.thumbHeight }, controller.current.signal);
        avatar = { key, thumbKey };
      }
      await updateProfile({ name, about, ...(avatar ? { avatar } : {}) });
      if (alive.current) onClose();
    } catch (error) { if (alive.current) setError(getErrorMessage(error)); }
    finally { if (alive.current) setBusy(false); }
  };
  return createPortal(<div className="media-overlay" role="dialog" aria-modal="true" aria-label="Edit profile"><form onSubmit={save} className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-surface p-4 text-text">
    <h2 className="text-lg font-semibold">Your profile</h2>
    <label className="block text-sm">Name<input autoFocus aria-label="Profile name" value={name} onChange={event => setName(event.target.value)} maxLength={50} required minLength={2} className="mt-1 min-h-10 w-full rounded border border-border bg-input p-2" /></label>
    <label className="block text-sm">About<textarea aria-label="About" value={about} onChange={event => setAbout(limitCharacters(event.target.value, 140))} className="mt-1 w-full rounded border border-border bg-input p-2" /><span className="text-xs text-muted">{characterCount(about)}/140</span></label>
    <label className="block text-sm">Avatar photo<input aria-label="Avatar photo" type="file" accept={allowedImages} onChange={event => setPhoto(event.target.files[0] || null)} className="mt-1 block w-full min-w-0 text-xs" /></label>
    <p className="text-xs text-muted">Original kept privately. A thumbnail up to 512px is displayed.</p>
    {busy && photo && <p role="status">Uploading avatar: {progress}%</p>}{error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
    <div className="flex gap-2"><button disabled={busy} className="media-control" type="submit">Save profile</button><button type="button" className="media-control" onClick={onClose}>Cancel</button></div>
  </form></div>, document.body);
}
