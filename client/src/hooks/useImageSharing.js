import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { prepareImage, uploadImage } from "../services/media";
import { getErrorMessage } from "../services/api";

export function useImageSharing({ conversationId, isBot, create, update, deliver }) {
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState("");
  const [preparingPreview, setPreparingPreview] = useState(false);
  const urls = useRef(new Set()), jobs = useRef(new Map()), alive = useRef(true);
  const preparing = useRef(false), currentDrafts = useRef([]);
  const change = next => { currentDrafts.current = next; setDrafts(next); };
  useEffect(() => {
    alive.current = true;
    const activeJobs = jobs.current, activeUrls = urls.current;
    return () => { alive.current = false; for (const job of activeJobs.values()) job.controller?.abort(); activeJobs.clear(); for (const url of activeUrls) URL.revokeObjectURL(url); activeUrls.clear(); };
  }, [conversationId]);
  const addFiles = async files => {
    if (isBot) { setError("Buddy can't see images yet"); return; }
    if (preparing.current) return;
    preparing.current = true; setPreparingPreview(true); setError("");
    try {
      const next = [...currentDrafts.current];
      for (const file of files) {
        if (next.length >= 10) { setError("Choose at most ten photos."); break; }
        try {
          const prepared = await prepareImage(file);
          if (!alive.current) return;
          prepared.id = crypto.randomUUID(); prepared.localUrl = URL.createObjectURL(file); urls.current.add(prepared.localUrl);
          next.push(prepared);
        } catch (err) { if (alive.current) setError(err.message); }
      }
      if (alive.current) change(next);
    } finally { preparing.current = false; if (alive.current) setPreparingPreview(false); }
  };
  const remove = id => {
    const item = currentDrafts.current.find(item => item.id === id);
    if (item) { URL.revokeObjectURL(item.localUrl); urls.current.delete(item.localUrl); }
    change(currentDrafts.current.filter(item => item.id !== id));
  };
  const run = async job => {
    job.controller = new AbortController();
    job.progress = job.files.map(() => 0);
    update(job.id, { status: "sending", progress: job.files.map(() => 0) });
    try {
      const attachments = [];
      for (let i = 0; i < job.files.length; i++) {
        const item = job.files[i], dimensions = { width: item.width, height: item.height };
        const key = await uploadImage(item.file, item.mime, conversationId, "original", dimensions, job.controller.signal, value => {
          job.progress[i] = value; if (alive.current) update(job.id, { progress: [...job.progress] });
        });
        let thumbKey;
        if (item.thumb) {
          try { thumbKey = await uploadImage(item.thumb, "image/jpeg", conversationId, "thumb", dimensions, job.controller.signal); }
          catch (err) { if (job.controller.signal.aborted) throw err; /* Original still sends without an optional thumbnail. */ }
        }
        attachments.push({ key, thumbKey, ...dimensions });
      }
      if (!alive.current || job.controller.signal.aborted) return;
      job.uploaded = { type: "image", attachments, caption: job.caption };
      update(job.id, { attachments: attachments.map((a, i) => ({ ...a, localUrl: job.files[i].localUrl, mime: job.files[i].mime })), uploading: false });
      deliver(job.id, job.uploaded);
    } catch (err) {
      if (!alive.current) return;
      update(job.id, { status: "failed", uploading: false });
      toast.error(job.controller.signal.aborted ? "Upload canceled. Tap retry to upload again." : getErrorMessage(err));
    }
  };
  const send = caption => {
    const files = [...currentDrafts.current]; if (!files.length) return;
    const id = `tmp-${crypto.randomUUID()}`;
    const job = { id, files, caption, progress: files.map(() => 0) };
    jobs.current.set(id, job); change([]);
    create(id, { type: "image", content: "", caption, uploading: true, progress: job.progress,
      attachments: files.map(item => ({ localUrl: item.localUrl, width: item.width, height: item.height, mime: item.mime })) });
    void run(job);
  };
  const retry = message => {
    const job = jobs.current.get(message.tempId);
    if (!job) return false;
    if (job.uploaded) { update(job.id, { status: "sending" }); deliver(job.id, job.uploaded); }
    else { update(job.id, { uploading: true }); void run(job); }
    return true;
  };
  const cancel = id => jobs.current.get(id)?.controller?.abort();
  const invalidate = id => { const job = jobs.current.get(id); if (job) job.uploaded = null; };
  const complete = id => {
    const job = jobs.current.get(id);
    if (!job) return;
    for (const item of job.files) { URL.revokeObjectURL(item.localUrl); urls.current.delete(item.localUrl); }
    jobs.current.delete(id);
  };
  return { drafts, error, preparing: preparingPreview, addFiles, remove, send, retry, cancel, complete, invalidate };
}
