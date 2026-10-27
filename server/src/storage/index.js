import { local } from "./local.js";
import { createR2 } from "./r2.js";

let driver;
export function getStorage() {
  if (driver) return driver;
  const kind = process.env.STORAGE_DRIVER || "local";
  if (kind === "local") {
    if (process.env.NODE_ENV === "production") throw new Error("Local uploads are disabled in production; configure private R2 storage");
    driver = local;
  } else if (kind === "r2") {
    if (!["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].every(key => process.env[key])) throw new Error("Missing R2 storage configuration");
    driver = createR2();
  } else throw new Error("STORAGE_DRIVER must be local or r2");
  return driver;
}
