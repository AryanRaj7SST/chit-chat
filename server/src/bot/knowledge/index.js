import dsa from "./dsa.js";
import javascript from "./javascript.js";
import react from "./react.js";
import webdev from "./webdev.js";
import backend from "./backend.js";
import csBasics from "./cs-basics.js";

export const entries = [...dsa, ...javascript, ...react, ...webdev, ...backend, ...csBasics];
export const topics = Object.fromEntries(
  [...new Set(entries.map(item => item.topic))].map(topic => [topic,
    entries.filter(item => item.topic === topic).map(item => item.title)]),
);
