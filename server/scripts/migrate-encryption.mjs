import "dotenv/config";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { decrypt, encrypt, encryptionKey } from "../src/security/encryption.js";

export async function migrateEncryption(db, { apply = false, messageFilter = {}, userFilter = {} } = {}) {
  if (!encryptionKey()) throw new Error("Configure MESSAGE_ENC_KEY before migrating");
  const counts = { scanned: 0, changed: 0, encryptedFields: 0 };
  for (const [name, fields, filter] of [["messages", ["content", "caption"], messageFilter], ["users", ["about"], userFilter]]) {
    const collection = db.collection(name);
    for await (const row of collection.find(filter, { projection: Object.fromEntries(fields.map(field => [field, 1])) })) {
      counts.scanned++; const values = {}, guard = { _id: row._id };
      for (const field of fields) {
        const value = row[field]; if (typeof value !== "string" || !value) continue;
        if (value.startsWith("v1:")) { decrypt(value); continue; }
        values[field] = encrypt(value); guard[field] = value; counts.encryptedFields++;
      }
      if (Object.keys(values).length) {
        if (apply) { const result = await collection.updateOne(guard, { $set: values }); counts.changed += result.modifiedCount; }
        else counts.changed++;
      }
    }
  }
  return counts;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    encryptionKey(); if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
    await mongoose.connect(process.env.MONGO_URI);
    const apply = process.argv.includes("--apply");
    const counts = await migrateEncryption(mongoose.connection.db, { apply });
    console.log(`${apply ? "Applied" : "Dry run"}: scanned ${counts.scanned}, changed ${counts.changed}, encrypted fields ${counts.encryptedFields}`);
  } catch { console.error("Migration stopped. Check configuration/key and reserved v1 envelopes; no field values are logged."); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
}
