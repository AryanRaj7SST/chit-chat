import assert from "node:assert/strict";
import test from "node:test";
import { getClientUrls } from "../src/utils/environment.js";

test("deployment URLs come from explicit environment values and normalize trailing slashes", () => {
  assert.deepEqual(getClientUrls({ VITE_API_URL: " https://api.example/api/ ", VITE_SOCKET_URL: " https://api.example/ " }),
    { apiUrl: "https://api.example/api", socketUrl: "https://api.example" });
});

test("missing or malformed deployment URLs fail instead of using the frontend origin", () => {
  const valid = { VITE_API_URL: "https://api.example/api", VITE_SOCKET_URL: "https://api.example" };
  for (const overrides of [
    { VITE_API_URL: "" }, { VITE_SOCKET_URL: "" },
    { VITE_API_URL: "https://api.example" }, { VITE_SOCKET_URL: "https://api.example/api" },
    { VITE_API_URL: "/api" }, { VITE_SOCKET_URL: "ftp://api.example" },
    { VITE_API_URL: "https://api.example/api?token=invalid" },
  ]) assert.throws(() => getClientUrls({ ...valid, ...overrides }));
});
