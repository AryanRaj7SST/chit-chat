import { entries, topics } from "./index.js";

export const normalize = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const allowed = new Set(["o(n)", "dp", "bfs", "dfs", "css", "dom", "api", "jwt", "sql", "oop", "tcp", "udp", "dns", "cdn", "bst", "lru"]);
const common = new Set(["a", "is", "time", "add"]);
const valid = word => !common.has(word) && (word.length >= 3 || allowed.has(word));
// Explicit boundaries also work for punctuation-ending aliases such as o(n).
const boundary = text => new RegExp(`(?:^|[^a-z0-9])${escape(text)}(?=$|[^a-z0-9])`);
const compiled = entries.map(entry => {
  const seen = new Set();
  const keywords = entry.keywords.filter(valid).flatMap(keyword => {
    const normalized = normalize(keyword);
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    return [{ raw: boundary(keyword), normalized: boundary(normalized),
      weight: normalized.split(" ").length, length: keyword.length }];
  });
  const main = normalize(entry.id.replace(/^(dsa|js|react|web|backend|cs)-/, ""));
  return { entry, keywords, main: valid(main) ? boundary(main) : null };
});

export function findEntry(text) {
  const raw = String(text).toLowerCase(), normalized = normalize(raw);
  let best = null, bestScore = 0, bestLength = 0;
  for (const candidate of compiled) {
    let score = 0, length = 0;
    for (const keyword of candidate.keywords) {
      if (keyword.raw.test(raw) || keyword.normalized.test(normalized)) {
        score += keyword.weight;
        length = Math.max(length, keyword.length);
      }
    }
    // An ID bonus strengthens a real keyword match; it cannot create one.
    if (score && candidate.main?.test(normalized)) score += 2;
    if (score > bestScore || (score === bestScore && length > bestLength)) {
      best = candidate.entry; bestScore = score; bestLength = length;
    }
  }
  return bestScore >= 1 ? best : null;
}

const byId = new Map(entries.map(entry => [entry.id, entry]));
const areas = new Map(Object.keys(topics).map(topic => [normalize(topic), topic]));
areas.set("webdev", "web dev");
areas.set("cs", "cs basics");

// An injectable clock/RNG allows bounded-session behavior to be tested without timers.
export function createKnowledgeResponder({ now = Date.now, random = Math.random, ttl = 30 * 60 * 1000, cap = 1000 } = {}) {
  const sessions = new Map();
  const stateFor = userId => {
    const time = now();
    for (const [key, state] of sessions) if (state.expires <= time) sessions.delete(key);
    const key = String(userId ?? "anonymous");
    let state = sessions.get(key);
    sessions.delete(key);
    if (!state) state = { seen: new Set(), last: null, pending: null };
    while (sessions.size >= cap) sessions.delete(sessions.keys().next().value);
    state.expires = time + ttl;
    sessions.set(key, state);
    return state;
  };
  const pick = state => {
    if (state.seen.size === entries.length) state.seen.clear();
    const remaining = entries.filter(entry => !state.seen.has(entry.id));
    const entry = remaining[Math.min(remaining.length - 1, Math.max(0, Math.floor(random() * remaining.length)))];
    state.seen.add(entry.id);
    return entry;
  };
  const remember = (entry, userId) => {
    stateFor(userId).last = entry.id;
    return entry.answer;
  };
  const command = (text, userId) => {
    const input = normalize(text);
    const state = stateFor(userId);
    if (["topics", "what can you teach", "what can you teach me"].includes(input)) {
      return "I can explain these areas:\n" + Object.entries(topics).map(([area, titles]) => `${area}: e.g. ${titles[0]}`).join("\n") + "\nType dsa, javascript, react, web dev, backend, or cs basics to browse. Try quiz me or random.";
    }
    if (areas.has(input)) return topics[areas.get(input)].slice(0, 20).join(", ") + ".\nType any concept name to learn it";
    if (["more", "example", "explain again"].includes(input)) {
      const last = byId.get(state.last);
      return last ? last.more || last.answer.split("\n").filter(line => line && !line.startsWith("```"))[1] || `Ask about ${last.title} to review the explanation.`
        : "Ask about a concept first, such as binary search or closure, then type more.";
    }
    if (["random", "tip", "random tip", "teach me something"].includes(input)) {
      const entry = pick(state); state.last = entry.id; return entry.answer;
    }
    if (input === "quiz me") {
      const entry = pick(state); state.pending = entry.id;
      return `What is ${entry.title}? Think of an explanation, then type answer, show, or idk to reveal it.`;
    }
    if (["answer", "show", "idk"].includes(input)) {
      const entry = byId.get(state.pending);
      if (!entry) return "Type quiz me for a question, or topics to browse concepts.";
      state.pending = null; state.last = entry.id; return entry.answer;
    }
    return null;
  };
  return { command, remember };
}

const responder = createKnowledgeResponder();
export const knowledgeCommand = responder.command;
export const rememberEntry = responder.remember;
