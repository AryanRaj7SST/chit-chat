import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../hooks/useAuth";
import api, { getErrorMessage } from "../services/api";
import { playTone } from "../utils/sounds";

const choices = { theme: ["system", "light", "dark"], accent: ["violet", "blue", "teal", "green", "rose", "orange"], wallpaper: ["none", "dots", "grid", "diagonal", "violet", "sunrise", "ocean"], fontSize: ["small", "medium", "large"], bubbleStyle: ["rounded", "compact"], density: ["comfortable", "compact"], presence: ["everyone", "friends", "nobody"], soundTone: ["bell", "soft", "chime"] };
export default function SettingsPanel({ onClose, onEditProfile }) {
  const { user, updateProfile, logout } = useAuth();
  const [draft, setDraft] = useState(user.settings || {}), [error, setError] = useState(""), [busy, setBusy] = useState(false), [password, setPassword] = useState("");
  const panel = useRef(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; panel.current?.querySelector("button")?.focus();
    const key = event => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const elements = [...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const select = (key, label, fallback) => <label className="settings-row">{label}<select aria-label={label} value={draft[key] || fallback} onChange={event => setDraft({ ...draft, [key]: event.target.value })}>{choices[key].map(value => <option key={value} value={value}>{value}</option>)}</select></label>;
  const toggle = (key, label, fallback = true) => <label className="settings-row"><span>{label}</span><input type="checkbox" checked={draft[key] ?? fallback} onChange={event => setDraft({ ...draft, [key]: event.target.checked })} /></label>;
  const save = async () => { setBusy(true); setError(""); try { await updateProfile({ settings: draft }); onClose(); } catch (error) { setError(getErrorMessage(error)); } finally { setBusy(false); } };
  const exportData = async () => {
    setBusy(true); setError("");
    try { const { data } = await api.get("/users/me/export"); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "mern-chat-export.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (error) { setError(getErrorMessage(error)); } finally { setBusy(false); }
  };
  return createPortal(<div className="settings-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><section ref={panel} role="dialog" aria-modal="true" aria-label="Settings" className="settings-panel">
    <header className="flex items-center justify-between border-b border-border p-4"><h2 className="text-lg font-semibold">Settings</h2><button className="media-control" aria-label="Close settings" disabled={busy} onClick={onClose}>Close</button></header>
    <div className="settings-content">
      <fieldset><legend>Appearance</legend>{select("theme", "Theme", "system")}{select("accent", "Accent color", "violet")}{select("wallpaper", "Chat wallpaper", "none")}{select("fontSize", "Font size", "medium")}{select("bubbleStyle", "Bubble style", "rounded")}{select("density", "Message density", "comfortable")}{toggle("enterToSend", "Enter to send")}<p>When off, Ctrl+Enter sends. Shift+Enter adds a line.</p></fieldset>
      <fieldset><legend>Privacy</legend>{toggle("readReceipts", "Read receipts")}<p>When off, you also stop seeing other people's read ticks.</p>{toggle("typingIndicators", "Share typing indicators")}{select("presence", "Last seen and online visibility", "friends")}{toggle("removePhotoLocation", "Remove location data from photos")}<p>Removes JPEG EXIF without re-encoding pixels. Other metadata may remain; orientation can change.</p>{toggle("hidePreviews", "Hide message previews in notifications")}</fieldset>
      <fieldset><legend>Notifications</legend>{toggle("browserNotifications", "Browser notifications")}<button className="media-control" type="button" onClick={async () => { if (!("Notification" in window)) { setError("Browser notifications are unavailable."); return; } const permission = await Notification.requestPermission(); if (permission !== "granted") setError("Allow notifications in your browser's site settings."); }}>Enable notifications</button>{toggle("messageSound", "Message sound", false)}{select("soundTone", "Message tone", "bell")}<button className="media-control" onClick={() => void playTone(draft.soundTone)}>Preview tone / enable sound</button><p>Sound needs a browser gesture and may be restricted by your device. Mute individual chats from their chat menu.</p></fieldset>
      <fieldset><legend>Media</legend><label className="settings-row">Always send photos in original quality<input type="checkbox" checked disabled /></label><p>Photos are never recompressed. JPEG EXIF removal only changes metadata. Full originals download only when opened; thumbnails load first.</p></fieldset>
      <fieldset><legend>Account</legend><button className="media-control" disabled={busy} onClick={onEditProfile}>Edit name, About, avatar and password</button><p>The profile panel also offers Log out of all devices.</p><button className="media-control" disabled={busy} onClick={() => void exportData()}>Export my data</button><p>Exports your profile and authored messages. Media links are excluded and marked expired.</p><label className="block text-sm">Password to delete account<input aria-label="Password to delete account" autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} /></label><p>Deletion permanently removes your account, authored messages and storage objects. Other people's remaining history shows Deleted user.</p><button className="media-control text-danger-ink" disabled={busy || !password} onClick={async () => { if (!window.confirm("Permanently delete your account and authored messages? This cannot be undone.")) return; setBusy(true); setError(""); try { await api.delete("/users/me", { data: { password } }); logout(); } catch (error) { setError(getErrorMessage(error)); setBusy(false); } }}>Delete account permanently</button></fieldset>
      {error && <p role="alert" className="text-danger-ink">{error}</p>}
    </div><footer className="border-t border-border p-3"><button disabled={busy} className="brand-gradient min-h-10 rounded-lg px-4" onClick={() => void save()}>{busy ? "Working…" : "Save settings"}</button><span className="ml-2 text-xs text-muted">Saved settings follow your account.</span></footer>
  </section></div>, document.body);
}
