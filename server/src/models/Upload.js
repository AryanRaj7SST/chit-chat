import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
  kind: { type: String, enum: ["original", "thumb", "avatar-original", "avatar-thumb"], required: true },
  mime: { type: String, required: true }, size: { type: Number, required: true },
  width: Number, height: Number,
  expiresAt: { type: Date, required: true },
  claim: String,
});
// Keep signed metadata so size/owner checks survive server restarts. Pending
// objects are not public; expired unused uploads require operational cleanup.
export default mongoose.model("Upload", schema);
