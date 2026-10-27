// A persisted tempId lets history, socket events, and acknowledgements reconcile
// the same optimistic message, including after an acknowledgement is lost.
export function mergeMessages(previous, incoming) {
  const result = [...previous];
  for (const message of incoming) {
    const matches = (item) => item._id === message._id || (
      item.tempId && message.tempId && item.tempId === message.tempId && item.sender === message.sender
    );
    const index = result.findIndex(matches);
    if (index < 0) result.push(message);
    else {
      const existing = result[index];
      if ((existing.revision || 0) > (message.revision || 0)) { if (message.status === "sent") result[index] = { ...existing, status: "sent" }; continue; }
      // A history/socket response can prove persistence, but only the send ack
      // clears this tab's pending/failed delivery state.
      result[index] = existing.status && !message.status ? { ...message, status: existing.status } : message;
      const deliveredAt = latestReadAt(existing.deliveredAt, message.deliveredAt);
      if (deliveredAt !== undefined) result[index] = { ...result[index], deliveredAt };
      for (let i = result.length - 1; i > index; i--) {
        if (matches(result[i])) result.splice(i, 1);
      }
    }
  }
  return result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a._id).localeCompare(String(b._id)));
}

export const latestReadAt = (previous, incoming) =>
  !incoming || (previous && new Date(previous) >= new Date(incoming)) ? previous : incoming;
