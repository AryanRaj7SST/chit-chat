import "dotenv/config";
import http from "http";
import app from "./app.js";
import connectDB from "./config/db.js";
import { initSocket } from "./socket/index.js";

const PORT = Number(process.env.PORT || 5000);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  console.error("PORT must be an integer between 0 and 65535");
  process.exit(1);
}

if (!process.env.JWT_SECRET || !process.env.MONGO_URI) {
  console.error("Missing JWT_SECRET or MONGO_URI in server/.env");
  process.exit(1);
}

const server = http.createServer(app);
initSocket(server);

connectDB()
  .then(() => server.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${server.address().port}`)))
  .catch((err) => {
    console.error("Startup failed:", err.message);
    process.exit(1);
  });
