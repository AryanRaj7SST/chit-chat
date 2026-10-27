import express from "express";
import cors from "cors";
import { getCorsOptions } from "./config/cors.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import friendRoutes from "./routes/friendRoutes.js";
import { protect } from "./middleware/auth.js";
import asyncHandler from "./utils/asyncHandler.js";
import { localGet, localPut, mediaUrl, signUpload } from "./controllers/uploadController.js";
import { notFound, errorHandler } from "./middleware/error.js";

const app = express();

app.use(cors(getCorsOptions()));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/friends", friendRoutes);
app.post("/api/uploads/sign", protect, asyncHandler(signUpload));
app.put("/api/uploads/local/:token", protect, express.raw({ type: () => true, limit: "25mb" }), asyncHandler(localPut));
app.get("/api/uploads/local/:token", asyncHandler(localGet));
app.get("/api/media", protect, asyncHandler(mediaUrl));

app.use(notFound);
app.use(errorHandler);

export default app;
