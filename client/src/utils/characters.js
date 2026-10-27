const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const characters = text => [...segmenter.segment(text)].map(part => part.segment);
export const characterCount = text => characters(text).length;
export const limitCharacters = (text, max) => characters(text).slice(0, max).join("");
export function isLargeEmoji(text) {
  const parts = characters(text.trim());
  return parts.length >= 1 && parts.length <= 3 && parts.every(part => /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(part) && !/[a-z]/i.test(part));
}
