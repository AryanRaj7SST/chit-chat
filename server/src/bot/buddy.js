import { randomBytes } from "node:crypto";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { pairKey } from "../utils/friendship.js";
import { findEntry, knowledgeCommand, rememberEntry } from "./knowledge/matcher.js";

let buddyPromise;
export function ensureBuddy() {
  if (!buddyPromise) buddyPromise = (async () => {
    let buddy = await User.findOne({ email: "buddy@buddy-ai.local" });
    if (!buddy) {
      try {
        buddy = await User.create({ name: "Buddy AI", email: "buddy@buddy-ai.local", password: randomBytes(24).toString("hex"), isBot: true });
      } catch (error) {
        if (error.code !== 11000) throw error;
        buddy = await User.findOne({ email: "buddy@buddy-ai.local" });
      }
    }
    if (!buddy?.isBot) throw new Error("Buddy's reserved email belongs to a non-bot account");
    return buddy._id;
  })().catch((error) => { buddyPromise = null; throw error; });
  return buddyPromise;
}

const conversationSetups = new Map();
export function ensureBuddyConversation(userId) {
  const key = String(userId);
  if (!conversationSetups.has(key)) {
    const setup = createBuddyConversation(userId).finally(() => conversationSetups.delete(key));
    conversationSetups.set(key, setup);
  }
  return conversationSetups.get(key);
}

async function createBuddyConversation(userId) {
  const buddyId = await ensureBuddy();
  const key = pairKey(userId, buddyId);
  const existing = await Conversation.findOne({ participantsKey: key });
  if (existing) return existing;
  // Metadata distinguishes the winning insert from concurrent/repeated calls.
  let result;
  try {
    result = await Conversation.findOneAndUpdate({ participantsKey: key }, {
      $setOnInsert: { participants: [userId, buddyId], createdAt: new Date(), updatedAt: new Date() },
    }, { upsert: true, returnDocument: "after", includeResultMetadata: true, timestamps: false });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return Conversation.findOne({ participantsKey: key });
  }
  const conversation = result.value;
  if (!result.lastErrorObject.updatedExisting) {
    const welcome = await Message.create({ conversation: conversation._id, sender: buddyId,
      content: "Hi! I'm Buddy AI, your automated chat buddy. Type help to see what I can do, or search for someone and add them as a friend." });
    await Conversation.updateOne({ _id: conversation._id, lastMessage: null }, { lastMessage: welcome._id });
  }
  return conversation;
}

export const JOKES = [
  "Why did the bicycle fall over? It was two-tired!",
  "What do you call a bear with no teeth? A gummy bear!",
  "Why did the computer get cold? It left its Windows open!",
  "What do clouds wear under their clothes? Thunderwear!",
  "Why did the math book look sad? It had too many problems!",
  "What do you call cheese that isn't yours? Nacho cheese!",
  "Why can't a nose be twelve inches long? Then it would be a foot!",
  "What did one wall say to the other? I'll meet you at the corner!",
];

// Knowledge sessions are bounded and process-local. No external AI or network calls.
// The optional third argument keeps time/joke tests deterministic.
export function getBuddyReply(text, userId, { now = new Date(), variant = Math.floor(Math.random() * 3), jokeIndex = 0 } = {}) {
  const input = String(text).toLowerCase();
  const choose = (values) => values[Math.abs(variant) % values.length];
  const command = knowledgeCommand(text, userId);
  if (command !== null) return command;
  if (/\bwhat time\b/.test(input)) {
    const time = now.toLocaleTimeString("en-US", { timeZoneName: "short" });
    return choose([`It's ${time} (server time).`, `My clock says ${time} (server time).`]);
  }
  if (/\bdate\b|what day/.test(input)) return choose([`Today is ${now.toDateString()} (server time).`, `The date here is ${now.toDateString()} (server time).`]);
  if (/\bjoke\b/.test(input)) return JOKES[Math.abs(jokeIndex) % JOKES.length];
  if (/how are you/.test(input)) return choose(["I'm doing well, thanks! How are you?", "I'm ready to chat! How's your day going?", "I'm here and happy to help. How are you feeling?"]);
  if (/your name|who are you/.test(input)) return choose(["I'm Buddy AI, a local rule-based chat bot. No external AI service is involved.", "My name is Buddy AI! I'm your automated chat companion."]);
  if (/\bthanks\b|thank you/.test(input)) return choose(["You're welcome!", "Happy to help!", "Any time, friend!"]);
  if (/\bbye\b|goodbye/.test(input)) return choose(["See you soon!", "Take care! I'll be here when you return."]);
  if (/\blove\b/.test(input)) return choose(["A little kindness goes a long way. I'm glad you're here!", "Sending some friendly encouragement your way!"]);
  if (/\bsad\b/.test(input)) return choose(["I'm sorry today feels hard. A small break or a chat with someone you trust might help.", "You don't have to handle a difficult day alone. Consider reaching out to a friend."]);
  if (/\bbored\b/.test(input)) return choose(["How about a short walk, a new song, or a joke?", "Try messaging a friend or ask me for a joke!"]);
  if (/\b(h+i+|he+y+|he+l+o+|hlo|yo+|sup)\b/i.test(input)) return choose(["Hello! How's your day going?", "Hey there! Nice to hear from you.", "Hi! Want a joke or some help finding friends?"]);
  const entry = findEntry(text);
  if (entry) return rememberEntry(entry, userId);
  if (/\bhelp\b|what can you do/.test(input)) return "Try topics to browse DSA, JavaScript, React, web dev, backend, and CS basics. Ask for quiz me or random to practice. I can also tell jokes, share server time/date, and explain adding friends.";
  if (/\bfriend\b|\bfriends\b|\badd\b/.test(input)) return choose(["Search for a name or email using at least two characters, then choose Add. When they accept, you can chat!", "Use Search to find people, send Add requests, and check the Requests tab to accept invitations."]);
  return "I'm a local rule-based buddy. Try topics to browse, or dsa for algorithms and data structures. You can also ask for help.";
}
