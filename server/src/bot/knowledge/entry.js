// Keep the content files compact while exposing ordinary, inspectable entries.
export const entry = (id, title, keywords, answer, more) => ({
  id, title, keywords: keywords.split("|"), answer,
  ...(more ? { more } : {}),
});
