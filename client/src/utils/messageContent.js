// Return text/code segments only. React remains responsible for escaping content.
export function splitMessageContent(content) {
  const parts = [];
  const fences = /```([a-zA-Z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  let cursor = 0;
  for (const match of content.matchAll(fences)) {
    if (match.index > cursor) parts.push({ type: "text", text: content.slice(cursor, match.index) });
    parts.push({ type: "code", language: match[1] || "text", text: match[2].replace(/\r?\n$/, "") });
    cursor = match.index + match[0].length;
  }
  if (cursor < content.length) parts.push({ type: "text", text: content.slice(cursor) });
  return parts;
}
