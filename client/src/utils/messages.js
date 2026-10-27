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
      // A history/socket response can prove persistence, but only the send ack
      // clears this tab's pending/failed delivery state.
      result[index] = existing.status && !message.status ? { ...message, status: existing.status } : message;
      for (let i = result.length - 1; i > index; i--) {
        if (matches(result[i])) result.splice(i, 1);
      }
    }
  }
  return result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export const latestReadAt = (previous, incoming) =>
  !incoming || (previous && new Date(previous) >= new Date(incoming)) ? previous : incoming;
