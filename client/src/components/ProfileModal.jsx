import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../hooks/useAuth";
import { allowedImages, prepareImage, uploadImage } from "../services/media";
import { getErrorMessage } from "../services/api";
import { characterCount, limitCharacters } from "../utils/characters";
import { passwordError } from "../utils/passwords";

export default function ProfileModal({ onClose }) {
  const { user, mediaEnabled, updateProfile, logoutAll, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState(""), [newPassword, setNewPassword] = useState("");
  const [removeLocation, setRemoveLocation] = useState(user.settings?.removePhotoLocation !== false);
  const [name, setName] = useState(user.name), [about, setAbout] = useState(user.about || ""), [photo, setPhoto] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0);
  const controller = useRef(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { const key = event => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key); }, [onClose]);
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(""); controller.current = new AbortController();
    try {
      let avatar;
      if (mediaEnabled && photo) {
        const file = await prepareImage(photo, { maxWidth: 512, maxHeight: 512, removeLocation });
        if (!file.thumb) throw new Error("Could not create an avatar thumbnail. Choose another supported photo.");
        const key = await uploadImage(file.file, file.mime, undefined, "avatar-original", { width: file.width, height: file.height }, controller.current.signal, setProgress);
        const thumbKey = await uploadImage(file.thumb, "image/jpeg", undefined, "avatar-thumb", { width: file.thumbWidth, height: file.thumbHeight }, controller.current.signal);
        avatar = { key, thumbKey };
      }
      await updateProfile({ name, about, settings: { removePhotoLocation: removeLocation }, ...(avatar ? { avatar } : {}) });
      if (alive.current) onClose();
    } catch (error) { if (alive.current) setError(getErrorMessage(error)); }
    finally { if (alive.current) setBusy(false); }
  };
  return createPortal(<div className="media-overlay" role="dialog" aria-modal="true" aria-label="Edit profile"><form onSubmit={save} className="max-h-[90dvh] w-full max-w-sm space-y-3 overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-text">
    <h2 className="text-lg font-semibold">Your profile</h2>
    <label className="block text-sm">Name<input autoFocus aria-label="Profile name" value={name} onChange={event => setName(event.target.value)} maxLength={50} required minLength={2} className="mt-1 min-h-10 w-full rounded border border-border bg-input p-2" /></label>
    <label className="block text-sm">About<textarea aria-label="About" value={about} onChange={event => setAbout(limitCharacters(event.target.value, 140))} className="mt-1 w-full rounded border border-border bg-input p-2" /><span className="text-xs text-muted">{characterCount(about)}/140</span></label>
    {mediaEnabled && <><label className="block text-sm">Avatar photo<input aria-label="Avatar photo" type="file" accept={allowedImages} onChange={event => setPhoto(event.target.files[0] || null)} className="mt-1 block w-full min-w-0 text-xs" /></label>
    <p className="text-xs text-muted">Original kept privately. A thumbnail up to 512px is displayed.</p></>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={removeLocation} onChange={event => setRemoveLocation(event.target.checked)} />Remove location data from photos</label>
    <p className="text-xs text-muted">Removes JPEG EXIF without changing pixels. Other metadata may remain; some originals may display rotated.</p>
    {busy && photo && <p role="status">Uploading avatar: {progress}%</p>}{error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
    <div className="flex gap-2"><button disabled={busy} className="media-control" type="submit">Save profile</button><button type="button" className="media-control" onClick={onClose}>Cancel</button></div>
    <fieldset className="space-y-2 border-t border-border pt-2"><legend className="text-sm">Account security</legend>
      <p className="text-xs text-muted">Hardened, privacy-focused. The server can read messages.</p>
      <input type="password" aria-label="Current password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder="Current password" className="min-h-10 w-full rounded border border-border bg-input p-2 text-sm" />
      <input type="password" aria-label="New password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="New password, at least 8 characters" className="min-h-10 w-full rounded border border-border bg-input p-2 text-sm" />
      <button type="button" disabled={busy || !currentPassword || !newPassword} className="media-control" onClick={async () => { const error = passwordError(newPassword); if (error) { setError(error); return; } setBusy(true); try { await changePassword({ currentPassword, newPassword }); } catch (error) { if (alive.current) { setError(getErrorMessage(error)); setBusy(false); } } }}>Change password</button>
      <button type="button" disabled={busy} className="media-control" onClick={async () => { setBusy(true); try { await logoutAll(); } catch (error) { if (alive.current) { setError(getErrorMessage(error)); setBusy(false); } } }}>Log out of all devices</button>
    </fieldset>
  </form></div>, document.body);
}
