import mongoose from "mongoose";

const friendshipSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  pairKey: { type: String, required: true, unique: true },
  status: { type: String, enum: ["pending", "accepted"], default: "pending", required: true },
}, { timestamps: true });
friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });
export default mongoose.model("Friendship", friendshipSchema);
