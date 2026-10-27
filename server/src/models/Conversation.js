import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      validate: (v) => v.length === 2,
    },
    // sorted "idA_idB" -> unique index prevents duplicate private conversations
    participantsKey: { type: String, required: true, unique: true },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    lastReadAt: { type: Map, of: Date, default: () => ({}) },
    disappearingSeconds: { type: Number, enum: [0, 3600, 86400, 604800], default: 0 },
  },
  { timestamps: true, toJSON: { flattenMaps: true } }
);

conversationSchema.index({ participants: 1, updatedAt: -1 });

export default mongoose.model("Conversation", conversationSchema);
