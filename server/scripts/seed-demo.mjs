import "dotenv/config";
import mongoose from "mongoose";
import User from "../src/models/User.js";

// Public, disposable demonstration credentials. Never use these for real users.
const password = "DemoChat123!";
const demoUsers = [
  { name: "Alice Johnson", email: "alice.demo@example.com" },
  { name: "Bob Smith", email: "bob.demo@example.com" },
];

async function main() {
  if (process.env.NODE_ENV?.trim().toLowerCase() === "production")
    throw new Error("Refusing to seed demo users when NODE_ENV=production.");
  if (!process.env.MONGO_URI) throw new Error("Set MONGO_URI for a development/demo database before seeding.");

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await User.init();
  const results = [];
  for (const details of demoUsers) {
    let user = await User.findOne({ email: details.email }).select("+password");
    let action = "Reused";
    if (!user) {
      try {
        user = await User.create({ ...details, password }); // Uses the model's bcrypt save hook.
        action = "Created";
      } catch (error) {
        if (error.code !== 11000) throw error;
        user = await User.findOne({ email: details.email }).select("+password");
      }
    }
    // Never take over an existing account or silently replace its password.
    if (!user || user.name !== details.name || !(await user.matchPassword(password)))
      throw new Error("An existing demo email has different account details. Use a separate demo database; no existing account was changed.");
    results.push({ ...details, action });
  }
  process.stdout.write("Demo accounts ready (public demo credentials; development use only):\n");
  for (const user of results) {
    process.stdout.write(`${user.action}: ${user.name}\n`);
    process.stdout.write(`Email: ${user.email}\n`);
    process.stdout.write(`Password: ${password}\n`);
  }
  process.stdout.write("Existing conversations and messages were left unchanged.\n");
}

main().catch((error) => {
  // Database errors can include connection details. Print only our own messages.
  const expected = ["Refusing to seed", "Set MONGO_URI", "An existing demo email"];
  console.error(expected.some((prefix) => error.message?.startsWith(prefix))
    ? error.message : "Demo seed failed. Check database access and connection settings; connection details are not printed.");
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
