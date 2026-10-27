export const MAX_MESSAGE_LENGTH = 2000;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const characterCount = value => Array.from(segmenter.segment(value)).length;

export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// React escapes output, so server-side cleaning = type check, strip control chars, trim
export const cleanMessageContent = (value) => {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
};

export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
