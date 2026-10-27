import mongoose from "mongoose";
import HttpError from "../utils/HttpError.js";
export const settingChoices = {
  theme: ["system", "light", "dark"], accent: ["violet", "blue", "teal", "green", "rose", "orange"],
  wallpaper: ["none", "dots", "grid", "diagonal", "violet", "sunrise", "ocean"], fontSize: ["small", "medium", "large"],
  bubbleStyle: ["rounded", "compact"], density: ["comfortable", "compact"], presence: ["everyone", "friends", "nobody"], soundTone: ["bell", "soft", "chime"],
};
export const settingDefaults = { theme: "system", accent: "violet", wallpaper: "none", fontSize: "medium", bubbleStyle: "rounded", density: "comfortable", presence: "friends", soundTone: "bell", readReceipts: true, typingIndicators: true, removePhotoLocation: true, hidePreviews: true, browserNotifications: true, messageSound: false, enterToSend: true };
export const settingsSchema = new mongoose.Schema(Object.fromEntries(Object.entries(settingDefaults).map(([key, value]) => [key, { type: typeof value === "boolean" ? Boolean : String, default: value, ...(settingChoices[key] ? { enum: settingChoices[key] } : {}) }])), { _id: false, strict: true });
export function validateSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Settings must be an object");
  const patch = {};
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(settingDefaults, key)) continue;
    if (typeof value !== typeof settingDefaults[key] || (settingChoices[key] && !settingChoices[key].includes(value))) throw new HttpError(400, `Invalid setting: ${key}`);
    patch[`settings.${key}`] = value;
  }
  return patch;
}
